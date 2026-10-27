"""Pydantic response models."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel


class Period(BaseModel):
    start_date: date
    end_date: date
    timezone: str = "Europe/London"


class CutoffInfo(BaseModel):
    mode: Literal["day_ahead", "horizon"]
    cutoff_time: str
    horizon_hours: float
    description: str


class QueryContext(BaseModel):
    period: Period
    cutoff: CutoffInfo


class AccuracyMetrics(BaseModel):
    observations: int
    mae: float | None
    rmse: float | None
    bias: float | None
    mape: float | None
    mape_observations: int
    mape_excluded_zero_actual: int
    normalised_mae_pct: float | None
    median_abs_error: float | None
    p90_abs_error: float | None
    max_abs_error: float | None
    mean_forecast: float | None
    mean_actual: float | None
    over_forecast_count: int
    under_forecast_count: int
    mean_lead_time_hours: float | None


class Coverage(BaseModel):
    expected_half_hour_intervals: int
    actual_half_hour_intervals_available: int
    expected_evaluation_intervals: int
    matched_intervals: int
    missing_forecast_intervals: int
    missing_actual_intervals: int
    missing_both_intervals: int
    excluded_intervals: int
    coverage_pct: float | None


class DailySummary(BaseModel):
    delivery_date: date
    observations: int
    expected_intervals: int
    mae: float | None
    rmse: float | None
    bias: float | None
    mape: float | None
    mean_forecast: float | None
    mean_actual: float | None
    max_abs_error: float | None
    forecast_publish_times: list[datetime]


class HourProfile(BaseModel):
    hour: int
    observations: int
    mae: float
    bias: float


class AnalysisRow(BaseModel):
    start_time: datetime
    delivery_date: date
    cutoff: datetime
    publish_time: datetime | None
    forecast: float | None
    actual: float | None
    error: float | None
    abs_error: float | None
    lead_time_hours: float | None
    status: str


class AccuracyResponse(QueryContext):
    metrics: AccuracyMetrics
    coverage: Coverage
    daily: list[DailySummary]
    hour_of_day: list[HourProfile]


class AnalysisResponse(AccuracyResponse):
    rows: list[AnalysisRow]
    data_refreshed_at: datetime | None


class ActualPoint(BaseModel):
    start_time: datetime
    generation: float


class ActualsResponse(BaseModel):
    period: Period
    count: int
    records: list[ActualPoint]


class ForecastPoint(BaseModel):
    start_time: datetime
    publish_time: datetime
    cutoff: datetime
    generation: float
    lead_time_hours: float


class ForecastsResponse(QueryContext):
    count: int
    records: list[ForecastPoint]


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    data_loaded: bool
    data_refreshed_at: datetime | None
    last_refresh_error: str | None


class RefreshResponse(BaseModel):
    status: Literal["ok"]
    data_refreshed_at: datetime
    actual_records: int
    forecast_records: int
    forecast_publish_runs: int


class DataSourceInfo(BaseModel):
    name: str
    dataset: str
    description: str
    endpoint: str
    documentation_url: str
    fields: list[str]


class MetaResponse(BaseModel):
    analysis_period: Period
    default_cutoff: CutoffInfo
    max_horizon_hours: int
    data_refreshed_at: datetime | None
    loaded_from: str | None
    sources: list[DataSourceInfo]
    record_counts: dict[str, dict[str, int]]
    forecast_publish_runs: int
