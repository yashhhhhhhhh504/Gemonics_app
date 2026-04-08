import os
import sys

from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from config import settings
from database import init_db

from routers.auth_router import router as auth_router
from routers.projects_router import router as projects_router
from routers.samples_router import router as samples_router
from routers.jobs_router import router as jobs_router
from routers.reports_router import router as reports_router
from routers.system_router import router as system_router
from routers.references_router import router as references_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create directories
    for d in [settings.UPLOAD_DIR, settings.RESULTS_DIR, settings.REFERENCES_DIR, settings.TEMP_DIR]:
        os.makedirs(d, exist_ok=True)
    # Init database
    await init_db()
    yield


app = FastAPI(
    title=settings.APP_NAME,
    description="Full-Stack NGS Analysis Platform for Automated Genomics Pipelines",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routers
app.include_router(auth_router)
app.include_router(projects_router)
app.include_router(samples_router)
app.include_router(jobs_router)
app.include_router(reports_router)
app.include_router(system_router)
app.include_router(references_router)

# Serve frontend static files in production
frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.isdir(frontend_dist):
    # Serve static assets
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="assets")

    # SPA catch-all: serve index.html for any non-API route
    @app.get("/{full_path:path}")
    async def spa_fallback(request: Request, full_path: str):
        # Don't catch API routes
        if full_path.startswith("api/"):
            from fastapi import HTTPException
            raise HTTPException(status_code=404)
        index = os.path.join(frontend_dist, "index.html")
        return FileResponse(index)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
