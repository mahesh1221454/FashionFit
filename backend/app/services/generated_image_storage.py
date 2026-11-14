
import os
import tempfile
import uuid
from pathlib import Path
from urllib.parse import quote

from dotenv import load_dotenv
from PIL import Image


# ==========================================================
# CONFIGURATION
# ==========================================================

BACKEND_DIR = Path(__file__).resolve().parents[2]

load_dotenv(
    dotenv_path=BACKEND_DIR / ".env"
)


def required_setting(name):
    value = os.environ.get(name)

    if not value or not value.strip():
        raise RuntimeError(
            f"Missing required environment setting: {name}"
        )

    return value.strip()


GENERATED_DIR_VALUE = required_setting(
    "GENERATED_DIR"
)

PUBLIC_BACKEND_URL = required_setting(
    "PUBLIC_BACKEND_URL"
).rstrip("/")

GENERATED_PUBLIC_PATH = required_setting(
    "GENERATED_PUBLIC_PATH"
).strip("/")

GENERATED_IMAGE_FORMAT = required_setting(
    "GENERATED_IMAGE_FORMAT"
).upper()

GENERATED_IMAGE_EXTENSION = required_setting(
    "GENERATED_IMAGE_EXTENSION"
).lower()

GENERATED_LEGACY_FORMATS = {
    value.strip().upper()
    for value in required_setting(
        "GENERATED_LEGACY_FORMATS"
    ).split(",")
    if value.strip()
}


def resolve_storage_directory():
    configured = Path(GENERATED_DIR_VALUE)

    if not configured.is_absolute():
        configured = BACKEND_DIR / configured

    return configured.resolve()


STORAGE_DIRECTORY = resolve_storage_directory()


# ==========================================================
# CONFIGURATION VALIDATION
# ==========================================================

if not GENERATED_IMAGE_EXTENSION.startswith("."):
    raise RuntimeError(
        "GENERATED_IMAGE_EXTENSION must start with a dot."
    )

if "/" in GENERATED_IMAGE_EXTENSION or "\\" in GENERATED_IMAGE_EXTENSION:
    raise RuntimeError(
        "Invalid generated image extension."
    )

Image.init()

registered_format = Image.registered_extensions().get(
    GENERATED_IMAGE_EXTENSION
)

if registered_format != GENERATED_IMAGE_FORMAT:
    raise RuntimeError(
        "GENERATED_IMAGE_EXTENSION does not match "
        "GENERATED_IMAGE_FORMAT."
    )

if not PUBLIC_BACKEND_URL.startswith(
    ("http://", "https://")
):
    raise RuntimeError(
        "PUBLIC_BACKEND_URL must be an HTTP(S) URL."
    )

if not GENERATED_PUBLIC_PATH:
    raise RuntimeError(
        "GENERATED_PUBLIC_PATH cannot be empty."
    )

if GENERATED_PUBLIC_PATH in {".", ".."}:
    raise RuntimeError(
        "Invalid GENERATED_PUBLIC_PATH."
    )

if any(
    segment in {".", "..", ""}
    for segment in GENERATED_PUBLIC_PATH.split("/")
):
    raise RuntimeError(
        "Invalid generated public path segments."
    )


# ==========================================================
# JOB IDENTIFIER VALIDATION
# ==========================================================

def validate_job_id(job_id):
    try:
        parsed = uuid.UUID(str(job_id))
    except (ValueError, TypeError, AttributeError):
        raise ValueError(
            "Invalid generation job ID."
        )

    return str(parsed)


# ==========================================================
# OUTPUT PATHS AND URL
# ==========================================================

def generated_output_details(job_id, view):
    safe_job_id = validate_job_id(job_id)

    if not isinstance(view, str):
        raise ValueError("Invalid generated image view.")

    safe_view = view.strip().lower()

    if not safe_view.isidentifier():
        raise ValueError(
            "Invalid generated image view."
        )

    filename = (
        safe_view
        + GENERATED_IMAGE_EXTENSION
    )

    job_directory = (
        STORAGE_DIRECTORY / safe_job_id
    ).resolve()

    job_directory.relative_to(STORAGE_DIRECTORY)

    output_path = job_directory / filename

    public_url = (
        PUBLIC_BACKEND_URL
        + "/"
        + GENERATED_PUBLIC_PATH
        + "/"
        + quote(safe_job_id, safe="")
        + "/"
        + quote(filename, safe="")
    )

    return (
        str(job_directory),
        str(output_path),
        public_url,
    )


# ==========================================================
# VALIDATE IMAGE FILE
# ==========================================================

def validate_image_file(
    path,
    allowed_formats=None,
):
    image_path = Path(path)

    if not image_path.is_file():
        raise FileNotFoundError(
            f"Generated image not found: {image_path}"
        )

    if image_path.stat().st_size <= 0:
        raise RuntimeError(
            f"Generated image is empty: {image_path}"
        )

    try:
        with Image.open(image_path) as image:
            detected_format = image.format
            image.verify()

        with Image.open(image_path) as image:
            image.load()
            width, height = image.size

            if width <= 0 or height <= 0:
                raise ValueError(
                    "Invalid image dimensions."
                )

        if (
            allowed_formats is not None
            and detected_format not in allowed_formats
        ):
            raise RuntimeError(
                "Unexpected image format: "
                f"{detected_format}"
            )

        return {
            "format": detected_format,
            "width": width,
            "height": height,
            "size_bytes": image_path.stat().st_size,
        }

    except Exception as error:
        raise RuntimeError(
            f"Generated image validation failed: "
            f"{image_path}: {error}"
        ) from error


# ==========================================================
# REUSE EXISTING GENERATED IMAGE
# ==========================================================

def is_existing_image_usable(output_path):
    path = Path(output_path)

    if not path.exists():
        return False

    allowed_formats = {
        GENERATED_IMAGE_FORMAT,
        *GENERATED_LEGACY_FORMATS,
    }

    details = validate_image_file(
        path,
        allowed_formats=allowed_formats,
    )

    if details["format"] != GENERATED_IMAGE_FORMAT:
        print(
            "[STORAGE] Valid legacy image reused: "
            f"{path.name} "
            f"({details['format']})"
        )

    return True


# ==========================================================
# ATOMIC IMAGE SAVING
# ==========================================================

def save_generated_image_atomic(
    generated_image,
    output_path,
):
    final_path = Path(output_path).resolve()

    try:
        final_path.relative_to(STORAGE_DIRECTORY)
    except ValueError as error:
        raise ValueError(
            "Generated image path is outside storage."
        ) from error

    if final_path.suffix.lower() != GENERATED_IMAGE_EXTENSION:
        raise ValueError(
            "Generated image file extension mismatch."
        )

    if not isinstance(generated_image, Image.Image):
        raise TypeError(
            "Generated output must be a PIL image."
        )

    final_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    # Never silently overwrite an existing output.
    if final_path.exists():
        raise FileExistsError(
            f"Generated output already exists: {final_path}"
        )

    temporary_path = None

    try:
        with tempfile.NamedTemporaryFile(
            mode="wb",
            dir=final_path.parent,
            prefix=f".{final_path.stem}_",
            suffix=GENERATED_IMAGE_EXTENSION,
            delete=False,
        ) as temporary_file:
            temporary_path = Path(
                temporary_file.name
            )

        generated_image.save(
            temporary_path,
            format=GENERATED_IMAGE_FORMAT,
            optimize=True,
        )

        # Ensure written bytes are flushed.
        with open(temporary_path, "r+b") as saved:
            os.fsync(saved.fileno())

        # Verify before publishing the final file.
        validate_image_file(
            temporary_path,
            allowed_formats={
                GENERATED_IMAGE_FORMAT
            },
        )

        # Recheck before replacement.
        if final_path.exists():
            raise FileExistsError(
                f"Output appeared during saving: {final_path}"
            )

        os.replace(
            temporary_path,
            final_path,
        )

        temporary_path = None

        # Verify published output.
        details = validate_image_file(
            final_path,
            allowed_formats={
                GENERATED_IMAGE_FORMAT
            },
        )

        print(
            "[STORAGE] Image saved and verified: "
            f"{final_path}"
        )

        return details

    except Exception:
        raise

    finally:
        if (
            temporary_path is not None
            and temporary_path.exists()
        ):
            temporary_path.unlink()
