import math

import numpy as np
import pytest

from app.analytics import metrics


def test_mae_rmse_bias_known_values():
    forecast = [110, 90, 100, 130]
    actual = [100, 100, 100, 100]
    # errors: +10, -10, 0, +30
    assert metrics.mean_absolute_error(forecast, actual) == pytest.approx(12.5)
    assert metrics.root_mean_squared_error(forecast, actual) == pytest.approx(math.sqrt((100 + 100 + 0 + 900) / 4))
    assert metrics.forecast_bias(forecast, actual) == pytest.approx(7.5)


def test_signed_error_direction():
    assert list(metrics.signed_errors([120, 80], [100, 100])) == [20, -20]


def test_mape_excludes_zero_actuals_and_reports_count():
    result = metrics.mean_absolute_percentage_error([110, 50, 90], [100, 0, 100])
    assert result["value"] == pytest.approx(10.0)
    assert result["observations"] == 2
    assert result["excluded_zero_actual"] == 1


def test_mape_all_zero_actuals_returns_none():
    result = metrics.mean_absolute_percentage_error([10, 20], [0, 0])
    assert result["value"] is None
    assert result["excluded_zero_actual"] == 2


def test_missing_values_are_ignored_not_treated_as_zero():
    forecast = [110, np.nan, 100]
    actual = [100, 100, None]
    assert metrics.mean_absolute_error(forecast, actual) == pytest.approx(10.0)
    summary = metrics.accuracy_metrics(forecast, actual)
    assert summary["observations"] == 1


def test_empty_inputs_return_none():
    summary = metrics.accuracy_metrics([], [])
    assert summary["observations"] == 0
    assert summary["mae"] is None and summary["rmse"] is None and summary["bias"] is None


def test_length_mismatch_raises():
    with pytest.raises(ValueError):
        metrics.mean_absolute_error([1, 2], [1])
