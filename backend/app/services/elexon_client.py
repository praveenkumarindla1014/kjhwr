"""HTTP client for the Elexon Insights (BMRS) API.

Endpoints used (verified against the live API):
  GET {base}/datasets/FUELHH/stream?settlementDateFrom=YYYY-MM-DD&settlementDateTo=YYYY-MM-DD&fuelType=WIND
  GET {base}/datasets/WINDFOR/stream?publishDateTimeFrom=ISO&publishDateTimeTo=ISO

The /stream endpoints are not paginated: they return a single JSON array for the
requested window. Requests are split into fixed-size windows so that no single
response is very large and a failure can be retried for one window only.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable
from datetime import date, datetime, timedelta, timezone
from typing import Any

import httpx

logger = logging.getLogger(__name__)

RETRYABLE_STATUS = {429, 500, 502, 503, 504}


class ElexonAPIError(RuntimeError):
    """Raised when the Elexon API cannot provide a valid response."""


def _iso_utc(value: datetime) -> str:
    return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class ElexonClient:
    def __init__(
        self,
        base_url: str,
        timeout_seconds: float = 30.0,
        max_retries: int = 3,
        backoff_seconds: float = 1.0,
        chunk_days: int = 7,
        transport: httpx.BaseTransport | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._max_retries = max(0, max_retries)
        self._backoff_seconds = backoff_seconds
        self._chunk_days = max(1, chunk_days)
        self._sleep = sleep
        self._client = httpx.Client(
            timeout=timeout_seconds,
            transport=transport,
            headers={"Accept": "application/json", "User-Agent": "wind-intelligence/1.0"},
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "ElexonClient":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def _get_records(self, path: str, params: dict[str, str]) -> list[dict[str, Any]]:
        url = f"{self._base_url}{path}"
        last_error: str = "unknown error"
        for attempt in range(self._max_retries + 1):
            try:
                response = self._client.get(url, params=params)
            except httpx.TransportError as exc:  # timeouts, connection errors
                last_error = f"{type(exc).__name__}: {exc}"
                logger.warning("Elexon request failed (attempt %d): %s %s", attempt + 1, path, last_error)
            else:
                if response.status_code == 200:
                    return self._validate_payload(response, path)
                last_error = f"HTTP {response.status_code}: {response.text[:300]}"
                if response.status_code not in RETRYABLE_STATUS:
                    raise ElexonAPIError(f"Elexon {path} rejected the request ({last_error})")
                logger.warning("Elexon returned %s (attempt %d) for %s", response.status_code, attempt + 1, path)
            if attempt < self._max_retries:
                self._sleep(self._backoff_seconds * (2**attempt))
        raise ElexonAPIError(f"Elexon {path} unavailable after {self._max_retries + 1} attempts ({last_error})")

    @staticmethod
    def _validate_payload(response: httpx.Response, path: str) -> list[dict[str, Any]]:
        try:
            payload = response.json()
        except ValueError as exc:
            raise ElexonAPIError(f"Elexon {path} returned invalid JSON") from exc
        # Stream endpoints return a bare list; non-stream endpoints wrap it in {"data": [...]}.
        if isinstance(payload, dict) and isinstance(payload.get("data"), list):
            payload = payload["data"]
        if not isinstance(payload, list):
            raise ElexonAPIError(f"Elexon {path} returned an unexpected payload type: {type(payload).__name__}")
        return [record for record in payload if isinstance(record, dict)]

    def fetch_wind_actuals(self, settlement_date_from: date, settlement_date_to: date) -> list[dict[str, Any]]:
        """Half-hourly outturn generation for fuelType WIND (FUELHH)."""
        records: list[dict[str, Any]] = []
        chunk_start = settlement_date_from
        while chunk_start <= settlement_date_to:
            chunk_end = min(chunk_start + timedelta(days=self._chunk_days - 1), settlement_date_to)
            batch = self._get_records(
                "/datasets/FUELHH/stream",
                {
                    "settlementDateFrom": chunk_start.isoformat(),
                    "settlementDateTo": chunk_end.isoformat(),
                    "fuelType": "WIND",
                },
            )
            logger.info("FUELHH %s..%s: %d records", chunk_start, chunk_end, len(batch))
            records.extend(batch)
            chunk_start = chunk_end + timedelta(days=1)
        return records

    def fetch_wind_forecasts(self, publish_from: datetime, publish_to: datetime) -> list[dict[str, Any]]:
        """All WINDFOR forecast runs published in [publish_from, publish_to)."""
        records: list[dict[str, Any]] = []
        chunk_start = publish_from
        while chunk_start < publish_to:
            chunk_end = min(chunk_start + timedelta(days=self._chunk_days), publish_to)
            batch = self._get_records(
                "/datasets/WINDFOR/stream",
                {"publishDateTimeFrom": _iso_utc(chunk_start), "publishDateTimeTo": _iso_utc(chunk_end)},
            )
            logger.info("WINDFOR published %s..%s: %d records", chunk_start, chunk_end, len(batch))
            records.extend(batch)
            chunk_start = chunk_end
        return records
