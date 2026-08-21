from fastapi.testclient import TestClient

from tests.test_daily_manual_upsert import bootstrap_admin, client
import main as main_mod


def test_csrf_blocks_mutation_without_token_and_allows_valid_token(
    client: TestClient,
    monkeypatch,
):
    monkeypatch.setattr(main_mod.settings, "csrf_protection_enabled", True)
    bootstrap_admin(client)

    payload = {"nombre": "Celula CSRF", "jira_codigo": "CSF", "activa": True}
    response = client.post("/celulas", json=payload)
    assert response.status_code == 403

    token_response = client.get("/auth/csrf")
    assert token_response.status_code == 200
    token = token_response.json()["csrf_token"]

    response = client.post("/celulas", json=payload, headers={"X-CSRF-Token": token})
    assert response.status_code == 201
