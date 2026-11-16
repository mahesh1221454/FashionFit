from app.services.generated_image_storage import GENERATED_IMAGE_EXTENSION
import os

from datetime import datetime

from sqlalchemy.orm import Session

from app.models import (
    Design,
    GenerationJob,
)

from app.services.image_service import (
    generate_single_image,
)


# =========================================================
# UPDATE JOB STATUS / PROGRESS
# =========================================================

def update_job(
    db: Session,
    job: GenerationJob,
    status: str,
    progress: int,
):
    """
    Update generation job status and progress.
    """

    job.status = status
    job.progress = progress

    db.commit()
    db.refresh(job)


# =========================================================
# CONVERT CATALOG URL TO LOCAL FILE PATH
# =========================================================

def catalog_url_to_local_path(
    image_url: str,
) -> str:
    """
    Convert:

    http://localhost:8000/catalog/abc/image.jpg

    into:

    catalog-images/abc/image.jpg
    """

    if not image_url:
        raise ValueError(
            "Design image URL is empty."
        )

    if "/catalog/" in image_url:

        relative_path = image_url.split(
            "/catalog/",
            1,
        )[1]

        return os.path.join(
            "catalog-images",
            *relative_path.split("/"),
        )

    return image_url


# =========================================================
# VALIDATE USER IMAGES
# =========================================================

def validate_user_images(
    job: GenerationJob,
):
    """
    Ensure all four uploaded user images exist.
    """

    images = {
        "front": job.front_image_url,
        "left": job.left_image_url,
        "right": job.right_image_url,
        "back": job.back_image_url,
    }

    for view, image_path in images.items():

        if not image_path:
            raise ValueError(
                f"{view.capitalize()} image path is missing."
            )

        if not os.path.exists(
            image_path
        ):
            raise FileNotFoundError(
                f"{view.capitalize()} user image "
                f"not found: {image_path}"
            )


# =========================================================
# GET GENERATED OUTPUT PATH
# =========================================================

def get_generated_output_path(
    job_id,
    view: str,
) -> str:

    return os.path.join(
        "generated",
        str(job_id),
        f"{view}{GENERATED_IMAGE_EXTENSION}",
    )


# =========================================================
# CHECK IF VIEW ALREADY EXISTS
# =========================================================

def view_is_already_generated(
    job: GenerationJob,
    view: str,
) -> bool:
    """
    Check both:

    1. DB output URL exists
    2. Generated file exists on disk
    """

    output_field = (
        f"output_{view}_url"
    )

    existing_url = getattr(
        job,
        output_field,
        None,
    )

    output_path = (
        get_generated_output_path(
            job.id,
            view,
        )
    )

    return bool(
        existing_url
        and
        os.path.exists(
            output_path
        )
    )


# =========================================================
# GENERATE ONE VIEW
# =========================================================

def generate_view(
    db: Session,
    job: GenerationJob,
    design_image_path: str,
    view: str,
    person_image_path: str,
    progress_after: int,
):
    """
    Generate one view.

    If this view has already been generated,
    reuse it instead of calling Gemini again.
    """

    output_field = (
        f"output_{view}_url"
    )

    # =====================================================
    # REUSE EXISTING OUTPUT
    # =====================================================

    if view_is_already_generated(
        job,
        view,
    ):

        existing_url = getattr(
            job,
            output_field,
        )

        print()
        print(
            f"[GENERATION] "
            f"{view.upper()} already generated."
        )

        print(
            f"[GENERATION] "
            f"Reusing existing output:"
        )

        print(
            existing_url
        )

        update_job(
            db=db,
            job=job,
            status="generating",
            progress=progress_after,
        )

        return existing_url


    # =====================================================
    # GENERATE NEW OUTPUT
    # =====================================================

    print()
    print(
        f"[GENERATION] "
        f"Generating {view.upper()} view..."
    )

    result = generate_single_image(
        design_image_path,
        person_image_path,
        view,
        str(job.id),
                 usage_job_id=str(job.id),
             )

    output_url = result.get(
        "image_url"
    )

    if not output_url:
        raise RuntimeError(
            f"{view.capitalize()} image generation "
            f"did not return image URL."
        )


    # =====================================================
    # SAVE URL TO DATABASE IMMEDIATELY
    # =====================================================

    setattr(
        job,
        output_field,
        output_url,
    )

    job.status = (
        "generating"
    )

    job.progress = (
        progress_after
    )

    job.error_message = (
        None
    )

    db.commit()
    db.refresh(job)

    print(
        f"[GENERATION] "
        f"{view.capitalize()} generated:"
    )

    print(
        output_url
    )

    return output_url


# =========================================================
# PROCESS GENERATION
# =========================================================

def process_generation(
    db: Session,
    job_id,
):
    """
    Complete virtual try-on pipeline.

    Flow:

    1. Load generation job.
    2. Load selected design.
    3. Convert design URL to local path.
    4. Validate user images.
    5. Generate front.
    6. Generate left.
    7. Generate right.
    8. Generate back.
    9. Save output URLs.
    10. Mark completed.

    Existing successful views are reused.
    """

    # =====================================================
    # LOAD JOB
    # =====================================================

    job = (
        db.query(
            GenerationJob
        )
        .filter(
            GenerationJob.id ==
            job_id
        )
        .first()
    )

    if not job:

        print(
            f"[GENERATION] "
            f"Job not found: {job_id}"
        )

        return


    try:

        print()
        print(
            "=========================================="
        )

        print(
            f"[GENERATION] "
            f"Starting job: {job.id}"
        )

        print(
            "=========================================="
        )


        # =================================================
        # LOAD SELECTED DESIGN
        # =================================================

        design = (
            db.query(
                Design
            )
            .filter(
                Design.id ==
                job.design_id
            )
            .first()
        )

        if not design:

            raise RuntimeError(
                "Selected design not found."
            )


        print(
            f"[GENERATION] "
            f"Design ID: {design.id}"
        )


        print(
            f"[GENERATION] "
            f"Design code: "
            f"{design.design_code}"
        )


        print(
            f"[GENERATION] "
            f"Design URL: "
            f"{design.image_url}"
        )


        # =================================================
        # DESIGN IMAGE LOCAL PATH
        # =================================================

        design_image_path = (
            catalog_url_to_local_path(
                design.image_url
            )
        )

        print(
            f"[GENERATION] "
            f"Design local path: "
            f"{design_image_path}"
        )

        if not os.path.exists(
            design_image_path
        ):

            raise FileNotFoundError(
                f"Design image not found: "
                f"{design_image_path}"
            )


        # =================================================
        # VALIDATE USER IMAGES
        # =================================================

        validate_user_images(
            job
        )


        # =================================================
        # START PROCESSING
        # =================================================

        job.error_message = None

        update_job(
            db=db,
            job=job,
            status="processing",
            progress=10,
        )


        # =================================================
        # FRONT VIEW
        # =================================================

        front_url = generate_view(
            db=db,
            job=job,
            design_image_path=(
                design_image_path
            ),
            view="front",
            person_image_path=(
                job.front_image_url
            ),
            progress_after=35,
        )


        # =================================================
        # LEFT VIEW
        # =================================================

        left_url = generate_view(
            db=db,
            job=job,
            design_image_path=(
                design_image_path
            ),
            view="left",
            person_image_path=(
                job.left_image_url
            ),
            progress_after=55,
        )


        # =================================================
        # RIGHT VIEW
        # =================================================

        right_url = generate_view(
            db=db,
            job=job,
            design_image_path=(
                design_image_path
            ),
            view="right",
            person_image_path=(
                job.right_image_url
            ),
            progress_after=75,
        )


        # =================================================
        # BACK VIEW
        # =================================================

        back_url = generate_view(
            db=db,
            job=job,
            design_image_path=(
                design_image_path
            ),
            view="back",
            person_image_path=(
                job.back_image_url
            ),
            progress_after=95,
        )


        # =================================================
        # MARK COMPLETED
        # =================================================

        job.status = (
            "completed"
        )

        job.progress = (
            100
        )

        job.error_message = (
            None
        )

        job.completed_at = (
            datetime.utcnow()
        )

        db.commit()
        db.refresh(job)


        # =================================================
        # SUCCESS LOG
        # =================================================

        print()
        print(
            "=========================================="
        )

        print(
            "[GENERATION] "
            "Job completed successfully"
        )

        print(
            f"[GENERATION] "
            f"Job ID: {job.id}"
        )

        print(
            f"[GENERATION] "
            f"Output folder: "
            f"generated/{job.id}"
        )

        print(
            f"[GENERATION] "
            f"Front: {front_url}"
        )

        print(
            f"[GENERATION] "
            f"Left: {left_url}"
        )

        print(
            f"[GENERATION] "
            f"Right: {right_url}"
        )

        print(
            f"[GENERATION] "
            f"Back: {back_url}"
        )

        print(
            "=========================================="
        )

        print()


    # =====================================================
    # ERROR HANDLING
    # =====================================================

    except Exception as error:

        print()
        print(
            "=========================================="
        )

        print(
            "[GENERATION ERROR]"
        )

        print(
            f"Job ID: "
            f"{job.id}"
        )

        print(
            f"Error: "
            f"{str(error)}"
        )

        print(
            "=========================================="
        )

        print()


        try:

            job.status = (
                "failed"
            )

            job.error_message = (
                str(error)
            )

            db.commit()
            db.refresh(job)


        except Exception as database_error:

            db.rollback()

            print(
                "[DATABASE ERROR] "
                "Could not save "
                "generation error:"
            )

            print(
                str(
                    database_error
                )
            )