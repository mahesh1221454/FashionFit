
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

def build_tryon_prompt(view: str) -> str:
    return f"""
You are a professional photorealistic virtual fashion try-on system.

This task is a controlled clothing replacement operation.

INPUT REFERENCES:

IMAGE 1: GARMENT REFERENCE
Use only the clothing, design, fabric, color and outfit components.
The person wearing this garment is NOT the customer.
Ignore that person's face, hairstyle, body shape and physique.

IMAGE 2: CUSTOMER TARGET VIEW
This is the original photograph of the actual customer from the
requested camera direction.

Use this photograph as the primary reference for:
- Body shape
- Body proportions
- Pose
- Camera direction
- Visible facial structure
- Natural physical appearance

IMAGE 3: CUSTOMER IDENTITY REFERENCE
This is an additional photograph of the same actual customer.
Use it to confirm facial identity and natural physique.

Never treat IMAGE 3 as an instruction to change the camera angle.

REQUESTED OUTPUT:
One realistic full-body photograph in {view.upper()} VIEW.

=========================================================
PRIORITY 1: CUSTOMER BODY SHAPE AND PHYSIQUE
=========================================================

Preserving the customer's body shape is mandatory.

The customer must have the same natural physical proportions
as the person in IMAGE 2 and IMAGE 3.

Preserve:
- Original height and relative body proportions.
- Shoulder width and shoulder shape.
- Chest size and natural chest shape.
- Waist circumference appearance.
- Natural abdomen size and profile.
- Hip width and hip shape.
- Arm thickness.
- Thigh and calf thickness.
- Leg length.
- Neck thickness.
- Natural posture and body silhouette.

Do not replace the customer's physique with the garment model's
physique.

Do not make the customer slimmer, taller, shorter, heavier,
more athletic or more muscular.

Do not flatten the abdomen or narrow the waist.

Do not exaggerate shoulders or modify leg proportions.

The selected garment must adapt to the customer's existing body.

Allow realistic garment draping, fabric thickness and natural
folds without changing the underlying anatomy.

=========================================================
PRIORITY 2: EXACT FACIAL IDENTITY
=========================================================

The output must show the actual customer.

Use IMAGE 2 for the visible face and viewing angle.
Use IMAGE 3 to confirm the customer's facial identity.

Preserve:
- Facial structure.
- Eye shape.
- Eyebrows.
- Nose.
- Lips.
- Cheeks.
- Jawline.
- Chin.
- Ears.
- Skin tone.
- Natural skin texture.
- Hairstyle and hairline.
- Beard and moustache.
- Apparent age.

Never copy facial features from IMAGE 1.

Never blend the garment model's face with the customer's face.

Do not perform face beautification, skin whitening, face slimming,
cosmetic retouching or artificial facial reconstruction.

For LEFT and RIGHT views, preserve the customer's genuine
side-profile characteristics.

For BACK views, preserve the customer's original back profile,
hair, head shape, shoulders and physique.

Do not turn the customer toward the front simply because
IMAGE 3 is available.

=========================================================
PRIORITY 3: REALISTIC CLOTHING REPLACEMENT
=========================================================

Replace the customer's clothing with the selected outfit
from IMAGE 1.

Preserve the selected garment's:
- Colors.
- Fabric.
- Patterns.
- Texture.
- Embroidery.
- Stitching.
- Collar and neckline.
- Buttons and pockets.
- Sleeves and cuffs.
- Borders.
- Garment structure and design.

If the selected reference contains trousers, transfer those
trousers as part of the complete outfit.

Do not allow the original customer trousers to remain visible
when replacement trousers are provided.

If the selected reference contains only an upper garment,
preserve the customer's existing lower garment.

Fit every clothing component naturally to the customer's body.

Do not change the customer's anatomy to fit the garment.

=========================================================
PRIORITY 4: REMOVE UNWANTED ACCESSORIES
=========================================================

Remove unrelated customer accessories including:
- ID cards.
- Lanyards.
- Office badges.
- Bags.
- Backpacks.
- Phones held in hands.
- Unrelated neck straps.

Preserve accessories that are integral to the selected outfit.

=========================================================
PRIORITY 5: PURE WHITE BACKGROUND
=========================================================

Use a solid pure white background: RGB 255, 255, 255.

Remove the original backgrounds from all reference photographs.

The background must be:
- Pure white.
- Uniform.
- Clean.
- Free from gradients.
- Free from gray tones.
- Free from colored lighting.
- Free from walls, furniture and scenery.

No visible studio backdrop seams or horizons.
Avoid distracting cast shadows on the background.

Keep realistic garment shading and natural body shading.

=========================================================
PRIORITY 6: PHOTOGRAPHIC REALISM
=========================================================

Produce a realistic professional digital photograph.

Maintain:
- Natural skin texture.
- Correct body anatomy.
- Realistic clothing fit.
- Natural fabric folds.
- Accurate lighting.
- Natural head and hand appearance.
- Original customer physique.
- Correct {view.upper()} viewing direction.

The person must remain upright.

Do not crop the head or feet.
Do not mirror left and right directions incorrectly.

Do not generate illustrations, mannequins, CGI, cartoon effects,
plastic-looking faces, exaggerated body shapes or artificial
beauty filters.

=========================================================

STRICT FOOTWEAR CONSISTENCY
=========================================================

All four generated views must show the same pair of shoes.

Use IMAGE 3, the original customer front photograph,
as the common footwear reference.

If IMAGE 1 explicitly provides footwear as part of the
selected outfit, use that footwear consistently.

Otherwise, preserve the footwear shown in IMAGE 3.

Preserve exactly the same:
- Shoe color.
- Shoe design.
- Shoe material.
- Shoe shape.
- Sole color.
- Laces and decorative details.
- Footwear style.

Never independently select footwear for each camera view.

If the front view has brown shoes, every other view
must also have the same brown shoes.

If the front view has black shoes, every other view
must also have the same black shoes.

Do not randomly switch between brown, black, white,
or any other footwear color.

Do not invent footwear when the reference is unclear.

=========================================================
STRICT SIDE-VIEW IDENTITY PRESERVATION
=========================================================

For LEFT and RIGHT views, do not generate a new person.

Treat IMAGE 2 as the original customer photograph to edit.

Preserve the customer's actual:
- Side-profile facial structure.
- Nose and forehead profile.
- Jawline and chin.
- Beard and moustache.
- Hairstyle and hairline.
- Ear shape.
- Neck thickness.
- Natural shoulder width.
- Chest and abdomen profile.
- Arm and leg thickness.
- Original body silhouette.

Use IMAGE 3 to confirm the customer's identity.

Never copy the garment model's head, face, hairstyle,
body proportions or physical appearance.

Do not remove the customer's beard or moustache.

Do not make a customer with a fuller abdomen appear slim.

Do not change the original body shape to improve
the garment's appearance.

The garment must fit the customer's existing physique.

=========================================================
CROSS-VIEW VISUAL CONSISTENCY
=========================================================

Maintain the same customer and complete outfit across
FRONT, LEFT, RIGHT and BACK views.

Keep consistent:
- Customer facial identity.
- Body shape and proportions.
- Hairstyle.
- Beard and moustache.
- Garment color.
- Garment design.
- Trouser color.
- Trouser design.
- Footwear color.
- Footwear style.
- Pure white background.

Only the camera viewing direction should differ,
while preserving the original pose for that view.

=========================================================
FINAL VERIFICATION
=========================================================

Before returning the photograph, verify that:

1. The person is the original customer.
2. The original customer body shape is preserved.
3. The garment model's identity is not present.
4. The requested viewing direction is correct.
5. The selected outfit is accurately transferred.
6. Referenced trousers are correctly transferred.
7. The background is pure white.
8. Unwanted accessories are removed.
9. The image is natural and photorealistic.

Identity and physique take priority over aesthetic enhancement.

Return exactly one generated image.
Do not return text, collages or watermarks.
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
    identity_image: Image.Image = None,
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

                    "IMAGE 1 - Garment reference only:",
                    design_image,

                    f"IMAGE 2 - Actual customer target {view} view:",
                    person_image,

                    "IMAGE 3 - Actual customer identity reference:",
                    identity_image
                    if identity_image is not None
                    else person_image,
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
    identity_image_path: str = None,
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

    identity_image = prepare_input_image(
        identity_image_path or person_image_path,
        force_portrait=True,
    )

    print(
        f"[IDENTITY] Customer identity reference ready for {view} view."
    )

    prompt = build_tryon_prompt(view)


    # =====================================================
    # GEMINI
    # =====================================================

    response = call_gemini_with_retry(
        prompt=prompt,
        design_image=design_image,
        person_image=person_image,
        identity_image=identity_image,
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

