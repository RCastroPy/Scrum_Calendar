from datetime import date

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
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    db.engine = engine
    db.SessionLocal = TestingSessionLocal
    main_mod.engine = engine
    main_mod.SessionLocal = TestingSessionLocal
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    main_mod.app.dependency_overrides[db.get_db] = override_get_db
    with TestClient(main_mod.app) as client:
        yield client
    main_mod.app.dependency_overrides.clear()


def bootstrap_admin(client: TestClient):
    resp = client.post("/auth/bootstrap", json={"username": "admin", "password": "secret"})
    assert resp.status_code == 200
    return resp.json()


def test_auth_login_logout_flow(client):
    bootstrap_admin(client)
    resp = client.get("/auth/me")
    assert resp.status_code == 200

    resp = client.post("/auth/logout")
    assert resp.status_code == 200

    resp = client.get("/auth/me")
    assert resp.status_code == 401


def test_oneonone_sessions_crud(client):
    bootstrap_admin(client)

    resp = client.post(
        "/celulas", json={"nombre": "Celula QA", "jira_codigo": "QA", "activa": True}
    )
    assert resp.status_code == 201
    celula_id = resp.json()["id"]

    resp = client.post(
        "/personas",
        json={
            "nombre": "Ana",
            "apellido": "Perez",
            "rol": "DEV",
            "capacidad_diaria_horas": 7,
            "celulas_ids": [celula_id],
            "fecha_cumple": None,
            "activo": True,
        },
    )
    assert resp.status_code == 201
    persona_id = resp.json()["id"]

    payload = {
        "celula_id": celula_id,
        "persona_id": persona_id,
        "fecha": date(2025, 1, 10).isoformat(),
        "checklist": [{"text": "Estado personal", "done": True}],
        "agreements": [{"text": "Acuerdo 1", "due": "2025-01-15", "done": False}],
        "mood": "3",
        "feedback_pos": "Buen foco",
        "feedback_neg": "Pendiente de ajuste",
        "growth": "Mejorar pruebas",
    }
    resp = client.post("/oneonone-sessions", json=payload)
    assert resp.status_code == 201
    session_id = resp.json()["id"]

    resp = client.get(f"/oneonone-sessions?celula_id={celula_id}&persona_id={persona_id}")
    assert resp.status_code == 200
    sessions = resp.json()
    assert len(sessions) == 1
    assert sessions[0]["id"] == session_id

    resp = client.put(f"/oneonone-sessions/{session_id}", json={"mood": "4"})
    assert resp.status_code == 200
    assert resp.json()["mood"] == "4"

    resp = client.delete(f"/oneonone-sessions/{session_id}")
    assert resp.status_code == 200

    resp = client.get(f"/oneonone-sessions?celula_id={celula_id}&persona_id={persona_id}")
    assert resp.status_code == 200
    assert resp.json() == []


def test_oneonone_sessions_requires_admin(client):
    bootstrap_admin(client)

    resp = client.post("/usuarios", json={"username": "member", "password": "pass", "rol": "member"})
    assert resp.status_code == 201

    resp = client.post(
        "/celulas", json={"nombre": "Celula Auth", "jira_codigo": "AUTH", "activa": True}
    )
    assert resp.status_code == 201
    celula_id = resp.json()["id"]

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
    persona_id = resp.json()["id"]

    resp = client.post("/auth/logout")
    assert resp.status_code == 200

    resp = client.post("/auth/login", json={"username": "member", "password": "pass"})
    assert resp.status_code == 200

    resp = client.get(f"/oneonone-sessions?celula_id={celula_id}&persona_id={persona_id}")
    assert resp.status_code == 403

    resp = client.post(
        "/oneonone-sessions",
        json={
            "celula_id": celula_id,
            "persona_id": persona_id,
            "fecha": date(2025, 1, 20).isoformat(),
            "checklist": [],
            "agreements": [],
            "mood": "3",
            "feedback_pos": "ok",
            "feedback_neg": "ok",
            "growth": "ok",
        },
    )
    assert resp.status_code == 403
