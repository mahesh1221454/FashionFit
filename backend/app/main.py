
import os

from dotenv import load_dotenv

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.database import Base, engine

from app.routes.categories import (
    router as categories_router,
)
from app.routes.designs import (
    router as designs_router,
)
from app.routes.uploads import (
    router as uploads_router,
)
from app.routes.generation import (
    router as generation_router,
)
from app.routes.custom_designs import (
    router as custom_designs_router,
)

load_dotenv()

Base.metadata.create_all(
    bind=engine
)

app = FastAPI(
    title="Fashion AI Portal API",
    version="1.0.0",
)

FRONTEND_URL = os.getenv(
    "FRONTEND_URL",
    "http://localhost:5173",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        FRONTEND_URL
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount(
    "/catalog",
    StaticFiles(
        directory="catalog-images"
    ),
    name="catalog",
)

app.mount(
    "/uploads",
    StaticFiles(
        directory="uploads"
    ),
    name="uploads",
)

app.mount(
    "/generated",
    StaticFiles(
        directory="generated"
    ),
    name="generated",
)

app.include_router(
    categories_router,
    prefix="/api/categories",
    tags=["Categories"],
)

app.include_router(
    designs_router,
    prefix="/api/designs",
    tags=["Designs"],
)

app.include_router(
    uploads_router,
    prefix="/api/uploads",
    tags=["Uploads"],
)

app.include_router(
    generation_router,
    prefix="/api/generation",
    tags=["Generation"],
)

app.include_router(
    custom_designs_router,
    prefix="/api/custom-designs",
    tags=["Custom Designs"],
)


@app.get("/")
def root():
    return {
        "message":
        "Fashion AI Portal backend is running"
    }


@app.get("/api/health")
def health():
    return {
        "status": "healthy"
    }
