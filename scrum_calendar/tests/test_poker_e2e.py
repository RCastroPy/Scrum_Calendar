from collections import Counter

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import data.db as db
import main as main_mod
from data.models import Base


@pytest.fixture()
def client(tmp_path):
    db_path = tmp_path / "test_poker.db"
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


def bootstrap_admin(client: TestClient) -> None:
    resp = client.post("/auth/bootstrap", json={"username": "admin", "password": "secret"})
    assert resp.status_code == 200


def setup_poker_session(client: TestClient, total_personas: int = 10):
    bootstrap_admin(client)
    resp = client.post(
        "/celulas",
        json={"nombre": "Celula Poker", "jira_codigo": "PKR", "activa": True},
    )
    assert resp.status_code == 201
    celula_id = resp.json()["id"]

    personas = []
    for idx in range(1, total_personas + 1):
        resp = client.post(
            "/personas",
            json={
                "nombre": f"User{idx}",
                "apellido": "Test",
                "rol": "DEV",
                "capacidad_diaria_horas": 7,
                "celulas_ids": [celula_id],
                "fecha_cumple": None,
                "activo": True,
            },
        )
        assert resp.status_code == 201
        personas.append(resp.json()["id"])

    resp = client.post("/poker/sessions", json={"celula_id": celula_id})
    assert resp.status_code == 201
    session_id = resp.json()["id"]
    token = resp.json()["token"]
    return {
        "celula_id": celula_id,
        "personas": personas,
        "session_id": session_id,
        "token": token,
    }


def result_color_map(votes):
    if not votes:
        return {}
    counts = Counter(votes)
    if len(counts) == 1:
        return {value: "green" for value in counts.keys()}
    max_count = max(counts.values())
    colors = {}
    for value, qty in counts.items():
        colors[value] = "orange" if qty == max_count else "red"
    return colors


def test_poker_claims_lock_select(client):
    ctx = setup_poker_session(client, total_personas=10)
    token = ctx["token"]
    persona_ids = ctx["personas"]

    claims = []
    for idx, persona_id in enumerate(persona_ids, start=1):
        resp = client.post(
            f"/poker/public/{token}/claim",
            json={"persona_id": persona_id, "client_id": f"client-{idx}"},
        )
        assert resp.status_code == 200
        claims = resp.json()["claimed"]
        assert persona_id in claims

    assert len(claims) == 10

    resp = client.post(
        f"/poker/public/{token}/claim",
        json={"persona_id": persona_ids[0], "client_id": "otro"},
    )
    assert resp.status_code == 409
    assert resp.json()["detail"] == "Nombre ya seleccionado"


def test_poker_votes_tracking_and_colors(client):
    ctx = setup_poker_session(client, total_personas=10)
    token = ctx["token"]
    session_id = ctx["session_id"]
    persona_ids = ctx["personas"]

    for idx, persona_id in enumerate(persona_ids, start=1):
        resp = client.post(
            f"/poker/public/{token}/claim",
            json={"persona_id": persona_id, "client_id": f"client-{idx}"},
        )
        assert resp.status_code == 200

    voted_ids = persona_ids[:5]
    for persona_id in voted_ids:
        resp = client.post(
            f"/poker/public/{token}/vote",
            json={"persona_id": persona_id, "valor": 3},
        )
        assert resp.status_code == 201

    resp = client.get(f"/poker/sessions/{session_id}")
    assert resp.status_code == 200
    votos = resp.json()["votos"]
    assert len(votos) == len(voted_ids)
    assert {v["persona_id"] for v in votos} == set(voted_ids)

    colors = result_color_map([v["valor"] for v in votos])
    assert colors == {3: "green"}


def test_poker_hide_results_and_close_session(client):
    ctx = setup_poker_session(client, total_personas=10)
    token = ctx["token"]
    session_id = ctx["session_id"]
    persona_ids = ctx["personas"]

    resp = client.post(
        f"/poker/public/{token}/claim",
        json={"persona_id": persona_ids[0], "client_id": "client-1"},
    )
    assert resp.status_code == 200

    resp = client.post(
        f"/poker/public/{token}/vote",
        json={"persona_id": persona_ids[0], "valor": 5},
    )
    assert resp.status_code == 201

    resp = client.put(f"/poker/sessions/{session_id}", json={"fase": "revelado"})
    assert resp.status_code == 200

    resp = client.put(f"/poker/sessions/{session_id}", json={"fase": "votacion"})
    assert resp.status_code == 200

    resp = client.get(f"/poker/sessions/{session_id}")
    assert resp.status_code == 200
    assert resp.json()["votos"] == []

    resp = client.put(f"/poker/sessions/{session_id}", json={"estado": "cerrada"})
    assert resp.status_code == 200

    resp = client.get(f"/poker/public/{token}")
    assert resp.status_code == 200
    assert resp.json()["estado"] == "cerrada"
    assert resp.json()["claimed_persona_ids"] == []

    resp = client.post(
        f"/poker/public/{token}/vote",
        json={"persona_id": persona_ids[0], "valor": 8},
    )
    assert resp.status_code == 403
