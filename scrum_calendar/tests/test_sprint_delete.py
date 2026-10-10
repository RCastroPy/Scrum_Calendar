from datetime import date

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session

from api.routes import eliminar_sprint
from data.models import (
    Base,
    Celula,
    ReleaseItem,
    Retrospective,
    Sprint,
    SprintImportItem,
    SprintItem,
    Task,
)


@pytest.fixture()
def db(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'sprints.db'}")

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    engine.dispose()


def make_sprint(db):
    celula = Celula(nombre="Equipo sprint")
    db.add(celula)
    db.flush()
    sprint = Sprint(
        nombre="Sprint 1",
        celula_id=celula.id,
        fecha_inicio=date(2026, 10, 1),
        fecha_fin=date(2026, 10, 15),
    )
    db.add(sprint)
    db.commit()
    return celula, sprint


def test_delete_sprint_removes_own_items_but_keeps_tasks_and_releases(db):
    celula, sprint = make_sprint(db)
    db.add_all([
        SprintItem(
            celula_id=celula.id, sprint_id=sprint.id, issue_key="SM-1",
            issue_type="Task", summary="Item", status="To Do",
        ),
        SprintImportItem(
            celula_id=celula.id, sprint_id=sprint.id, issue_key="SM-2",
            issue_type="Task", summary="Importado", status="To Do",
        ),
        Task(titulo="Tarea", celula_id=celula.id, sprint_id=sprint.id),
        ReleaseItem(
            celula_id=celula.id, sprint_id=sprint.id, issue_key="SM-3",
            issue_type="Task", summary="Release", status="To Do",
        ),
    ])
    db.commit()
    sprint_id = sprint.id

    eliminar_sprint(sprint_id, None, db)

    assert db.get(Sprint, sprint_id) is None
    assert db.query(SprintItem).count() == 0
    assert db.query(SprintImportItem).count() == 0
    assert db.query(Task).one().sprint_id is None
    assert db.query(ReleaseItem).one().sprint_id is None


def test_delete_sprint_with_retrospective_is_rejected_without_data_loss(db):
    celula, sprint = make_sprint(db)
    db.add(Retrospective(celula_id=celula.id, sprint_id=sprint.id, token="retro-1"))
    db.commit()

    with pytest.raises(HTTPException) as error:
        eliminar_sprint(sprint.id, None, db)

    assert error.value.status_code == 409
    assert db.get(Sprint, sprint.id) is not None
    assert db.query(Retrospective).count() == 1


def test_delete_sprint_with_legacy_sprint_items_schema(db):
    celula, sprint = make_sprint(db)
    db.execute(text("ALTER TABLE sprint_items DROP COLUMN release_issue_key"))
    db.execute(
        text(
            "INSERT INTO sprint_items "
            "(celula_id, sprint_id, issue_key, issue_type, summary, status, creado_en) "
            "VALUES (:celula_id, :sprint_id, 'SM-4', 'Task', 'Historico', 'To Do', CURRENT_TIMESTAMP)"
        ),
        {"celula_id": celula.id, "sprint_id": sprint.id},
    )
    db.commit()
    sprint_id = sprint.id

    result = eliminar_sprint(sprint_id, None, db)

    assert result.id == sprint_id
    assert db.get(Sprint, sprint_id) is None
    assert db.execute(text("SELECT COUNT(*) FROM sprint_items")).scalar_one() == 0
