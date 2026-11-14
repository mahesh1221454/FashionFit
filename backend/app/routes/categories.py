
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

# =====================================================
# ADMIN: DELETE EMPTY CATEGORY
# =====================================================

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func

from app.models import Design
from app.routes.designs import require_management_auth


@router.delete(
    "/{category_id}",
    dependencies=[Depends(require_management_auth)],
)
def delete_empty_category(
    category_id: UUID,
    db: Session = Depends(get_db),
):
    category = (
        db.query(Category)
        .filter(Category.id == category_id)
        .with_for_update()
        .first()
    )

    if category is None:
        raise HTTPException(
            status_code=404,
            detail="Category not found.",
        )

    if category.slug == "custom-uploads":
        raise HTTPException(
            status_code=403,
            detail="This system category cannot be deleted.",
        )

    # Count all dresses, including hidden and trashed.
    dress_count = (
        db.query(func.count(Design.id))
        .filter(Design.category_id == category.id)
        .scalar()
    ) or 0

    if dress_count > 0:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Cannot delete '{category.name}'. "
                f"It contains {dress_count} dress record(s), "
                "including hidden or trashed dresses. "
                "Move or resolve those dresses first."
            ),
        )

    deleted_id = str(category.id)
    deleted_name = category.name

    try:
        db.delete(category)
        db.commit()

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail=(
                "Category is still referenced by other records."
            ),
        )

    except Exception:
        db.rollback()
        raise

    return {
        "success": True,
        "deleted": True,
        "category_id": deleted_id,
        "category_name": deleted_name,
        "message": "Empty category deleted successfully.",
        "images_deleted": False,
        "generation_history_deleted": False,
    }
