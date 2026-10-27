from datetime import date, datetime, timezone

import httpx
import pytest

from app.services.elexon_client import ElexonAPIError, ElexonClient


def make_client(handler, **kwargs) -> ElexonClient:
    return ElexonClient(
        "https://example.test/api/v1", transport=httpx.MockTransport(handler), sleep=lambda _: None, **kwargs
    )


def test_actuals_are_chunked_and_concatenated():
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(dict(request.url.params))
        return httpx.Response(200, json=[{"startTime": request.url.params["settlementDateFrom"]}])

    with make_client(handler, chunk_days=7) as client:
        records = client.fetch_wind_actuals(date(2026, 1, 1), date(2026, 1, 15))
    assert len(records) == 3
    assert seen[0] == {"settlementDateFrom": "2026-01-01", "settlementDateTo": "2026-01-07", "fuelType": "WIND"}
    assert seen[-1]["settlementDateTo"] == "2026-01-15"


def test_forecast_windows_use_iso_utc():
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(dict(request.url.params))
        return httpx.Response(200, json={"data": []})

    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    end = datetime(2026, 1, 3, tzinfo=timezone.utc)
    with make_client(handler, chunk_days=7) as client:
        assert client.fetch_wind_forecasts(start, end) == []
    assert seen == [{"publishDateTimeFrom": "2026-01-01T00:00:00Z", "publishDateTimeTo": "2026-01-03T00:00:00Z"}]


def test_retries_transient_errors_then_succeeds():
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            raise httpx.ConnectTimeout("timeout")
        if calls["n"] == 2:
            return httpx.Response(503, text="busy")
        return httpx.Response(200, json=[{"startTime": "x"}])

    with make_client(handler, max_retries=3) as client:
        assert len(client.fetch_wind_actuals(date(2026, 1, 1), date(2026, 1, 1))) == 1
    assert calls["n"] == 3


def test_gives_up_after_max_retries():
    with make_client(lambda r: httpx.Response(500, text="err"), max_retries=2) as client:
        with pytest.raises(ElexonAPIError, match="after 3 attempts"):
            client.fetch_wind_actuals(date(2026, 1, 1), date(2026, 1, 1))


def test_client_error_is_not_retried():
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        return httpx.Response(400, json={"title": "bad"})

    with make_client(handler, max_retries=3) as client:
        with pytest.raises(ElexonAPIError, match="HTTP 400"):
            client.fetch_wind_actuals(date(2026, 1, 1), date(2026, 1, 1))
    assert calls["n"] == 1


def test_invalid_payload_raises():
    with make_client(lambda r: httpx.Response(200, json={"unexpected": True})) as client:
        with pytest.raises(ElexonAPIError, match="unexpected payload"):
            client.fetch_wind_actuals(date(2026, 1, 1), date(2026, 1, 1))
    with make_client(lambda r: httpx.Response(200, text="<html>")) as client:
        with pytest.raises(ElexonAPIError, match="invalid JSON"):
            client.fetch_wind_actuals(date(2026, 1, 1), date(2026, 1, 1))
