"""Administrator-only permanent dress deletion with generation-history cleanup.

Data deletion: usage rows -> generation jobs -> dress, in one DB transaction.
Local files: conservative best-effort cleanup after successful commit.

Never follow arbitrary URLs, symlinks, or unlink shared imported catalog images.
Refuse deletion while any related generation job is not terminal, because
FastAPI background tasks cannot safely be cancelled from this endpoint.
"""
import logging
import os
import re
from pathlib import Path
from urllib.parse import unquote, urlsplit
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Design, GenerationJob, GeminiAPIUsage
from app.routes.designs import require_management_auth

logger = logging.getLogger(__name__)
router = APIRouter()
BACKEND_DIR = Path(__file__).resolve().parents[3]
TERMINAL_STATUSES = {"completed", "failed", "error", "cancelled", "canceled"}
INPUT_COLUMNS = ("front_image_url", "left_image_url", "right_image_url", "back_image_url")


def _configured_dir(name: str, default: str) -> Path:
    location = Path(os.getenv(name, default))
    return (location if location.is_absolute() else BACKEND_DIR / location).resolve()


def _is_inside(path: Path, folder: Path) -> bool:
    return path != folder and path.is_relative_to(folder)


def _safe_relative_path(raw: str, prefix: str, root: Path) -> Path | None:
    """Accept only local URL paths or relative file paths under prefix."""
    if not raw or not isinstance(raw, str):
        return None
    parsed = urlsplit(raw)
    if parsed.scheme and parsed.scheme not in {"http", "https"}:
        return None
    if parsed.netloc:
        expected = urlsplit(os.getenv("PUBLIC_BACKEND_URL", ""))
        if not expected.netloc or parsed.netloc != expected.netloc:
            return None
    path = unquote(parsed.path)
    if re.search(r"%[0-9a-fA-F]{2}", path) or "\\" in path or "\x00" in path:
        return None
    path = path.lstrip("/")
    if not path.startswith(prefix + "/"):
        return None
    relative = Path(path[len(prefix) + 1:])
    if not relative.parts or any(p in {".", "..", ""} for p in relative.parts):
        return None
    candidate = root.joinpath(relative)
    if candidate.is_symlink():
        return None
    resolved = candidate.resolve()
    if not _is_inside(resolved, root):
        return None
    return resolved


def _custom_dress_file(url: str) -> Path | None:
    catalog = _configured_dir("CATALOG_DIR", "catalog-images")
    custom = _configured_dir("CUSTOM_DRESS_DIRECTORY", "catalog-images/custom")
    if not custom.is_relative_to(catalog):
        return None
    candidate = _safe_relative_path(url, "catalog", catalog)
    if candidate is None or not _is_inside(candidate, custom):
        return None
    if candidate.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
        return None
    return candidate


def _uploaded_file(path: str) -> Path | None:
    upload_root = _configured_dir("UPLOAD_DIR", "uploads")
    candidate = _safe_relative_path(path, "uploads", upload_root)
    if candidate is None or candidate.parent != upload_root:
        return None
    if not re.fullmatch(r"(?:front|left|right|back)_[0-9a-fA-F-]{36}\.(jpg|jpeg|png|webp)", candidate.name, re.I):
        return None
    return candidate


def _generated_job_dir(job_id: UUID) -> Path:
    root = _configured_dir("GENERATED_DIR", "generated")
    return root / str(job_id)


def _referenced_in_other_client_schemas(db: Session, url: str, table: str, fields: tuple[str, ...]) -> bool:
    """Fail closed if references in other client schemas cannot be ruled out."""
    # All schema names are retrieved from pg_catalog and validated before
    # appearing in identifier SQL; values are always parameterized.
    if table not in {"designs", "generation_jobs"}:
        return True
    permitted_fields = {"image_url", *INPUT_COLUMNS}
    if any(field not in permitted_fields for field in fields):
        return True
    try:
        schemas = db.execute(text("""
            SELECT n.nspname AS schema_name
            FROM pg_catalog.pg_namespace AS n
            WHERE n.nspname ~ '^client_[0-9a-f]{32}$'
        """)).scalars().all()
        active_schema = db.execute(text("SELECT current_schema() ")).scalar()
        for schema in schemas:
            if schema == active_schema:
                continue
            if not re.fullmatch(r"client_[0-9a-f]{32}", schema):
                return True
            available = db.execute(text("""
                SELECT EXISTS (
                  SELECT 1 FROM information_schema.tables
                  WHERE table_schema = :schema AND table_name = :table
                )
            """), {"schema": schema, "table": table}).scalar()
            if not available:
                # Lack of table visibility is not proof it doesn't exist.
                return True
            clause = " OR ".join(f'{f} = :url' for f in fields)
            matched = db.execute(text(
                f'SELECT EXISTS (SELECT 1 FROM "{schema}"."{table}" WHERE {clause})'
            ), {"url": url}).scalar()
            if matched:
                return True
        return False
    except Exception:
        logger.exception("Could not establish cross-schema file ownership")
        return True


def _remove_file(path: Path, warnings: list[str]) -> bool:
    try:
        if path.is_symlink():
            warnings.append(f"Skipped symlink: {path.name}")
            return False
        if path.is_file():
            path.unlink()
            return True
        return False
    except OSError:
        logger.exception("Cleanup failed for %s", path)
        warnings.append(f"Could not remove image: {path.name}")
        return False


def _remove_job_dir(path: Path, warnings: list[str]) -> int:
    """Remove a UUID-owned directory only if it contains regular images."""
    if not path.exists():
        return 0
    try:
        if path.is_symlink() or not path.is_dir():
            raise OSError("Unexpected generated directory type")
        files = list(path.iterdir())
        if any(p.is_symlink() or not p.is_file() or p.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"} for p in files):
            raise OSError("Unexpected generated directory contents")
        for file in files:
            file.unlink()
        path.rmdir()
        return len(files)
    except OSError:
        logger.exception("Cleanup failed for generated job directory %s", path)
        warnings.append(f"Could not fully remove generated directory for job {path.name}")
        return 0


@router.delete(
    "/{design_id}/permanent",
    dependencies=[Depends(require_management_auth)],
)
def delete_design_permanently(design_id: UUID, db: Session = Depends(get_db)):
    dress = (
        db.query(Design)
        .filter(Design.id == design_id)
        .with_for_update()
        .first()
    )
    if dress is None:
        raise HTTPException(status_code=404, detail="Dress not found.")

    jobs = (
        db.query(GenerationJob)
        .filter(GenerationJob.design_id == design_id)
        .with_for_update()
        .all()
    )
    active = [job for job in jobs if (job.status or "").lower() not in TERMINAL_STATUSES]
    if active:
        raise HTTPException(
            status_code=409,
            detail=(f"{len(active)} try-on job(s) are still pending or processing. "
                    "Finish or cancel them safely before permanently deleting this dress."),
        )

    job_ids = [job.id for job in jobs]
    original_url = dress.image_url
    original_file = _custom_dress_file(original_url)
    input_files_by_raw = {
        getattr(job, column): _uploaded_file(getattr(job, column))
        for job in jobs for column in INPUT_COLUMNS
    }
    input_files_by_raw.pop(None, None)
    input_files = {p for p in input_files_by_raw.values() if p is not None}
    job_dirs = [_generated_job_dir(job.id) for job in jobs]

    # Verify whether candidate local files are still in use by surviving records
    # in this schema. Other schemas may share a filesystem; do not delete
    # catalog imports or arbitrary external URLs.
    other_dress_reference = db.query(Design.id).filter(
        Design.id != design_id, Design.image_url == original_url
    ).first() is not None
    all_other_jobs = db.query(GenerationJob).filter(
        GenerationJob.design_id != design_id
    ).all() if input_files else []
    surviving_inputs = {
        _uploaded_file(getattr(job, column))
        for job in all_other_jobs for column in INPUT_COLUMNS
    }
    input_files -= surviving_inputs
    # A file must not be deleted if any other tenant schema references it.
    for raw, path in input_files_by_raw.items():
        if path in input_files and _referenced_in_other_client_schemas(
            db, raw, "generation_jobs", INPUT_COLUMNS
        ):
            input_files.discard(path)
    # In multi-client deployments, job UUIDs are assumed unique and generated
    # directories must never be reused across clients. Avoid deleting dress
    # catalog images unless ownership is provable at a higher tenant level.

    try:
        usage_deleted = 0
        if job_ids:
            usage_deleted = db.query(GeminiAPIUsage).filter(
                GeminiAPIUsage.job_id.in_(job_ids)
            ).delete(synchronize_session=False)
            db.query(GenerationJob).filter(
                GenerationJob.id.in_(job_ids)
            ).delete(synchronize_session=False)
        db.delete(dress)
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Permanent deletion DB transaction failed for %s", design_id)
        raise HTTPException(status_code=500, detail="Database deletion failed. No deletion was committed.")

    warnings = []
    removed_files = 0
    for path in input_files:
        removed_files += int(_remove_file(path, warnings))
    for path in job_dirs:
        removed_files += _remove_job_dir(path, warnings)

    # Only custom-upload images are eligible. Imported/shared catalog images
    # are intentionally retained. Cross-schema sharing must be checked by
    # a tenant-aware storage layer before enabling automatic catalog deletion.
    image_deleted = False
    if original_file is None:
        warnings.append("Catalog image retained: imported, external, or outside managed custom directory.")
    elif other_dress_reference:
        warnings.append("Catalog image retained: another dress references it.")
    elif _referenced_in_other_client_schemas(db, original_url, "designs", ("image_url",)):
        warnings.append("Catalog image retained: another client may reference it or ownership could not be verified.")
    else:
        image_deleted = _remove_file(original_file, warnings)
        removed_files += int(image_deleted)

    return {
        "success": True,
        "deleted": True,
        "design_id": str(design_id),
        "generation_jobs_deleted": len(job_ids),
        "gemini_usage_deleted": usage_deleted,
        "local_files_deleted": removed_files,
        "image_deleted": image_deleted,
        "image_retained_reason": warnings[-1] if warnings else None,
        "cleanup_warnings": warnings,
        "message": "Dress and related job/usage records permanently deleted; local cleanup reported separately.",
    }
