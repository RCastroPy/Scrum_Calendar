from fastapi.testclient import TestClient

from tests.test_daily_manual_upsert import bootstrap_admin, client


def test_daily_bulk_csv_import_is_idempotent(client: TestClient):
    bootstrap_admin(client)
    response = client.post(
        "/celulas",
        json={"nombre": "Celula Import", "jira_codigo": "SMP", "activa": True},
    )
    assert response.status_code == 201
    celula_id = response.json()["id"]

    csv_content = (
        "Issue Key,Issue Type,Summary,Status,Story Points,Assignee,Start Date,End Date,Due Date,Sprint\n"
        "SMP-900,Story,Importada,To Do,5,Ana Lopez,2026-08-17,2026-08-21,2026-08-21,Sprint 202634-SMP\n"
    )
    response = client.post(
        "/imports/sprint-items",
        data={"celula_id": str(celula_id)},
        files={"file": ("daily.csv", csv_content.encode("utf-8"), "text/csv")},
    )
    assert response.status_code == 200
    assert response.json()["created"] == 1
    assert response.json()["updated"] == 0

    response = client.get(f"/sprint-items?celula_id={celula_id}")
    assert response.status_code == 200
    rows = [row for row in response.json() if row["issue_key"] == "SMP-900"]
    assert len(rows) == 1
    assert rows[0]["start_date"] == "2026-08-17"

    response = client.post(
        "/imports/sprint-items",
        data={"celula_id": str(celula_id)},
        files={"file": ("daily.csv", csv_content.encode("utf-8"), "text/csv")},
    )
    assert response.status_code == 200
    assert response.json()["created"] == 0
    assert response.json()["updated"] == 0
