
import uuid

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)

from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.database import Base


# =========================================================
# CATEGORY
# =========================================================

class Category(Base):
    __tablename__ = "categories"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    name = Column(
        String(150),
        nullable=False,
    )

    slug = Column(
        String(150),
        unique=True,
        nullable=False,
    )

    display_order = Column(
        Integer,
        default=0,
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
    )


# =========================================================
# DESIGN
# =========================================================

class Design(Base):
    __tablename__ = "designs"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    category_id = Column(
        UUID(as_uuid=True),
        ForeignKey(
            "categories.id",
            ondelete="CASCADE",
        ),
        nullable=False,
    )

    design_code = Column(
        String(100),
        unique=True,
        nullable=False,
    )

    name = Column(
        String(200),
        nullable=False,
    )

    description = Column(
        Text,
        nullable=True,
    )

    image_url = Column(
        Text,
        nullable=False,
    )

    is_active = Column(
        Boolean,
        default=True,
    )

    pdf_name = Column(
        Text,
        nullable=True,
    )

    pdf_page = Column(
        Integer,
        nullable=True,
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    trashed_at = Column(
        DateTime(timezone=True),
        nullable=True,
    )


# =========================================================
# GENERATION JOB
# =========================================================

class GenerationJob(Base):
    __tablename__ = "generation_jobs"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    design_id = Column(
        UUID(as_uuid=True),
        ForeignKey("designs.id"),
        nullable=False,
    )

    front_image_url = Column(
        Text,
        nullable=False,
    )

    left_image_url = Column(
        Text,
        nullable=False,
    )

    right_image_url = Column(
        Text,
        nullable=False,
    )

    back_image_url = Column(
        Text,
        nullable=True,
    )

    status = Column(
        String(50),
        default="pending",
    )

    progress = Column(
        Integer,
        default=0,
    )

    output_front_url = Column(
        Text,
        nullable=True,
    )

    output_left_url = Column(
        Text,
        nullable=True,
    )

    output_right_url = Column(
        Text,
        nullable=True,
    )

    output_back_url = Column(
        Text,
        nullable=True,
    )

    error_message = Column(
        Text,
        nullable=True,
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    completed_at = Column(
        DateTime(timezone=True),
        nullable=True,
    )


# =========================================================
# STEP 10 - GEMINI API USAGE MONITORING
# =========================================================

class GeminiAPIUsage(Base):
    __tablename__ = "gemini_api_usage"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    job_id = Column(
        UUID(as_uuid=True),
        nullable=True,
    )


    image_output_tokens = Column(
        Integer,
        nullable=True,
    )

    text_output_tokens = Column(
        Integer,
        nullable=True,
    )

    thinking_tokens = Column(
        Integer,
        nullable=True,
    )

    model_name = Column(
        String(150),
        nullable=False,
    )

    view_name = Column(
        String(30),
        nullable=True,
    )

    attempt_number = Column(
        Integer,
        nullable=False,
        default=1,
    )

    status = Column(
        String(30),
        nullable=False,
    )

    input_tokens = Column(
        Integer,
        nullable=True,
    )

    output_tokens = Column(
        Integer,
        nullable=True,
    )

    total_tokens = Column(
        Integer,
        nullable=True,
    )

    duration_ms = Column(
        Integer,
        nullable=True,
    )

    error_code = Column(
        String(100),
        nullable=True,
    )

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    __table_args__ = (
        Index(
            "ix_gemini_api_usage_created_at",
            "created_at",
        ),
        Index(
            "ix_gemini_api_usage_model_created",
            "model_name",
            "created_at",
        ),
    )
