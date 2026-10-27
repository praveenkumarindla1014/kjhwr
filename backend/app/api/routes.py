"""HTTP routes. Handlers only validate input and shape output; logic lives in services/analytics."""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, datetime, time
from typing import Annotated, Any, Literal

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app import schemas
from app.analytics.processing import CutoffPolicy
from app.services.elexon_client import ElexonAPIError
from app.services.forecast_service import DataUnavailableError, ForecastService

router = APIRouter(prefix="/api")

FORECASTS_DOC = "https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream"
ACTUALS_DOC = "https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream"


def get_service(request: Request) -> ForecastService:
    return request.app.state.forecast_service


@dataclass(frozen=True)
class AnalysisQuery:
    start_date: date
    end_date: date
    policy: CutoffPolicy


def analysis_query(
    service: Annotated[ForecastService, Depends(get_service)],
    start_date: Annotated[date | None, Query(description="First UK-local delivery date (YYYY-MM-DD)")] = None,
    end_date: Annotated[date | None, Query(description="Last UK-local delivery date (YYYY-MM-DD)")] = None,
    cutoff_mode: Annotated[Literal["day_ahead", "horizon"], Query()] = "day_ahead",
    cutoff_time: Annotated[
        str | None, Query(pattern=r"^([01]\d|2[0-3]):[0-5]\d$", description="D-1 cutoff, UK local HH:MM")
    ] = None,
    horizon_hours: Annotated[float, Query(ge=0, le=72, description="Minimum forecast lead time (hours)")] = 24.0,
) -> AnalysisQuery:
    settings = service.settings
    start = start_date or settings.analysis_start
    end = end_date or settings.analysis_end
    if not (settings.analysis_start <= start <= settings.analysis_end) or not (
        settings.analysis_start <= end <= settings.analysis_end
    ):
        raise HTTPException(
            status_code=422,
            detail=f"Dates must be within the analysis period {settings.analysis_start} to {settings.analysis_end}",
        )
    if start > end:
        raise HTTPException(status_code=422, detail="start_date must be on or before end_date")
    hh, mm = (cutoff_time or settings.default_cutoff_time).split(":")
    policy = CutoffPolicy(mode=cutoff_mode, cutoff_time=time(int(hh), int(mm)), horizon_hours=horizon_hours)
    return AnalysisQuery(start, end, policy)


Query_ = Annotated[AnalysisQuery, Depends(analysis_query)]
Service_ = Annotated[ForecastService, Depends(get_service)]


def _context(q: AnalysisQuery) -> dict[str, Any]:
    return {
        "period": {"start_date": q.start_date, "end_date": q.end_date},
        "cutoff": _cutoff_info(q.policy),
    }


def _cutoff_info(policy: CutoffPolicy) -> dict[str, Any]:
    return {
        "mode": policy.mode,
        "cutoff_time": f"{policy.cutoff_time:%H:%M}",
        "horizon_hours": policy.horizon_hours,
        "description": policy.describe(),
    }


def _clean(value: Any) -> Any:
    if value is None or value is pd.NaT:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    if isinstance(value, pd.Timestamp):
        return value.to_pydatetime()
    return value


def _frame_records(frame: pd.DataFrame, columns: list[str]) -> list[dict[str, Any]]:
    return [{c: _clean(v) for c, v in zip(columns, row)} for row in frame[columns].itertuples(index=False)]


def _frame(service: ForecastService, q: AnalysisQuery) -> pd.DataFrame:
    try:
        return service.analysis_frame(q.start_date, q.end_date, q.policy)
    except DataUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _refreshed_at(service: ForecastService) -> str | None:
    if not service.repository.is_loaded:
        return None
    return service.repository.get().meta.get("fetched_at")


@router.get("/health", response_model=schemas.HealthResponse)
def health(service: Service_) -> dict[str, Any]:
    repo = service.repository
    return {
        "status": "ok" if repo.is_loaded else "degraded",
        "data_loaded": repo.is_loaded,
        "data_refreshed_at": _refreshed_at(service),
        "last_refresh_error": repo.last_refresh_error,
    }


@router.get("/meta", response_model=schemas.MetaResponse)
def meta(service: Service_) -> dict[str, Any]:
    settings = service.settings
    try:
        dataset = service.repository.get()
    except DataUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    hh, mm = settings.default_cutoff_time.split(":")
    return {
        "analysis_period": {"start_date": settings.analysis_start, "end_date": settings.analysis_end},
        "default_cutoff": _cutoff_info(CutoffPolicy(cutoff_time=time(int(hh), int(mm)))),
        "max_horizon_hours": settings.max_horizon_hours,
        "data_refreshed_at": dataset.meta.get("fetched_at"),
        "loaded_from": dataset.meta.get("loaded_from"),
        "record_counts": {
            "actuals": dataset.meta.get("actual_records", {}),
            "forecasts": dataset.meta.get("forecast_records", {}),
        },
        "forecast_publish_runs": dataset.meta.get("forecast_publish_runs", 0),
        "sources": [
            {
                "name": "Actual wind generation",
                "dataset": "FUELHH",
                "description": "Half-hourly outturn generation by fuel type, filtered to fuelType = WIND.",
                "endpoint": f"{settings.elexon_base_url}/datasets/FUELHH/stream",
                "documentation_url": ACTUALS_DOC,
                "fields": ["startTime", "generation", "fuelType", "publishTime", "settlementPeriod"],
            },
            {
                "name": "Wind generation forecast",
                "dataset": "WINDFOR",
                "description": "National wind generation forecast, hourly resolution, several runs per day.",
                "endpoint": f"{settings.elexon_base_url}/datasets/WINDFOR/stream",
                "documentation_url": FORECASTS_DOC,
                "fields": ["startTime", "publishTime", "generation"],
            },
        ],
    }


@router.post("/refresh", response_model=schemas.RefreshResponse)
def refresh(service: Service_) -> dict[str, Any]:
    try:
        dataset = service.repository.refresh()
    except ElexonAPIError as exc:
        raise HTTPException(status_code=502, detail=f"Elexon refresh failed; previous data retained. {exc}") from exc
    return {
        "status": "ok",
        "data_refreshed_at": dataset.meta["fetched_at"],
        "actual_records": dataset.actual_stats.valid_records,
        "forecast_records": dataset.forecast_stats.valid_records,
        "forecast_publish_runs": dataset.meta["forecast_publish_runs"],
    }


@router.get("/actuals", response_model=schemas.ActualsResponse)
def actuals(service: Service_, q: Query_) -> dict[str, Any]:
    frame = _frame(service, q)
    available = frame[frame["actual"].notna()]
    records = [
        {"start_time": _clean(ts), "generation": float(v)} for ts, v in zip(available["start_time"], available["actual"])
    ]
    return {"period": _context(q)["period"], "count": len(records), "records": records}


@router.get("/forecasts", response_model=schemas.ForecastsResponse)
def forecasts(service: Service_, q: Query_) -> dict[str, Any]:
    frame = _frame(service, q)
    selected = frame[frame["forecast"].notna()].rename(columns={"forecast": "generation"})
    records = _frame_records(selected, ["start_time", "publish_time", "cutoff", "generation", "lead_time_hours"])
    return {**_context(q), "count": len(records), "records": records}


@router.get("/accuracy", response_model=schemas.AccuracyResponse)
def accuracy(service: Service_, q: Query_) -> dict[str, Any]:
    frame = _frame(service, q)
    return {**_context(q), **service.accuracy(frame)}


ROW_COLUMNS = [
    "start_time",
    "delivery_date",
    "cutoff",
    "publish_time",
    "forecast",
    "actual",
    "error",
    "abs_error",
    "lead_time_hours",
    "status",
]


@router.get("/analysis", response_model=schemas.AnalysisResponse)
def analysis(service: Service_, q: Query_) -> dict[str, Any]:
    frame = _frame(service, q)
    refreshed: datetime | None = _refreshed_at(service)
    return {
        **_context(q),
        **service.accuracy(frame),
        "rows": _frame_records(frame, ROW_COLUMNS),
        "data_refreshed_at": refreshed,
    }
