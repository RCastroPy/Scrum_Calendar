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


def test_tasks_doing_sets_start_date_and_cascades_to_parents(client: TestClient):
    bootstrap_admin(client)

    resp = client.post("/celulas", json={"nombre": "Celula Tasks", "jira_codigo": "TSK", "activa": True})
    assert resp.status_code == 201
    celula_id = resp.json()["id"]

    resp = client.post("/tasks", json={"titulo": "Padre", "celula_id": celula_id})
    assert resp.status_code == 201
    parent_id = resp.json()["id"]

    resp = client.post("/tasks", json={"titulo": "Hija", "celula_id": celula_id, "parent_id": parent_id})
    assert resp.status_code == 201
    child_id = resp.json()["id"]

    resp = client.put(f"/tasks/{child_id}", json={"estado": "doing"})
    assert resp.status_code == 200
    child = resp.json()
    assert child["estado"] == "doing"
    assert child["start_date"] == date.today().isoformat()

    resp = client.get(f"/tasks?celula_id={celula_id}")
    assert resp.status_code == 200
    items = resp.json()
    parent = next(t for t in items if t["id"] == parent_id)
    assert parent["estado"] == "doing"
    assert parent["start_date"] == date.today().isoformat()


def test_tasks_start_date_is_min_of_descendants_and_recursive(client: TestClient):
    bootstrap_admin(client)

    resp = client.post("/celulas", json={"nombre": "Celula Dates", "jira_codigo": "DAT", "activa": True})
    assert resp.status_code == 201
    celula_id = resp.json()["id"]

    resp = client.post("/tasks", json={"titulo": "Padre", "celula_id": celula_id})
    assert resp.status_code == 201
    parent_id = resp.json()["id"]

    resp = client.post("/tasks", json={"titulo": "C1", "celula_id": celula_id, "parent_id": parent_id})
    assert resp.status_code == 201
    c1_id = resp.json()["id"]

    resp = client.post("/tasks", json={"titulo": "C2", "celula_id": celula_id, "parent_id": parent_id})
    assert resp.status_code == 201
    c2_id = resp.json()["id"]

    resp = client.put(f"/tasks/{c1_id}", json={"start_date": "2025-01-01"})
    assert resp.status_code == 200
    resp = client.put(f"/tasks/{c2_id}", json={"start_date": "2025-01-05"})
    assert resp.status_code == 200

    resp = client.get(f"/tasks?celula_id={celula_id}")
    assert resp.status_code == 200
    items = resp.json()
    parent = next(t for t in items if t["id"] == parent_id)
    assert parent["start_date"] == "2025-01-01"

    # Deep nesting: grandchild earlier should roll up to C2 then to parent
    resp = client.post("/tasks", json={"titulo": "G", "celula_id": celula_id, "parent_id": c2_id})
    assert resp.status_code == 201
    g_id = resp.json()["id"]

    resp = client.put(f"/tasks/{g_id}", json={"start_date": "2024-12-31", "estado": "doing"})
    assert resp.status_code == 200

    resp = client.get(f"/tasks?celula_id={celula_id}")
    assert resp.status_code == 200
    items = resp.json()
    c2 = next(t for t in items if t["id"] == c2_id)
    parent = next(t for t in items if t["id"] == parent_id)
    assert c2["estado"] == "doing"
    assert c2["start_date"] == "2024-12-31"
    assert parent["estado"] == "doing"
    assert parent["start_date"] == "2024-12-31"


def test_tasks_done_sets_end_date_automatically(client: TestClient):
    bootstrap_admin(client)

    resp = client.post("/celulas", json={"nombre": "Celula Done", "jira_codigo": "DON", "activa": True})
    assert resp.status_code == 201
    celula_id = resp.json()["id"]

    resp = client.post("/tasks", json={"titulo": "Task Done", "celula_id": celula_id})
    assert resp.status_code == 201
    task_id = resp.json()["id"]

    resp = client.put(f"/tasks/{task_id}", json={"estado": "done"})
    assert resp.status_code == 200
    task = resp.json()
    assert task["estado"] == "done"
    assert task["end_date"] == date.today().isoformat()
