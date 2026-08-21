from fastapi.testclient import TestClient

from tests.test_daily_manual_upsert import bootstrap_admin, client


def test_release_bulk_csv_import_is_idempotent(client: TestClient):
    bootstrap_admin(client)
    response = client.post(
        "/celulas",
        json={"nombre": "Celula Release Import", "jira_codigo": "REL", "activa": True},
    )
    assert response.status_code == 201
    celula_id = response.json()["id"]

    csv_content = (
        "Issue Type,Issue Key,Issue ID,Summary,Reporter,Reporter ID,Status,Story Points,"
        "Assignee,Assignee ID,Start Date,End Date,Due Date,Sprint\n"
        "Release,REL-900,900,Release importado,PO,po-1,Backlog,8,Ana Lopez,ana-1,"
        "2026-08-17,2026-08-21,2026-08-21,Sprint 202634-REL\n"
    )
    response = client.post(
        "/imports/release-items",
        data={"celula_id": str(celula_id), "tipo_release": "nuevo"},
        files={"file": ("releases.csv", csv_content.encode("utf-8"), "text/csv")},
    )
    assert response.status_code == 200
    assert response.json()["created"] == 1
    assert response.json()["updated"] == 0

    response = client.get(f"/release-items?celula_id={celula_id}")
    assert response.status_code == 200
    rows = [row for row in response.json() if row["issue_key"] == "REL-900"]
    assert len(rows) == 1
    assert rows[0]["release_tipo"] == "nuevo"
    assert rows[0]["start_date"] == "2026-08-17"

    response = client.post(
        "/imports/release-items",
        data={"celula_id": str(celula_id), "tipo_release": "nuevo"},
        files={"file": ("releases.csv", csv_content.encode("utf-8"), "text/csv")},
    )
    assert response.status_code == 200
    assert response.json()["created"] == 0
    assert response.json()["updated"] == 0


def test_release_listing_supports_filters_and_pagination(client: TestClient):
    bootstrap_admin(client)
    response = client.post(
        "/celulas",
        json={"nombre": "Celula Release Filtros", "jira_codigo": "RLF"},
    )
    assert response.status_code == 201
    celula_id = response.json()["id"]

    for issue_key, quarter, release_status in (
        ("RLF-1", "Q3-2026", "Backlog"),
        ("RLF-2", "Q3-2026", "Done"),
        ("RLF-3", "Q4-2026", "Backlog"),
    ):
        response = client.post(
            "/release-items",
            json={
                "celula_id": celula_id,
                "issue_key": issue_key,
                "issue_type": "Release",
                "summary": issue_key,
                "status": release_status,
                "release_tipo": "nuevo",
                "quarter": quarter,
            },
        )
        assert response.status_code == 201

    response = client.get(
        f"/release-items?celula_id={celula_id}&quarter=Q3-2026&status=Backlog&limit=1"
    )

    assert response.status_code == 200
    assert [row["issue_key"] for row in response.json()] == ["RLF-1"]
