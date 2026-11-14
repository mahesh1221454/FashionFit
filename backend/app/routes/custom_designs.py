
import os
import re
import uuid
import unicodedata

from io import BytesIO
from pathlib import Path

from dotenv import load_dotenv

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
)

from PIL import (
    Image,
    ImageOps,
    UnidentifiedImageError,
)

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Category, Design
from app.schemas import DesignResponse


# =========================================================
# CONFIGURATION
# =========================================================

load_dotenv()

router = APIRouter()


def get_required_env(name):
    value = os.getenv(name)

    if not value:
        raise RuntimeError(
            f"Missing environment variable: {name}"
        )

    return value


MAX_UPLOAD_BYTES = int(
    get_required_env("CUSTOM_DRESS_MAX_BYTES")
)

MAX_IMAGE_PIXELS = int(
    get_required_env("CUSTOM_DRESS_MAX_PIXELS")
)

MAX_IMAGE_DIMENSION = int(
    get_required_env("CUSTOM_DRESS_MAX_DIMENSION")
)

MAX_DRESS_NAME_LENGTH = int(
    get_required_env("CUSTOM_DRESS_NAME_MAX_LENGTH")
)

MAX_CATEGORY_NAME_LENGTH = int(
    get_required_env("CUSTOM_CATEGORY_MAX_LENGTH")
)

IMAGE_QUALITY = int(
    get_required_env("CUSTOM_DRESS_IMAGE_QUALITY")
)

CATALOG_ROOT = Path(
    get_required_env("CATALOG_DIR")
).resolve()

CUSTOM_IMAGE_DIR = Path(
    get_required_env("CUSTOM_DRESS_DIRECTORY")
).resolve()

ALLOWED_MIME_TYPES = {
    value.strip()
    for value in get_required_env(
        "CUSTOM_DRESS_ALLOWED_TYPES"
    ).split(",")
    if value.strip()
}

PUBLIC_BACKEND_URL = get_required_env(
    "PUBLIC_BACKEND_URL"
).rstrip("/")

# Ensure uploaded images are inside the
# catalog directory served by FastAPI.

try:
    CUSTOM_RELATIVE_DIR = CUSTOM_IMAGE_DIR.relative_to(
        CATALOG_ROOT
    )
except ValueError as exc:
    raise RuntimeError(
        "CUSTOM_DRESS_DIRECTORY must be inside CATALOG_DIR"
    ) from exc

if not ALLOWED_MIME_TYPES:
    raise RuntimeError(
        "CUSTOM_DRESS_ALLOWED_TYPES cannot be empty"
    )

if MAX_UPLOAD_BYTES <= 0 or MAX_IMAGE_PIXELS <= 0:
    raise RuntimeError(
        "Upload size and pixel limits must be positive"
    )

if MAX_IMAGE_DIMENSION <= 0:
    raise RuntimeError(
        "Image dimension must be positive"
    )

if not 1 <= IMAGE_QUALITY <= 95:
    raise RuntimeError(
        "CUSTOM_DRESS_IMAGE_QUALITY must be between 1 and 95"
    )

Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS


# =========================================================
# GENERATE CATEGORY SLUG
# =========================================================

def generate_slug(name):
    normalized = unicodedata.normalize(
        "NFKD",
        name,
    )

    normalized = normalized.encode(
        "ascii",
        "ignore",
    ).decode("ascii")

    slug = re.sub(
        r"[^a-z0-9]+",
        "-",
        normalized.lower(),
    ).strip("-")

    if not slug:
        slug = f"category-{uuid.uuid4().hex[:12]}"

    return slug[:140].strip("-")


# =========================================================
# VALIDATE UPLOADED IMAGE
# =========================================================

async def validate_and_process_image(file):
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=415,
            detail=(
                "Unsupported image format. "
                "Upload JPG, PNG or WebP."
            ),
        )

    content = await file.read(
        MAX_UPLOAD_BYTES + 1
    )

    await file.close()

    if not content:
        raise HTTPException(
            status_code=400,
            detail="Uploaded image is empty.",
        )

    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Image exceeds the upload size limit.",
        )

    try:
        with Image.open(BytesIO(content)) as source:
            if source.format not in {
                "JPEG",
                "PNG",
                "WEBP",
            }:
                raise ValueError(
                    "Invalid image format"
                )

            if (
                source.width * source.height
                > MAX_IMAGE_PIXELS
            ):
                raise ValueError(
                    "Image dimensions exceed the limit"
                )

            source.load()

            corrected = ImageOps.exif_transpose(
                source
            )

            # Preserve transparency on a white
            # background before converting to JPEG.

            if corrected.mode in {
                "RGBA",
                "LA",
                "P",
            }:
                rgba = corrected.convert("RGBA")

                image = Image.new(
                    "RGB",
                    rgba.size,
                    (255, 255, 255),
                )

                image.paste(
                    rgba,
                    mask=rgba.getchannel("A"),
                )

            else:
                image = corrected.convert("RGB")

            image.thumbnail(
                (
                    MAX_IMAGE_DIMENSION,
                    MAX_IMAGE_DIMENSION,
                ),
                Image.Resampling.LANCZOS,
            )

            return image.copy()

    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ) as exc:
        raise HTTPException(
            status_code=400,
            detail="Invalid or damaged dress image.",
        ) from exc


# =========================================================
# FIND EXISTING CATEGORY
# =========================================================

def find_existing_category(
    db: Session,
    category_id: str,
):
    if not category_id:
        raise HTTPException(
            status_code=422,
            detail="Please select an existing category.",
        )

    try:
        parsed_id = uuid.UUID(category_id)

    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail="Invalid category ID.",
        ) from exc

    category = (
        db.query(Category)
        .filter(Category.id == parsed_id)
        .first()
    )

    if category is None:
        raise HTTPException(
            status_code=404,
            detail="Selected category not found.",
        )

    return category


# =========================================================
# CREATE NEW CATEGORY
# =========================================================

def create_new_category(
    db: Session,
    category_name: str,
):
    clean_name = " ".join(
        (category_name or "").split()
    )

    if not clean_name:
        raise HTTPException(
            status_code=422,
            detail="New category name is required.",
        )

    if len(clean_name) > MAX_CATEGORY_NAME_LENGTH:
        raise HTTPException(
            status_code=422,
            detail="Category name is too long.",
        )

    # Prevent duplicate category names.

    existing = (
        db.query(Category)
        .filter(
            func.lower(Category.name)
            == clean_name.lower()
        )
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=409,
            detail=(
                "This category already exists. "
                "Please select Existing Category."
            ),
        )

    slug = generate_slug(clean_name)

    # Handle categories with different names
    # that produce the same URL slug.

    existing_slug = (
        db.query(Category)
        .filter(Category.slug == slug)
        .first()
    )

    if existing_slug:
        slug = (
            f"{slug[:125]}-"
            f"{uuid.uuid4().hex[:10]}"
        )

    highest_order = (
        db.query(
            func.max(Category.display_order)
        ).scalar()
    )

    category = Category(
        id=uuid.uuid4(),
        name=clean_name,
        slug=slug,
        display_order=(highest_order or 0) + 1,
    )

    db.add(category)

    # Assign an ID without committing yet.
    # The category and dress are committed together.

    db.flush()

    return category


# =========================================================
# RESOLVE CATEGORY MODE
# =========================================================

def resolve_category(
    db: Session,
    category_mode: str,
    category_id: str,
    new_category_name: str,
):
    if category_mode == "existing":
        return find_existing_category(
            db,
            category_id,
        )

    if category_mode == "new":
        return create_new_category(
            db,
            new_category_name,
        )

    raise HTTPException(
        status_code=422,
        detail=(
            "Invalid category mode. "
            "Choose 'existing' or 'new'."
        ),
    )


# =========================================================
# CREATE CUSTOM DRESS
#
# POST /api/custom-designs
# =========================================================

@router.post(
    "",
    response_model=DesignResponse,
    status_code=201,
)
async def create_custom_design(
    request: Request,
    file: UploadFile = File(...),
    name: str = Form(...),
    category_mode: str = Form(...),
    category_id: str = Form(""),
    new_category_name: str = Form(""),
    db: Session = Depends(get_db),
):
    # -----------------------------------------------------
    # Validate dress name
    # -----------------------------------------------------

    clean_name = " ".join(name.split())

    if not clean_name:
        raise HTTPException(
            status_code=422,
            detail="Dress name is required.",
        )

    if len(clean_name) > MAX_DRESS_NAME_LENGTH:
        raise HTTPException(
            status_code=422,
            detail="Dress name is too long.",
        )

    if category_mode not in {
        "existing",
        "new",
    }:
        raise HTTPException(
            status_code=422,
            detail="Choose a valid category option.",
        )

    # -----------------------------------------------------
    # Validate image before saving
    # -----------------------------------------------------

    image = await validate_and_process_image(
        file
    )

    # -----------------------------------------------------
    # Generate unique image file
    # -----------------------------------------------------

    image_id = uuid.uuid4()

    filename = f"{image_id.hex}.jpg"

    CUSTOM_IMAGE_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    file_path = CUSTOM_IMAGE_DIR / filename

    image_saved = False

    try:
        # -------------------------------------------------
        # Find or create the requested category
        # -------------------------------------------------

        category = resolve_category(
            db=db,
            category_mode=category_mode,
            category_id=category_id,
            new_category_name=new_category_name,
        )

        # -------------------------------------------------
        # Save uploaded image
        # -------------------------------------------------

        image.save(
            file_path,
            format="JPEG",
            quality=IMAGE_QUALITY,
            optimize=True,
        )

        image_saved = True

        # -------------------------------------------------
        # Build image URL
        # -------------------------------------------------

        relative_image_path = (
            CUSTOM_RELATIVE_DIR / filename
        ).as_posix()

        image_url = (
            f"{PUBLIC_BACKEND_URL}/catalog/"
            f"{relative_image_path}"
        )

        # -------------------------------------------------
        # Create dress record in PostgreSQL
        # -------------------------------------------------

        design = Design(
            id=uuid.uuid4(),
            category_id=category.id,
            design_code=(
                f"CUSTOM-{image_id.hex[:20]}"
            ),
            name=clean_name,
            description=(
                "Customer-uploaded catalog design."
            ),
            image_url=image_url,
            is_active=True,
        )

        db.add(design)

        # Save category and dress in one transaction.

        db.commit()
        db.refresh(design)

        return design

    except HTTPException:
        db.rollback()

        if image_saved:
            file_path.unlink(missing_ok=True)

        raise

    except IntegrityError as exc:
        db.rollback()

        if image_saved:
            file_path.unlink(missing_ok=True)

        raise HTTPException(
            status_code=409,
            detail=(
                "Category or dress conflict occurred. "
                "Please try again."
            ),
        ) from exc

    except OSError as exc:
        db.rollback()

        file_path.unlink(missing_ok=True)

        raise HTTPException(
            status_code=500,
            detail="Unable to save the uploaded image.",
        ) from exc

    except Exception:
        db.rollback()

        if image_saved:
            file_path.unlink(missing_ok=True)

        raise
