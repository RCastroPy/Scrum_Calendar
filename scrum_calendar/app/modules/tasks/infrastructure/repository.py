from typing import Optional

from sqlalchemy.orm import Session

from app.modules.tasks.domain.hierarchy import TaskNode, would_create_parent_cycle
from data.models import Task


class SqlAlchemyTaskRepository:
    def __init__(self, db: Session):
        self.db = db

    def get(self, task_id: int) -> Optional[Task]:
        return self.db.get(Task, task_id)

    def tree_by_celula(self, celula_id: Optional[int]):
        q = self.db.query(Task)
        if celula_id is None:
            q = q.filter(Task.celula_id.is_(None))
        else:
            q = q.filter(Task.celula_id == celula_id)
        items = q.all()
        by_id = {
            int(t.id): TaskNode(
                id=int(t.id),
                parent_id=int(t.parent_id) if t.parent_id else None,
                status=getattr(t, "estado", "") or "",
                start_date=getattr(t, "start_date", None),
            )
            for t in items
            if t and t.id
        }
        model_by_id = {int(t.id): t for t in items if t and t.id}
        children = {}
        for task in items:
            if not task or not task.parent_id:
                continue
            children.setdefault(int(task.parent_id), []).append(int(task.id))
        return by_id, model_by_id, children

    def would_create_parent_cycle(self, child_id: int, new_parent_id: int) -> bool:
        def get_parent_id(task_id: int) -> Optional[int]:
            current = self.get(task_id)
            return int(current.parent_id) if current and current.parent_id else None

        return would_create_parent_cycle(child_id, new_parent_id, get_parent_id)

