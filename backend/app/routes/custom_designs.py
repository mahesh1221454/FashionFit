
import uuid
from io import BytesIO
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
)

from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Category, Design
from app.schemas import DesignResponse

router = APIRouter()

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_IMAGE_PIXELS = 40_000_000

ALLOWED_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
}

CUSTOM_CATEGORY_SLUG = "custom-uploads"

CUSTOM_IMAGE_DIR = (
    Path("catalog-images") / "custom"
)

CUSTOM_IMAGE_DIR.mkdir(
    parents=True,
    exist_ok=True,
)


def get_custom_category(db: Session):
    category = (
        db.query(Category)
        .filter(
            Category.slug == CUSTOM_CATEGORY_SLUG
        )
        .first()
    )

    if category:
        return category

    category = Category(
        id=uuid.uuid4(),
        name="Custom Uploads",
        slug=CUSTOM_CATEGORY_SLUG,
        display_order=9999,
    )

    db.add(category)

    try:
        db.commit()
        db.refresh(category)
        return category

    except IntegrityError:
        db.rollback()

        category = (
            db.query(Category)
            .filter(
                Category.slug == CUSTOM_CATEGORY_SLUG
            )
            .first()
        )

        if category:
            return category

        raise


@router.post(
    "",
    response_model=DesignResponse,
    status_code=201,
)
async def create_custom_design(
    request: Request,
    file: UploadFile = File(...),
    name: str = Form("My Custom Dress"),
    db: Session = Depends(get_db),
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=415,
            detail=(
                "Only JPG, PNG and WebP "
                "images are supported."
            ),
        )

    clean_name = name.strip()

    if not clean_name:
        clean_name = "My Custom Dress"

    if len(clean_name) > 100:
        raise HTTPException(
            status_code=422,
            detail=(
                "Dress name must be "
                "100 characters or less."
            ),
        )

    content = await file.read(
        MAX_UPLOAD_BYTES + 1
    )

    await file.close()

    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Maximum image size is 10 MB.",
        )

    if not content:
        raise HTTPException(
            status_code=400,
            detail="The uploaded image is empty.",
        )

    try:
        with Image.open(BytesIO(content)) as source:
            if source.format not in {
                "JPEG", "PNG", "WEBP"
            }:
                raise ValueError(
                    "Unsupported image format."
                )

            if (
                source.width * source.height
                > MAX_IMAGE_PIXELS
            ):
                raise ValueError(
                    "Image dimensions are too large."
                )

            source.load()

            image = ImageOps.exif_transpose(
                source
            ).convert("RGB")

            image.thumbnail(
                (2048, 2048),
                Image.Resampling.LANCZOS,
            )

    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid image. Upload a valid "
                "JPG, PNG or WebP photograph."
            ),
        )

    image_id = uuid.uuid4()
    filename = f"{image_id}.jpg"

    file_path = (
        CUSTOM_IMAGE_DIR / filename
    )

    try:
        image.save(
            file_path,
            format="JPEG",
            quality=92,
            optimize=True,
        )
    except OSError:
        raise HTTPException(
            status_code=500,
            detail="Unable to save dress image.",
        )

    try:
        category = get_custom_category(db)

        design = Design(
            id=uuid.uuid4(),
            category_id=category.id,
            design_code=f"CUSTOM-{image_id.hex[:16]}",
            name=clean_name,
            description=(
                "Customer-uploaded custom "
                "dress reference."
            ),
            image_url=(
                str(request.base_url).rstrip("/")
                + f"/catalog/custom/{filename}"
            ),
            is_active=True,
        )

        db.add(design)
        db.commit()
        db.refresh(design)

        return design

    except Exception:
        db.rollback()

        file_path.unlink(
            missing_ok=True
        )

        raise
