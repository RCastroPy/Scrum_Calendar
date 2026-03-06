import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import main as main_mod
import data.db as db
from data.models import Base


@pytest.fixture()
def client(tmp_path):
    db_path = tmp_path / "test.db"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    testing_session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    db.engine = engine
    db.SessionLocal = testing_session_local
    main_mod.engine = engine
    main_mod.SessionLocal = testing_session_local
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        session = testing_session_local()
        try:
            yield session
        finally:
            session.close()

    main_mod.app.dependency_overrides[db.get_db] = override_get_db
    with TestClient(main_mod.app) as test_client:
        yield test_client
    main_mod.app.dependency_overrides.clear()


def bootstrap_admin(client: TestClient):
    resp = client.post("/auth/bootstrap", json={"username": "admin", "password": "secret"})
    assert resp.status_code == 200


def test_daily_manual_create_upserts_existing_issue_key(client: TestClient):
    bootstrap_admin(client)

    resp = client.post("/celulas", json={"nombre": "Celula Daily", "jira_codigo": "SMP", "activa": True})
    assert resp.status_code == 201
    celula_id = resp.json()["id"]

    resp = client.post(
        "/personas",
        json={
            "nombre": "Ana",
            "apellido": "Lopez",
            "rol": "DEV",
            "capacidad_diaria_horas": 7,
            "celulas_ids": [celula_id],
            "fecha_cumple": None,
            "activo": True,
        },
    )
    assert resp.status_code == 201
    persona_1 = resp.json()["id"]

    resp = client.post(
        "/personas",
        json={
            "nombre": "Luis",
            "apellido": "Gomez",
            "rol": "DEV",
            "capacidad_diaria_horas": 7,
            "celulas_ids": [celula_id],
            "fecha_cumple": None,
            "activo": True,
        },
    )
    assert resp.status_code == 201
    persona_2 = resp.json()["id"]

    resp = client.post(
        "/sprints",
        json={
            "nombre": "Sprint 202610-SMP",
            "celula_id": celula_id,
            "fecha_inicio": "2026-03-02",
            "fecha_fin": "2026-03-15",
        },
    )
    assert resp.status_code == 201
    sprint_1 = resp.json()["id"]

    resp = client.post(
        "/sprints",
        json={
            "nombre": "Sprint 202611-SMP",
            "celula_id": celula_id,
            "fecha_inicio": "2026-03-16",
            "fecha_fin": "2026-03-29",
        },
    )
    assert resp.status_code == 201
    sprint_2 = resp.json()["id"]

    payload_1 = {
        "celula_id": celula_id,
        "sprint_id": sprint_1,
        "persona_id": persona_1,
        "assignee_nombre": "Ana Lopez",
        "issue_key": "SMP-1234",
        "issue_type": "Story",
        "summary": "Primer registro",
        "status": "To Do",
        "story_points": 3,
    }
    resp = client.post("/sprint-items", json=payload_1)
    assert resp.status_code == 201
    first_id = resp.json()["id"]

    payload_2 = {
        "celula_id": celula_id,
        "sprint_id": sprint_2,
        "persona_id": persona_2,
        "assignee_nombre": "Luis Gomez",
        "issue_key": "SMP-1234",
        "issue_type": "Story",
        "summary": "Registro actualizado",
        "status": "In Progress",
        "story_points": 8,
    }
    resp = client.post("/sprint-items", json=payload_2)
    assert resp.status_code == 201
    assert resp.json()["id"] == first_id
    assert resp.json()["sprint_id"] == sprint_2
    assert resp.json()["persona_id"] == persona_2
    assert resp.json()["story_points"] == 8

    resp = client.get(f"/sprint-items?celula_id={celula_id}")
    assert resp.status_code == 200
    rows = [row for row in resp.json() if row["issue_key"] == "SMP-1234"]
    assert len(rows) == 1
    assert rows[0]["id"] == first_id
    assert rows[0]["sprint_id"] == sprint_2
    assert rows[0]["persona_id"] == persona_2
    assert rows[0]["story_points"] == 8

    resp = client.get(f"/import-sprint-items?celula_id={celula_id}")
    assert resp.status_code == 200
    import_rows = [row for row in resp.json() if row["issue_key"] == "SMP-1234"]
    assert len(import_rows) == 1
    assert import_rows[0]["sprint_id"] == sprint_2
    assert import_rows[0]["persona_id"] == persona_2
    assert import_rows[0]["story_points"] == 8
