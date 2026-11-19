
import os
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from uuid import UUID
from urllib.parse import quote

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func

from app.database import SessionLocal
from app.models import GenerationJob, GeminiAPIUsage
from app.routes.designs import require_management_auth
from app.services.generated_image_storage import (
    generated_output_details,
)

BACKEND_DIR = Path(__file__).resolve().parents[2]
load_dotenv(dotenv_path=BACKEND_DIR / ".env")

router = APIRouter(
    prefix="/api/designs/management/generation-history",
    tags=["Admin Generation History"],
    dependencies=[Depends(require_management_auth)],
)

VIEWS = ("front", "left", "right", "back")


def setting(name):
    value = os.getenv(name)
    if not value or not value.strip():
        raise RuntimeError(f"Missing setting: {name}")
    return value.strip()


def decimal_setting(name):
    try:
        value = Decimal(setting(name))
        if not value.is_finite() or value < 0:
            raise ValueError("Invalid nonnegative amount")
        return value
    except (ValueError, InvalidOperation) as error:
        raise RuntimeError(
            f"Invalid pricing setting: {name}"
        ) from error


def money(value):
    if value is None:
        return None
    return str(value.quantize(Decimal("0.000001")))


def pricing():
    return {
        "model": setting("GEMINI_MODEL"),
        "input": decimal_setting(
            "GEMINI_COST_FLASH_LITE_IMAGE_INPUT"
        ),
        "text": decimal_setting(
            "GEMINI_COST_FLASH_LITE_TEXT_OUTPUT"
        ),
        "image": decimal_setting(
            "GEMINI_COST_FLASH_LITE_IMAGE_OUTPUT"
        ),
        "fx": decimal_setting(
            "GEMINI_COST_USD_TO_INR"
        ),
    }


def as_integer(value):
    return int(value) if value is not None else None


def calculate_attempt_cost(record, rates):
    """
    Calculate estimated Gemini image generation cost.

    Candidate-output tokens may include image and non-image
    tokens even when TEXT modality metadata reports zero.

    Thinking tokens are accounted for separately.
    Missing thinking count is inferred as zero only when
    the aggregate total proves no additional tokens exist.
    """
    if record.model_name != rates["model"]:
        return None, "unsupported_model"

    required = (
        record.input_tokens,
        record.output_tokens,
        record.image_output_tokens,
    )

    if any(value is None for value in required):
        return None, "incomplete_token_metadata"

    try:
        input_count = int(record.input_tokens)
        output_count = int(record.output_tokens)
        image_count = int(record.image_output_tokens)

        text_count = (
            int(record.text_output_tokens)
            if record.text_output_tokens is not None
            else None
        )

        thinking_count = (
            int(record.thinking_tokens)
            if record.thinking_tokens is not None
            else None
        )

        total_count = (
            int(record.total_tokens)
            if record.total_tokens is not None
            else None
        )

    except (TypeError, ValueError, OverflowError):
        return None, "invalid_token_metadata"

    counts = (
        input_count,
        output_count,
        image_count,
        text_count,
        thinking_count,
        total_count,
    )

    if any(
        value is not None and value < 0
        for value in counts
    ):
        return None, "invalid_token_metadata"

    if image_count > output_count:
        return None, "invalid_token_metadata"

    non_image_count = output_count - image_count

    if (
        text_count is not None
        and text_count > non_image_count
    ):
        return None, "invalid_token_metadata"

    unclassified_count = (
        non_image_count - text_count
        if text_count is not None
        else non_image_count
    )

    inferred_thinking = False

    if thinking_count is None:
        if (
            total_count is None
            or total_count != input_count + output_count
        ):
            return None, "incomplete_token_metadata"

        thinking_count = 0
        inferred_thinking = True

    if total_count is not None:
        expected_total = (
            input_count
            + output_count
            + thinking_count
        )

        if total_count != expected_total:
            return None, "unclassified_total_tokens"

    million = Decimal("1000000")

    input_cost = (
        Decimal(input_count)
        * rates["input"]
        / million
    )

    image_cost = (
        Decimal(image_count)
        * rates["image"]
        / million
    )

    text_cost = (
        Decimal(non_image_count + thinking_count)
        * rates["text"]
        / million
    )

    total_usd = (
        input_cost
        + image_cost
        + text_cost
    )

    return {
        "input_usd": money(input_cost),
        "image_usd": money(image_cost),
        "text_and_thinking_usd": money(text_cost),
        "total_usd": money(total_usd),
        "total_inr": money(
            total_usd * rates["fx"]
        ),
        "unclassified_output_tokens": (
            unclassified_count
        ),
        "inferred_thinking_tokens": (
            inferred_thinking
        ),
    }, "estimated"


def usage_details(records):
    rates = pricing()

    attempts = []
    known_usd = Decimal("0")
    known_inr = Decimal("0")
    incomplete = False

    for record in records:
        cost, cost_status = calculate_attempt_cost(
            record, rates
        )

        if cost is None:
            incomplete = True
        else:
            known_usd += Decimal(cost["total_usd"])
            known_inr += Decimal(cost["total_inr"])

        attempts.append({
            "id": str(record.id),
            "model_name": record.model_name,
            "view_name": record.view_name,
            "attempt_number": record.attempt_number,
            "status": record.status,
            "input_tokens": as_integer(record.input_tokens),
            "output_tokens": as_integer(record.output_tokens),
            "total_tokens": as_integer(record.total_tokens),
            "image_output_tokens": as_integer(
                record.image_output_tokens
            ),
            "text_output_tokens": as_integer(
                record.text_output_tokens
            ),
            "thinking_tokens": as_integer(
                record.thinking_tokens
            ),
            "duration_ms": record.duration_ms,
            "error_code": record.error_code,
            "created_at": (
                record.created_at.isoformat()
                if record.created_at else None
            ),
            "estimated_cost": cost,
            "cost_status": cost_status,
        })

    by_view = {}

    for view in VIEWS:
        view_attempts = [
            item for item in attempts
            if item["view_name"] == view
        ]

        complete = (
            bool(view_attempts)
            and all(
                item["estimated_cost"] is not None
                for item in view_attempts
            )
        )

        view_inr = sum(
            (
                Decimal(
                    item["estimated_cost"]["total_inr"]
                )
                for item in view_attempts
                if item["estimated_cost"] is not None
            ),
            Decimal("0"),
        )

        by_view[view] = {
            "attempts": len(view_attempts),
            "successful_attempts": sum(
                item["status"] == "success"
                for item in view_attempts
            ),
            "failed_attempts": sum(
                item["status"] == "failed"
                for item in view_attempts
            ),
            "estimated_cost_inr": (
                money(view_inr) if complete else None
            ),
            "cost_status": (
                "estimated" if complete
                else "unavailable_or_incomplete"
            ),
        }

    all_complete = bool(attempts) and not incomplete

    return {
        "tracked_requests": len(attempts),
        "successful_requests": sum(
            item["status"] == "success"
            for item in attempts
        ),
        "failed_requests": sum(
            item["status"] == "failed"
            for item in attempts
        ),
        "input_tokens": sum(
            item["input_tokens"] or 0
            for item in attempts
        ),
        "output_tokens": sum(
            item["output_tokens"] or 0
            for item in attempts
        ),
        "duration_ms": sum(
            item["duration_ms"] or 0
            for item in attempts
        ),
        "estimated_cost_inr": (
            money(known_inr) if all_complete else None
        ),
        "estimated_cost_usd": (
            money(known_usd) if all_complete else None
        ),
        "cost_status": (
            "estimated" if all_complete
            else "unavailable_or_incomplete"
        ),
        "by_view": by_view,
        "attempts": attempts,
        "pricing": {
            "currency": "INR",
            "usd_to_inr": str(rates["fx"]),
            "model": rates["model"],
            "estimated_not_billed": True,
        },
    }


def upload_image_details(stored_path):
    if not stored_path:
        return {"url": None, "exists": False, "path": None}

    upload_root_value = Path(setting("UPLOAD_DIR"))
    upload_root = (
        upload_root_value
        if upload_root_value.is_absolute()
        else BACKEND_DIR / upload_root_value
    ).resolve()

    relative = Path(stored_path.replace("\\", "/"))

    if relative.is_absolute() or ".." in relative.parts:
        return {"url": None, "exists": False, "path": None}

    if relative.parts and relative.parts[0] == upload_root.name:
        relative = Path(*relative.parts[1:])

    image_path = (upload_root / relative).resolve()

    if not image_path.is_relative_to(upload_root):
        return {"url": None, "exists": False, "path": None}

    exists = image_path.is_file()

    public_prefix = setting("UPLOAD_PUBLIC_PATH").strip("/")
    backend_url = setting("PUBLIC_BACKEND_URL").rstrip("/")

    relative_url = "/".join(
        quote(part, safe="") for part in relative.parts
    )

    return {
        "url": (
            f"{backend_url}/{public_prefix}/{relative_url}"
            if exists else None
        ),
        "exists": exists,
        "path": stored_path,
    }


def generated_image_details(job, view):
    stored_url = getattr(job, f"output_{view}_url")

    _, output_path, fallback_url = generated_output_details(
        str(job.id), view
    )

    exists = Path(output_path).is_file()

    return {
        "url": stored_url or (fallback_url if exists else None),
        "exists": exists,
        "path": str(
            Path(setting("GENERATED_DIR"))
            / str(job.id)
            / Path(output_path).name
        ),
        "source": "database" if stored_url else "filesystem",
    }


def serialize_job(job, include_details=False, db=None):
    result = {
        "id": str(job.id),
        "design_id": (
            str(job.design_id) if job.design_id else None
        ),
        "status": job.status,
        "progress": job.progress,
        "error_message": job.error_message,
        "created_at": (
            job.created_at.isoformat()
            if job.created_at else None
        ),
        "completed_at": (
            job.completed_at.isoformat()
            if job.completed_at else None
        ),
    }

    if not include_details:
        return result

    job_views = (
        VIEWS
        if job.back_image_url or job.output_back_url
        else VIEWS[:3]
    )

    result["uploaded_images"] = {
        view: upload_image_details(
            getattr(job, f"{view}_image_url")
        )
        for view in job_views
    }

    result["generated_images"] = {
        view: generated_image_details(job, view)
        for view in job_views
    }

    records = (
        db.query(GeminiAPIUsage)
        .filter(GeminiAPIUsage.job_id == job.id)
        .order_by(GeminiAPIUsage.created_at.asc())
        .all()
    )

    result["usage"] = usage_details(records)

    return result


@router.get("")
def list_generation_history(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status: str | None = None,
):
    db = SessionLocal()

    try:
        query = db.query(GenerationJob)

        if status:
            query = query.filter(
                GenerationJob.status == status
            )

        total = query.with_entities(
            func.count(GenerationJob.id)
        ).scalar() or 0

        jobs = (
            query
            .order_by(
                GenerationJob.created_at.desc(),
                GenerationJob.id.desc(),
            )
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )

        return {
            "success": True,
            "total": total,
            "page": page,
            "page_size": page_size,
            "jobs": [serialize_job(job) for job in jobs],
        }
    finally:
        db.close()


# GEMINI_COST_ANALYTICS_V1

@router.get("/analytics/requests")
def gemini_cost_analytics(
    days: int = Query(default=30, ge=0, le=3650),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    request_status: str | None = None,
    model: str | None = None,
    job_id: UUID | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
):
    """
    Read-only Gemini API usage and cost analytics.

    days=0 means all recorded history.
    Date filters use UTC calendar dates.
    Pricing is estimated using current .env rates.
    """
    from datetime import date, timedelta
    from collections import defaultdict

    db = SessionLocal()

    try:
        if request_status not in (
            None, "", "success", "failed"
        ):
            raise HTTPException(
                status_code=422,
                detail="Invalid request status.",
            )

        try:
            start_date = (
                date.fromisoformat(date_from)
                if date_from else None
            )
            end_date = (
                date.fromisoformat(date_to)
                if date_to else None
            )
        except ValueError:
            raise HTTPException(
                status_code=422,
                detail="Dates must use YYYY-MM-DD.",
            )

        if (
            start_date is not None
            and end_date is not None
            and start_date > end_date
        ):
            raise HTTPException(
                status_code=422,
                detail="Start date exceeds end date.",
            )

        now = datetime.now(timezone.utc)

        query = db.query(GeminiAPIUsage)

        if days:
            query = query.filter(
                GeminiAPIUsage.created_at
                >= now - timedelta(days=days)
            )

        if start_date:
            query = query.filter(
                GeminiAPIUsage.created_at
                >= datetime.combine(
                    start_date,
                    datetime.min.time(),
                    tzinfo=timezone.utc,
                )
            )

        if end_date:
            query = query.filter(
                GeminiAPIUsage.created_at
                < datetime.combine(
                    end_date + timedelta(days=1),
                    datetime.min.time(),
                    tzinfo=timezone.utc,
                )
            )

        if request_status:
            query = query.filter(
                GeminiAPIUsage.status == request_status
            )

        if model:
            query = query.filter(
                GeminiAPIUsage.model_name == model
            )

        if job_id is not None:
            query = query.filter(
                GeminiAPIUsage.job_id == job_id
            )

        total = query.with_entities(
            func.count(GeminiAPIUsage.id)
        ).scalar() or 0

        rates = pricing()

        known_cost = Decimal("0")
        unknown_cost_requests = 0
        successful = 0
        failed = 0
        input_tokens = 0
        output_tokens = 0

        daily_costs = defaultdict(
            lambda: {
                "known_cost_inr": Decimal("0"),
                "requests": 0,
                "unknown_cost_requests": 0,
            }
        )

        job_costs = defaultdict(
            lambda: {
                "known_cost_inr": Decimal("0"),
                "requests": 0,
                "unknown_cost_requests": 0,
            }
        )

        # Aggregate the entire filtered selection, not
        # only the currently displayed table page.
        for record in query.yield_per(500):
            cost, _ = calculate_attempt_cost(
                record, rates
            )

            successful += (
                record.status == "success"
            )
            failed += (
                record.status == "failed"
            )

            input_tokens += (
                record.input_tokens or 0
            )
            output_tokens += (
                record.output_tokens or 0
            )

            if record.created_at:
                day = record.created_at.date().isoformat()
            else:
                day = "unknown"

            job_key = (
                str(record.job_id)
                if record.job_id
                else None
            )

            daily = daily_costs[day]
            job = job_costs[(day, job_key)]

            daily["requests"] += 1
            job["requests"] += 1

            if cost is not None:
                amount = Decimal(cost["total_inr"])

                known_cost += amount
                daily["known_cost_inr"] += amount
                job["known_cost_inr"] += amount
            else:
                unknown_cost_requests += 1
                daily["unknown_cost_requests"] += 1
                job["unknown_cost_requests"] += 1

        records = (
            query
            .order_by(
                GeminiAPIUsage.created_at.desc(),
                GeminiAPIUsage.id.desc(),
            )
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )

        requests = []

        for record in records:
            cost, cost_status = calculate_attempt_cost(
                record, rates
            )

            requests.append({
                "id": str(record.id),
                "job_id": (
                    str(record.job_id)
                    if record.job_id else None
                ),
                "model_name": record.model_name,
                "view_name": record.view_name,
                "attempt_number": record.attempt_number,
                "status": record.status,
                "input_tokens": record.input_tokens,
                "output_tokens": record.output_tokens,
                "image_output_tokens": (
                    record.image_output_tokens
                ),
                "text_output_tokens": (
                    record.text_output_tokens
                ),
                "thinking_tokens": record.thinking_tokens,
                "total_tokens": record.total_tokens,
                "duration_ms": record.duration_ms,
                "error_code": record.error_code,
                "created_at": (
                    record.created_at.isoformat()
                    if record.created_at else None
                ),
                "estimated_cost": cost,
                "cost_status": cost_status,
            })

        daily = [
            {
                "date": day,
                "requests": values["requests"],
                "known_cost_inr": money(
                    values["known_cost_inr"]
                ),
                "unknown_cost_requests": (
                    values["unknown_cost_requests"]
                ),
                "complete": (
                    values["unknown_cost_requests"] == 0
                ),
            }
            for day, values in sorted(
                daily_costs.items()
            )
        ]

        daily_jobs = [
            {
                "date": day,
                "job_id": job,
                "requests": values["requests"],
                "known_cost_inr": money(
                    values["known_cost_inr"]
                ),
                "unknown_cost_requests": (
                    values["unknown_cost_requests"]
                ),
                "complete": (
                    values["unknown_cost_requests"] == 0
                ),
            }
            for (day, job), values in sorted(
                job_costs.items(),
                key=lambda item: (
                    item[0][0],
                    item[0][1] or "",
                ),
            )
        ]

        available_models = [
            name
            for (name,) in (
                db.query(GeminiAPIUsage.model_name)
                .distinct()
                .order_by(GeminiAPIUsage.model_name)
                .all()
            )
            if name
        ]

        return {
            "success": True,
            "total": total,
            "page": page,
            "page_size": page_size,
            "requests": requests,
            "summary": {
                "total_requests": total,
                "successful_requests": successful,
                "failed_requests": failed,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "known_cost_inr": money(known_cost),
                "unknown_cost_requests": (
                    unknown_cost_requests
                ),
                "complete": (
                    total > 0
                    and unknown_cost_requests == 0
                ),
            },
            "daily": daily,
            "daily_jobs": daily_jobs,
            "available_models": available_models,
            "pricing": {
                "currency": "INR",
                "model": rates["model"],
                "usd_to_inr": str(rates["fx"]),
                "estimated_not_billed": True,
            },
        }
    finally:
        db.close()


@router.get("/{job_id}")
def get_generation_history_job(job_id: UUID):
    db = SessionLocal()

    try:
        job = (
            db.query(GenerationJob)
            .filter(GenerationJob.id == job_id)
            .first()
        )

        if job is None:
            raise HTTPException(
                status_code=404,
                detail="Generation job not found.",
            )

        return {
            "success": True,
            "job": serialize_job(
                job,
                include_details=True,
                db=db,
            ),
        }
    finally:
        db.close()
