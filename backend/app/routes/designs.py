
import base64
import hashlib
import hmac
import json
import os
import secrets
import time

from datetime import datetime, timezone
from uuid import UUID

from dotenv import load_dotenv
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Request,
    Security,
)
from fastapi.security import (
    APIKeyHeader,
    HTTPAuthorizationCredentials,
    HTTPBearer,
)
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Category, Design
from app.schemas import DesignResponse


load_dotenv()

router = APIRouter()

management_key_header = APIKeyHeader(
    name="X-Collection-Management-Key",
    auto_error=False,
)

admin_bearer = HTTPBearer(
    auto_error=False,
    scheme_name="CollectionAdminBearer",
)


# =========================================================
# SCHEMAS
# =========================================================

class AdminLoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=150)
    password: str = Field(min_length=1, max_length=256)


class AdminLoginResponse(BaseModel):
    access_token: str
    token_type: str
    expires_in: int
    username: str


class ManagedDesignResponse(BaseModel):
    id: UUID
    category_id: UUID
    category_name: str
    design_code: str
    name: str
    image_url: str
    is_active: bool
    trashed_at: datetime | None = None


class MoveDesignRequest(BaseModel):
    category_id: UUID


# =========================================================
# ADMIN CONFIGURATION
# =========================================================

def get_admin_config():
    username = os.getenv(
        "COLLECTION_ADMIN_USERNAME", ""
    ).strip()

    password_hash = os.getenv(
        "COLLECTION_ADMIN_PASSWORD_HASH", ""
    ).strip()

    signing_key = os.getenv(
        "COLLECTION_AUTH_SIGNING_KEY", ""
    )

    try:
        ttl = int(
            os.getenv("COLLECTION_AUTH_TOKEN_MINUTES", "0")
        )
    except (ValueError, TypeError):
        ttl = 0

    if (
        not username
        or not password_hash
        or len(signing_key) < 32
        or not 1 <= ttl <= 1440
    ):
        raise HTTPException(
            status_code=503,
            detail=(
                "Collection administrator authentication "
                "is not configured."
            ),
        )

    return {
        "username": username,
        "password_hash": password_hash,
        "signing_key": signing_key,
        "token_seconds": ttl * 60,
    }


def encode_base64(value):
    return base64.urlsafe_b64encode(
        value
    ).decode("ascii").rstrip("=")


def decode_base64(value):
    return base64.urlsafe_b64decode(
        value + "=" * (-len(value) % 4)
    )


def verify_admin_password(password, stored_hash):
    try:
        iterations_text, salt_text, hash_text = (
            stored_hash.split(":")
        )

        iterations = int(iterations_text)

        if not 310000 <= iterations <= 2000000:
            return False

        salt = decode_base64(salt_text)
        expected = decode_base64(hash_text)

        if len(salt) < 16 or len(expected) != 32:
            return False

        calculated = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt,
            iterations,
        )

        return hmac.compare_digest(
            calculated,
            expected,
        )

    except (
        ValueError,
        TypeError,
        OverflowError,
    ):
        return False


def create_admin_token(config):
    issued_at = int(time.time())

    payload = {
        "sub": config["username"],
        "role": "collection_admin",
        "purpose": "collection_management",
        "iat": issued_at,
        "exp": issued_at + config["token_seconds"],
        "nonce": secrets.token_hex(16),
    }

    payload_bytes = json.dumps(
        payload,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")

    encoded_payload = encode_base64(payload_bytes)

    signature = hmac.new(
        config["signing_key"].encode("utf-8"),
        encoded_payload.encode("ascii"),
        hashlib.sha256,
    ).digest()

    return encoded_payload + "." + encode_base64(
        signature
    )


def verify_admin_token(token):
    try:
        config = get_admin_config()

        encoded_payload, encoded_signature = (
            token.split(".")
        )

        expected_signature = hmac.new(
            config["signing_key"].encode("utf-8"),
            encoded_payload.encode("ascii"),
            hashlib.sha256,
        ).digest()

        supplied_signature = decode_base64(
            encoded_signature
        )

        if not hmac.compare_digest(
            expected_signature,
            supplied_signature,
        ):
            return False

        payload = json.loads(
            decode_base64(encoded_payload)
        )

        now = int(time.time())
        issued_at = payload.get("iat")
        expires_at = payload.get("exp")

        return (
            payload.get("sub") == config["username"]
            and payload.get("role") == "collection_admin"
            and payload.get("purpose")
            == "collection_management"
            and isinstance(issued_at, int)
            and isinstance(expires_at, int)
            and issued_at <= now + 60
            and expires_at > now
            and expires_at - issued_at
            <= config["token_seconds"]
        )

    except (
        ValueError,
        TypeError,
        KeyError,
        UnicodeError,
        HTTPException,
    ):
        return False


def require_management_auth(
    api_key: str | None = Security(
        management_key_header
    ),
    bearer: HTTPAuthorizationCredentials | None = Security(
        admin_bearer
    ),
):
    expected_key = os.getenv(
        "COLLECTION_MANAGEMENT_API_KEY", ""
    )

    if (
        expected_key
        and api_key
        and secrets.compare_digest(
            api_key,
            expected_key,
        )
    ):
        return True

    if (
        bearer
        and bearer.scheme.lower() == "bearer"
        and verify_admin_token(bearer.credentials)
    ):
        return True

    raise HTTPException(
        status_code=401,
        detail="Administrator authentication required.",
        headers={"WWW-Authenticate": "Bearer"},
    )


# =========================================================
# LOGIN RATE LIMITING
# =========================================================

LOGIN_WINDOW_SECONDS = 900
LOGIN_MAX_FAILURES = 5
_login_attempts = {}


def login_attempt_key(request: Request):
    return request.client.host if request.client else "unknown"


def check_login_limit(client_key):
    now = time.monotonic()

    failures = [
        timestamp
        for timestamp in _login_attempts.get(
            client_key, []
        )
        if now - timestamp < LOGIN_WINDOW_SECONDS
    ]

    _login_attempts[client_key] = failures

    if len(failures) >= LOGIN_MAX_FAILURES:
        raise HTTPException(
            status_code=429,
            detail="Too many unsuccessful login attempts.",
        )


def register_login_failure(client_key):
    _login_attempts.setdefault(
        client_key, []
    ).append(time.monotonic())


# =========================================================
# SHARED HELPER
# =========================================================

def managed_design_record(design, category_name):
    return ManagedDesignResponse(
        id=design.id,
        category_id=design.category_id,
        category_name=category_name,
        design_code=design.design_code,
        name=design.name,
        image_url=design.image_url,
        is_active=design.is_active,
        trashed_at=design.trashed_at,
    )


# =========================================================
# ADMIN LOGIN
# =========================================================

@router.post(
    "/management/login",
    response_model=AdminLoginResponse,
)
def login_collection_admin(
    credentials: AdminLoginRequest,
    request: Request,
):
    config = get_admin_config()
    client_key = login_attempt_key(request)

    check_login_limit(client_key)

    valid_username = secrets.compare_digest(
        credentials.username,
        config["username"],
    )

    valid_password = verify_admin_password(
        credentials.password,
        config["password_hash"],
    )

    if not (valid_username and valid_password):
        register_login_failure(client_key)
        raise HTTPException(
            status_code=401,
            detail="Invalid administrator username or password.",
        )

    _login_attempts.pop(client_key, None)

    return AdminLoginResponse(
        access_token=create_admin_token(config),
        token_type="bearer",
        expires_in=config["token_seconds"],
        username=config["username"],
    )


# =========================================================
# GET TRASHED DESIGNS
# =========================================================

@router.get(
    "/management/trash",
    response_model=list[ManagedDesignResponse],
    dependencies=[Depends(require_management_auth)],
)
def get_trashed_designs(
    db: Session = Depends(get_db),
):
    records = (
        db.query(Design, Category.name)
        .join(Category, Design.category_id == Category.id)
        .filter(Design.trashed_at.is_not(None))
        .order_by(Design.trashed_at.desc())
        .all()
    )

    return [
        managed_design_record(design, category_name)
        for design, category_name in records
    ]


# =========================================================
# NEW: GET HIDDEN DESIGNS
#
# Hidden:
# is_active = False
# trashed_at = NULL
# =========================================================

@router.get(
    "/management/hidden",
    response_model=list[ManagedDesignResponse],
    dependencies=[Depends(require_management_auth)],
)
def get_hidden_designs(
    db: Session = Depends(get_db),
):
    records = (
        db.query(Design, Category.name)
        .join(Category, Design.category_id == Category.id)
        .filter(
            Design.is_active.is_(False),
            Design.trashed_at.is_(None),
        )
        .order_by(Design.name.asc())
        .all()
    )

    return [
        managed_design_record(design, category_name)
        for design, category_name in records
    ]


# =========================================================
# GET ACTIVE DESIGNS BY CATEGORY
# =========================================================

@router.get(
    "/category/{category_id}",
    response_model=list[DesignResponse],
)
def get_designs_by_category(
    category_id: UUID,
    db: Session = Depends(get_db),
):
    return (
        db.query(Design)
        .filter(
            Design.category_id == category_id,
            Design.is_active.is_(True),
            Design.trashed_at.is_(None),
        )
        .all()
    )


# =========================================================
# MOVE DESIGN TO ANOTHER CATEGORY
# =========================================================

@router.post(
    "/{design_id}/move",
    dependencies=[Depends(require_management_auth)],
)
def move_design(
    design_id: UUID,
    payload: MoveDesignRequest,
    db: Session = Depends(get_db),
):
    design = (
        db.query(Design)
        .filter(Design.id == design_id)
        .with_for_update()
        .first()
    )

    if design is None:
        raise HTTPException(
            status_code=404,
            detail="Dress not found.",
        )

    if design.trashed_at is not None:
        raise HTTPException(
            status_code=409,
            detail=(
                "Restore this dress from Trash before moving it."
            ),
        )

    target_category = (
        db.query(Category)
        .filter(Category.id == payload.category_id)
        .first()
    )

    if target_category is None:
        raise HTTPException(
            status_code=404,
            detail="Destination category not found.",
        )

    if design.category_id == target_category.id:
        return {
            "success": True,
            "moved": False,
            "message": (
                "Dress already belongs to this category."
            ),
            "design_id": str(design.id),
            "category_id": str(design.category_id),
            "category_name": target_category.name,
        }

    design.category_id = target_category.id

    try:
        db.commit()
        db.refresh(design)
    except Exception:
        db.rollback()
        raise

    return {
        "success": True,
        "moved": True,
        "message": "Dress moved successfully.",
        "design_id": str(design.id),
        "category_id": str(design.category_id),
        "category_name": target_category.name,
    }


# =========================================================
# HIDE DESIGN
# =========================================================

@router.post(
    "/{design_id}/hide",
    dependencies=[Depends(require_management_auth)],
)
def hide_design(
    design_id: UUID,
    db: Session = Depends(get_db),
):
    design = (
        db.query(Design)
        .filter(Design.id == design_id)
        .with_for_update()
        .first()
    )

    if design is None:
        raise HTTPException(
            status_code=404,
            detail="Dress not found.",
        )

    if design.trashed_at is not None:
        raise HTTPException(
            status_code=409,
            detail="Dress is in Trash, not the active collection.",
        )

    if not design.is_active:
        return {
            "success": True,
            "hidden": True,
            "message": "Dress is already hidden.",
            "design_id": str(design.id),
        }

    design.is_active = False

    try:
        db.commit()
        db.refresh(design)
    except Exception:
        db.rollback()
        raise

    return {
        "success": True,
        "hidden": True,
        "message": "Dress hidden successfully.",
        "design_id": str(design.id),
    }


# =========================================================
# UNHIDE DESIGN
# =========================================================

@router.post(
    "/{design_id}/unhide",
    dependencies=[Depends(require_management_auth)],
)
def unhide_design(
    design_id: UUID,
    db: Session = Depends(get_db),
):
    design = (
        db.query(Design)
        .filter(Design.id == design_id)
        .with_for_update()
        .first()
    )

    if design is None:
        raise HTTPException(
            status_code=404,
            detail="Dress not found.",
        )

    if design.trashed_at is not None:
        raise HTTPException(
            status_code=409,
            detail="Restore this dress from Trash first.",
        )

    if design.is_active:
        return {
            "success": True,
            "unhidden": False,
            "message": "Dress is already visible.",
            "design_id": str(design.id),
        }

    design.is_active = True

    try:
        db.commit()
        db.refresh(design)
    except Exception:
        db.rollback()
        raise

    return {
        "success": True,
        "unhidden": True,
        "message": "Dress is now visible.",
        "design_id": str(design.id),
    }


# =========================================================
# MOVE DESIGN TO TRASH
# =========================================================

@router.post(
    "/{design_id}/trash",
    dependencies=[Depends(require_management_auth)],
)
def move_design_to_trash(
    design_id: UUID,
    db: Session = Depends(get_db),
):
    design = (
        db.query(Design)
        .filter(Design.id == design_id)
        .with_for_update()
        .first()
    )

    if design is None:
        raise HTTPException(
            status_code=404,
            detail="Dress not found.",
        )

    if design.trashed_at is not None:
        return {
            "success": True,
            "message": "Dress is already in Trash.",
            "design_id": str(design.id),
            "trashed_at": design.trashed_at.isoformat(),
        }

    design.is_active = False
    design.trashed_at = datetime.now(timezone.utc)

    try:
        db.commit()
        db.refresh(design)
    except Exception:
        db.rollback()
        raise

    return {
        "success": True,
        "message": "Dress moved to Trash.",
        "design_id": str(design.id),
        "trashed_at": design.trashed_at.isoformat(),
    }


# =========================================================
# RESTORE DESIGN FROM TRASH
# =========================================================

@router.post(
    "/{design_id}/restore",
    dependencies=[Depends(require_management_auth)],
)
def restore_design(
    design_id: UUID,
    db: Session = Depends(get_db),
):
    design = (
        db.query(Design)
        .filter(Design.id == design_id)
        .with_for_update()
        .first()
    )

    if design is None:
        raise HTTPException(
            status_code=404,
            detail="Dress not found.",
        )

    if design.trashed_at is None:
        return {
            "success": True,
            "message": "Dress is not in Trash.",
            "design_id": str(design.id),
            "category_id": str(design.category_id),
            "restored": False,
        }

    design.is_active = True
    design.trashed_at = None

    try:
        db.commit()
        db.refresh(design)
    except Exception:
        db.rollback()
        raise

    return {
        "success": True,
        "message": "Dress restored successfully.",
        "design_id": str(design.id),
        "category_id": str(design.category_id),
        "restored": True,
    }


# =========================================================
# GET SINGLE ACTIVE / NON-TRASHED DESIGN
# =========================================================

@router.get(
    "/{design_id}",
    response_model=DesignResponse,
)
def get_design(
    design_id: UUID,
    db: Session = Depends(get_db),
):
    design = (
        db.query(Design)
        .filter(
            Design.id == design_id,
            Design.is_active.is_(True),
            Design.trashed_at.is_(None),
        )
        .first()
    )

    if design is None:
        raise HTTPException(
            status_code=404,
            detail="Design not found.",
        )

    return design


# =========================================================
# STEP 7 - EDIT DRESS DETAILS
#
# PATCH /api/designs/{design_id}/details
#
# Requires administrator authentication.
# Preserves design ID, image and generation history.
# =========================================================

from pydantic import BaseModel, Field, model_validator


class EditDressRequest(BaseModel):
    name: str | None = Field(
        default=None,
        min_length=1,
        max_length=150,
    )

    category_id: UUID | None = None

    @model_validator(mode="after")
    def validate_changes(self):
        if self.name is None and self.category_id is None:
            raise ValueError(
                "Provide a dress name or category ID."
            )

        if self.name is not None:
            self.name = self.name.strip()

            if not self.name:
                raise ValueError(
                    "Dress name cannot be empty."
                )

        return self


class EditDressResponse(BaseModel):
    success: bool
    message: str
    design_id: UUID
    name: str
    category_id: UUID
    category_name: str
    updated: bool


@router.patch(
    "/{design_id}/details",
    response_model=EditDressResponse,
    dependencies=[
        Depends(require_management_auth)
    ],
)
def update_dress_details(
    design_id: UUID,
    payload: EditDressRequest,
    db: Session = Depends(get_db),
):
    design = (
        db.query(Design)
        .filter(Design.id == design_id)
        .with_for_update()
        .first()
    )

    if design is None:
        raise HTTPException(
            status_code=404,
            detail="Dress not found.",
        )

    if design.trashed_at is not None:
        raise HTTPException(
            status_code=409,
            detail=(
                "Restore the dress from Trash "
                "before editing its details."
            ),
        )

    updated = False

    if payload.name is not None:
        if design.name != payload.name:
            design.name = payload.name
            updated = True

    if payload.category_id is not None:
        target_category = (
            db.query(Category)
            .filter(
                Category.id == payload.category_id
            )
            .first()
        )

        if target_category is None:
            raise HTTPException(
                status_code=404,
                detail="Destination category not found.",
            )

        if design.category_id != target_category.id:
            design.category_id = target_category.id
            updated = True

    if updated:
        try:
            db.commit()
            db.refresh(design)
        except Exception:
            db.rollback()
            raise

    category = (
        db.query(Category)
        .filter(
            Category.id == design.category_id
        )
        .first()
    )

    return EditDressResponse(
        success=True,
        message=(
            "Dress details updated successfully."
            if updated
            else "No changes were necessary."
        ),
        design_id=design.id,
        name=design.name,
        category_id=design.category_id,
        category_name=(
            category.name if category else ""
        ),
        updated=updated,
    )


# =========================================================
# STEP 8 - REPLACE EXISTING DRESS IMAGE
#
# POST /api/designs/{design_id}/replace-image
#
# Administrator authentication required.
# Uses the same validation and storage configuration
# as the existing Custom Dress upload feature.
# =========================================================

import uuid

from fastapi import File, UploadFile
from fastapi.concurrency import run_in_threadpool

from app.routes.custom_designs import (
    validate_and_process_image,
    CUSTOM_IMAGE_DIR,
    CUSTOM_RELATIVE_DIR,
    PUBLIC_BACKEND_URL,
    IMAGE_QUALITY,
)


def _save_replacement_jpeg(image, destination):
    image.save(
        destination,
        format="JPEG",
        quality=IMAGE_QUALITY,
        optimize=True,
    )


@router.post(
    "/{design_id}/replace-image",
    dependencies=[
        Depends(require_management_auth)
    ],
)
async def replace_dress_image(
    design_id: UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    new_file_path = None
    database_committed = False

    try:
        # -------------------------------------------------
        # 1. Find the existing dress
        # -------------------------------------------------

        design = (
            db.query(Design)
            .filter(Design.id == design_id)
            .with_for_update()
            .first()
        )

        if design is None:
            raise HTTPException(
                status_code=404,
                detail="Dress not found.",
            )

        if design.trashed_at is not None:
            raise HTTPException(
                status_code=409,
                detail=(
                    "Restore this dress from Trash "
                    "before replacing its image."
                ),
            )

        # -------------------------------------------------
        # 2. Validate using existing upload rules
        # -------------------------------------------------

        image = await validate_and_process_image(
            file
        )

        # -------------------------------------------------
        # 3. Generate a unique image filename
        # -------------------------------------------------

        image_id = uuid.uuid4()
        filename = f"{image_id.hex}.jpg"

        CUSTOM_IMAGE_DIR.mkdir(
            parents=True,
            exist_ok=True,
        )

        new_file_path = (
            CUSTOM_IMAGE_DIR / filename
        )

        # -------------------------------------------------
        # 4. Save the processed replacement image
        # -------------------------------------------------

        await run_in_threadpool(
            _save_replacement_jpeg,
            image,
            new_file_path,
        )

        # -------------------------------------------------
        # 5. Build public catalog image URL
        # -------------------------------------------------

        relative_image_path = (
            CUSTOM_RELATIVE_DIR / filename
        ).as_posix()

        new_image_url = (
            f"{PUBLIC_BACKEND_URL}/catalog/"
            f"{relative_image_path}"
        )

        # -------------------------------------------------
        # 6. Preserve original image reference
        # -------------------------------------------------

        previous_image_url = design.image_url

        # -------------------------------------------------
        # 7. Update only image_url in PostgreSQL
        # -------------------------------------------------

        design.image_url = new_image_url

        db.commit()
        database_committed = True

        db.refresh(design)

        # -------------------------------------------------
        # 8. Return updated image information
        # -------------------------------------------------

        return {
            "success": True,
            "message": (
                "Dress image replaced successfully."
            ),
            "design_id": str(design.id),
            "design_code": design.design_code,
            "name": design.name,
            "category_id": str(design.category_id),
            "previous_image_url": previous_image_url,
            "image_url": design.image_url,
            "history_preserved": True,
        }

    except HTTPException:
        if not database_committed:
            db.rollback()

            if new_file_path is not None:
                new_file_path.unlink(
                    missing_ok=True
                )

        raise

    except Exception:
        if not database_committed:
            db.rollback()

            if new_file_path is not None:
                new_file_path.unlink(
                    missing_ok=True
                )

        raise

    finally:
        await file.close()

# =========================================================
# STEP 10D - GEMINI API USAGE DASHBOARD
#
# GET /api/designs/management/gemini-usage
#
# Protected by existing collection administrator auth.
# Usage data comes from PostgreSQL.
# =========================================================

from datetime import timedelta
from sqlalchemy import func as sql_func

from app.models import GeminiAPIUsage


@router.get(
    "/management/gemini-usage",
    dependencies=[
        Depends(require_management_auth)
    ],
)
def get_gemini_usage_dashboard(
    days: int = 30,
    db: Session = Depends(get_db),
):
    # ---------------------------------------------
    # Validate date range
    # ---------------------------------------------

    if days < 1 or days > 90:
        raise HTTPException(
            status_code=422,
            detail="days must be between 1 and 90.",
        )

    now = datetime.now(timezone.utc)

    # Include today plus previous calendar days.
    start_date = now.date() - timedelta(
        days=days - 1
    )

    start_datetime = datetime.combine(
        start_date,
        datetime.min.time(),
        tzinfo=timezone.utc,
    )

    # ---------------------------------------------
    # Read actual Gemini usage records
    # ---------------------------------------------

    base_filter = (
        GeminiAPIUsage.created_at >= start_datetime
    )

    # ---------------------------------------------
    # Overall statistics
    # ---------------------------------------------

    overall = (
        db.query(
            sql_func.count(
                GeminiAPIUsage.id
            ).label("total_requests"),

            sql_func.count(
                GeminiAPIUsage.id
            ).filter(
                GeminiAPIUsage.status == "success"
            ).label("successful_requests"),

            sql_func.count(
                GeminiAPIUsage.id
            ).filter(
                GeminiAPIUsage.status == "failed"
            ).label("failed_requests"),

            sql_func.coalesce(
                sql_func.sum(
                    GeminiAPIUsage.input_tokens
                ),
                0,
            ).label("input_tokens"),

            sql_func.coalesce(
                sql_func.sum(
                    GeminiAPIUsage.output_tokens
                ),
                0,
            ).label("output_tokens"),

            sql_func.coalesce(
                sql_func.sum(
                    GeminiAPIUsage.total_tokens
                ),
                0,
            ).label("total_tokens"),

            sql_func.avg(
                GeminiAPIUsage.duration_ms
            ).label("average_duration_ms"),
        )
        .filter(base_filter)
        .one()
    )

    total = int(overall.total_requests or 0)
    successful = int(
        overall.successful_requests or 0
    )
    failed = int(overall.failed_requests or 0)

    success_rate = (
        round(successful / total * 100, 2)
        if total > 0
        else 0
    )

    average_duration = (
        round(
            float(overall.average_duration_ms),
            2,
        )
        if overall.average_duration_ms is not None
        else None
    )

    # ---------------------------------------------
    # Usage grouped by Gemini model
    # ---------------------------------------------

    model_rows = (
        db.query(
            GeminiAPIUsage.model_name.label(
                "model_name"
            ),

            sql_func.count(
                GeminiAPIUsage.id
            ).label("requests"),

            sql_func.count(
                GeminiAPIUsage.id
            ).filter(
                GeminiAPIUsage.status == "success"
            ).label("successful_requests"),

            sql_func.count(
                GeminiAPIUsage.id
            ).filter(
                GeminiAPIUsage.status == "failed"
            ).label("failed_requests"),

            sql_func.coalesce(
                sql_func.sum(
                    GeminiAPIUsage.input_tokens
                ),
                0,
            ).label("input_tokens"),

            sql_func.coalesce(
                sql_func.sum(
                    GeminiAPIUsage.output_tokens
                ),
                0,
            ).label("output_tokens"),

            sql_func.coalesce(
                sql_func.sum(
                    GeminiAPIUsage.total_tokens
                ),
                0,
            ).label("total_tokens"),
        )
        .filter(base_filter)
        .group_by(
            GeminiAPIUsage.model_name
        )
        .order_by(
            sql_func.count(
                GeminiAPIUsage.id
            ).desc()
        )
        .all()
    )

    models = [
        {
            "model_name": row.model_name,
            "requests": int(row.requests),
            "successful_requests": int(
                row.successful_requests
            ),
            "failed_requests": int(
                row.failed_requests
            ),
            "input_tokens": int(
                row.input_tokens
            ),
            "output_tokens": int(
                row.output_tokens
            ),
            "total_tokens": int(
                row.total_tokens
            ),
        }
        for row in model_rows
    ]

    # ---------------------------------------------
    # Daily usage (UTC)
    # ---------------------------------------------

    utc_day = sql_func.date(
        sql_func.timezone(
            "UTC",
            GeminiAPIUsage.created_at,
        )
    )

    daily_rows = (
        db.query(
            utc_day.label("usage_date"),

            sql_func.count(
                GeminiAPIUsage.id
            ).label("requests"),

            sql_func.count(
                GeminiAPIUsage.id
            ).filter(
                GeminiAPIUsage.status == "success"
            ).label("successful_requests"),

            sql_func.count(
                GeminiAPIUsage.id
            ).filter(
                GeminiAPIUsage.status == "failed"
            ).label("failed_requests"),

            sql_func.coalesce(
                sql_func.sum(
                    GeminiAPIUsage.total_tokens
                ),
                0,
            ).label("total_tokens"),
        )
        .filter(base_filter)
        .group_by(utc_day)
        .order_by(utc_day)
        .all()
    )

    daily_lookup = {
        row.usage_date.isoformat(): {
            "date": row.usage_date.isoformat(),
            "requests": int(row.requests),
            "successful_requests": int(
                row.successful_requests
            ),
            "failed_requests": int(
                row.failed_requests
            ),
            "total_tokens": int(
                row.total_tokens
            ),
        }
        for row in daily_rows
    }

    daily_usage = []

    for index in range(days):
        date_value = (
            start_date + timedelta(days=index)
        ).isoformat()

        daily_usage.append(
            daily_lookup.get(
                date_value,
                {
                    "date": date_value,
                    "requests": 0,
                    "successful_requests": 0,
                    "failed_requests": 0,
                    "total_tokens": 0,
                },
            )
        )

    # ---------------------------------------------
    # Response for React management dashboard
    # ---------------------------------------------

    return {
        "success": True,
        "period_days": days,
        "timezone": "UTC",
        "generated_at": now.isoformat(),
        "summary": {
            "total_requests": total,
            "successful_requests": successful,
            "failed_requests": failed,
            "success_rate": success_rate,
            "input_tokens": int(
                overall.input_tokens
            ),
            "output_tokens": int(
                overall.output_tokens
            ),
            "total_tokens": int(
                overall.total_tokens
            ),
            "average_duration_ms": average_duration,
        },
        "models": models,
        "daily_usage": daily_usage,
    }
