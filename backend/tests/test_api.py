from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import create_app
from app.services.elexon_client import ElexonAPIError
from app.services.forecast_service import DataRepository
from tests.fixtures.synthetic import january_day_records


class FakeClient:
    """Stands in for ElexonClient; serves SYNTHETIC records."""

    def __init__(self, fail: bool = False):
        self.fail = fail

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return None

    def fetch_wind_actuals(self, *_):
        if self.fail:
            raise ElexonAPIError("Elexon unavailable (simulated)")
        return january_day_records()[0]

    def fetch_wind_forecasts(self, *_):
        return january_day_records()[1]


@pytest.fixture
def settings(tmp_path):
    return replace(get_settings(), data_dir=tmp_path)


def make_client(settings, fail=False) -> TestClient:
    repo = DataRepository(settings, client_factory=lambda: FakeClient(fail=fail))
    return TestClient(create_app(settings, repo))


def test_health_and_lazy_fetch(settings):
    client = make_client(settings)
    assert client.get("/api/health").json()["data_loaded"] is False
    response = client.get("/api/analysis", params={"start_date": "2026-01-10", "end_date": "2026-01-10"})
    assert response.status_code == 200
    body = response.json()
    assert body["coverage"]["matched_intervals"] == 24
    assert body["metrics"]["mae"] == pytest.approx(100.0)
    assert len(body["rows"]) == 48
    assert body["cutoff"]["mode"] == "day_ahead"
    assert client.get("/api/health").json()["status"] == "ok"


def test_snapshot_is_persisted_and_reloaded(settings):
    make_client(settings).post("/api/refresh").raise_for_status()
    reloaded = make_client(settings, fail=True)
    assert reloaded.get("/api/health").json()["data_loaded"] is True
    assert reloaded.get("/api/meta").json()["loaded_from"] == "local_snapshot"


def test_refresh_failure_returns_502_and_keeps_data(settings):
    make_client(settings).post("/api/refresh").raise_for_status()
    client = make_client(settings, fail=True)
    response = client.post("/api/refresh")
    assert response.status_code == 502
    assert "previous data retained" in response.json()["detail"]
    assert client.get("/api/accuracy").status_code == 200


def test_no_data_and_api_failure_returns_503(settings):
    response = make_client(settings, fail=True).get("/api/accuracy")
    assert response.status_code == 503


@pytest.mark.parametrize(
    "params",
    [
        {"start_date": "2025-12-31"},
        {"end_date": "2026-02-01"},
        {"start_date": "2026-01-10", "end_date": "2026-01-05"},
        {"start_date": "not-a-date"},
        {"cutoff_time": "25:00"},
        {"horizon_hours": "-1"},
        {"cutoff_mode": "whenever"},
    ],
)
def test_parameter_validation(settings, params):
    assert make_client(settings).get("/api/analysis", params=params).status_code == 422


def test_forecasts_endpoint_respects_cutoff(settings):
    client = make_client(settings)
    day = {"start_date": "2026-01-10", "end_date": "2026-01-10"}
    early = client.get("/api/forecasts", params=day).json()
    assert early["count"] == 24
    assert {r["publish_time"] for r in early["records"]} == {"2026-01-09T09:30:00Z"}
    late = client.get("/api/forecasts", params={**day, "cutoff_time": "16:00"}).json()
    assert {r["publish_time"] for r in late["records"]} == {"2026-01-09T15:30:00Z"}


def test_read_only_data_dir_falls_back_to_writable_dir(tmp_path):
    # A *file* where the data dir should be makes it unwritable, like a read-only serverless filesystem.
    blocked = tmp_path / "readonly"
    blocked.write_text("not a directory")
    fallback = tmp_path / "fallback"
    settings = replace(get_settings(), data_dir=blocked)
    repo = DataRepository(settings, client_factory=lambda: FakeClient(), fallback_dir=fallback)
    client = TestClient(create_app(settings, repo))
    assert client.post("/api/refresh").status_code == 200
    assert (fallback / "windfor.json").exists()
    # A fresh process picks the refreshed snapshot up from the fallback dir.
    reloaded = DataRepository(settings, client_factory=lambda: FakeClient(fail=True), fallback_dir=fallback)
    assert reloaded.load_from_cache() is True


def test_serves_built_frontend_when_static_dir_exists(tmp_path):
    static = tmp_path / "static"
    static.mkdir()
    (static / "index.html").write_text("<html>spa</html>")
    settings = replace(get_settings(), data_dir=tmp_path / "data", static_dir=static)
    client = TestClient(create_app(settings, DataRepository(settings, client_factory=lambda: FakeClient())))
    assert "spa" in client.get("/").text
    assert client.get("/api/health").status_code == 200


def test_actuals_endpoint(settings):
    body = make_client(settings).get("/api/actuals", params={"start_date": "2026-01-10", "end_date": "2026-01-10"}).json()
    assert body["count"] == 48
