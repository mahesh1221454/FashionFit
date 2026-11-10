
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Category
from app.schemas import CategoryResponse

router = APIRouter()


@router.get(
    "",
    response_model=list[CategoryResponse],
)
def get_categories(
    db: Session = Depends(get_db),
):
    categories = (
        db.query(Category)
        .filter(
            Category.slug != "custom-uploads"
        )
        .order_by(
            Category.display_order.asc()
        )
        .all()
    )

    return categories
