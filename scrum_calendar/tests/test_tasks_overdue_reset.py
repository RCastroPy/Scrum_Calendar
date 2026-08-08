from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import main as main_mod
import data.db as db
from data.models import Base, now_py


def build_client(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False})
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


def test_overdue_reset_moves_parent_and_child_from_doing_to_todo(tmp_path):
    with build_client(tmp_path) as client:
        response = client.post("/auth/bootstrap", json={"username": "admin", "password": "secret"})
        assert response.status_code == 200
        overdue_date = (now_py().date() - timedelta(days=1)).isoformat()
        today = now_py().date().isoformat()

        cell = client.post("/celulas", json={"nombre": "Celula Reset", "jira_codigo": "RST", "activa": True})
        assert cell.status_code == 201
        cell_id = cell.json()["id"]

        parent = client.post(
            "/tasks",
            json={
                "titulo": "Padre vencido",
                "celula_id": cell_id,
                "estado": "doing",
                "start_date": overdue_date,
                "fecha_vencimiento": overdue_date,
            },
        )
        assert parent.status_code == 201
        child = client.post(
            "/tasks",
            json={
                "titulo": "Hija vencida",
                "celula_id": cell_id,
                "parent_id": parent.json()["id"],
                "estado": "doing",
                "start_date": overdue_date,
                "fecha_vencimiento": overdue_date,
            },
        )
        assert child.status_code == 201

        reset = client.post("/tasks/overdue-to-today")
        assert reset.status_code == 200
        updated = {task["id"]: task for task in reset.json()}
        for task_id in (parent.json()["id"], child.json()["id"]):
            assert updated[task_id]["estado"] == "todo"
            assert updated[task_id]["fecha_vencimiento"] == today
    main_mod.app.dependency_overrides.clear()
