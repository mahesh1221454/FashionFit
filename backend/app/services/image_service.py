
import os
import time
import base64

from io import BytesIO

from PIL import Image, ImageOps
from google import genai
from google.genai import types

from app.core.gemini_config import (
    GEMINI_API_KEY,
    GEMINI_MODEL,
    MAX_RETRIES,
    RETRY_DELAYS,
    MAX_INPUT_DIMENSION,
)

from app.services.gemini_usage import (
    record_gemini_usage,
    elapsed_milliseconds,
)

from app.services.generated_image_storage import (
    generated_output_details,
    is_existing_image_usable,
    save_generated_image_atomic,
)


# =========================================================
# GEMINI CLIENT
# =========================================================

client = genai.Client(
    api_key=GEMINI_API_KEY
)


# =========================================================
# OUTPUT CONFIGURATION
# =========================================================

GENERATED_DIR = "generated"

os.makedirs(
    GENERATED_DIR,
    exist_ok=True,
)





# =========================================================
# RETRYABLE GEMINI ERRORS
# =========================================================

def is_retryable_gemini_error(
    error: Exception,
) -> bool:

    message = str(
        error
    ).lower()

    retryable_terms = [
        "503",
        "unavailable",
        "deadline expired",
        "deadline exceeded",
        "service unavailable",
        "temporarily unavailable",
        "resource exhausted",
        "429",
        "timeout",
        "timed out",
    ]

    return any(
        term in message
        for term in retryable_terms
    )


# =========================================================
# PREPARE INPUT IMAGE
# =========================================================

def prepare_input_image(
    image_path: str,
    force_portrait: bool = False,
) -> Image.Image:
    """
    Prepare input image for Gemini.

    - validates file
    - applies EXIF orientation
    - converts to RGB
    - fixes sideways customer images
    - resizes large images
    """

    if not image_path:

        raise ValueError(
            "Image path is empty."
        )


    if not os.path.exists(
        image_path
    ):

        raise FileNotFoundError(
            f"Image not found: {image_path}"
        )


    try:

        with Image.open(
            image_path
        ) as opened_image:

            image = (
                ImageOps.exif_transpose(
                    opened_image
                )
                .convert(
                    "RGB"
                )
                .copy()
            )

    except Exception as error:

        raise RuntimeError(
            f"Unable to open image "
            f"{image_path}: {error}"
        )


    width, height = (
        image.size
    )


    print()
    print(
        f"[IMAGE] Loaded: "
        f"{os.path.basename(image_path)}"
    )

    print(
        f"[IMAGE] Current dimensions: "
        f"{width}x{height}"
    )


    # =====================================================
    # CUSTOMER FULL-BODY ORIENTATION FIX
    # =====================================================

    if (
        force_portrait
        and
        width > height
    ):

        print(
            "[IMAGE] Landscape customer "
            "photo detected."
        )

        print(
            "[IMAGE] Rotating customer "
            "photo 90Â° clockwise."
        )


        image = image.transpose(
            Image.Transpose.ROTATE_270
        )


        width, height = (
            image.size
        )


        print(
            f"[IMAGE] Corrected dimensions: "
            f"{width}x{height}"
        )


    # =====================================================
    # RESIZE
    # =====================================================

    largest_dimension = max(
        width,
        height,
    )


    if (
        largest_dimension >
        MAX_INPUT_DIMENSION
    ):

        scale = (
            MAX_INPUT_DIMENSION
            /
            float(
                largest_dimension
            )
        )


        new_width = max(
            1,
            int(
                width * scale
            ),
        )


        new_height = max(
            1,
            int(
                height * scale
            ),
        )


        image = image.resize(
            (
                new_width,
                new_height,
            ),
            Image.Resampling.LANCZOS,
        )


        width, height = (
            image.size
        )


        print(
            f"[IMAGE] Resized to: "
            f"{width}x{height}"
        )


    print(
        f"[IMAGE] Final dimensions: "
        f"{image.size[0]}x"
        f"{image.size[1]}"
    )


    return image


# =========================================================
# PROMPT
# =========================================================

def build_tryon_prompt(
    view: str,
) -> str:

    return f"""
You are an expert AI virtual fashion try-on image generator.

You are given two images.

IMAGE 1:
The selected garment/design reference.

IMAGE 2:
The real customer's photograph.

Required output:

{view.upper()} VIEW


MAIN TASK:

Generate a highly realistic photographic virtual try-on
showing the SAME CUSTOMER wearing the selected garment.


CUSTOMER PRESERVATION:

- Keep exactly the same person.
- Preserve facial identity.
- Preserve facial structure.
- Preserve hairstyle.
- Preserve skin tone.
- Preserve body proportions.
- Preserve body shape.
- Preserve natural hands and legs.
- Preserve the customer's original pose as much as possible.
- Preserve the requested camera/view direction.
- Do not replace the person.


GARMENT PRESERVATION:

Preserve the selected garment accurately.

Maintain:

- garment type
- garment color
- garment length
- garment pattern
- embroidery
- decorative work
- collar
- neckline
- buttons
- sleeves
- cuffs
- pockets
- borders
- fabric appearance
- stitching
- silhouette
- garment structure


ORIENTATION REQUIREMENTS:

The human subject must remain upright.

The person's head must be at the top of the image.

The person's feet must be at the bottom of the image.

Never rotate the human subject sideways.

Do not place the person horizontally.

Do not rotate the final photograph 90 degrees.


VIRTUAL TRY-ON REQUIREMENTS:

Replace only the customer's clothing.

The garment should fit naturally on the customer's body.

The result should look like a professional real-world
fashion photograph.


IMPORTANT:

Do not create a different garment.

Do not create a different customer.

Do not significantly change the body.

Do not create a cartoon.

Do not create an illustration.

Do not add text.

Do not add watermarks.

Requested camera view:

{view.upper()} VIEW

Return only the generated image.
"""


# =========================================================
# GEMINI CALL WITH RETRIES
# =========================================================

# =========================================================
# GEMINI CALL WITH RETRIES + DATABASE USAGE TRACKING
# =========================================================

def call_gemini_with_retry(
    prompt: str,
    design_image: Image.Image,
    person_image: Image.Image,
    view: str,
    job_id=None,
):
    last_error = None

    for attempt in range(
        1,
        MAX_RETRIES + 1,
    ):
        print()
        print("------------------------------------------")
        print(
            f"[GEMINI] {view.upper()} "
            f"attempt {attempt}/{MAX_RETRIES}"
        )
        print("------------------------------------------")

        # Time only the Gemini request, not retry delays.
        started_at = time.perf_counter()

        try:
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=[
                    prompt,
                    design_image,
                    person_image,
                ],
                config=types.GenerateContentConfig(
                    response_modalities=["IMAGE"],
                ),
            )

        except Exception as error:
            duration_ms = elapsed_milliseconds(
                started_at
            )

            last_error = error

            # Record this failed API attempt.
            # The recorder handles its own database errors.
            record_gemini_usage(
                model_name=GEMINI_MODEL,
                view_name=view,
                attempt_number=attempt,
                status="failed",
                duration_ms=duration_ms,
                error=error,
                job_id=job_id,
            )

            print(
                f"[GEMINI] {view.upper()} "
                f"attempt {attempt} failed:"
            )

            print(str(error))

            if not is_retryable_gemini_error(error):
                raise RuntimeError(
                    f"Gemini generation failed "
                    f"for {view} view: {error}"
                ) from error

            if attempt >= MAX_RETRIES:
                break

            delay_index = min(
                attempt - 1,
                len(RETRY_DELAYS) - 1,
            )

            delay = RETRY_DELAYS[delay_index]

            print("[GEMINI] Temporary error.")
            print(
                f"[GEMINI] Retrying {view.upper()} "
                f"in {delay} seconds..."
            )

            time.sleep(delay)
            continue

        # Record the successful API attempt.
        duration_ms = elapsed_milliseconds(
            started_at
        )

        record_gemini_usage(
            model_name=GEMINI_MODEL,
            view_name=view,
            attempt_number=attempt,
            status="success",
            duration_ms=duration_ms,
            response=response,
            job_id=job_id,
        )

        print(
            f"[GEMINI] {view.upper()} "
            "request succeeded."
        )

        return response

    raise RuntimeError(
        f"Gemini generation failed "
        f"for {view} view after "
        f"{MAX_RETRIES} attempts: "
        f"{last_error}"
    )


# =========================================================
# GET RESPONSE PARTS SAFELY
# =========================================================

def get_response_parts(
    response,
):

    # First try convenience property
    parts = getattr(
        response,
        "parts",
        None,
    )


    if parts:

        return parts


    # Fallback through candidates
    candidates = getattr(
        response,
        "candidates",
        None,
    )


    if not candidates:

        return []


    for candidate in candidates:

        content = getattr(
            candidate,
            "content",
            None,
        )


        if not content:
            continue


        candidate_parts = getattr(
            content,
            "parts",
            None,
        )


        if candidate_parts:

            return candidate_parts


    return []


# =========================================================
# EXTRACT GENERATED IMAGE BYTES
# =========================================================

def extract_generated_image_bytes(
    response,
    view: str,
) -> bytes:
    """
    Extract the raw image bytes directly from Gemini.

    IMPORTANT:
    This does NOT use part.as_image().

    That avoids google.genai.types.Image/PIL compatibility
    problems such as:

    - no attribute width
    - no attribute height
    - no attribute load
    """

    parts = get_response_parts(
        response
    )


    if not parts:

        raise RuntimeError(
            f"Gemini returned no response parts "
            f"for {view} view."
        )


    for part in parts:

        inline_data = getattr(
            part,
            "inline_data",
            None,
        )


        if inline_data is None:

            continue


        image_data = getattr(
            inline_data,
            "data",
            None,
        )


        if not image_data:

            continue


        # Normally google-genai returns bytes.
        if isinstance(
            image_data,
            bytes,
        ):

            return image_data


        if isinstance(
            image_data,
            bytearray,
        ):

            return bytes(
                image_data
            )


        # Safety fallback if SDK returns base64 string.
        if isinstance(
            image_data,
            str,
        ):

            try:

                return base64.b64decode(
                    image_data
                )

            except Exception as error:

                raise RuntimeError(
                    f"Unable to decode Gemini "
                    f"{view} image data: {error}"
                )


    raise RuntimeError(
        f"Gemini did not return image bytes "
        f"for {view} view."
    )


# =========================================================
# CONVERT GENERATED BYTES TO PIL
# =========================================================

def generated_bytes_to_pil(
    image_bytes: bytes,
    view: str,
) -> Image.Image:

    if not image_bytes:

        raise RuntimeError(
            f"Generated image data is empty "
            f"for {view} view."
        )


    try:

        with Image.open(
            BytesIO(
                image_bytes
            )
        ) as generated_source:

            generated_pil = (
                ImageOps.exif_transpose(
                    generated_source
                )
                .convert(
                    "RGB"
                )
                .copy()
            )


    except Exception as error:

        raise RuntimeError(
            f"Unable to decode generated "
            f"{view} image: {error}"
        )


    print(
        f"[OUTPUT] Gemini decoded image: "
        f"{generated_pil.size[0]}x"
        f"{generated_pil.size[1]}"
    )


    return generated_pil


# =========================================================
# GENERATE SINGLE TRY-ON IMAGE
# =========================================================

def generate_single_image(
    design_image_path: str,
    person_image_path: str,
    view: str,
    job_id: str,
    usage_job_id=None,
):

    # =====================================================
    # VALIDATE VIEW
    # =====================================================

    allowed_views = {
        "front",
        "left",
        "right",
        "back",
    }


    view = (
        view
        .lower()
        .strip()
    )


    if (
        view not in
        allowed_views
    ):

        raise ValueError(
            f"Invalid view: {view}"
        )


    # =====================================================
    # VALIDATE FILES
    # =====================================================

    if not design_image_path:

        raise ValueError(
            "Design image path is empty."
        )


    if not os.path.exists(
        design_image_path
    ):

        raise FileNotFoundError(
            f"Design image not found: "
            f"{design_image_path}"
        )


    if not person_image_path:

        raise ValueError(
            "Customer image path is empty."
        )


    if not os.path.exists(
        person_image_path
    ):

        raise FileNotFoundError(
            f"Customer image not found: "
            f"{person_image_path}"
        )


    # =====================================================
    # OUTPUT FOLDER
    # =====================================================

    job_folder, output_path, output_url = generated_output_details(job_id, view)


    # =====================================================
    # REUSE EXISTING OUTPUT
    # =====================================================

    if is_existing_image_usable(output_path):

        print(
            f"[GEMINI] "
            f"{view.upper()} output already exists."
        )


        print(
            f"[GEMINI] Reusing: "
            f"{output_path}"
        )


        return {
            "image_url":
                output_url,

            "path":
                output_path,

            "view":
                view,

            "reused":
                True,
        }


    # =====================================================
    # PREPARE DESIGN IMAGE
    # =====================================================

    print()
    print(
        "=========================================="
    )

    print(
        f"[GENERATION IMAGE] "
        f"{view.upper()}"
    )

    print(
        "=========================================="
    )


    design_image = prepare_input_image(
        design_image_path,
        force_portrait=False,
    )


    # =====================================================
    # PREPARE CUSTOMER IMAGE
    # =====================================================

    person_image = prepare_input_image(
        person_image_path,
        force_portrait=True,
    )


    # =====================================================
    # FINAL CUSTOMER IMAGE SAFETY CHECK
    # =====================================================

    customer_width, customer_height = (
        person_image.size
    )


    if (
        customer_width >
        customer_height
    ):

        print(
            "[IMAGE] Final customer image "
            "is still landscape."
        )

        print(
            "[IMAGE] Applying final "
            "clockwise rotation."
        )


        person_image = (
            person_image.transpose(
                Image.Transpose.ROTATE_270
            )
        )


    print(
        f"[IMAGE] Customer sent to Gemini: "
        f"{person_image.size[0]}x"
        f"{person_image.size[1]}"
    )


    # =====================================================
    # BUILD PROMPT
    # =====================================================

    prompt = build_tryon_prompt(
        view
    )


    # =====================================================
    # GEMINI
    # =====================================================

    response = call_gemini_with_retry(
        prompt=prompt,
        design_image=design_image,
        person_image=person_image,
        view=view,
                   job_id=usage_job_id,
               )


    # =====================================================
    # GET RAW IMAGE BYTES
    # =====================================================

    image_bytes = (
        extract_generated_image_bytes(
            response,
            view,
        )
    )


    print(
        f"[OUTPUT] Received "
        f"{len(image_bytes)} bytes "
        f"for {view.upper()} view."
    )


    # =====================================================
    # CONVERT TO PIL
    # =====================================================

    generated_pil = (
        generated_bytes_to_pil(
            image_bytes,
            view,
        )
    )


    # =====================================================
    # OUTPUT ORIENTATION
    # =====================================================
    #
    # Our fashion result should normally be portrait.
    #
    # However, do NOT blindly rotate every landscape result
    # multiple times. We perform exactly one correction here.
    # =====================================================

    output_width, output_height = (
        generated_pil.size
    )


    if (
        output_width >
        output_height
    ):

        print(
            f"[OUTPUT] Landscape generated "
            f"result detected: "
            f"{output_width}x{output_height}"
        )


        print(
            "[OUTPUT] Rotating result "
            "90Â° clockwise."
        )


        generated_pil = (
            generated_pil.transpose(
                Image.Transpose.ROTATE_270
            )
        )


        print(
            f"[OUTPUT] Corrected result: "
            f"{generated_pil.size[0]}x"
            f"{generated_pil.size[1]}"
        )


    else:

        print(
            "[OUTPUT] Generated result "
            "is already portrait."
        )


    # =====================================================
    # SAVE FINAL PNG
    # =====================================================

    try:

        save_generated_image_atomic(generated_pil, output_path)


    except Exception as error:

        raise RuntimeError(
            f"Unable to save generated "
            f"{view} image: {error}"
        )


    # =====================================================
    # SUCCESS LOG
    # =====================================================

    print()

    print(
        f"[GEMINI] "
        f"{view.upper()} "
        f"generation completed."
    )


    print(
        f"[GEMINI] Saved: "
        f"{output_path}"
    )


    print(
        f"[GEMINI] URL: "
        f"{output_url}"
    )


    print(
        "=========================================="
    )


    # =====================================================
    # RETURN
    # =====================================================

    return {
        "image_url":
            output_url,

        "path":
            output_path,

        "view":
            view,

        "reused":
            False,
    }

