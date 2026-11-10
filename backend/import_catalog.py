import os

import fitz

from app.database import SessionLocal
from app.models import Category, Design


PDF_FOLDER = "catalog-pdfs"
OUTPUT_FOLDER = "catalog-images"

BASE_URL = "http://localhost:8000"


CATALOGS = {
    "designer-shirts": {
        "pdf": "designer-shirts.pdf",
        "prefix": "DS",
        "name": "Designer Shirt",
    },

    "formals": {
        "pdf": "formals.pdf",
        "prefix": "FM",
        "name": "Formal",
    },

    "indowestern": {
        "pdf": "indowestern.pdf",
        "prefix": "IW",
        "name": "Indowestern",
    },

    "sherwani": {
        "pdf": "sherwani.pdf",
        "prefix": "SH",
        "name": "Sherwani",
    },
}


def import_catalog():

    db = SessionLocal()

    try:

        for category_slug, config in CATALOGS.items():

            print(
                f"\nProcessing {category_slug}..."
            )

            category = (
                db.query(Category)
                .filter(
                    Category.slug
                    == category_slug
                )
                .first()
            )

            if not category:

                print(
                    f"Category not found: "
                    f"{category_slug}"
                )

                continue


            pdf_path = os.path.join(
                PDF_FOLDER,
                config["pdf"],
            )

            if not os.path.exists(
                pdf_path
            ):

                print(
                    f"PDF not found: "
                    f"{pdf_path}"
                )

                continue


            output_directory = os.path.join(
                OUTPUT_FOLDER,
                category_slug,
            )

            os.makedirs(
                output_directory,
                exist_ok=True,
            )


            pdf = fitz.open(
                pdf_path
            )


            print(
                f"Pages found: "
                f"{len(pdf)}"
            )


            for index, page in enumerate(
                pdf
            ):

                page_number = index + 1

                design_code = (
                    f"{config['prefix']}-"
                    f"{page_number:03d}"
                )


                filename = (
                    f"{design_code}.jpg"
                )


                output_path = os.path.join(
                    output_directory,
                    filename,
                )


                # Render page
                pixmap = page.get_pixmap(
                    matrix=fitz.Matrix(
                        2,
                        2,
                    ),
                    alpha=False,
                )


                pixmap.save(
                    output_path
                )


                image_url = (
                    f"{BASE_URL}"
                    f"/catalog/"
                    f"{category_slug}/"
                    f"{filename}"
                )


                existing = (
                    db.query(Design)
                    .filter(
                        Design.design_code
                        == design_code
                    )
                    .first()
                )


                if existing:

                    existing.image_url = (
                        image_url
                    )

                    existing.pdf_page = (
                        page_number
                    )

                    existing.pdf_name = (
                        config["pdf"]
                    )

                    print(
                        f"Updated "
                        f"{design_code}"
                    )

                else:

                    design = Design(

                        category_id=
                            category.id,

                        design_code=
                            design_code,

                        name=(
                            f"{config['name']} "
                            f"{page_number:03d}"
                        ),

                        description=(
                            f"{config['name']} "
                            f"catalog design"
                        ),

                        image_url=
                            image_url,

                        pdf_name=
                            config["pdf"],

                        pdf_page=
                            page_number,

                        is_active=True,
                    )

                    db.add(
                        design
                    )

                    print(
                        f"Added "
                        f"{design_code}"
                    )


            db.commit()

            pdf.close()


        print(
            "\nCatalog import completed."
        )


    except Exception as error:

        db.rollback()

        print(
            "Catalog import failed:",
            error,
        )

        raise


    finally:

        db.close()


if __name__ == "__main__":

    import_catalog()