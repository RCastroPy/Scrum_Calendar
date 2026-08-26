from fastapi.testclient import TestClient

import main as main_mod
from tests.test_daily_manual_upsert import client


def test_session_cookie_is_not_secure_when_production_is_served_over_http(
    client: TestClient,
    monkeypatch,
):
    monkeypatch.setattr(main_mod.settings, "app_env", "production")

    response = client.post("/auth/bootstrap", json={"username": "admin", "password": "secret"})

    assert response.status_code == 200
    set_cookie = response.headers["set-cookie"]
    assert "scrum_session=" in set_cookie
    assert "Secure" not in set_cookie


def test_session_cookie_is_secure_when_forwarded_request_is_https(
    client: TestClient,
    monkeypatch,
):
    monkeypatch.setattr(main_mod.settings, "app_env", "production")

    response = client.post(
        "/auth/bootstrap",
        json={"username": "admin", "password": "secret"},
        headers={"X-Forwarded-Proto": "https"},
    )

    assert response.status_code == 200
    assert "Secure" in response.headers["set-cookie"]
