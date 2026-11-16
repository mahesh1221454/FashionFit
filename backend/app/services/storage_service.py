from app.services.webp_service import decode_upload, save_webp
from fastapi.concurrency import run_in_threadpool
import os
import uuid

import aiofiles
from fastapi import UploadFile


UPLOAD_DIR = "uploads"
GENERATED_DIR = "generated"

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(GENERATED_DIR, exist_ok=True)


async def save_upload(file: UploadFile, prefix: str) -> str:
    image = await decode_upload(
        file,
        int(os.environ["CUSTOM_DRESS_MAX_BYTES"]),
        int(os.environ["CUSTOM_DRESS_MAX_PIXELS"]),
        int(os.environ["CUSTOM_DRESS_MAX_DIMENSION"]),
    )

    filename = f"{prefix}_{uuid.uuid4()}.webp"
    filepath = os.path.join(UPLOAD_DIR, filename)

    await run_in_threadpool(save_webp, image, filepath)

    return filepath
