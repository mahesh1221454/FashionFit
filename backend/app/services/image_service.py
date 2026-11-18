
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

    view = view.strip().lower()

    common_prompt = """

ROLE:
You are a professional virtual clothing try-on image editing
system. Your task is to dress the actual customer in the
selected garment while maintaining their original identity,
physical appearance, body proportions and photographic realism.

PRIMARY OBJECTIVE:
Generate a realistic photograph of the ORIGINAL CUSTOMER
wearing the selected outfit.

This is a clothing replacement task, not a person generation
task, not a face replacement task, and not a fashion model
creation task.

INPUT IMAGE UNDERSTANDING:

CUSTOMER IMAGE:
The customer image is the primary reference for identity,
face, body, skin tone, hairstyle, pose and camera direction.

GARMENT REFERENCE IMAGE:
The garment image is strictly a clothing design reference.

If the garment is displayed on a mannequin or another person,
extract only the clothing information from that reference.

Never use the garment reference person's face, head, hairstyle,
skin, body shape or personal identity.

ADDITIONAL CUSTOMER REFERENCE:
If another customer photograph is provided, use it only to
reinforce the original customer's identity. Do not copy its
camera angle into the requested output.

PRIORITY ORDER:

1. Original customer identity.
2. Requested customer viewing angle.
3. Original customer body proportions.
4. Exact selected garment design.
5. Outfit consistency.
6. Footwear consistency.
7. Photorealistic rendering.


SECTION 1: STRICT CUSTOMER IDENTITY PRESERVATION

The generated person must remain the original customer.

Preserve the customer's:

- Facial geometry.
- Face shape.
- Eye shape, size and spacing.
- Eyebrows.
- Nose shape and nose bridge.
- Lips and mouth structure.
- Cheeks and cheekbones.
- Jawline and chin.
- Forehead.
- Ears.
- Natural skin tone.
- Skin texture.
- Facial hair.
- Beard and moustache.
- Hairstyle.
- Hairline.
- Age appearance.
- Natural facial asymmetry.
- Recognizable personal features.

Treat the original customer head and face as protected regions.

Do not unnecessarily regenerate, reinterpret, beautify,
enhance, reshape or replace the customer's face.

Retain the original face and head pixels wherever feasible.

Do not change the customer's gender, ethnicity, age,
complexion or facial appearance.

Do not generate a generic attractive fashion model.

Do not combine the customer's face with another person's face.

Do not use any facial information from the garment reference.

The result must look like the actual customer wearing
new clothes, rather than another person wearing those clothes.


SECTION 2: MANNEQUIN AND MODEL EXCLUSION

The mannequin or model in the garment reference exists
only to display the selected clothing.

Ignore the mannequin's:

- Face.
- Head.
- Eyes.
- Nose.
- Ears.
- Lips.
- Hair.
- Skin.
- Neck.
- Hands.
- Body shape.
- Body proportions.
- Pose.

Never reproduce a mannequin face.

Never generate plastic-looking skin.

Never transfer the mannequin's identity to the customer.

The original customer is the sole authoritative source
for all visible human identity and anatomical characteristics.


SECTION 3: BODY PRESERVATION

Maintain the customer's original:

- Height appearance.
- Body shape.
- Shoulder width.
- Chest proportions.
- Waist proportions.
- Hip proportions.
- Arm length.
- Leg length.
- Neck length.
- Overall body structure.

Fit the selected clothes naturally onto the customer's
existing body.

Do not reshape the customer to match the mannequin.

Do not make the customer taller, shorter, slimmer,
heavier or more muscular.

Preserve natural human anatomy and realistic proportions.


SECTION 4: EXACT GARMENT REPRODUCTION

Carefully examine the selected garment reference.

Reproduce the same outfit, preserving:

- Original garment category.
- Original color.
- Fabric.
- Material appearance.
- Texture.
- Patterns.
- Prints.
- Embroidery.
- Decorative elements.
- Buttons.
- Seams.
- Collar.
- Neckline.
- Sleeve length.
- Cuffs.
- Garment length.
- Hemline.
- Pants or trousers, if included.
- Included garment accessories.
- Layering.
- Overall design and silhouette.

Do not redesign or simplify the selected garment.

Do not introduce unrelated patterns or additional clothing.

Do not change the color of any garment component.

Do not shorten or extend the garment.

If lower-body clothing is visible in the reference,
reproduce its original design and color.

If lower-body clothing is not included, retain compatible
customer clothing or select suitable complementary clothing
for the front image.

Maintain the same clothing arrangement across all views.

For garment regions not visible in the reference, infer
only reasonable construction details consistent with the
visible design. Do not introduce unrelated decorations.


SECTION 5: FOOTWEAR SELECTION AND CONSISTENCY

Inspect the complete selected garment reference for footwear.

CASE A: FOOTWEAR IS PRESENT

If shoes, sandals, heels, traditional footwear or any other
footwear are visible in the selected garment reference:

Use the exact same footwear.

Preserve its:

- Color.
- Design.
- Style.
- Shape.
- Material.
- Texture.
- Pattern.
- Sole appearance.

Do not substitute different footwear.

CASE B: FOOTWEAR IS NOT PRESENT

If the selected garment reference does not include footwear:

Automatically select appropriate footwear that complements
the garment's design, color, category and occasion.

Examples:

- Traditional ethnic outfits: suitable traditional footwear.
- Sherwani: matching ethnic shoes or mojari.
- Formal suits: suitable formal dress shoes.
- Casual outfits: suitable casual footwear.
- Sarees: appropriate sandals or ethnic footwear.
- Lehengas: complementary ethnic footwear.
- Western dresses: suitable footwear matching the outfit.
- Sportswear: suitable athletic footwear.

Select footwear based on the complete outfit, not on
random styling preferences.

Footwear must have natural proportions and realistic
ground contact.

FOOTWEAR CONSISTENCY:

The footwear selected during front-view generation must
remain unchanged in subsequent views when a generated
front-outfit reference is provided.

Do not independently redesign or recolor footwear for
the left, right or back view.

Show the same footwear from the requested camera angle.


SECTION 6: FOUR-VIEW OUTFIT CONSISTENCY

All images belong to the same virtual try-on session.

The customer must appear to be wearing the same physical
outfit photographed from different viewpoints.

Maintain identical:

- Customer identity.
- Garment color.
- Fabric appearance.
- Embroidery.
- Garment length.
- Sleeve length.
- Trousers design and color.
- Footwear style and color.
- Clothing layers.
- Included accessories.

If a generated front-outfit reference is supplied,
use it only as a clothing and footwear consistency reference.

Never use it to override the actual customer image's
identity, head orientation or body pose.

The selected original garment reference remains the
authoritative source for visible garment design details.

Do not introduce a different outfit in another view.


SECTION 7: PHOTOGRAPHIC REALISM

Generate a natural, realistic fashion photograph.

Maintain:

- Natural skin texture.
- Realistic fabric folds.
- Correct clothing draping.
- Realistic shadows.
- Natural lighting.
- Accurate perspective.
- Anatomically correct hands and feet.
- Realistic clothing fitting.
- Natural connection between the head, neck and body.

Preserve the customer's original pose and body direction.

Keep the person fully visible from head to footwear
whenever the input image and framing allow.

Do not crop out the head or feet unnecessarily.

Avoid artificial or excessively stylized appearance.


SECTION 8: STRICTLY PROHIBITED OUTPUTS

Do not generate:

- A mannequin face.
- A different person.
- A generic AI fashion model.
- A modified customer face.
- Plastic skin.
- An altered hairstyle.
- Different facial hair.
- Incorrect camera direction.
- Mirrored left or right views.
- Changed garment colors.
- Different trousers across views.
- Different footwear across views.
- Incorrect garment lengths.
- Unnatural body proportions.
- Extra fingers or limbs.
- Watermarks.
- Text.
- Logos not present in the garment.
- Collages.
- Multiple people.


SECTION 9: OUTPUT REQUIREMENT

Return exactly ONE realistic virtual try-on image
for the requested view.

The final image must show the original customer
wearing the selected outfit.

Prioritize customer identity preservation over
beautification or creative modification.

"""

    view_prompts = {

        "front": """

REQUESTED VIEW: FRONT VIEW

Use the original front-facing customer photograph
as the primary image for editing.

Preserve the customer's original front-facing identity,
facial features, expression, hairstyle and head position.

Both eyes should remain visible if they are visible
in the original customer photograph.

Preserve the original shoulder orientation, body posture
and camera perspective.

Replace only the customer's existing clothing with
the selected outfit and apply the footwear rule.

The customer must face the same direction as in the
original front photograph.

Do not rotate the customer into a side view.

Establish the garment appearance, lower-body clothing,
accessories and footwear for this try-on session.

Return exactly one front-view photograph.

""",

        "left": """

REQUESTED VIEW: LEFT SIDE VIEW

Use the original LEFT customer photograph as the
primary image for editing.

The customer in the left reference photograph is
the only authoritative source for side-profile identity.

Preserve the original:

- Left-profile facial geometry.
- Visible eye.
- Nose profile.
- Forehead profile.
- Jawline.
- Chin.
- Ear.
- Beard and moustache.
- Side hairstyle.
- Neck and head proportions.

Follow the exact viewing direction and body orientation
of the original left customer photograph.

Do not horizontally flip or mirror the photograph.

Do not copy the right-side profile.

Do not convert the side profile into a front-facing view.

Do not replace the original customer's side-profile face
with the mannequin's side-profile face.

Apply the selected garment naturally to the customer's
left-side body orientation.

If a front-outfit consistency reference is available,
reproduce the same garment and footwear from this angle.

Return exactly one left-side photograph.

""",

        "right": """

REQUESTED VIEW: RIGHT SIDE VIEW

Use the original RIGHT customer photograph as the
primary image for editing.

The customer in the right reference photograph is
the only authoritative source for side-profile identity.

Preserve the original:

- Right-profile facial geometry.
- Visible eye.
- Nose profile.
- Forehead profile.
- Jawline.
- Chin.
- Ear.
- Beard and moustache.
- Side hairstyle.
- Neck and head proportions.

Follow the exact viewing direction and body orientation
of the original right customer photograph.

Do not horizontally flip or mirror the photograph.

Do not copy the left-side profile.

Do not convert the side profile into a front-facing view.

Do not generate the garment reference model's face.

Apply the selected garment naturally to the customer's
right-side body orientation.

Maintain the same garment length, trousers and footwear
established in the front-outfit reference, if supplied.

Return exactly one right-side photograph.

""",

        "back": """

REQUESTED VIEW: BACK VIEW

Use the original BACK customer photograph as the
primary image for editing.

Preserve the original:

- Back of the head.
- Hair texture.
- Rear hairstyle.
- Hairline.
- Neck.
- Shoulder width.
- Back posture.
- Body shape.
- Arm position.
- Leg position.

Follow the exact rear-facing direction of the
original back customer photograph.

Do not turn the customer's head toward the camera.

Do not create facial features where the original
back-facing image does not show them.

Reproduce the selected garment from behind.

Maintain the original garment color, fabric, sleeve
length, hemline and overall construction.

Where rear garment details are not visible in the
selected garment reference, infer realistic details
consistent with the original garment.

Do not invent unrelated embroidery or decorations.

Maintain the same trousers, accessories and footwear
as the front-outfit reference, if supplied.

Return exactly one back-view photograph.

"""

    }

    if view not in view_prompts:
        raise ValueError(f"Unsupported try-on view: {view}")

    return (
        common_prompt.strip()
        + "\n\n"
        + view_prompts[view].strip()
    )




# =========================================================
# GEMINI CALL WITH RETRIES
# =========================================================

# =========================================================
# GEMINI CALL WITH RETRIES + DATABASE USAGE TRACKING
# =========================================================


def build_v4_reference_contents(
    prompt,
    view,
    person_image,
    design_image,
    outfit_reference=None,
):
    """
    V4_IMAGE_REFERENCE_MAPPING

    Each reference has an explicit role.
    Customer identity always takes priority.
    """

    contents = [
        "IMAGE 1: PRIMARY CUSTOMER PHOTOGRAPH. "
        "Edit this exact person. Preserve the face, head, "
        "hair, skin tone, body shape, pose and viewing "
        "direction. Replace clothing only.",

        person_image,

        "IMAGE 2: SELECTED GARMENT REFERENCE. "
        "Use this image exclusively for garment design, "
        "fabric, color, embroidery, length, accessories "
        "and included footwear. Ignore the mannequin or "
        "model's face, head, hair, skin and body.",

        design_image,
    ]

    if view != "front" and outfit_reference is not None:

        contents.extend([
            "IMAGE 3: GENERATED FRONT OUTFIT REFERENCE. "
            "Use only the clothing and footwear shown here. "
            "Maintain the same garment length, colors, "
            "trousers, accessories and footwear. "
            "Ignore the head, face and body orientation. "
            "Do not copy the front-facing pose.",

            outfit_reference,
        ])

    contents.extend([
        "FINAL INSTRUCTIONS: Apply the following rules "
        "to IMAGE 1. Identity and viewing direction must "
        "come from IMAGE 1 only.",

        prompt,
    ])

    return contents


def call_gemini_with_retry(
    prompt: str,
    design_image: Image.Image,
    person_image: Image.Image,
    view: str,
    job_id=None,
    identity_image: Image.Image = None,
    footwear_reference: Image.Image = None, customer_images=None,
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
                contents=(
                    build_v4_reference_contents(
                    prompt=prompt,
                    view=view,
                    person_image=person_image,
                    design_image=design_image,
                    outfit_reference=footwear_reference,
                )
                ),
                config=types.GenerateContentConfig(
                    temperature=0.3, response_modalities=["IMAGE"],
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



# =========================================================
# FASHIONFIT_V41_DIRECTION_VALIDATION
# =========================================================

import json


STRICT_VIEW_PROMPTS = {
    "front": """
Generate a strict FRONT view.

The customer must face directly toward the camera.
Both eyes and the front of the torso must be visible.
Head, shoulders, knees and feet must face forward.
Do not generate a side or rear-facing pose.
Return a complete head-to-foot photograph.
""",

    "left": """
Generate a strict LEFT-facing side profile.

The nose, chest, knees and toes must point toward
the LEFT EDGE of the output image.

Only the near-side facial profile should be visible.
Do not face toward the right edge.
Do not generate a three-quarter view.
Do not mirror another photograph.
Preserve anatomical accessory placement.
""",

    "right": """
Generate a strict RIGHT-facing side profile.

The nose, chest, knees and toes must point toward
the RIGHT EDGE of the output image.

This must be the opposite viewing direction
from the LEFT-facing result.

Do not generate a left-facing profile.
Do not duplicate or mirror the left-view image.
Do not generate a three-quarter view.
Preserve anatomical accessory placement.
""",

    "back": """
Generate a strict BACK view.

The customer must face completely away from the camera.
Show the back of the head, torso, garment and footwear.
The eyes, nose and mouth must not be visible.
Do not turn the head toward either shoulder.
Do not generate a side or three-quarter rear view.
"""
}


def validate_generated_direction(
    image,
    expected_view,
    job_id=None,
    attempt=1,
):

    enabled = os.getenv(
        "VIEW_VALIDATION_ENABLED",
        "true",
    ).strip().lower() == "true"

    if not enabled:
        return True, "Validation disabled"

    model = os.getenv(
        "VIEW_VALIDATION_MODEL",
        "",
    ).strip()

    if not model:
        raise RuntimeError(
            "VIEW_VALIDATION_MODEL is not configured."
        )

    validation_prompt = """
You are a strict image orientation quality inspector.

Analyze the actual image pixels.

Do not assume the requested pose is correct.

Classify the person into exactly one category:

front:
Face and torso directly toward the camera.

left:
Nose and body pointing toward the left image edge.

right:
Nose and body pointing toward the right image edge.

back:
Person facing away from the camera with no visible face.

invalid:
Three-quarter view, ambiguous direction,
conflicting head and torso orientation,
multiple people or incorrect pose.

Also check whether the complete body, including
head and footwear, is visible.

Return only JSON using this exact structure:

{
    "detected_view": "front",
    "full_body_visible": true,
    "body_alignment_valid": true,
    "reason": ""
}
"""

    started_at = time.perf_counter()

    try:
        response = client.models.generate_content(
            model=model,
            contents=[
                validation_prompt,
                image,
            ],
            config=types.GenerateContentConfig(
                temperature=0,
                response_mime_type="application/json",
            ),
        )

        record_gemini_usage(
            model_name=model,
            view_name=expected_view,
            attempt_number=attempt,
            status="success",
            duration_ms=elapsed_milliseconds(
                started_at
            ),
            response=response,
            job_id=job_id,
        )

    except Exception as error:

        record_gemini_usage(
            model_name=model,
            view_name=expected_view,
            attempt_number=attempt,
            status="failed",
            duration_ms=elapsed_milliseconds(
                started_at
            ),
            error=error,
            job_id=job_id,
        )

        raise RuntimeError(
            f"View validation API failed: {error}"
        ) from error

    try:
        result = json.loads(response.text)

        detected = str(
            result.get("detected_view", "invalid")
        ).strip().lower()

        valid = (
            detected == expected_view
            and result.get(
                "full_body_visible"
            ) is True
            and result.get(
                "body_alignment_valid"
            ) is True
        )

        reason = (
            f"Expected={expected_view}, "
            f"Detected={detected}, "
            f"Details={result.get('reason', '')}"
        )

        print(
            f"[V4.1 VALIDATION] "
            f"{'PASS' if valid else 'FAIL'}: "
            f"{reason}"
        )

        return valid, reason

    except Exception as error:
        raise RuntimeError(
            f"Invalid view validation response: {error}"
        ) from error


def generate_single_image(
    design_image_path: str,
    person_image_path: str,
    view: str,
    job_id: str,
    usage_job_id=None,
    identity_image_path: str = None, customer_image_paths=None,
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


    validation_enabled = os.getenv(
        "VIEW_VALIDATION_ENABLED",
        "true",
    ).strip().lower() == "true"

    if validation_enabled and not os.getenv(
        "VIEW_VALIDATION_MODEL",
        "",
    ).strip():
        raise RuntimeError(
            "VIEW_VALIDATION_MODEL is not configured."
        )

    prompt = (
        build_tryon_prompt(view)
        + "\\n\\nSTRICT OUTPUT DIRECTION:"
        + STRICT_VIEW_PROMPTS[view]
        + "\\nThe strict output direction takes priority "
          "over any conflicting pose instructions."
    )



    # =====================================================
    # GEMINI
    # =====================================================


    required_views = ("front", "left", "right", "back")

    if not customer_image_paths:
        raise ValueError(
            "All four customer photographs are required."
        )

    customer_images = {}

    for reference_view in required_views:
        reference_path = customer_image_paths.get(
            reference_view
        )

        if not reference_path:
            raise ValueError(
                f"Missing customer {reference_view} photograph."
            )

        if reference_view == view:
            customer_images[reference_view] = person_image
        else:
            customer_images[reference_view] = prepare_input_image(
                reference_path,
                force_portrait=True,
            )

    print(
        f"[MULTI-ANGLE] Prepared all four customer references "
        f"for {view.upper()} generation."
    )


    # =====================================================
    # V4 FRONT OUTFIT CONSISTENCY REFERENCE
    # =====================================================

    front_outfit_reference = None

    if view != "front":

        _, front_output_path, _ = generated_output_details(
            job_id,
            "front",
        )

        if not is_existing_image_usable(
            front_output_path
        ):
            raise RuntimeError(
                "A valid generated front image is required "
                "before generating other views."
            )

        front_outfit_reference = prepare_input_image(
            front_output_path,
            force_portrait=True,
        )

        print(
            f"[V4] {view.upper()}: "
            "Loaded generated front outfit reference."
        )

    else:

        print(
            "[V4] FRONT: Establishing outfit "
            "and footwear appearance."
        )


    # =====================================================
    # V4.1 GENERATION AND DIRECTION VALIDATION
    # =====================================================

    max_regenerations = int(
        os.environ[
            "VIEW_MAX_REGENERATION_ATTEMPTS"
        ]
    )

    if max_regenerations < 0:
        raise ValueError(
            "Invalid regeneration attempt configuration."
        )

    if not validation_enabled:
        max_regenerations = 0

    correction = ""
    generated_pil = None
    accepted = False
    rejection_reason = ""

    # Reject mislabeled customer photographs before
    # spending tokens on image generation.

    if validation_enabled:

        input_valid, input_reason = (
            validate_generated_direction(
                image=person_image,
                expected_view=view,
                job_id=usage_job_id,
                attempt=1,
            )
        )

        if not input_valid:
            raise RuntimeError(
                f"Incorrect customer {view} photograph. "
                f"{input_reason}. "
                "Please upload the correct viewing angle."
            )

    for quality_attempt in range(
        1,
        max_regenerations + 2,
    ):

        print(
            f"[V4.1] {view.upper()} "
            f"quality attempt {quality_attempt}/"
            f"{max_regenerations + 1}"
        )

        response = call_gemini_with_retry(
            customer_images=customer_images,
            prompt=prompt + correction,
            design_image=design_image,
            person_image=person_image,
            view=view,
            job_id=usage_job_id,
            identity_image=person_image,
            footwear_reference=front_outfit_reference,
        )

        image_bytes = (
            extract_generated_image_bytes(
                response,
                view,
            )
        )

        generated_pil = generated_bytes_to_pil(
            image_bytes,
            view,
        )

        if generated_pil.width > generated_pil.height:

            # Rotating a landscape image does not
            # correct the actual human viewing direction.

            accepted = False

            rejection_reason = (
                "Generated image must be upright "
                "and portrait-oriented."
            )

        else:

            accepted, rejection_reason = (
                validate_generated_direction(
                    image=generated_pil,
                    expected_view=view,
                    job_id=usage_job_id,
                    attempt=quality_attempt,
                )
            )

        if accepted:

            print(
                f"[V4.1] {view.upper()} "
                "accepted successfully."
            )

            break

        print(
            f"[V4.1] {view.upper()} rejected: "
            f"{rejection_reason}"
        )

        correction = (
            "\\n\\nPREVIOUS OUTPUT WAS REJECTED."
            "\\nReason: "
            + rejection_reason
            + "\\nGenerate a new image."
            + "\\nFollow the exact requested direction."
            + "\\nDo not repeat the previous pose."
            + "\\n"
            + STRICT_VIEW_PROMPTS[view]
        )

    if not accepted:
        raise RuntimeError(
            f"Unable to generate a valid {view} image "
            f"after {max_regenerations + 1} attempts. "
            f"{rejection_reason}"
        )

    # Save only the validated image.

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

