
import asyncio
import os

from contextlib import asynccontextmanager, suppress
from pathlib import Path

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
from app.routes.permanent_delete import router as permanent_delete_router
from app.routes.uploads import (
    router as uploads_router,
)
from app.routes.generation import (
    router as generation_router,
)
from app.routes.custom_designs import (
    router as custom_designs_router,
)
from app.routes.temporary_generation import (
    router as temporary_generation_router,
    clean_expired_sessions,
)

load_dotenv()


def required_setting(name):
    value = os.getenv(name)

    if not value:
        raise RuntimeError(
            f"Missing environment setting: {name}"
        )

    return value


FRONTEND_URL = required_setting("FRONTEND_URL")
GENERATED_DIR = Path(required_setting("GENERATED_DIR"))
CATALOG_DIR = Path(required_setting("CATALOG_DIR"))
UPLOAD_DIR = Path(required_setting("UPLOAD_DIR"))

CLEANUP_INTERVAL = int(
    required_setting("TEMP_TRYON_CLEANUP_INTERVAL_SECONDS")
)

for folder in (GENERATED_DIR, CATALOG_DIR, UPLOAD_DIR):
    folder.mkdir(parents=True, exist_ok=True)


async def cleanup_loop():
    while True:
        await asyncio.to_thread(clean_expired_sessions)
        await asyncio.sleep(CLEANUP_INTERVAL)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)

    task = asyncio.create_task(cleanup_loop())

    try:
        yield
    finally:
        task.cancel()

        with suppress(asyncio.CancelledError):
            await task


app = FastAPI(
    title="Fashion AI Portal API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount(
    "/catalog",
    StaticFiles(directory=str(CATALOG_DIR)),
    name="catalog",
)

app.mount(
    "/uploads",
    StaticFiles(directory=str(UPLOAD_DIR)),
    name="uploads",
)

app.mount(
    "/generated",
    StaticFiles(directory=str(GENERATED_DIR)),
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
    permanent_delete_router,
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

app.include_router(
    temporary_generation_router,
    prefix="/api/temporary-generation",
    tags=["Temporary Try-On"],
)


@app.get("/")
def root():
    return {
        "message": "Fashion AI Portal backend is running"
    }


@app.get("/api/health")
def health():
    return {
        "status": "healthy"
    }


# Administrator generation history and job cost
from app.routes.generation_history import (
    router as generation_history_router,
)

app.include_router(generation_history_router)
