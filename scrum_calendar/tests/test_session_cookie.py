from fastapi.testclient import TestClient

import main as main_mod
from tests.test_daily_manual_upsert import client


def test_opening_login_form_url_returns_the_login_page(client: TestClient):
    response = client.get("/auth/login-form", follow_redirects=False)
    assert response.status_code == 303
    assert response.headers["location"] == "/ui/login.html"
    assert response.headers["cache-control"] == "no-store"
    assert "scrum_session=" not in response.headers.get("set-cookie", "")
    page = client.get("/auth/login-form")
    assert page.status_code == 200
    assert 'id="login-form"' in page.text
    assert client.get("/auth/me").status_code == 401


def test_html_login_submission_still_authenticates_and_sets_session_cookie(client: TestClient):
    assert client.post("/auth/bootstrap", json={"username": "admin", "password": "secret"}).status_code == 200
    client.post("/auth/logout")
    invalid = client.post("/auth/login-form", data={"username": "admin", "password": "invalid"}, follow_redirects=False)
    assert invalid.status_code == 401
    assert client.get("/auth/me").status_code == 401
    response = client.post("/auth/login-form", data={"username": "admin", "password": "secret"}, follow_redirects=False)
    assert response.status_code == 303
    assert response.headers["location"] == "/ui/index.html"
    assert "scrum_session=" in response.headers["set-cookie"]
    assert client.get("/auth/me").status_code == 200


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
