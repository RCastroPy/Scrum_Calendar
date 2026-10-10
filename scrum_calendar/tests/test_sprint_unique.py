from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

import data.db as db
import main as main_mod
from data.models import Base, Sprint


@pytest.fixture()
def client(tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'sprints.db'}",
        connect_args={"check_same_thread": False},
    )
    testing_session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db.engine = engine
    db.SessionLocal = testing_session_local
    main_mod.engine = engine
    main_mod.SessionLocal = testing_session_local
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        session = testing_session_local()
        try:
            yield session
        finally:
            session.close()

    main_mod.app.dependency_overrides[db.get_db] = override_get_db
    with TestClient(main_mod.app) as test_client:
        yield test_client, testing_session_local
    main_mod.app.dependency_overrides.clear()
    engine.dispose()


def create_cell(client, name):
    response = client.post(
        "/celulas",
        json={"nombre": name, "jira_codigo": name[-1].upper(), "activa": True},
    )
    assert response.status_code == 201
    return response.json()["id"]


def create_sprint(client, cell_id, name):
    return client.post(
        "/sprints",
        json={
            "nombre": name,
            "celula_id": cell_id,
            "fecha_inicio": "2026-10-12",
            "fecha_fin": "2026-10-25",
        },
    )


def test_sprint_name_unique_within_cell_but_allowed_in_another(client):
    http, sessions = client
    assert http.post("/auth/bootstrap", json={"username": "admin", "password": "secret"}).status_code == 200
    first_cell = create_cell(http, "Celula A")
    second_cell = create_cell(http, "Celula B")

    first = create_sprint(http, first_cell, "Sprint 202613-SM")
    assert first.status_code == 201
    assert create_sprint(http, first_cell, " sprint 202613-sm ").status_code == 409
    assert create_sprint(http, second_cell, "Sprint 202613-SM").status_code == 201

    with sessions() as session:
        assert session.query(Sprint).count() == 2
        session.add(Sprint(
            nombre="SPRINT 202613-SM", celula_id=first_cell,
            fecha_inicio=date(2026, 10, 12), fecha_fin=date(2026, 10, 25),
        ))
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()


def test_sprint_update_rejects_duplicate_name_or_cell_change(client):
    http, _ = client
    assert http.post("/auth/bootstrap", json={"username": "admin", "password": "secret"}).status_code == 200
    first_cell = create_cell(http, "Celula A")
    second_cell = create_cell(http, "Celula B")
    first = create_sprint(http, first_cell, "Sprint A").json()
    second = create_sprint(http, first_cell, "Sprint B").json()
    other = create_sprint(http, second_cell, "Sprint A").json()

    duplicate_name = http.put(f"/sprints/{second['id']}", json={"nombre": " sprint a "})
    assert duplicate_name.status_code == 409
    duplicate_cell = http.put(f"/sprints/{other['id']}", json={"celula_id": first_cell})
    assert duplicate_cell.status_code == 409
    assert http.put(f"/sprints/{first['id']}", json={"nombre": "SPRINT A"}).status_code == 200
    rows = {row["id"]: row for row in http.get("/sprints").json()}
    assert rows[first["id"]]["nombre"] == "SPRINT A"
    assert rows[second["id"]]["nombre"] == "Sprint B"
    assert rows[other["id"]]["celula_id"] == second_cell
