"""SYNTHETIC test fixtures. Hand-made records shaped like Elexon responses.

These values are NOT real Elexon data and are used only by the automated tests.
"""

from __future__ import annotations


def actual(start: str, generation: float | None, publish: str | None = None, fuel: str = "WIND") -> dict:
    return {
        "dataset": "FUELHH",
        "publishTime": publish or start,
        "startTime": start,
        "fuelType": fuel,
        "generation": generation,
    }


def forecast(start: str, publish: str, generation: float | None) -> dict:
    return {"dataset": "WINDFOR", "publishTime": publish, "startTime": start, "generation": generation}


def january_day_records() -> tuple[list[dict], list[dict]]:
    """Synthetic data for delivery date 2026-01-10 (UK local = UTC in January)."""
    actuals = []
    forecasts = []
    for hour in range(24):
        for minute in (0, 30):
            start = f"2026-01-10T{hour:02d}:{minute:02d}:00Z"
            actuals.append(actual(start, 1000.0 + hour * 10))
        start = f"2026-01-10T{hour:02d}:00:00Z"
        # Eligible run (D-1 09:30) and a later, ineligible run (D-1 15:30, after the 11:00 cutoff).
        forecasts.append(forecast(start, "2026-01-09T09:30:00Z", 1100.0 + hour * 10))
        forecasts.append(forecast(start, "2026-01-09T15:30:00Z", 9999.0))
        # Older eligible run that must lose to the 09:30 run.
        forecasts.append(forecast(start, "2026-01-09T04:30:00Z", 500.0))
    return actuals, forecasts
