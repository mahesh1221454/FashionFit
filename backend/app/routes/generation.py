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
    back: UploadFile = File(...),

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

    back_path = await save_upload(
        back,
        "back",
    )

    job = GenerationJob(
        id=uuid.uuid4(),
        design_id=design.id,

        front_image_url=front_path,
        left_image_url=left_path,
        right_image_url=right_path,
        back_image_url=back_path,

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