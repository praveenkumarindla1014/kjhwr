"""Data normalisation, point-in-time forecast selection and forecast/actual matching.

All timestamps are handled as timezone-aware UTC internally. Delivery dates and the
day-ahead decision cutoff are defined in UK local time (Europe/London), which makes
the logic correct across daylight-saving transitions (46/50 half-hours per day).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, time, timedelta
from typing import Any, Literal
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

UK_TZ = ZoneInfo("Europe/London")
INTERVAL = pd.Timedelta(minutes=30)

CutoffMode = Literal["day_ahead", "horizon"]

STATUS_MATCHED = "matched"
STATUS_MISSING_FORECAST = "missing_forecast"
STATUS_MISSING_ACTUAL = "missing_actual"
STATUS_MISSING_BOTH = "missing_both"
# WINDFOR is published at hourly resolution; half-past intervals have no forecast by design.
STATUS_NOT_FORECAST_INTERVAL = "no_forecast_interval"


@dataclass(frozen=True)
class CutoffPolicy:
    """Rule deciding which forecast runs were known at decision time.

    day_ahead: forecasts must be published by `cutoff_time` (UK local) on the day
               before the delivery date of the target interval.
    horizon:   forecasts must be published at least `horizon_hours` before the
               target interval starts.
    """

    mode: CutoffMode = "day_ahead"
    cutoff_time: time = time(11, 0)
    horizon_hours: float = 24.0

    def describe(self) -> str:
        if self.mode == "day_ahead":
            return f"Latest forecast published by {self.cutoff_time:%H:%M} UK time on the day before delivery (D-1)"
        return f"Latest forecast published at least {self.horizon_hours:g} hours before the target interval"


@dataclass
class NormalisationStats:
    raw_records: int = 0
    invalid_records: int = 0
    duplicate_records: int = 0
    other_fuel_records: int = 0
    valid_records: int = 0
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "raw_records": self.raw_records,
            "invalid_records": self.invalid_records,
            "duplicate_records": self.duplicate_records,
            "other_fuel_records": self.other_fuel_records,
            "valid_records": self.valid_records,
        }


def _to_utc(series: pd.Series) -> pd.Series:
    return pd.to_datetime(series, utc=True, errors="coerce")


def normalise_actuals(records: list[dict[str, Any]]) -> tuple[pd.DataFrame, NormalisationStats]:
    """FUELHH records -> DataFrame[start_time, publish_time, actual] (one row per interval)."""
    stats = NormalisationStats(raw_records=len(records))
    frame = pd.DataFrame.from_records(records)
    for column in ("startTime", "generation", "publishTime", "fuelType"):
        if column not in frame:
            frame[column] = None

    if len(frame):
        is_wind = frame["fuelType"].isna() | (frame["fuelType"].astype(str).str.upper() == "WIND")
        stats.other_fuel_records = int((~is_wind).sum())
        frame = frame[is_wind]

    out = pd.DataFrame(
        {
            "start_time": _to_utc(frame["startTime"]),
            "publish_time": _to_utc(frame["publishTime"]),
            "actual": pd.to_numeric(frame["generation"], errors="coerce"),
        }
    )
    valid = out["start_time"].notna() & out["actual"].notna() & np.isfinite(out["actual"].astype(float))
    stats.invalid_records = int((~valid).sum())
    out = out[valid]

    # Revisions: keep the most recently published value for each interval.
    out = out.sort_values(["start_time", "publish_time"], na_position="first")
    before = len(out)
    out = out.drop_duplicates(subset="start_time", keep="last")
    stats.duplicate_records = before - len(out)
    stats.valid_records = len(out)
    return out.reset_index(drop=True), stats


def normalise_forecasts(records: list[dict[str, Any]]) -> tuple[pd.DataFrame, NormalisationStats]:
    """WINDFOR records -> DataFrame[start_time, publish_time, forecast] (unique per pair)."""
    stats = NormalisationStats(raw_records=len(records))
    frame = pd.DataFrame.from_records(records)
    for column in ("startTime", "publishTime", "generation"):
        if column not in frame:
            frame[column] = None

    out = pd.DataFrame(
        {
            "start_time": _to_utc(frame["startTime"]),
            "publish_time": _to_utc(frame["publishTime"]),
            "forecast": pd.to_numeric(frame["generation"], errors="coerce"),
        }
    )
    valid = (
        out["start_time"].notna()
        & out["publish_time"].notna()
        & out["forecast"].notna()
        & np.isfinite(out["forecast"].astype(float))
    )
    stats.invalid_records = int((~valid).sum())
    out = out[valid]

    before = len(out)
    out = out.drop_duplicates(subset=["start_time", "publish_time"], keep="last")
    stats.duplicate_records = before - len(out)
    stats.valid_records = len(out)
    return out.sort_values(["start_time", "publish_time"]).reset_index(drop=True), stats


def period_bounds_utc(start_date: date, end_date: date) -> tuple[pd.Timestamp, pd.Timestamp]:
    """UTC [start, end) covering UK-local delivery dates start_date..end_date inclusive."""
    start = pd.Timestamp(start_date).tz_localize(UK_TZ).tz_convert("UTC")
    end = pd.Timestamp(end_date + timedelta(days=1)).tz_localize(UK_TZ).tz_convert("UTC")
    return start, end


def target_intervals(start_date: date, end_date: date) -> pd.DatetimeIndex:
    """Every half-hour interval start (UTC) for the UK-local delivery dates."""
    start, end = period_bounds_utc(start_date, end_date)
    return pd.date_range(start, end, freq=INTERVAL, inclusive="left", name="start_time")


def delivery_dates(start_times: pd.Series | pd.DatetimeIndex) -> pd.Series:
    """UK-local calendar date of each interval start."""
    series = pd.Series(start_times)
    return series.dt.tz_convert(UK_TZ).dt.date


def decision_cutoffs(start_times: pd.Series, policy: CutoffPolicy) -> pd.Series:
    """Latest permissible forecast publish time (UTC) for each target interval."""
    start_times = pd.Series(start_times).reset_index(drop=True)
    if policy.mode == "horizon":
        return start_times - pd.Timedelta(hours=policy.horizon_hours)

    local_day = start_times.dt.tz_convert(UK_TZ).dt.normalize().dt.tz_localize(None)
    cutoff_naive = local_day - pd.Timedelta(days=1) + pd.Timedelta(
        hours=policy.cutoff_time.hour, minutes=policy.cutoff_time.minute
    )
    return cutoff_naive.dt.tz_localize(UK_TZ, ambiguous=False, nonexistent="shift_forward").dt.tz_convert("UTC")


def select_latest_forecasts(forecasts: pd.DataFrame, targets: pd.DatetimeIndex, policy: CutoffPolicy) -> pd.DataFrame:
    """For each target interval pick the latest forecast published on or before its cutoff.

    Forecasts published after the cutoff (or after the interval itself started) are
    never eligible, which prevents hindsight bias in the evaluation.
    Returns DataFrame[start_time, cutoff, publish_time, forecast] for targets that have
    at least one eligible forecast.
    """
    target_frame = pd.DataFrame({"start_time": pd.Series(targets)})
    target_frame["cutoff"] = decision_cutoffs(target_frame["start_time"], policy)

    candidates = forecasts.merge(target_frame, on="start_time", how="inner")
    eligible = candidates[
        (candidates["publish_time"] <= candidates["cutoff"]) & (candidates["publish_time"] <= candidates["start_time"])
    ]
    if eligible.empty:
        return pd.DataFrame(columns=["start_time", "cutoff", "publish_time", "forecast"])

    latest_idx = eligible.groupby("start_time")["publish_time"].idxmax()
    selected = eligible.loc[latest_idx, ["start_time", "cutoff", "publish_time", "forecast"]]
    return selected.sort_values("start_time").reset_index(drop=True)


def build_analysis_frame(
    actuals: pd.DataFrame,
    forecasts: pd.DataFrame,
    start_date: date,
    end_date: date,
    policy: CutoffPolicy,
) -> pd.DataFrame:
    """One row per half-hour target interval with the selected forecast, actual and errors.

    Missing values stay NaN (never coerced to zero) and are labelled by `status`.
    """
    targets = target_intervals(start_date, end_date)
    frame = pd.DataFrame({"start_time": pd.Series(targets)})
    frame["delivery_date"] = delivery_dates(frame["start_time"])
    frame["cutoff"] = decision_cutoffs(frame["start_time"], policy)
    # Forecast product resolution: WINDFOR values exist on the hour (UTC).
    frame["forecast_interval"] = frame["start_time"].dt.minute.eq(0) & frame["start_time"].dt.second.eq(0)

    selected = select_latest_forecasts(forecasts, targets, policy)
    frame = frame.merge(selected[["start_time", "publish_time", "forecast"]], on="start_time", how="left")
    frame = frame.merge(actuals[["start_time", "actual"]], on="start_time", how="left")

    frame["error"] = frame["forecast"] - frame["actual"]
    frame["abs_error"] = frame["error"].abs()
    frame["lead_time_hours"] = (frame["start_time"] - frame["publish_time"]).dt.total_seconds() / 3600.0

    has_forecast = frame["forecast"].notna()
    has_actual = frame["actual"].notna()
    frame["status"] = np.select(
        [
            ~frame["forecast_interval"],
            has_forecast & has_actual,
            has_forecast & ~has_actual,
            ~has_forecast & has_actual,
        ],
        [STATUS_NOT_FORECAST_INTERVAL, STATUS_MATCHED, STATUS_MISSING_ACTUAL, STATUS_MISSING_FORECAST],
        default=STATUS_MISSING_BOTH,
    )
    return frame


def filter_by_delivery_date(frame: pd.DataFrame, start_date: date, end_date: date) -> pd.DataFrame:
    mask = (frame["delivery_date"] >= start_date) & (frame["delivery_date"] <= end_date)
    return frame[mask].reset_index(drop=True)
