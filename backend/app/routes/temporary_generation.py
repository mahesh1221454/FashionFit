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

from app.services.generated_image_storage import (
    generated_output_details,
    is_existing_image_usable,
)

load_dotenv()

router = APIRouter()
lock = threading.RLock()

ACTIVE_SESSIONS = set()


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

VIEWS = ("front", "left", "right")

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
    with lock:
        _clean_expired_sessions_locked()


def _clean_expired_sessions_locked():
    current_time = now()

    for directory in TEMP_ROOT.iterdir():
        if not directory.is_dir():
            continue

        session_id = directory.name

        if session_id in ACTIVE_SESSIONS:
            continue

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
            created = (
                data.get("attempt_started_at")
                or data.get("created_at")
            )

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
    try:
        _process_temporary_generation(session_id)
    finally:
        with lock:
            ACTIVE_SESSIONS.discard(session_id)


def _process_temporary_generation(session_id):
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
            "front": 35,
            "left": 65,
            "right": 95,
        }

        for view in VIEWS:
            current = read_session(session_id)

            if current is None or current.get("status") == "failed":
                return

            output_field = f"output_{view}_url"

            existing_url = current.get(output_field)

            _, existing_path, _ = generated_output_details(
                session_id,
                view,
            )

            if (
                existing_url
                and is_existing_image_usable(existing_path)
            ):
                print(
                    f"[V5 TEMP RETRY] Reusing "
                    f"{view.upper()} image."
                )

                update_session(
                    session_id,
                    progress=steps[view],
                )

                continue

            result = generate_single_image(
                str(folder / "dress.webp"),
                str(folder / f"{view}.webp"),
                view,
                session_id,
                customer_image_paths={
                    "front": str(folder / "front.webp"),
                    "left": str(folder / "left.webp"),
                    "right": str(folder / "right.webp"),
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
        # Delete original input images only after successful
        # generation. Failed sessions retain their inputs
        # until retry succeeds or the session expires.

        final_session = read_session(session_id)

        if (
            final_session
            and final_session.get("status") == "completed"
        ):
            for filename in (
                "dress.webp",
                "front.webp",
                "left.webp",
                "right.webp",
                "back.webp",
            ):
                with suppress(OSError):
                    (folder / filename).unlink(
                        missing_ok=True
                    )


@router.post("/create", status_code=202)
async def create_temporary_generation(
    background_tasks: BackgroundTasks,
    dress: UploadFile = File(...),
    front: UploadFile = File(...),
    left: UploadFile = File(...),
    right: UploadFile = File(...),
):
    session_id = f"temp_{uuid.uuid4().hex}"
    folder = session_directory(session_id)

    try:
        uploads = {
            "dress": dress,
            "front": front,
            "left": left,
            "right": right,
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

        with lock:
            save_session(data)
            ACTIVE_SESSIONS.add(session_id)

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



# =====================================================
# FASHIONFIT V5 - TEMPORARY GENERATION RETRY
# =====================================================

@router.post("/{session_id}/retry", status_code=202)
def retry_temporary_generation(
    session_id: str,
    background_tasks: BackgroundTasks,
):

    if (
        not session_id.startswith("temp_")
        or len(session_id) != 37
        or not all(
            char in "0123456789abcdef"
            for char in session_id[5:]
        )
    ):
        raise HTTPException(
            status_code=404,
            detail="Invalid temporary session.",
        )

    with lock:

        clean_expired_sessions()

        data = read_session(session_id)

        if data is None:
            raise HTTPException(
                status_code=404,
                detail=(
                    "Temporary session expired. "
                    "Please upload the photographs again."
                ),
            )

        status = data.get("status")

        if (
            session_id in ACTIVE_SESSIONS
            or status in {
                "pending",
                "processing",
                "generating",
            }
        ):
            return {
                "job_id": session_id,
                "status": status,
                "retry_started": False,
                "message": "Generation is already running.",
            }

        if status == "completed":
            return {
                "job_id": session_id,
                "status": "completed",
                "retry_started": False,
            }

        if status != "failed":
            raise HTTPException(
                status_code=409,
                detail="This session cannot be retried.",
            )

        error_message = (
            data.get("error_message") or ""
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

        folder = session_directory(session_id)

        completed_views = []
        pending_views = []

        for view in VIEWS:

            existing_url = data.get(
                f"output_{view}_url"
            )

            _, output_path, _ = generated_output_details(
                session_id,
                view,
            )

            if (
                existing_url
                and is_existing_image_usable(output_path)
            ):
                completed_views.append(view)

            else:
                pending_views.append(view)

        if not pending_views:

            finished = now()

            update_session(
                session_id,
                status="completed",
                progress=100,
                completed_at=iso(finished),
                error_message=None,
                expires_at=iso(
                    finished + timedelta(
                        minutes=RETENTION_MINUTES
                    )
                ),
            )

            for filename in (
                "dress.webp",
                "front.webp",
                "left.webp",
                "right.webp",
                "back.webp",
            ):
                with suppress(OSError):
                    (folder / filename).unlink(
                        missing_ok=True
                    )

            return {
                "job_id": session_id,
                "status": "completed",
                "retry_started": False,
                "completed_views": completed_views,
                "pending_views": [],
            }

        for filename in (
            "dress.webp",
            "front.webp",
            "left.webp",
            "right.webp",
        ):

            if not (folder / filename).is_file():
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "Original photographs are no longer "
                        "available. Please upload them again."
                    ),
                )

        changes = {
            "status": "pending",
            "progress": len(completed_views) * 30,
            "error_message": None,
            "expires_at": None,
            "completed_at": None,
            "attempt_started_at": iso(now()),
        }

        for view in pending_views:
            changes[f"output_{view}_url"] = None

        update_session(
            session_id,
            **changes,
        )

        ACTIVE_SESSIONS.add(session_id)

        background_tasks.add_task(
            process_temporary_generation,
            session_id,
        )

        print(
            f"[V5 TEMP RETRY] Session: {session_id}"
        )

        print(
            f"[V5 TEMP RETRY] Preserved: {completed_views}"
        )

        print(
            f"[V5 TEMP RETRY] Pending: {pending_views}"
        )

        return {
            "job_id": session_id,
            "status": "pending",
            "retry_started": True,
            "completed_views": completed_views,
            "pending_views": pending_views,
            "message": "Temporary generation retry started.",
        }
