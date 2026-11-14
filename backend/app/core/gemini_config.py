
import os

from dotenv import load_dotenv


# =========================================================
# GEMINI CONFIGURATION
# All values are loaded from backend/.env
# =========================================================

load_dotenv()


def required_env(name: str) -> str:
    value = os.getenv(name, "").strip()

    if not value:
        raise RuntimeError(
            f"Missing required environment variable: {name}"
        )

    return value


def required_positive_int(name: str) -> int:
    raw_value = required_env(name)

    try:
        value = int(raw_value)
    except ValueError as exc:
        raise RuntimeError(
            f"{name} must be a valid integer."
        ) from exc

    if value <= 0:
        raise RuntimeError(
            f"{name} must be greater than zero."
        )

    return value


def required_retry_delays() -> list[int]:
    raw_value = required_env(
        "GEMINI_RETRY_DELAYS"
    )

    try:
        delays = [
            int(value.strip())
            for value in raw_value.split(",")
        ]
    except ValueError as exc:
        raise RuntimeError(
            "GEMINI_RETRY_DELAYS must contain "
            "comma-separated integers."
        ) from exc

    if not delays or any(
        delay < 0 for delay in delays
    ):
        raise RuntimeError(
            "GEMINI_RETRY_DELAYS contains "
            "an invalid value."
        )

    return delays


GEMINI_API_KEY = required_env(
    "GEMINI_API_KEY"
)

GEMINI_MODEL = required_env(
    "GEMINI_MODEL"
)

MAX_RETRIES = required_positive_int(
    "GEMINI_MAX_RETRIES"
)

RETRY_DELAYS = required_retry_delays()

MAX_INPUT_DIMENSION = required_positive_int(
    "GEMINI_MAX_INPUT_DIMENSION"
)
