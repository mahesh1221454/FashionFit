from fastapi import (
    APIRouter,
    File,
    UploadFile,
)

from app.services.storage_service import save_upload

router = APIRouter()


@router.post("")
async def upload_image(
    file: UploadFile = File(...),
):

    path = await save_upload(
        file,
        "upload",
    )

    return {
        "message": "Image uploaded successfully",
        "path": path,
    }