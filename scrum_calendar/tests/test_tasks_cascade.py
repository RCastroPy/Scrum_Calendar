import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import main as main_mod
import data.db as db
from data.models import Base, now_py


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
    assert child["start_date"] == now_py().date().isoformat()

    resp = client.get(f"/tasks?celula_id={celula_id}")
    assert resp.status_code == 200
    items = resp.json()
    parent = next(t for t in items if t["id"] == parent_id)
    assert parent["estado"] == "doing"
    assert parent["start_date"] == now_py().date().isoformat()

    ancestors = client.get(f"/tasks/{child_id}/ancestors")
    assert ancestors.status_code == 200
    assert [task["id"] for task in ancestors.json()] == [parent_id]
    assert ancestors.json()[0]["estado"] == "doing"

    counts = client.get(f"/tasks/comments/counts?task_ids={parent_id},{child_id},999999")
    assert counts.status_code == 200
    assert counts.json() == {str(parent_id): 0, str(child_id): 0, "999999": 0}


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
    assert c2["start_date"] == now_py().date().isoformat()
    assert parent["estado"] == "doing"
    # Parent keeps the earliest descendant start_date across all children (C1 still has 2025-01-01).
    assert parent["start_date"] == "2025-01-01"


def test_tasks_listing_supports_optional_pagination_without_changing_default(client: TestClient):
    bootstrap_admin(client)

    response = client.post("/celulas", json={"nombre": "Celula Paginacion", "jira_codigo": "PAG", "activa": True})
    assert response.status_code == 201
    celula_id = response.json()["id"]
    for title in ("Primera", "Segunda", "Tercera"):
        response = client.post("/tasks", json={"titulo": title, "celula_id": celula_id})
        assert response.status_code == 201

    all_tasks = client.get(f"/tasks?celula_id={celula_id}")
    first_page = client.get(f"/tasks?celula_id={celula_id}&limit=2&offset=0")
    second_page = client.get(f"/tasks?celula_id={celula_id}&limit=2&offset=2")

    assert all_tasks.status_code == 200
    assert first_page.status_code == 200
    assert second_page.status_code == 200
    assert len(all_tasks.json()) == 3
    assert len(first_page.json()) == 2
    assert len(second_page.json()) == 1
    assert {task["id"] for task in first_page.json()}.isdisjoint(
        {task["id"] for task in second_page.json()}
    )


def test_tasks_listing_supports_backend_filters(client: TestClient):
    bootstrap_admin(client)

    response = client.post("/celulas", json={"nombre": "Celula Filtros", "jira_codigo": "FLT", "activa": True})
    assert response.status_code == 201
    celula_id = response.json()["id"]
    tasks = (
        {"titulo": "Pago urgente", "release_issue_key": "FLT-1", "prioridad": "urgente", "fecha_vencimiento": "2026-05-08"},
        {"titulo": "Documentacion", "release_issue_key": "FLT-2", "prioridad": "baja", "fecha_vencimiento": "2026-05-20"},
    )
    for payload in tasks:
        response = client.post("/tasks", json={**payload, "celula_id": celula_id})
        assert response.status_code == 201

    response = client.get(
        f"/tasks?celula_id={celula_id}&texto=FLT-1&prioridad=URGENTE&"
        "fecha_vencimiento_desde=2026-05-01&fecha_vencimiento_hasta=2026-05-10"
    )

    assert response.status_code == 200
    assert [task["release_issue_key"] for task in response.json()] == ["FLT-1"]


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
    assert task["start_date"] == now_py().date().isoformat()
    assert task["end_date"] == now_py().date().isoformat()


def test_task_status_transitions_manage_start_and_end_dates(client: TestClient):
    bootstrap_admin(client)

    resp = client.post("/celulas", json={"nombre": "Celula Reglas Estado", "jira_codigo": "EST", "activa": True})
    assert resp.status_code == 201
    celula_id = resp.json()["id"]

    resp = client.post("/tasks", json={"titulo": "Task estados", "celula_id": celula_id})
    assert resp.status_code == 201
    task_id = resp.json()["id"]

    # Backlog -> ToDo: inicia la gestion de la tarea y completa start_date.
    resp = client.put(f"/tasks/{task_id}", json={"estado": "todo"})
    assert resp.status_code == 200
    task = resp.json()
    assert task["estado"] == "todo"
    assert task["start_date"] == now_py().date().isoformat()
    assert task["end_date"] is None

    # ToDo -> Done: setea start_date y end_date.
    resp = client.put(f"/tasks/{task_id}", json={"estado": "done"})
    assert resp.status_code == 200
    task = resp.json()
    assert task["estado"] == "done"
    assert task["start_date"] == now_py().date().isoformat()
    assert task["end_date"] == now_py().date().isoformat()

    # Done -> In Progress: limpia end_date y mantiene/reasigna start_date.
    resp = client.put(f"/tasks/{task_id}", json={"estado": "doing"})
    assert resp.status_code == 200
    task = resp.json()
    assert task["estado"] == "doing"
    assert task["start_date"] == now_py().date().isoformat()
    assert task["end_date"] is None

    # In Progress -> Done: setea end_date.
    resp = client.put(f"/tasks/{task_id}", json={"estado": "done"})
    assert resp.status_code == 200
    task = resp.json()
    assert task["estado"] == "done"
    assert task["start_date"] == now_py().date().isoformat()
    assert task["end_date"] == now_py().date().isoformat()

    # In Progress -> Backlog: limpia start_date y end_date.
    resp = client.put(f"/tasks/{task_id}", json={"estado": "doing"})
    assert resp.status_code == 200
    resp = client.put(f"/tasks/{task_id}", json={"estado": "backlog"})
    assert resp.status_code == 200
    task = resp.json()
    assert task["estado"] == "backlog"
    assert task["start_date"] is None
    assert task["end_date"] is None

    # Done -> ToDo: reinicia la gestion con start_date de hoy.
    resp = client.put(f"/tasks/{task_id}", json={"estado": "done"})
    assert resp.status_code == 200
    resp = client.put(f"/tasks/{task_id}", json={"estado": "todo"})
    assert resp.status_code == 200
    task = resp.json()
    assert task["estado"] == "todo"
    assert task["start_date"] == now_py().date().isoformat()
    assert task["end_date"] is None


def test_subtask_must_belong_to_same_celula_as_parent(client: TestClient):
    bootstrap_admin(client)

    resp = client.post("/celulas", json={"nombre": "Celula A", "jira_codigo": "CLA", "activa": True})
    assert resp.status_code == 201
    celula_a = resp.json()["id"]

    resp = client.post("/celulas", json={"nombre": "Celula B", "jira_codigo": "CLB", "activa": True})
    assert resp.status_code == 201
    celula_b = resp.json()["id"]

    resp = client.post("/tasks", json={"titulo": "Padre", "celula_id": celula_a})
    assert resp.status_code == 201
    parent_id = resp.json()["id"]

    # Cannot create a child in another cell.
    resp = client.post("/tasks", json={"titulo": "Hija invalida", "celula_id": celula_b, "parent_id": parent_id})
    assert resp.status_code == 400


def test_rejects_parent_cycles_and_allows_detach_parent(client: TestClient):
    bootstrap_admin(client)

    resp = client.post("/celulas", json={"nombre": "Celula Tree", "jira_codigo": "TRE", "activa": True})
    assert resp.status_code == 201
    celula_id = resp.json()["id"]

    resp = client.post("/tasks", json={"titulo": "A", "celula_id": celula_id})
    assert resp.status_code == 201
    a_id = resp.json()["id"]

    resp = client.post("/tasks", json={"titulo": "B", "celula_id": celula_id, "parent_id": a_id})
    assert resp.status_code == 201
    b_id = resp.json()["id"]

    # Can't make A a child of B (would create cycle A -> B -> A).
    resp = client.put(f"/tasks/{a_id}", json={"parent_id": b_id})
    assert resp.status_code == 400

    # Can detach B from A by sending parent_id null.
    resp = client.put(f"/tasks/{b_id}", json={"parent_id": None})
    assert resp.status_code == 200
    assert resp.json()["parent_id"] is None
