from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class CategoryResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    display_order: int

    model_config = ConfigDict(from_attributes=True)


class DesignResponse(BaseModel):
    id: UUID
    category_id: UUID
    design_code: str
    name: str
    description: Optional[str] = None
    image_url: str
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class GenerationJobResponse(BaseModel):
    id: UUID
    design_id: UUID

    status: str
    progress: int

    output_front_url: Optional[str] = None
    output_left_url: Optional[str] = None
    output_right_url: Optional[str] = None
    output_back_url: Optional[str] = None

    error_message: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)