import uuid

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
)

from sqlalchemy.orm import Session

from app.database import (
    SessionLocal,
    get_db,
)

from app.models import (
    Design,
    GenerationJob,
)

from app.schemas import GenerationJobResponse

from app.services.generation_service import (
    process_generation,
    validate_user_images,
    view_is_already_generated,
)

from app.services.storage_service import (
    save_upload,
)

router = APIRouter()


def run_generation_task(job_id):
    db = SessionLocal()

    try:
        process_generation(
            db,
            job_id,
        )
    finally:
        db.close()


@router.post("/create")
async def create_generation(
    background_tasks: BackgroundTasks,

    design_id: str = Form(...),

    front: UploadFile = File(...),
    left: UploadFile = File(...),
    right: UploadFile = File(...),

    db: Session = Depends(get_db),
):

    design = (
        db.query(Design)
        .filter(
            Design.id == design_id
        )
        .first()
    )

    if not design:
        raise HTTPException(
            status_code=404,
            detail="Design not found",
        )

    front_path = await save_upload(
        front,
        "front",
    )

    left_path = await save_upload(
        left,
        "left",
    )

    right_path = await save_upload(
        right,
        "right",
    )

    job = GenerationJob(
        id=uuid.uuid4(),
        design_id=design.id,

        front_image_url=front_path,
        left_image_url=left_path,
        right_image_url=right_path,
        back_image_url=None,

        status="pending",
        progress=0,
    )

    db.add(job)
    db.commit()
    db.refresh(job)

    background_tasks.add_task(
        run_generation_task,
        job.id,
    )

    return {
        "job_id": str(job.id),
        "status": job.status,
    }


@router.get(
    "/{job_id}",
    response_model=GenerationJobResponse,
)
def get_generation(
    job_id: uuid.UUID,
    db: Session = Depends(get_db),
):

    job = (
        db.query(GenerationJob)
        .filter(
            GenerationJob.id == job_id
        )
        .first()
    )

    if not job:
        raise HTTPException(
            status_code=404,
            detail="Generation job not found",
        )

    return job



# =====================================================
# V5 - RETRY FAILED GENERATION
# =====================================================

@router.post("/{job_id}/retry", status_code=202)
def retry_generation(
    job_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):

    # Lock the database row to prevent concurrent
    # refresh requests from scheduling duplicate jobs.

    job = (
        db.query(GenerationJob)
        .filter(GenerationJob.id == job_id)
        .with_for_update()
        .first()
    )

    if not job:
        raise HTTPException(
            status_code=404,
            detail="Generation job not found.",
        )

    if job.status in {
        "pending",
        "processing",
        "generating",
    }:
        return {
            "job_id": str(job.id),
            "status": job.status,
            "retry_started": False,
            "message": "Generation is already running.",
        }

    if job.status == "completed":
        return {
            "job_id": str(job.id),
            "status": "completed",
            "retry_started": False,
            "message": "Generation is already completed.",
        }

    if job.status != "failed":
        raise HTTPException(
            status_code=409,
            detail="This generation cannot be retried.",
        )

    error_message = (
        job.error_message or ""
    ).lower()

    permanent_errors = (
        "api_key_invalid",
        "invalid api key",
        "api key not valid",
        "unauthenticated",
        "permission_denied",
        "payment required",
        "insufficient credits",
        "not configured",
        "incorrect customer",
        "unable to verify the customer",
        "selected design not found",
    )

    if any(
        message in error_message
        for message in permanent_errors
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                "Please resolve the original error "
                "before retrying generation."
            ),
        )

    # Verify that customer images are available on
    # this server before changing the database status.

    try:
        validate_user_images(job)

    except (ValueError, FileNotFoundError):
        raise HTTPException(
            status_code=409,
            detail=(
                "Original customer photographs are "
                "not available on this server."
            ),
        )

    views = ("front", "left", "right")

    completed_views = []
    pending_views = []

    for view in views:

        existing_url = getattr(
            job,
            f"output_{view}_url",
            None,
        )

        if view_is_already_generated(job, view):
            completed_views.append(view)

        elif existing_url:

            # Do not overwrite an existing result
            # belonging to another server.

            raise HTTPException(
                status_code=409,
                detail=(
                    f"Existing {view} output is not "
                    "available on this server."
                ),
            )

        else:
            pending_views.append(view)

    # All three images already exist.
    # No additional Gemini requests are necessary.

    if not pending_views:

        from datetime import datetime

        job.status = "completed"
        job.progress = 100
        job.error_message = None
        job.completed_at = datetime.utcnow()

        db.commit()

        return {
            "job_id": str(job.id),
            "status": "completed",
            "retry_started": False,
            "completed_views": completed_views,
            "pending_views": [],
        }

    # Reuse the existing job.
    # Preserve all previously generated image URLs.

    job.status = "pending"
    job.error_message = None
    job.completed_at = None

    job.progress = max(
        0,
        len(completed_views) * 30,
    )

    db.commit()
    db.refresh(job)

    background_tasks.add_task(
        run_generation_task,
        job.id,
    )

    print(
        f"[V5 RETRY] Job: {job.id}"
    )

    print(
        f"[V5 RETRY] Preserved: {completed_views}"
    )

    print(
        f"[V5 RETRY] Generating: {pending_views}"
    )

    return {
        "job_id": str(job.id),
        "status": "pending",
        "retry_started": True,
        "completed_views": completed_views,
        "pending_views": pending_views,
        "message": "Failed generation retry started.",
    }
