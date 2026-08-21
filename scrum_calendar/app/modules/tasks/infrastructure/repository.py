from datetime import date
from typing import Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.modules.tasks.domain.hierarchy import TaskNode, would_create_parent_cycle
from app.shared.domain.text import clean_label, normalize_text
from data.models import Task, TaskComment, TaskSegment


def upsert_segment_name(db: Session, usuario_id: int, nombre: str) -> str:
    clean = clean_label(nombre)
    if not clean:
        raise ValueError("Nombre requerido")
    key = normalize_text(clean)
    row = (
        db.query(TaskSegment)
        .filter(TaskSegment.usuario_id == usuario_id, TaskSegment.nombre_key == key)
        .first()
    )
    if row:
        if row.nombre != clean:
            row.nombre = clean
            db.flush()
        return row.nombre
    db.add(TaskSegment(usuario_id=usuario_id, nombre=clean, nombre_key=key))
    db.flush()
    return clean


class SqlAlchemyTaskRepository:
    def __init__(self, db: Session):
        self.db = db

    def get(self, task_id: int) -> Optional[Task]:
        return self.db.get(Task, task_id)

    def list_tasks(
        self,
        *,
        celula_id: Optional[int] = None,
        sprint_id: Optional[int] = None,
        estado: Optional[str] = None,
        texto: Optional[str] = None,
        prioridad: Optional[str] = None,
        assignee_persona_id: Optional[int] = None,
        fecha_vencimiento_desde: Optional[date] = None,
        fecha_vencimiento_hasta: Optional[date] = None,
        limit: Optional[int] = None,
        offset: int = 0,
    ):
        query = self.db.query(Task)
        if celula_id is not None:
            query = query.filter(Task.celula_id == celula_id)
        if sprint_id is not None:
            query = query.filter(Task.sprint_id == sprint_id)
        if estado is not None:
            query = query.filter(Task.estado == estado)
        if texto and texto.strip():
            pattern = f"%{texto.strip()}%"
            query = query.filter(
                or_(Task.titulo.ilike(pattern), Task.release_issue_key.ilike(pattern))
            )
        if prioridad is not None:
            query = query.filter(Task.prioridad == prioridad.strip().lower())
        if assignee_persona_id is not None:
            query = query.filter(Task.assignee_persona_id == assignee_persona_id)
        if fecha_vencimiento_desde is not None:
            query = query.filter(Task.fecha_vencimiento >= fecha_vencimiento_desde)
        if fecha_vencimiento_hasta is not None:
            query = query.filter(Task.fecha_vencimiento <= fecha_vencimiento_hasta)
        query = query.order_by(Task.orden.asc(), Task.actualizado_en.desc(), Task.id.desc())
        if limit is not None:
            query = query.offset(offset).limit(limit)
        elif offset:
            query = query.offset(offset)
        return query.all()

    def comment_counts(self, task_ids: set[int]) -> dict[str, int]:
        if not task_ids:
            return {}
        rows = (
            self.db.query(TaskComment.task_id, func.count(TaskComment.id))
            .filter(TaskComment.task_id.in_(task_ids))
            .group_by(TaskComment.task_id)
            .all()
        )
        counts = {str(task_id): int(count) for task_id, count in rows}
        return {str(task_id): counts.get(str(task_id), 0) for task_id in task_ids}

    def list_segments(self, *, usuario_id: int):
        return (
            self.db.query(TaskSegment)
            .filter(TaskSegment.usuario_id == usuario_id)
            .order_by(func.lower(TaskSegment.nombre).asc(), TaskSegment.id.asc())
            .all()
        )

    def list_comments(self, *, task_id: int):
        return (
            self.db.query(TaskComment)
            .options(joinedload(TaskComment.usuario))
            .filter(TaskComment.task_id == task_id)
            .order_by(TaskComment.creado_en.asc(), TaskComment.id.asc())
            .all()
        )

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
