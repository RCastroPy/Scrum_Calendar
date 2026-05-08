from typing import List, Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from api.schemas import (
    TaskCommentCreate,
    TaskCommentOut,
    TaskCommentUpdate,
    TaskCreate,
    TaskOut,
    TaskSegmentCreate,
    TaskSegmentOut,
    TaskSegmentUpdate,
    TaskUpdate,
)
from app.modules.tasks.application.use_cases import apply_task_update, cascade_task_parents_for_inprogress
from app.modules.tasks.domain.constants import TASK_PRIORITIES, TASK_STATUSES
from app.modules.tasks.domain.hierarchy import same_optional_int
from app.modules.tasks.infrastructure.repository import SqlAlchemyTaskRepository
from app.shared.domain.text import clean_label, normalize_text
from app.shared.interface.dependencies import require_task_write_access, require_user
from data.db import get_db
from data.models import Celula, Persona, Sprint, Task, TaskComment, TaskSegment, now_py

router = APIRouter()


def _same_optional_int(a: Optional[int], b: Optional[int]) -> bool:
    return same_optional_int(a, b)


def _would_create_parent_cycle(db: Session, child_id: int, new_parent_id: int) -> bool:
    return SqlAlchemyTaskRepository(db).would_create_parent_cycle(child_id, new_parent_id)


def _upsert_task_segment_name(db: Session, usuario_id: int, nombre: str) -> str:
    clean = clean_label(nombre)
    if not clean:
        raise HTTPException(status_code=400, detail="Nombre requerido")
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
    row = TaskSegment(usuario_id=usuario_id, nombre=clean, nombre_key=key)
    db.add(row)
    db.flush()
    return row.nombre

@router.get("/tasks", response_model=List[TaskOut])
def listar_tasks(
    celula_id: Optional[int] = None,
    sprint_id: Optional[int] = None,
    estado: Optional[str] = None,
    db: Session = Depends(get_db),
    scrum_session: Optional[str] = Cookie(default=None),
):
    require_user(db, scrum_session)
    q = db.query(Task)
    if celula_id is not None:
        q = q.filter(Task.celula_id == celula_id)
    if sprint_id is not None:
        q = q.filter(Task.sprint_id == sprint_id)
    if estado is not None:
        q = q.filter(Task.estado == estado)
    return q.order_by(Task.orden.asc(), Task.actualizado_en.desc(), Task.id.desc()).all()


@router.post("/tasks", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def crear_task(
    payload: TaskCreate,
    db: Session = Depends(get_db),
    scrum_session: Optional[str] = Cookie(default=None),
):
    user = require_user(db, scrum_session)
    titulo = (payload.titulo or "").strip()
    if not titulo:
        raise HTTPException(status_code=400, detail="Titulo requerido")
    resolved_celula_id = payload.celula_id
    estado = (payload.estado or "backlog").strip().lower()
    if estado not in TASK_STATUSES:
        raise HTTPException(status_code=400, detail="Estado invalido")
    prioridad = (payload.prioridad or "media").strip().lower()
    if prioridad not in TASK_PRIORITIES:
        raise HTTPException(status_code=400, detail="Prioridad invalida")
    if resolved_celula_id is not None and not db.get(Celula, resolved_celula_id):
        raise HTTPException(status_code=404, detail="Celula no encontrada")
    if payload.sprint_id is not None and not db.get(Sprint, payload.sprint_id):
        raise HTTPException(status_code=404, detail="Sprint no encontrado")
    if payload.assignee_persona_id is not None and not db.get(Persona, payload.assignee_persona_id):
        raise HTTPException(status_code=404, detail="Persona no encontrada")
    if payload.parent_id is not None:
        parent = db.get(Task, payload.parent_id)
        if not parent:
            raise HTTPException(status_code=404, detail="Task padre no encontrado")
        if resolved_celula_id is None:
            resolved_celula_id = parent.celula_id
        if not _same_optional_int(resolved_celula_id, parent.celula_id):
            raise HTTPException(status_code=400, detail="La subtarea debe pertenecer a la misma celula del padre")
    segmento = (payload.segmento or "").strip() or None
    if segmento and len(segmento) > 80:
        raise HTTPException(status_code=400, detail="Segmento demasiado largo")
    if segmento:
        segmento = _upsert_task_segment_name(db, user.id, segmento)
    tipo = (payload.tipo or "").strip() or None
    if tipo and len(tipo) > 30:
        raise HTTPException(status_code=400, detail="Tipo demasiado largo")
    etiquetas = (payload.etiquetas or "").strip() or None
    if etiquetas and len(etiquetas) > 2000:
        raise HTTPException(status_code=400, detail="Etiquetas demasiado largas")
    orden = payload.orden if payload.orden is not None else now_py().timestamp()
    business_today = now_py().date()
    start_date = payload.start_date
    if start_date is None and estado == "doing":
        start_date = business_today
    end_date = payload.end_date
    if end_date is None and estado == "done":
        end_date = business_today
    task = Task(
        titulo=titulo,
        descripcion=payload.descripcion,
        estado=estado,
        prioridad=prioridad,
        celula_id=resolved_celula_id,
        sprint_id=payload.sprint_id,
        parent_id=payload.parent_id,
        assignee_persona_id=payload.assignee_persona_id,
        creado_por_usuario_id=user.id,
        start_date=start_date,
        end_date=end_date,
        fecha_vencimiento=payload.fecha_vencimiento,
        segmento=segmento,
        tipo=tipo,
        etiquetas=etiquetas,
        puntos=payload.puntos,
        horas_estimadas=payload.horas_estimadas,
        importante=bool(payload.importante) if payload.importante is not None else False,
        orden=float(orden),
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.get("/tasks/segments", response_model=List[TaskSegmentOut])
def listar_task_segments(
    db: Session = Depends(get_db),
    scrum_session: Optional[str] = Cookie(default=None),
):
    user = require_user(db, scrum_session)
    return (
        db.query(TaskSegment)
        .filter(TaskSegment.usuario_id == user.id)
        .order_by(func.lower(TaskSegment.nombre).asc(), TaskSegment.id.asc())
        .all()
    )


@router.post("/tasks/segments", response_model=TaskSegmentOut, status_code=status.HTTP_201_CREATED)
def crear_task_segment(
    payload: TaskSegmentCreate,
    db: Session = Depends(get_db),
    scrum_session: Optional[str] = Cookie(default=None),
):
    user = require_user(db, scrum_session)
    nombre = _upsert_task_segment_name(db, user.id, payload.nombre)
    db.commit()
    created = (
        db.query(TaskSegment)
        .filter(TaskSegment.usuario_id == user.id, TaskSegment.nombre_key == normalize_text(nombre))
        .first()
    )
    if not created:
        raise HTTPException(status_code=500, detail="No se pudo crear el segmento")
    return created


@router.put("/tasks/segments/{segment_id}", response_model=TaskSegmentOut)
def actualizar_task_segment(
    segment_id: int,
    payload: TaskSegmentUpdate,
    db: Session = Depends(get_db),
    scrum_session: Optional[str] = Cookie(default=None),
):
    user = require_user(db, scrum_session)
    segment = (
        db.query(TaskSegment)
        .filter(TaskSegment.id == segment_id, TaskSegment.usuario_id == user.id)
        .first()
    )
    if not segment:
        raise HTTPException(status_code=404, detail="Segmento no encontrado")
    old_name = clean_label(segment.nombre)
    old_key = normalize_text(old_name)
    new_name = clean_label(payload.nombre)
    new_key = normalize_text(new_name)
    if not new_name:
        raise HTTPException(status_code=400, detail="Nombre requerido")
    duplicate = (
        db.query(TaskSegment)
        .filter(
            TaskSegment.usuario_id == user.id,
            TaskSegment.nombre_key == new_key,
            TaskSegment.id != segment.id,
        )
        .first()
    )
    if duplicate:
        raise HTTPException(status_code=409, detail="Ya existe un segmento con ese nombre")
    segment.nombre = new_name
    segment.nombre_key = new_key
    if old_key != new_key:
        user_tasks = db.query(Task).filter(Task.creado_por_usuario_id == user.id).all()
        for task in user_tasks:
            if normalize_text(clean_label(task.segmento or "")) == old_key:
                task.segmento = new_name
    db.commit()
    db.refresh(segment)
    return segment


@router.delete("/tasks/segments/{segment_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_task_segment(
    segment_id: int,
    db: Session = Depends(get_db),
    scrum_session: Optional[str] = Cookie(default=None),
):
    user = require_user(db, scrum_session)
    segment = (
        db.query(TaskSegment)
        .filter(TaskSegment.id == segment_id, TaskSegment.usuario_id == user.id)
        .first()
    )
    if not segment:
        raise HTTPException(status_code=404, detail="Segmento no encontrado")
    segment_key = normalize_text(clean_label(segment.nombre))
    user_tasks = db.query(Task).filter(Task.creado_por_usuario_id == user.id).all()
    for task in user_tasks:
        if normalize_text(clean_label(task.segmento or "")) == segment_key:
            task.segmento = None
    db.delete(segment)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/tasks/{task_id}", response_model=TaskOut)
def actualizar_task(
    task_id: int,
    payload: TaskUpdate,
    db: Session = Depends(get_db),
    scrum_session: Optional[str] = Cookie(default=None),
):
    user = require_user(db, scrum_session)
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task no encontrada")
    require_task_write_access(user, task)

    fields_set = getattr(payload, "model_fields_set", None)
    if fields_set is None:
        fields_set = getattr(payload, "__fields_set__", set())

    if payload.titulo is not None:
        titulo = (payload.titulo or "").strip()
        if not titulo:
            raise HTTPException(status_code=400, detail="Titulo requerido")
        payload.titulo = titulo
    if payload.descripcion is not None:
        pass
    if payload.estado is not None:
        estado = (payload.estado or "").strip().lower()
        if estado not in TASK_STATUSES:
            raise HTTPException(status_code=400, detail="Estado invalido")
        payload.estado = estado
    if payload.prioridad is not None:
        prioridad = (payload.prioridad or "").strip().lower()
        if prioridad not in TASK_PRIORITIES:
            raise HTTPException(status_code=400, detail="Prioridad invalida")
        payload.prioridad = prioridad
    if payload.segmento is not None:
        segmento = (payload.segmento or "").strip() or None
        if segmento and len(segmento) > 80:
            raise HTTPException(status_code=400, detail="Segmento demasiado largo")
        if segmento:
            segmento = _upsert_task_segment_name(db, user.id, segmento)
        payload.segmento = segmento
    if payload.tipo is not None:
        tipo = (payload.tipo or "").strip() or None
        if tipo and len(tipo) > 30:
            raise HTTPException(status_code=400, detail="Tipo demasiado largo")
        payload.tipo = tipo
    if payload.etiquetas is not None:
        etiquetas = (payload.etiquetas or "").strip() or None
        if etiquetas and len(etiquetas) > 2000:
            raise HTTPException(status_code=400, detail="Etiquetas demasiado largas")
        payload.etiquetas = etiquetas
    if "celula_id" in fields_set:
        if payload.celula_id and not db.get(Celula, payload.celula_id):
            raise HTTPException(status_code=404, detail="Celula no encontrada")
    if payload.sprint_id is not None:
        if payload.sprint_id and not db.get(Sprint, payload.sprint_id):
            raise HTTPException(status_code=404, detail="Sprint no encontrado")
    if payload.assignee_persona_id is not None:
        if payload.assignee_persona_id and not db.get(Persona, payload.assignee_persona_id):
            raise HTTPException(status_code=404, detail="Persona no encontrada")
    if "parent_id" in fields_set:
        if payload.parent_id == task.id:
            raise HTTPException(status_code=400, detail="Task padre invalido")
        if payload.parent_id is not None:
            parent = db.get(Task, payload.parent_id)
            if not parent:
                raise HTTPException(status_code=404, detail="Task padre no encontrado")
            if _would_create_parent_cycle(db, int(task.id), int(payload.parent_id)):
                raise HTTPException(status_code=400, detail="Relacion padre-hijo invalida (ciclo)")
            next_celula_id = payload.celula_id if "celula_id" in fields_set else task.celula_id
            if not _same_optional_int(next_celula_id, parent.celula_id):
                raise HTTPException(status_code=400, detail="La subtarea debe pertenecer a la misma celula del padre")
    next_parent_id = payload.parent_id if "parent_id" in fields_set else task.parent_id
    if ("celula_id" in fields_set or "parent_id" in fields_set) and next_parent_id is not None:
        next_celula_id = payload.celula_id if "celula_id" in fields_set else task.celula_id
        parent = db.get(Task, next_parent_id)
        if parent and not _same_optional_int(next_celula_id, parent.celula_id):
            raise HTTPException(status_code=400, detail="La subtarea debe pertenecer a la misma celula del padre")

    result = apply_task_update(task, payload, fields_set, now_py().date())

    # Cascade: propagate earliest start_date + in-progress status to all ancestors.
    if result.prev_status != task.estado or result.prev_start_date != getattr(task, "start_date", None):
        cascade_task_parents_for_inprogress(SqlAlchemyTaskRepository(db), task)

    db.commit()
    db.refresh(task)
    return task


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_task(
    task_id: int,
    db: Session = Depends(get_db),
    scrum_session: Optional[str] = Cookie(default=None),
):
    user = require_user(db, scrum_session)
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task no encontrada")
    require_task_write_access(user, task)
    db.delete(task)
    db.commit()
    return None


@router.get("/tasks/{task_id}/comments", response_model=List[TaskCommentOut])
def listar_task_comments(
    task_id: int,
    db: Session = Depends(get_db),
    scrum_session: Optional[str] = Cookie(default=None),
):
    require_user(db, scrum_session)
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task no encontrada")
    return (
        db.query(TaskComment)
        .options(joinedload(TaskComment.usuario))
        .filter(TaskComment.task_id == task_id)
        .order_by(TaskComment.creado_en.asc(), TaskComment.id.asc())
        .all()
    )


@router.post("/tasks/{task_id}/comments", response_model=TaskCommentOut, status_code=status.HTTP_201_CREATED)
def crear_task_comment(
    task_id: int,
    payload: TaskCommentCreate,
    db: Session = Depends(get_db),
    scrum_session: Optional[str] = Cookie(default=None),
):
    user = require_user(db, scrum_session)
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task no encontrada")
    texto = (payload.texto or "").strip()
    if not texto:
        raise HTTPException(status_code=400, detail="Texto requerido")
    comment = TaskComment(task_id=task_id, usuario_id=user.id, texto=texto)
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


@router.put("/tasks/{task_id}/comments/{comment_id}", response_model=TaskCommentOut)
def actualizar_task_comment(
    task_id: int,
    comment_id: int,
    payload: TaskCommentUpdate,
    db: Session = Depends(get_db),
    scrum_session: Optional[str] = Cookie(default=None),
):
    user = require_user(db, scrum_session)
    comment = db.get(TaskComment, comment_id)
    if not comment or comment.task_id != task_id:
        raise HTTPException(status_code=404, detail="Comentario no encontrado")
    if user.rol != "admin" and comment.usuario_id != user.id:
        raise HTTPException(status_code=403, detail="Sin permisos")
    texto = (payload.texto or "").strip()
    if not texto:
        raise HTTPException(status_code=400, detail="Texto requerido")
    comment.texto = texto
    db.commit()
    db.refresh(comment)
    return comment


@router.delete("/tasks/{task_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_task_comment(
    task_id: int,
    comment_id: int,
    db: Session = Depends(get_db),
    scrum_session: Optional[str] = Cookie(default=None),
):
    user = require_user(db, scrum_session)
    comment = db.get(TaskComment, comment_id)
    if not comment or comment.task_id != task_id:
        raise HTTPException(status_code=404, detail="Comentario no encontrado")
    if user.rol != "admin" and comment.usuario_id != user.id:
        raise HTTPException(status_code=403, detail="Sin permisos")
    db.delete(comment)
    db.commit()
    return None
