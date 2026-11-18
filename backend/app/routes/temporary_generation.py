from app.services.webp_service import decode_upload, save_webp
from fastapi.concurrency import run_in_threadpool

import json
import os
import shutil
import threading
import uuid

from contextlib import suppress
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path

from dotenv import load_dotenv
from fastapi import (
    APIRouter,
    BackgroundTasks,
    File,
    HTTPException,
    UploadFile,
)
from PIL import Image, ImageOps, UnidentifiedImageError

from app.services.image_service import generate_single_image

load_dotenv()

router = APIRouter()
lock = threading.RLock()


def setting(name):
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing environment variable: {name}")
    return value


TEMP_ROOT = Path(setting("TEMP_TRYON_DIR")).resolve()
GENERATED_ROOT = Path(setting("GENERATED_DIR")).resolve()

MAX_BYTES = int(setting("TEMP_TRYON_MAX_BYTES"))
MAX_PIXELS = int(setting("TEMP_TRYON_MAX_PIXELS"))
MAX_DIMENSION = int(setting("TEMP_TRYON_MAX_DIMENSION"))
RETENTION_MINUTES = int(setting("TEMP_TRYON_RETENTION_MINUTES"))
STALE_MINUTES = int(setting("TEMP_TRYON_STALE_MINUTES"))

PUBLIC_BACKEND_URL = setting("PUBLIC_BACKEND_URL").rstrip("/")

ALLOWED_TYPES = {
    value.strip()
    for value in setting("TEMP_TRYON_ALLOWED_TYPES").split(",")
    if value.strip()
}

VIEWS = ("front", "left", "right", "back")

TEMP_ROOT.mkdir(parents=True, exist_ok=True)
GENERATED_ROOT.mkdir(parents=True, exist_ok=True)


def now():
    return datetime.now(timezone.utc)


def iso(value):
    return value.isoformat()


def session_directory(session_id):
    return TEMP_ROOT / session_id


def metadata_path(session_id):
    return session_directory(session_id) / "session.json"


def read_session(session_id):
    path = metadata_path(session_id)

    with lock:
        if not path.is_file():
            return None

        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            return None


def save_session(data):
    directory = session_directory(data["id"])
    directory.mkdir(parents=True, exist_ok=True)

    path = metadata_path(data["id"])
    temporary = path.with_suffix(".json.tmp")

    with lock:
        temporary.write_text(
            json.dumps(data, indent=2),
            encoding="utf-8",
        )
        os.replace(temporary, path)


def update_session(session_id, **changes):
    with lock:
        data = read_session(session_id)

        if data is None:
            return None

        data.update(changes)
        save_session(data)

        return data


def delete_session(session_id):
    if not session_id.startswith("temp_"):
        return

    if not all(
        char in "0123456789abcdef"
        for char in session_id.removeprefix("temp_")
    ):
        return

    with lock:
        shutil.rmtree(
            session_directory(session_id),
            ignore_errors=True,
        )

        shutil.rmtree(
            GENERATED_ROOT / session_id,
            ignore_errors=True,
        )


def clean_expired_sessions():
    current_time = now()

    for directory in TEMP_ROOT.iterdir():
        if not directory.is_dir():
            continue

        session_id = directory.name
        data = read_session(session_id)

        if data is None:
            continue

        status = data.get("status")

        if status in {"completed", "failed"}:
            expiry = data.get("expires_at")

            if expiry:
                with suppress(ValueError):
                    if datetime.fromisoformat(expiry) <= current_time:
                        delete_session(session_id)

        elif status in {"pending", "generating"}:
            created = data.get("created_at")

            if created:
                with suppress(ValueError):
                    created_time = datetime.fromisoformat(created)

                    if current_time - created_time > timedelta(
                        minutes=STALE_MINUTES
                    ):
                        # Do not delete a live generation while
                        # Gemini may still be processing it.
                        update_session(
                            session_id,
                            status="failed",
                            error_message="Session processing timed out.",
                            expires_at=iso(
                                current_time + timedelta(
                                    minutes=RETENTION_MINUTES
                                )
                            ),
                        )


async def store_image(upload, destination):
    image = await decode_upload(
        upload,
        MAX_BYTES,
        MAX_PIXELS,
        MAX_DIMENSION,
    )

    destination.parent.mkdir(parents=True, exist_ok=True)

    await run_in_threadpool(save_webp, image, destination)


def process_temporary_generation(session_id):
    data = read_session(session_id)

    if data is None:
        return

    folder = session_directory(session_id)

    try:
        update_session(
            session_id,
            status="generating",
            progress=5,
        )

        steps = {
            "front": 25,
            "left": 50,
            "right": 75,
            "back": 95,
        }

        for view in VIEWS:
            current = read_session(session_id)

            if current is None or current.get("status") == "failed":
                return

            result = generate_single_image(
                str(folder / "dress.webp"),
                str(folder / f"{view}.webp"),
                view,
                session_id,
                customer_image_paths={
                    "front": str(folder / "front.webp"),
                    "left": str(folder / "left.webp"),
                    "right": str(folder / "right.webp"),
                    "back": str(folder / "back.webp"),
                }, identity_image_path=str(folder / "front.webp"),
            )

            if not result.get("image_url"):
                raise RuntimeError(
                    f"Gemini did not generate the {view} view."
                )

            update_session(
                session_id,
                **{
                    f"output_{view}_url": (
                        result["image_url"]
                    ),
                    "progress": steps[view],
                },
            )

        finished = now()

        update_session(
            session_id,
            status="completed",
            progress=100,
            completed_at=iso(finished),
            expires_at=iso(
                finished + timedelta(minutes=RETENTION_MINUTES)
            ),
            error_message=None,
        )

    except Exception as exc:
        failed_at = now()

        update_session(
            session_id,
            status="failed",
            error_message=str(exc),
            expires_at=iso(
                failed_at + timedelta(minutes=RETENTION_MINUTES)
            ),
        )

    finally:
        # Delete dress and customer input images.
        # Keep only session metadata and generated
        # results until the expiration period.
        for filename in (
            "dress.webp",
            "front.webp",
            "left.webp",
            "right.webp",
            "back.webp",
        ):
            with suppress(OSError):
                (folder / filename).unlink(missing_ok=True)


@router.post("/create", status_code=202)
async def create_temporary_generation(
    background_tasks: BackgroundTasks,
    dress: UploadFile = File(...),
    front: UploadFile = File(...),
    left: UploadFile = File(...),
    right: UploadFile = File(...),
    back: UploadFile = File(...),
):
    session_id = f"temp_{uuid.uuid4().hex}"
    folder = session_directory(session_id)

    try:
        uploads = {
            "dress": dress,
            "front": front,
            "left": left,
            "right": right,
            "back": back,
        }

        for name, upload in uploads.items():
            await store_image(
                upload,
                folder / f"{name}.webp",
            )

        data = {
            "id": session_id,
            "design_id": None,
            "temporary": True,
            "status": "pending",
            "progress": 0,
            "created_at": iso(now()),
            "expires_at": None,
            "completed_at": None,
            "error_message": None,
            "output_front_url": None,
            "output_left_url": None,
            "output_right_url": None,
            "output_back_url": None,
        }

        save_session(data)

        background_tasks.add_task(
            process_temporary_generation,
            session_id,
        )

        return {
            "job_id": session_id,
            "status": "pending",
            "temporary": True,
        }

    except Exception:
        delete_session(session_id)
        raise


@router.get("/{session_id}")
def get_temporary_generation(session_id: str):
    if (
        not session_id.startswith("temp_")
        or len(session_id) != len("temp_") + 32
    ):
        raise HTTPException(
            status_code=404,
            detail="Temporary session not found.",
        )

    clean_expired_sessions()

    data = read_session(session_id)

    if data is None:
        raise HTTPException(
            status_code=404,
            detail="Temporary session expired or not found.",
        )

    return data
