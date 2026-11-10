import os
import uuid

import aiofiles
from fastapi import UploadFile


UPLOAD_DIR = "uploads"
GENERATED_DIR = "generated"

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(GENERATED_DIR, exist_ok=True)


async def save_upload(
    file: UploadFile,
    prefix: str,
) -> str:

    extension = "jpg"

    if file.filename and "." in file.filename:
        extension = file.filename.rsplit(".", 1)[1].lower()

    filename = (
        f"{prefix}_{uuid.uuid4()}.{extension}"
    )

    filepath = os.path.join(
        UPLOAD_DIR,
        filename,
    )

    async with aiofiles.open(
        filepath,
        "wb",
    ) as output_file:

        content = await file.read()

        await output_file.write(content)

    return filepath