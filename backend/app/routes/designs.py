from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
)

from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Design
from app.schemas import DesignResponse

router = APIRouter()


@router.get(
    "/category/{category_id}",
    response_model=list[DesignResponse],
)
def get_designs_by_category(
    category_id: UUID,
    db: Session = Depends(get_db),
):

    designs = (
        db.query(Design)
        .filter(
            Design.category_id == category_id,
            Design.is_active.is_(True),
        )
        .all()
    )

    return designs


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
            Design.id == design_id
        )
        .first()
    )

    if not design:
        raise HTTPException(
            status_code=404,
            detail="Design not found",
        )

    return design