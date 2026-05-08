from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.modules.tasks.infrastructure.repository import SqlAlchemyTaskRepository
from data.models import Base, Task


def build_session(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'repo.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session_local = sessionmaker(bind=engine)
    return session_local()


def test_task_repository_tree_and_cycle_detection(tmp_path):
    db = build_session(tmp_path)
    try:
        parent = Task(titulo="Padre", celula_id=1, estado="backlog", prioridad="media")
        child = Task(titulo="Hijo", celula_id=1, estado="doing", prioridad="media", parent_id=1)
        other = Task(titulo="Otra celula", celula_id=2, estado="backlog", prioridad="media")
        db.add_all([parent, child, other])
        db.commit()

        repo = SqlAlchemyTaskRepository(db)
        by_id, model_by_id, children = repo.tree_by_celula(1)

        assert sorted(by_id.keys()) == [1, 2]
        assert sorted(model_by_id.keys()) == [1, 2]
        assert children == {1: [2]}
        assert repo.would_create_parent_cycle(1, 2) is True
        assert repo.would_create_parent_cycle(3, 2) is False
    finally:
        db.close()

