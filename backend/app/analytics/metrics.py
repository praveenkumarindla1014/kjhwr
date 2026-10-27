"""Forecast accuracy metrics. Pure functions over arrays / analysis frames."""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from .processing import (
    STATUS_MATCHED,
    STATUS_MISSING_ACTUAL,
    STATUS_MISSING_BOTH,
    STATUS_MISSING_FORECAST,
    UK_TZ,
)


def _pairs(forecast: Any, actual: Any) -> tuple[np.ndarray, np.ndarray]:
    f = np.asarray(forecast, dtype=float)
    a = np.asarray(actual, dtype=float)
    if f.shape != a.shape:
        raise ValueError("forecast and actual must have the same length")
    valid = np.isfinite(f) & np.isfinite(a)
    return f[valid], a[valid]


def signed_errors(forecast: Any, actual: Any) -> np.ndarray:
    """forecast - actual; positive = over-forecast, negative = under-forecast."""
    f, a = _pairs(forecast, actual)
    return f - a


def mean_absolute_error(forecast: Any, actual: Any) -> float | None:
    errors = signed_errors(forecast, actual)
    return float(np.mean(np.abs(errors))) if errors.size else None


def root_mean_squared_error(forecast: Any, actual: Any) -> float | None:
    errors = signed_errors(forecast, actual)
    return float(np.sqrt(np.mean(errors**2))) if errors.size else None


def forecast_bias(forecast: Any, actual: Any) -> float | None:
    errors = signed_errors(forecast, actual)
    return float(np.mean(errors)) if errors.size else None


def mean_absolute_percentage_error(forecast: Any, actual: Any) -> dict[str, Any]:
    """MAPE (%) over pairs with non-zero actual; reports how many pairs were excluded."""
    f, a = _pairs(forecast, actual)
    nonzero = a != 0
    used = int(nonzero.sum())
    value = float(np.mean(np.abs((f[nonzero] - a[nonzero]) / a[nonzero])) * 100.0) if used else None
    return {"value": value, "observations": used, "excluded_zero_actual": int((~nonzero).sum())}


def _percentile(values: np.ndarray, q: float) -> float | None:
    return float(np.percentile(values, q)) if values.size else None


def accuracy_metrics(forecast: Any, actual: Any) -> dict[str, Any]:
    f, a = _pairs(forecast, actual)
    errors = f - a
    abs_errors = np.abs(errors)
    mape = mean_absolute_percentage_error(f, a)
    mean_actual = float(np.mean(a)) if a.size else None
    mae = float(np.mean(abs_errors)) if errors.size else None
    return {
        "observations": int(errors.size),
        "mae": mae,
        "rmse": float(np.sqrt(np.mean(errors**2))) if errors.size else None,
        "bias": float(np.mean(errors)) if errors.size else None,
        "mape": mape["value"],
        "mape_observations": mape["observations"],
        "mape_excluded_zero_actual": mape["excluded_zero_actual"],
        # MAE relative to mean actual generation (volume-weighted, robust to low-output periods).
        "normalised_mae_pct": (mae / mean_actual * 100.0) if mae is not None and mean_actual else None,
        "median_abs_error": _percentile(abs_errors, 50),
        "p90_abs_error": _percentile(abs_errors, 90),
        "max_abs_error": float(np.max(abs_errors)) if errors.size else None,
        "mean_forecast": float(np.mean(f)) if f.size else None,
        "mean_actual": mean_actual,
        "over_forecast_count": int((errors > 0).sum()),
        "under_forecast_count": int((errors < 0).sum()),
    }


def matched_rows(frame: pd.DataFrame) -> pd.DataFrame:
    return frame[frame["status"] == STATUS_MATCHED]


def frame_metrics(frame: pd.DataFrame) -> dict[str, Any]:
    matched = matched_rows(frame)
    metrics = accuracy_metrics(matched["forecast"], matched["actual"])
    lead = matched["lead_time_hours"]
    metrics["mean_lead_time_hours"] = float(lead.mean()) if len(lead) else None
    return metrics


def coverage_summary(frame: pd.DataFrame) -> dict[str, Any]:
    """Counts of expected / matched / missing intervals.

    Evaluation intervals are the hourly targets for which WINDFOR issues forecasts.
    """
    evaluation = frame[frame["forecast_interval"]]
    counts = evaluation["status"].value_counts()
    expected = int(len(evaluation))
    matched = int(counts.get(STATUS_MATCHED, 0))
    missing_both = int(counts.get(STATUS_MISSING_BOTH, 0))
    return {
        "expected_half_hour_intervals": int(len(frame)),
        "actual_half_hour_intervals_available": int(frame["actual"].notna().sum()),
        "expected_evaluation_intervals": expected,
        "matched_intervals": matched,
        "missing_forecast_intervals": int(counts.get(STATUS_MISSING_FORECAST, 0)) + missing_both,
        "missing_actual_intervals": int(counts.get(STATUS_MISSING_ACTUAL, 0)) + missing_both,
        "missing_both_intervals": missing_both,
        "excluded_intervals": expected - matched,
        "coverage_pct": (matched / expected * 100.0) if expected else None,
    }


def daily_summary(frame: pd.DataFrame) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for day, group in frame.groupby("delivery_date", sort=True):
        matched = matched_rows(group)
        metrics = accuracy_metrics(matched["forecast"], matched["actual"])
        evaluation = group[group["forecast_interval"]]
        publish_times = matched["publish_time"].dropna()
        rows.append(
            {
                "delivery_date": day.isoformat(),
                "observations": metrics["observations"],
                "expected_intervals": int(len(evaluation)),
                "mae": metrics["mae"],
                "rmse": metrics["rmse"],
                "bias": metrics["bias"],
                "mape": metrics["mape"],
                "mean_forecast": metrics["mean_forecast"],
                "mean_actual": metrics["mean_actual"],
                "max_abs_error": metrics["max_abs_error"],
                "forecast_publish_times": sorted({ts.isoformat() for ts in publish_times}),
            }
        )
    return rows


def hour_of_day_profile(frame: pd.DataFrame) -> list[dict[str, Any]]:
    """MAE and bias by UK-local hour of the target interval."""
    matched = matched_rows(frame).copy()
    if matched.empty:
        return []
    matched["hour"] = matched["start_time"].dt.tz_convert(UK_TZ).dt.hour
    grouped = matched.groupby("hour")
    profile = pd.DataFrame(
        {
            "observations": grouped.size(),
            "mae": grouped["abs_error"].mean(),
            "bias": grouped["error"].mean(),
        }
    ).reset_index()
    return [
        {"hour": int(r.hour), "observations": int(r.observations), "mae": float(r.mae), "bias": float(r.bias)}
        for r in profile.itertuples()
    ]
