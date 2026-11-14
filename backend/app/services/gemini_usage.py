from uuid import UUID

import logging
import re
import time

from app.database import SessionLocal
from app.models import GeminiAPIUsage


logger = logging.getLogger(__name__)


# =========================================================
# SAFE METADATA HELPERS
# =========================================================

def read_metadata_number(metadata, name):
    """
    Read an optional numeric value from Gemini
    response metadata without raising an exception.
    """

    if metadata is None:
        return None

    try:
        if isinstance(metadata, dict):
            value = metadata.get(name)
        else:
            value = getattr(metadata, name, None)

        if value is None:
            return None

        return max(0, int(value))

    except (TypeError, ValueError, AttributeError):
        return None


def extract_modality_tokens(metadata):
    """
    Read Gemini candidate token counts by modality.

    Missing modality details remain None.
    This avoids assuming an unknown token count is zero.
    """
    details = getattr(
        metadata,
        "candidates_tokens_details",
        None,
    )

    if details is None:
        return {
            "image_output_tokens": None,
            "text_output_tokens": None,
        }

    counts = {
        "IMAGE": 0,
        "TEXT": 0,
    }

    for detail in details:
        modality = getattr(detail, "modality", None)

        label = str(
            getattr(modality, "name", modality)
        ).upper().split(".")[-1]

        tokens = read_metadata_number(
            detail,
            "token_count",
        )

        if label in counts and tokens is not None:
            counts[label] += tokens

    return {
        "image_output_tokens": counts["IMAGE"],
        "text_output_tokens": counts["TEXT"],
    }


def extract_token_usage(response):
    """
    Extract aggregate and modality-level usage
    from Gemini response metadata.
    """
    metadata = getattr(
        response,
        "usage_metadata",
        None,
    )

    modality = extract_modality_tokens(metadata)

    return {
        "input_tokens": read_metadata_number(
            metadata,
            "prompt_token_count",
        ),
        "output_tokens": read_metadata_number(
            metadata,
            "candidates_token_count",
        ),
        "total_tokens": read_metadata_number(
            metadata,
            "total_token_count",
        ),
        "image_output_tokens": modality[
            "image_output_tokens"
        ],
        "text_output_tokens": modality[
            "text_output_tokens"
        ],
        "thinking_tokens": read_metadata_number(
            metadata,
            "thoughts_token_count",
        ),
    }


def get_safe_error_code(error):
    """
    Store a short error classification only.

    Never store API keys, raw exception messages,
    prompts or customer images.
    """

    code = getattr(error, "code", None)

    if code is None:
        code = getattr(error, "status_code", None)

    if code is not None:
        try:
            numeric_code = int(code)

            if 100 <= numeric_code <= 599:
                return f"HTTP_{numeric_code}"

        except (TypeError, ValueError):
            pass

    error_type = type(error).__name__

    safe_type = re.sub(
        r"[^A-Za-z0-9_]",
        "",
        error_type,
    )

    return safe_type[:100] or "UnknownError"


# =========================================================
# DATABASE RECORDER
# =========================================================

def record_gemini_usage(
    *,
    model_name,
    view_name,
    attempt_number,
    status,
    duration_ms,
    response=None,
    error=None,
    job_id=None,
):
    """
    Record one Gemini API attempt.

    A new database session is created for every
    attempt, independently of the generation job.

    IMPORTANT:
    Recording failures must never interrupt
    Gemini image generation.
    """

    db = None

    try:
        token_usage = extract_token_usage(response)

        db = SessionLocal()

        record = GeminiAPIUsage(
            model_name=str(model_name),
            view_name=str(view_name).lower(),
            attempt_number=int(attempt_number),
            status=status,
            input_tokens=token_usage["input_tokens"],
            output_tokens=token_usage["output_tokens"],
            total_tokens=token_usage["total_tokens"],
            duration_ms=max(0, int(duration_ms)),
            error_code=(
                get_safe_error_code(error)
                if error is not None
                else None
            ),
                     job_id=UUID(str(job_id)) if job_id is not None else None,
                 
            image_output_tokens=token_usage["image_output_tokens"],
            text_output_tokens=token_usage["text_output_tokens"],
            thinking_tokens=token_usage["thinking_tokens"],
        )

        db.add(record)
        db.commit()

        logger.info(
            "Gemini usage recorded: model=%s view=%s "
            "attempt=%s status=%s",
            model_name,
            view_name,
            attempt_number,
            status,
        )

        return True

    except Exception:
        if db is not None:
            try:
                db.rollback()
            except Exception:
                pass

        logger.exception(
            "Gemini usage recording failed. "
            "Image generation will continue."
        )

        return False

    finally:
        if db is not None:
            try:
                db.close()
            except Exception:
                pass


# =========================================================
# TIMING HELPER
# =========================================================

def elapsed_milliseconds(start_time):
    return max(
        0,
        round(
            (time.perf_counter() - start_time)
            * 1000
        ),
    )
