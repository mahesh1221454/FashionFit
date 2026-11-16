GARMENT_COLORS = {
    "original": None,
    "black": "#222222",
    "white": "#FFFFFF",
    "navy_blue": "#172554",
    "maroon": "#800020",
    "olive_green": "#556B2F",
    "beige": "#D7C5A5",
    "gray": "#808080",
    "sky_blue": "#87CEEB",
    "royal_blue": "#4169E1",
    "brown": "#795548",
    "red": "#B91C1C",
    "purple": "#6B21A8",
}


def get_available_colors():
    return [
        {
            "id": key,
            "name": key.replace("_", " ").title(),
            "hex": value,
        }
        for key, value in GARMENT_COLORS.items()
    ]


def validate_garment_color(color=None):
    selected = (color or "original").strip().lower()

    if selected not in GARMENT_COLORS:
        raise ValueError("Unsupported garment color.")

    return selected


def get_garment_color_hex(color=None):
    selected = validate_garment_color(color)
    return GARMENT_COLORS[selected]


def build_garment_color_prompt(color=None):
    selected = validate_garment_color(color)

    if selected == "original":
        return (
            "Preserve the original garment fabric color "
            "exactly as shown in the garment reference."
        )

    color_hex = GARMENT_COLORS[selected]
    color_name = selected.replace("_", " ").title()

    return f'''
SELECTED GARMENT COLOR:

The customer selected {color_name} ({color_hex}).

Override the original PRIMARY GARMENT fabric color
with the selected color.

Apply the selected color consistently across
front, left, right and back views.

Preserve:
- Original garment design.
- Fabric texture.
- Embroidery.
- Buttons.
- Decorative stones.
- Stitching.
- Patterns.
- Natural shadows and fabric folds.

Do not change:
- Customer facial identity.
- Customer skin tone.
- Customer body shape.
- Customer hairstyle.
- Customer body proportions.
- Trouser color.
- Footwear color or design.
- Pure white background.

Only recolor the primary garment fabric.

Identity and physique preservation remain mandatory.
'''



# =====================================================
# GARMENT COLOUR PROCESSING ENGINE
# =====================================================

from PIL import Image, ImageColor, ImageStat


def prepare_garment_mask(image, mask):
    image = image.convert("RGB")
    mask = mask.convert("L")

    if image.size != mask.size:
        raise ValueError("Garment image and mask dimensions must match.")

    if mask.getbbox() is None:
        raise ValueError("Garment mask is empty.")

    return image, mask


def detect_original_color(image, mask):
    image, mask = prepare_garment_mask(image, mask)

    analysis_mask = mask.point(
        lambda value: 255 if value >= 200 else 0
    )

    if analysis_mask.getbbox() is None:
        raise ValueError("No reliable garment pixels detected.")

    statistics = ImageStat.Stat(image, analysis_mask)

    rgb = tuple(
        int(value) for value in statistics.median[:3]
    )

    detected_hex = "#{:02X}{:02X}{:02X}".format(*rgb)

    nearest_color = min(
        (
            key for key in GARMENT_COLORS
            if key != "original"
        ),
        key=lambda key: sum(
            (a - b) ** 2
            for a, b in zip(
                rgb,
                ImageColor.getrgb(GARMENT_COLORS[key]),
            )
        ),
    )

    return {
        "detected_hex": detected_hex,
        "color_id": nearest_color,
        "color_name": nearest_color.replace("_", " ").title(),
        "palette_hex": GARMENT_COLORS[nearest_color],
    }


def recolor_garment(image, mask, selected_color):
    selected = validate_garment_color(selected_color)

    image, mask = prepare_garment_mask(image, mask)

    if selected == "original":
        return image.copy()

    target_rgb = ImageColor.getrgb(
        GARMENT_COLORS[selected]
    )

    source_luminance = image.convert("L")

    analysis_mask = mask.point(
        lambda value: 255 if value >= 200 else 0
    )

    if analysis_mask.getbbox() is None:
        raise ValueError("No reliable garment pixels detected.")

    garment_luminance = ImageStat.Stat(
        source_luminance,
        analysis_mask,
    ).median[0]

    channels = []

    for target_channel in target_rgb:
        lookup = []

        for brightness in range(256):
            difference = brightness - garment_luminance

            if difference < 0:
                adjustment = difference * (
                    target_channel / max(garment_luminance, 1)
                )
            else:
                adjustment = difference * (
                    (255 - target_channel)
                    / max(255 - garment_luminance, 1)
                )

            value = int(round(target_channel + adjustment))

            lookup.append(
                max(0, min(255, value))
            )

        channels.append(
            source_luminance.point(lookup)
        )

    recolored = Image.merge("RGB", tuple(channels))

    return Image.composite(
        recolored,
        image,
        mask,
    )
