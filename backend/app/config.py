"""Application configuration, read from environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _env_list(name: str, default: str) -> list[str]:
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    elexon_base_url: str = field(
        default_factory=lambda: os.getenv("ELEXON_BASE_URL", "https://data.elexon.co.uk/bmrs/api/v1").rstrip("/")
    )
    http_timeout_seconds: float = field(default_factory=lambda: float(os.getenv("HTTP_TIMEOUT_SECONDS", "30")))
    http_max_retries: int = field(default_factory=lambda: int(os.getenv("HTTP_MAX_RETRIES", "3")))
    http_backoff_seconds: float = field(default_factory=lambda: float(os.getenv("HTTP_BACKOFF_SECONDS", "1.0")))
    fetch_chunk_days: int = field(default_factory=lambda: int(os.getenv("FETCH_CHUNK_DAYS", "7")))

    data_dir: Path = field(default_factory=lambda: Path(os.getenv("DATA_DIR", str(BACKEND_ROOT / "data"))))
    auto_fetch_on_empty_cache: bool = field(default_factory=lambda: _env_bool("AUTO_FETCH_ON_EMPTY_CACHE", True))

    # Delivery-date period analysed (UK local dates, inclusive).
    analysis_start: date = field(default_factory=lambda: date.fromisoformat(os.getenv("ANALYSIS_START", "2026-01-01")))
    analysis_end: date = field(default_factory=lambda: date.fromisoformat(os.getenv("ANALYSIS_END", "2026-01-31")))

    # Default purchasing-decision cutoff: D-1 at this UK local time.
    # Assumption based on the GB day-ahead hourly auction gate closure (11:00 UK time);
    # it is configurable and is not an official rule for any specific utility.
    default_cutoff_time: str = field(default_factory=lambda: os.getenv("DEFAULT_CUTOFF_TIME", "11:00"))
    max_horizon_hours: int = 72

    cors_origins: list[str] = field(
        default_factory=lambda: _env_list("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080")
    )
    log_level: str = field(default_factory=lambda: os.getenv("LOG_LEVEL", "INFO"))

    # Built frontend to serve from FastAPI (single-container deployments such as Heroku).
    # Skipped silently when the directory does not exist (local dev, Vercel, split Docker).
    static_dir: Path = field(default_factory=lambda: Path(os.getenv("STATIC_DIR", str(BACKEND_ROOT / "static"))))


def get_settings() -> Settings:
    return Settings()
