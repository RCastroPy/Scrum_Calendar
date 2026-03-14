from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import main as main_mod
import data.db as db
from data.models import Base


def build_client(tmp_path):
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
    return TestClient(main_mod.app)


def bootstrap_admin(client: TestClient):
    resp = client.post("/auth/bootstrap", json={"username": "admin", "password": "secret"})
    assert resp.status_code == 200


def create_member(client: TestClient, username: str):
    resp = client.post("/usuarios", json={"username": username, "password": "pass", "rol": "member"})
    assert resp.status_code == 201


def login(client: TestClient, username: str, password: str):
    resp = client.post("/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200


def test_member_cannot_update_or_delete_other_users_tasks(tmp_path):
    with build_client(tmp_path) as client:
        bootstrap_admin(client)

        resp = client.post("/celulas", json={"nombre": "Celula Authz", "jira_codigo": "TAU", "activa": True})
        assert resp.status_code == 201
        celula_id = resp.json()["id"]

        resp = client.post("/tasks", json={"titulo": "Task admin", "celula_id": celula_id})
        assert resp.status_code == 201
        task_id = resp.json()["id"]

        create_member(client, "member")
        resp = client.post("/auth/logout")
        assert resp.status_code == 200

        login(client, "member", "pass")

        resp = client.put(f"/tasks/{task_id}", json={"titulo": "Intento member"})
        assert resp.status_code == 403

        resp = client.delete(f"/tasks/{task_id}")
        assert resp.status_code == 403


def test_member_can_update_and_delete_own_tasks(tmp_path):
    with build_client(tmp_path) as client:
        bootstrap_admin(client)

        resp = client.post("/celulas", json={"nombre": "Celula Own", "jira_codigo": "TOW", "activa": True})
        assert resp.status_code == 201
        celula_id = resp.json()["id"]

        create_member(client, "member2")
        resp = client.post("/auth/logout")
        assert resp.status_code == 200

        login(client, "member2", "pass")

        resp = client.post("/tasks", json={"titulo": "Task propia", "celula_id": celula_id})
        assert resp.status_code == 201
        task_id = resp.json()["id"]

        resp = client.put(f"/tasks/{task_id}", json={"titulo": "Task propia editada"})
        assert resp.status_code == 200
        assert resp.json()["titulo"] == "Task propia editada"

        resp = client.delete(f"/tasks/{task_id}")
        assert resp.status_code == 204


def test_admin_can_update_member_task(tmp_path):
    with build_client(tmp_path) as client:
        bootstrap_admin(client)

        resp = client.post("/celulas", json={"nombre": "Celula Admin", "jira_codigo": "TAD", "activa": True})
        assert resp.status_code == 201
        celula_id = resp.json()["id"]

        create_member(client, "member3")
        resp = client.post("/auth/logout")
        assert resp.status_code == 200
        login(client, "member3", "pass")

        resp = client.post("/tasks", json={"titulo": "Task member", "celula_id": celula_id})
        assert resp.status_code == 201
        task_id = resp.json()["id"]

        resp = client.post("/auth/logout")
        assert resp.status_code == 200
        login(client, "admin", "secret")

        resp = client.put(f"/tasks/{task_id}", json={"prioridad": "urgente"})
        assert resp.status_code == 200
        assert resp.json()["prioridad"] == "urgente"

    main_mod.app.dependency_overrides.clear()
