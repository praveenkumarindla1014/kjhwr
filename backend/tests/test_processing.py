from datetime import date, time

import pandas as pd
import pytest

from app.analytics import metrics
from app.analytics.processing import (
    STATUS_MATCHED,
    STATUS_MISSING_ACTUAL,
    STATUS_MISSING_FORECAST,
    STATUS_NOT_FORECAST_INTERVAL,
    CutoffPolicy,
    build_analysis_frame,
    decision_cutoffs,
    filter_by_delivery_date,
    normalise_actuals,
    normalise_forecasts,
    select_latest_forecasts,
    target_intervals,
)
from tests.fixtures.synthetic import actual, forecast, january_day_records

DAY = date(2026, 1, 10)


def ts(value: str) -> pd.Timestamp:
    return pd.Timestamp(value)


def test_normalise_actuals_filters_fuel_drops_invalid_and_dedupes_revisions():
    records = [
        actual("2026-01-10T00:00:00Z", 100, publish="2026-01-10T00:30:00Z"),
        actual("2026-01-10T00:00:00Z", 105, publish="2026-01-10T01:30:00Z"),  # later revision wins
        actual("2026-01-10T00:30:00Z", None),
        actual("2026-01-10T01:00:00Z", 50, fuel="CCGT"),
        {"startTime": "not-a-date", "generation": 1, "fuelType": "WIND"},
    ]
    frame, stats = normalise_actuals(records)
    assert list(frame["actual"]) == [105]
    assert stats.duplicate_records == 1
    assert stats.invalid_records == 2
    assert stats.other_fuel_records == 1
    assert str(frame["start_time"].dt.tz) == "UTC"


def test_normalise_forecasts_removes_exact_duplicates():
    records = [
        forecast("2026-01-10T00:00:00Z", "2026-01-09T09:30:00Z", 100),
        forecast("2026-01-10T00:00:00Z", "2026-01-09T09:30:00Z", 100),
        forecast("2026-01-10T00:00:00Z", "2026-01-09T04:30:00Z", 90),
    ]
    frame, stats = normalise_forecasts(records)
    assert len(frame) == 2
    assert stats.duplicate_records == 1


def test_day_ahead_cutoff_is_d_minus_1_uk_local():
    starts = pd.Series(pd.to_datetime(["2026-01-10T00:00:00Z", "2026-01-10T23:30:00Z"], utc=True))
    cutoffs = decision_cutoffs(starts, CutoffPolicy(cutoff_time=time(11, 0)))
    assert list(cutoffs) == [ts("2026-01-09T11:00:00Z"), ts("2026-01-09T11:00:00Z")]


def test_day_ahead_cutoff_during_british_summer_time():
    # 2026-06-15 00:00 BST = 2026-06-14T23:00Z; cutoff is 11:00 BST on 14 June = 10:00Z.
    starts = pd.Series(pd.to_datetime(["2026-06-14T23:00:00Z"], utc=True))
    cutoffs = decision_cutoffs(starts, CutoffPolicy(cutoff_time=time(11, 0)))
    assert cutoffs.iloc[0] == ts("2026-06-14T10:00:00Z")


def test_horizon_cutoff():
    starts = pd.Series(pd.to_datetime(["2026-01-10T12:00:00Z"], utc=True))
    cutoffs = decision_cutoffs(starts, CutoffPolicy(mode="horizon", horizon_hours=6))
    assert cutoffs.iloc[0] == ts("2026-01-10T06:00:00Z")


def test_selects_latest_eligible_and_excludes_after_cutoff():
    _, fc_records = january_day_records()
    forecasts, _ = normalise_forecasts(fc_records)
    selected = select_latest_forecasts(forecasts, target_intervals(DAY, DAY), CutoffPolicy())
    assert len(selected) == 24
    assert (selected["publish_time"] == ts("2026-01-09T09:30:00Z")).all()
    assert 9999.0 not in set(selected["forecast"])
    assert selected.iloc[0]["forecast"] == 1100.0


def test_later_cutoff_selects_later_run():
    _, fc_records = january_day_records()
    forecasts, _ = normalise_forecasts(fc_records)
    selected = select_latest_forecasts(forecasts, target_intervals(DAY, DAY), CutoffPolicy(cutoff_time=time(16, 0)))
    assert (selected["publish_time"] == ts("2026-01-09T15:30:00Z")).all()


def test_forecast_published_after_target_start_is_never_used():
    records = [forecast("2026-01-10T12:00:00Z", "2026-01-10T12:30:00Z", 100)]
    forecasts, _ = normalise_forecasts(records)
    policy = CutoffPolicy(mode="horizon", horizon_hours=0)
    assert select_latest_forecasts(forecasts, target_intervals(DAY, DAY), policy).empty


def test_target_intervals_handle_dst_days():
    assert len(target_intervals(DAY, DAY)) == 48
    assert len(target_intervals(date(2026, 3, 29), date(2026, 3, 29))) == 46  # clocks go forward
    assert len(target_intervals(date(2026, 10, 25), date(2026, 10, 25))) == 50  # clocks go back


def test_analysis_frame_matches_on_timestamp_and_labels_status():
    act_records, fc_records = january_day_records()
    # Remove the actual at 05:00 and the forecasts for 06:00.
    act_records = [r for r in act_records if r["startTime"] != "2026-01-10T05:00:00Z"]
    fc_records = [r for r in fc_records if r["startTime"] != "2026-01-10T06:00:00Z"]
    actuals, _ = normalise_actuals(act_records)
    forecasts, _ = normalise_forecasts(fc_records)

    frame = build_analysis_frame(actuals, forecasts, DAY, DAY, CutoffPolicy())
    assert len(frame) == 48
    by_time = frame.set_index("start_time")
    row = by_time.loc[ts("2026-01-10T03:00:00Z")]
    assert row["forecast"] == 1130.0 and row["actual"] == 1030.0 and row["error"] == 100.0
    assert by_time.loc[ts("2026-01-10T05:00:00Z"), "status"] == STATUS_MISSING_ACTUAL
    assert pd.isna(by_time.loc[ts("2026-01-10T05:00:00Z"), "actual"])  # never coerced to zero
    assert by_time.loc[ts("2026-01-10T06:00:00Z"), "status"] == STATUS_MISSING_FORECAST
    assert by_time.loc[ts("2026-01-10T03:30:00Z"), "status"] == STATUS_NOT_FORECAST_INTERVAL
    assert (frame["status"] == STATUS_MATCHED).sum() == 22
    assert str(frame["cutoff"].dt.tz) == "UTC"

    coverage = metrics.coverage_summary(frame)
    assert coverage["expected_evaluation_intervals"] == 24
    assert coverage["matched_intervals"] == 22
    assert coverage["missing_actual_intervals"] == 1
    assert coverage["missing_forecast_intervals"] == 1
    assert coverage["coverage_pct"] == pytest.approx(22 / 24 * 100)

    summary = metrics.frame_metrics(frame)
    assert summary["observations"] == 22
    assert summary["mae"] == pytest.approx(100.0)
    assert summary["bias"] == pytest.approx(100.0)


def test_date_filtering_by_uk_delivery_date():
    act_records, fc_records = january_day_records()
    actuals, _ = normalise_actuals(act_records)
    forecasts, _ = normalise_forecasts(fc_records)
    frame = build_analysis_frame(actuals, forecasts, date(2026, 1, 9), date(2026, 1, 11), CutoffPolicy())
    assert len(frame) == 48 * 3
    only_day = filter_by_delivery_date(frame, DAY, DAY)
    assert len(only_day) == 48
    assert set(only_day["delivery_date"]) == {DAY}
    daily = metrics.daily_summary(frame)
    assert [d["observations"] for d in daily] == [0, 24, 0]
