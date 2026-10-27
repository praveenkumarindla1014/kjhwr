"""Data repository (Elexon fetch + local snapshot cache) and analysis orchestration."""

from __future__ import annotations

import json
import logging
import os
import tempfile
import threading
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any

import pandas as pd

from app.analytics import metrics
from app.analytics.processing import (
    CutoffPolicy,
    NormalisationStats,
    build_analysis_frame,
    normalise_actuals,
    normalise_forecasts,
    period_bounds_utc,
)
from app.config import Settings
from app.services.elexon_client import ElexonAPIError, ElexonClient

logger = logging.getLogger(__name__)

ACTUALS_FILE = "fuelhh_wind.json"
FORECASTS_FILE = "windfor.json"
META_FILE = "snapshot_meta.json"


class DataUnavailableError(RuntimeError):
    """No real data is available (cache empty and Elexon fetch failed)."""


@dataclass
class Dataset:
    actuals: pd.DataFrame
    forecasts: pd.DataFrame
    actual_stats: NormalisationStats
    forecast_stats: NormalisationStats
    meta: dict[str, Any]
    version: int


def _atomic_write_json(path: Path, payload: Any) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    os.replace(tmp, path)


class DataRepository:
    def __init__(
        self,
        settings: Settings,
        client_factory: Callable[[], ElexonClient] | None = None,
        fallback_dir: Path | None = None,
    ) -> None:
        self._settings = settings
        self._fallback_dir = fallback_dir or Path(tempfile.gettempdir()) / "wind-intelligence-data"
        self._client_factory = client_factory or self._default_client
        self._lock = threading.Lock()
        self._dataset: Dataset | None = None
        self._version = 0
        self.last_refresh_error: str | None = None

    def _default_client(self) -> ElexonClient:
        s = self._settings
        return ElexonClient(
            s.elexon_base_url,
            timeout_seconds=s.http_timeout_seconds,
            max_retries=s.http_max_retries,
            backoff_seconds=s.http_backoff_seconds,
            chunk_days=s.fetch_chunk_days,
        )

    # ---- fetch windows -------------------------------------------------
    def actuals_window(self) -> tuple[date, date]:
        # Settlement dates are UK-local; pad by a day each side and trim later.
        return self._settings.analysis_start - timedelta(days=1), self._settings.analysis_end + timedelta(days=1)

    def forecasts_window(self) -> tuple[datetime, datetime]:
        start_utc, end_utc = period_bounds_utc(self._settings.analysis_start, self._settings.analysis_end)
        # WINDFOR runs look ~3 days ahead; publishes older than the max horizon + 1 day are irrelevant.
        lookback = timedelta(hours=self._settings.max_horizon_hours + 24)
        return (start_utc - lookback).to_pydatetime(), end_utc.to_pydatetime()

    # ---- cache ---------------------------------------------------------
    @property
    def data_dir(self) -> Path:
        return self._settings.data_dir

    def _runtime_dir(self) -> Path:
        """Directory refreshed snapshots are written to.

        Serverless hosts (e.g. Vercel) have a read-only deployment filesystem, so fall
        back to the system temp dir when the configured data dir is not writable.
        """
        try:
            self.data_dir.mkdir(parents=True, exist_ok=True)
            probe = self.data_dir / ".write_test"
            probe.write_text("ok")
            probe.unlink()
            return self.data_dir
        except OSError:
            self._fallback_dir.mkdir(parents=True, exist_ok=True)
            logger.warning("Data dir %s is not writable; using %s", self.data_dir, self._fallback_dir)
            return self._fallback_dir

    def _build_dataset(self, actual_records: list[dict], forecast_records: list[dict], meta: dict) -> Dataset:
        actuals, actual_stats = normalise_actuals(actual_records)
        forecasts, forecast_stats = normalise_forecasts(forecast_records)
        self._version += 1
        meta = {
            **meta,
            "actual_records": actual_stats.as_dict(),
            "forecast_records": forecast_stats.as_dict(),
            "forecast_publish_runs": int(forecasts["publish_time"].nunique()) if len(forecasts) else 0,
        }
        return Dataset(actuals, forecasts, actual_stats, forecast_stats, meta, self._version)

    def load_from_cache(self) -> bool:
        # A snapshot refreshed at runtime (fallback dir) wins over the bundled one.
        for directory in (self._fallback_dir, self.data_dir):
            paths = [directory / name for name in (ACTUALS_FILE, FORECASTS_FILE, META_FILE)]
            if all(p.exists() for p in paths):
                break
        else:
            return False
        try:
            actual_records = json.loads(paths[0].read_text(encoding="utf-8"))
            forecast_records = json.loads(paths[1].read_text(encoding="utf-8"))
            meta = json.loads(paths[2].read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            logger.error("Could not read cached snapshot: %s", exc)
            return False
        meta["loaded_from"] = "local_snapshot"
        self._dataset = self._build_dataset(actual_records, forecast_records, meta)
        logger.info("Loaded snapshot fetched at %s", meta.get("fetched_at"))
        return True

    def refresh(self) -> Dataset:
        """Fetch fresh data from Elexon. Existing data is kept if the fetch fails."""
        with self._lock:
            actual_from, actual_to = self.actuals_window()
            publish_from, publish_to = self.forecasts_window()
            try:
                with self._client_factory() as client:
                    actual_records = client.fetch_wind_actuals(actual_from, actual_to)
                    forecast_records = client.fetch_wind_forecasts(publish_from, publish_to)
            except ElexonAPIError as exc:
                self.last_refresh_error = str(exc)
                logger.error("Elexon refresh failed: %s", exc)
                raise
            if not actual_records or not forecast_records:
                self.last_refresh_error = "Elexon returned no records for the analysis period"
                raise ElexonAPIError(self.last_refresh_error)

            meta = {
                "fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "source": self._settings.elexon_base_url,
                "actuals_settlement_dates": [actual_from.isoformat(), actual_to.isoformat()],
                "forecasts_publish_window": [publish_from.isoformat(), publish_to.isoformat()],
                "loaded_from": "elexon_api",
            }
            dataset = self._build_dataset(actual_records, forecast_records, meta)
            target = self._runtime_dir()
            _atomic_write_json(target / ACTUALS_FILE, actual_records)
            _atomic_write_json(target / FORECASTS_FILE, forecast_records)
            _atomic_write_json(target / META_FILE, meta)
            self._dataset = dataset
            self.last_refresh_error = None
            return dataset

    def get(self) -> Dataset:
        if self._dataset is None and not self.load_from_cache():
            if not self._settings.auto_fetch_on_empty_cache:
                raise DataUnavailableError("No cached Elexon snapshot found and auto-fetch is disabled")
            try:
                self.refresh()
            except ElexonAPIError as exc:
                raise DataUnavailableError(f"No cached data and Elexon fetch failed: {exc}") from exc
        assert self._dataset is not None
        return self._dataset

    @property
    def is_loaded(self) -> bool:
        return self._dataset is not None


class ForecastService:
    def __init__(self, repository: DataRepository, settings: Settings) -> None:
        self.repository = repository
        self.settings = settings
        self._frame_cache = lru_cache(maxsize=64)(self._compute_frame)

    def _compute_frame(self, version: int, start: date, end: date, policy: CutoffPolicy) -> pd.DataFrame:
        dataset = self.repository.get()
        return build_analysis_frame(dataset.actuals, dataset.forecasts, start, end, policy)

    def analysis_frame(self, start: date, end: date, policy: CutoffPolicy) -> pd.DataFrame:
        dataset = self.repository.get()
        return self._frame_cache(dataset.version, start, end, policy)

    def summary(self, frame: pd.DataFrame) -> dict[str, Any]:
        return {"metrics": metrics.frame_metrics(frame), "coverage": metrics.coverage_summary(frame)}

    def accuracy(self, frame: pd.DataFrame) -> dict[str, Any]:
        return {
            **self.summary(frame),
            "daily": metrics.daily_summary(frame),
            "hour_of_day": metrics.hour_of_day_profile(frame),
        }
