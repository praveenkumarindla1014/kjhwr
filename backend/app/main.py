"""FastAPI application entry point."""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes import router
from app.config import Settings, get_settings
from app.services.forecast_service import DataRepository, ForecastService


def create_app(settings: Settings | None = None, repository: DataRepository | None = None) -> FastAPI:
    settings = settings or get_settings()
    logging.basicConfig(level=settings.log_level, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    app = FastAPI(
        title="Wind Intelligence API",
        description="UK national wind generation forecasts vs actuals (Elexon FUELHH / WINDFOR).",
        version="1.0.0",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )
    repository = repository or DataRepository(settings)
    repository.load_from_cache()
    app.state.forecast_service = ForecastService(repository, settings)
    app.include_router(router)
    if settings.static_dir.is_dir():
        # Mounted last so /api/* and /docs keep priority. The SPA uses hash routing,
        # so no catch-all fallback is needed.
        app.mount("/", StaticFiles(directory=settings.static_dir, html=True), name="frontend")
    return app


app = create_app()
