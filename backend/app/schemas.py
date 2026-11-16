import os
from pydantic import field_serializer

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


    # FASHIONFIT_CATALOG_URL_NORMALIZATION
    @field_serializer("image_url")
    def serialize_catalog_image_url(self, value):
        base_url = os.getenv("PUBLIC_BACKEND_URL", "").rstrip("/")

        if not value or not base_url:
            return value

        if "/catalog/" in value:
            relative_path = value.split("/catalog/", 1)[1]
            return f"{base_url}/catalog/{relative_path}"

        return value



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