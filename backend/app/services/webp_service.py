
import os
from io import BytesIO

from dotenv import load_dotenv
from fastapi import HTTPException
from PIL import Image, ImageOps
from PIL import UnidentifiedImageError

load_dotenv()

IMAGE_OUTPUT_QUALITY = int(os.environ["IMAGE_OUTPUT_QUALITY"])

ALLOWED_FORMATS = {
    value.strip().upper()
    for value in os.environ["IMAGE_INPUT_FORMATS"].split(",")
    if value.strip()
}


async def decode_upload(upload, max_bytes, max_pixels, max_dimension):
    try:
        content = await upload.read(max_bytes + 1)
    finally:
        await upload.close()

    if not content:
        raise HTTPException(400, "Uploaded image is empty.")

    if len(content) > max_bytes:
        raise HTTPException(413, "Image exceeds upload limit.")

    try:
        with Image.open(BytesIO(content)) as source:
            if source.format not in ALLOWED_FORMATS:
                raise HTTPException(415, "Unsupported image format.")

            if source.width * source.height > max_pixels:
                raise HTTPException(413, "Image dimensions exceed limit.")

            source.seek(0)
            source.load()

            image = ImageOps.exif_transpose(source)

            if "A" in image.getbands() or "transparency" in image.info:
                rgba = image.convert("RGBA")
                background = Image.new("RGB", rgba.size, "white")
                background.paste(rgba, mask=rgba.getchannel("A"))
                image = background
            else:
                image = image.convert("RGB")

            image.thumbnail(
                (max_dimension, max_dimension),
                Image.Resampling.LANCZOS,
            )

            return image.copy()

    except HTTPException:
        raise

    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ) as exc:
        raise HTTPException(
            400, "Invalid or damaged image."
        ) from exc


def save_webp(image, destination):
    image.save(
        destination,
        format="WEBP",
        quality=IMAGE_OUTPUT_QUALITY,
        method=4,
    )
