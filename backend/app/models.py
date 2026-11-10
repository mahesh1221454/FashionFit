import uuid

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)

from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.database import Base


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


class Design(Base):
    __tablename__ = "designs"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    category_id = Column(
        UUID(as_uuid=True),
        ForeignKey("categories.id", ondelete="CASCADE"),
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
        nullable=False,
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