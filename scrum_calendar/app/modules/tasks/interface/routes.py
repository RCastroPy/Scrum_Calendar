from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, Query, Response, status
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

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
from app.modules.tasks.application.use_cases import (
    apply_task_update,
    cascade_task_parents_for_inprogress,
    reset_overdue_tasks,
)
from app.modules.tasks.domain.constants import TASK_PRIORITIES, TASK_STATUSES
from app.modules.tasks.domain.hierarchy import same_optional_int
from app.modules.tasks.infrastructure.repository import SqlAlchemyTaskRepository, upsert_segment_name
from app.shared.domain.text import clean_label, normalize_text
from app.shared.interface.dependencies import require_task_write_access, require_user
from data.db import get_db
from data.models import Celula, Persona, Sprint, Task, TaskComment, TaskSegment, now_py

router = APIRouter()


def _normalize_release_issue_key(value: Optional[str]) -> Optional[str]:
    clean = (value or "").strip().upper()
    return clean or None


def _same_optional_int(a: Optional[int], b: Optional[int]) -> bool:
    return same_optional_int(a, b)


def _would_create_parent_cycle(db: Session, child_id: int, new_parent_id: int) -> bool:
    return SqlAlchemyTaskRepository(db).would_create_parent_cycle(child_id, new_parent_id)


@router.get("/tasks", response_model=List[TaskOut])
def listar_tasks(
    celula_id: Optional[int] = None,
    sprint_id: Optional[int] = None,
    estado: Optional[str] = None,
    texto: Optional[str] = None,
    prioridad: Optional[str] = None,
    assignee_persona_id: Optional[int] = None,
    fecha_vencimiento_desde: Optional[date] = None,
    fecha_vencimiento_hasta: Optional[date] = None,
    limit: Optional[int] = Query(default=None, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    scrum_session: Optional[str] = Cookie(default=None),
):
    require_user(db, scrum_session)
    return SqlAlchemyTaskRepository(db).list_tasks(
        celula_id=celula_id,
        sprint_id=sprint_id,
        estado=estado,
        texto=texto,
        prioridad=prioridad,
        assignee_persona_id=assignee_persona_id,
        fecha_vencimiento_desde=fecha_vencimiento_desde,
        fecha_vencimiento_hasta=fecha_vencimiento_hasta,
        limit=limit,
        offset=offset,
    )


@router.post("/tasks", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def crear_task(
    payload: TaskCreate,
    db: Session = Depends(get_db),
    scrum_session: Optional[str] = Cookie(default=None),
):
    user = require_user(db, scrum_session)
    repository = SqlAlchemyTaskRepository(db)
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
        parent = repository.get(payload.parent_id)
        if not parent:
            raise HTTPException(status_code=404, detail="Task padre no encontrado")
        if payload.celula_id is not None and payload.celula_id != parent.celula_id:
            raise HTTPException(status_code=400, detail="La subtarea debe pertenecer a la misma celula del padre")
        resolved_celula_id = parent.celula_id
    segmento = (payload.segmento or "").strip() or None
    if segmento and len(segmento) > 80:
        raise HTTPException(status_code=400, detail="Segmento demasiado largo")
    if segmento:
        try:
            segmento = upsert_segment_name(db, user.id, segmento)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    tipo = (payload.tipo or "").strip() or None
    if tipo and len(tipo) > 30:
        raise HTTPException(status_code=400, detail="Tipo demasiado largo")
    etiquetas = (payload.etiquetas or "").strip() or None
    if etiquetas and len(etiquetas) > 2000:
        raise HTTPException(status_code=400, detail="Etiquetas demasiado largas")
    orden = payload.orden if payload.orden is not None else now_py().timestamp()
    task = Task(
        titulo=titulo,
        descripcion=payload.descripcion,
        release_issue_key=_normalize_release_issue_key(payload.release_issue_key),
        estado=estado,
        prioridad=prioridad,
        celula_id=resolved_celula_id,
        sprint_id=payload.sprint_id,
        parent_id=payload.parent_id,
        assignee_persona_id=payload.assignee_persona_id,
        creado_por_usuario_id=user.id,
        start_date=payload.start_date,
        end_date=payload.end_date,
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
    return SqlAlchemyTaskRepository(db).list_segments(usuario_id=user.id)


@router.post("/tasks/segments", response_model=TaskSegmentOut, status_code=status.HTTP_201_CREATED)
def crear_task_segment(
    payload: TaskSegmentCreate,
    db: Session = Depends(get_db),
    scrum_session: Optional[str] = Cookie(default=None),
):
    user = require_user(db, scrum_session)
    try:
        nombre = upsert_segment_name(db, user.id, payload.nombre)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
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


@router.post("/tasks/overdue-to-today", response_model=List[TaskOut])
def actualizar_tareas_vencidas_a_hoy(
    db: Session = Depends(get_db),
    scrum_session: Optional[str] = Cookie(default=None),
):
    user = require_user(db, scrum_session)
    business_today = now_py().date()
    query = db.query(Task).filter(
        ~Task.estado.in_({"done", "archived"}),
        or_(
            Task.estado == "doing",
            and_(Task.fecha_vencimiento.isnot(None), Task.fecha_vencimiento < business_today),
        ),
    )
    if user.rol != "admin":
        query = query.filter(Task.creado_por_usuario_id == user.id)
    tasks = query.order_by(Task.parent_id.desc(), Task.id.desc()).all()

    # This daily reset must be atomic. Cascading every individual update can
    # otherwise reapply "doing" to a parent before its overdue children reset.
    reset_overdue_tasks(tasks, business_today)

    db.commit()
    for task in tasks:
        db.refresh(task)
    return tasks


@router.get("/tasks/{task_id}/ancestors", response_model=List[TaskOut])
def listar_ancestros_task(
    task_id: int,
    db: Session = Depends(get_db),
    scrum_session: Optional[str] = Cookie(default=None),
):
    require_user(db, scrum_session)
    repository = SqlAlchemyTaskRepository(db)
    task = repository.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task no encontrada")

    ancestors = []
    seen = {int(task.id)}
    parent_id = task.parent_id
    while parent_id and len(ancestors) < 200:
        parent = repository.get(parent_id)
        if not parent or int(parent.id) in seen:
            break
        ancestors.append(parent)
        seen.add(int(parent.id))
        parent_id = parent.parent_id
    return ancestors


@router.put("/tasks/{task_id}", response_model=TaskOut)
def actualizar_task(
    task_id: int,
    payload: TaskUpdate,
    db: Session = Depends(get_db),
    scrum_session: Optional[str] = Cookie(default=None),
):
    user = require_user(db, scrum_session)
    repository = SqlAlchemyTaskRepository(db)
    task = repository.get(task_id)
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
    if "release_issue_key" in fields_set:
        payload.release_issue_key = _normalize_release_issue_key(payload.release_issue_key)
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
            try:
                segmento = upsert_segment_name(db, user.id, segmento)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
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
            parent = repository.get(payload.parent_id)
            if not parent:
                raise HTTPException(status_code=404, detail="Task padre no encontrado")
            if _would_create_parent_cycle(db, int(task.id), int(payload.parent_id)):
                raise HTTPException(status_code=400, detail="Relacion padre-hijo invalida (ciclo)")
            payload.celula_id = parent.celula_id
            fields_set.add("celula_id")
    next_parent_id = payload.parent_id if "parent_id" in fields_set else task.parent_id
    if ("celula_id" in fields_set or "parent_id" in fields_set) and next_parent_id is not None:
        next_celula_id = payload.celula_id if "celula_id" in fields_set else task.celula_id
        parent = repository.get(next_parent_id)
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
    task = SqlAlchemyTaskRepository(db).get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task no encontrada")
    require_task_write_access(user, task)
    db.delete(task)
    db.commit()
    return None


@router.get("/tasks/comments/counts")
def contar_task_comments(
    task_ids: str = Query(default=""),
    db: Session = Depends(get_db),
    scrum_session: Optional[str] = Cookie(default=None),
):
    require_user(db, scrum_session)
    ids = {
        int(raw)
        for raw in str(task_ids or "").split(",")
        if raw.strip().isdigit() and int(raw) > 0
    }
    if not ids:
        return {}
    return SqlAlchemyTaskRepository(db).comment_counts(ids)


@router.get("/tasks/{task_id}/comments", response_model=List[TaskCommentOut])
def listar_task_comments(
    task_id: int,
    db: Session = Depends(get_db),
    scrum_session: Optional[str] = Cookie(default=None),
):
    require_user(db, scrum_session)
    task = SqlAlchemyTaskRepository(db).get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task no encontrada")
    return SqlAlchemyTaskRepository(db).list_comments(task_id=task_id)


@router.post("/tasks/{task_id}/comments", response_model=TaskCommentOut, status_code=status.HTTP_201_CREATED)
def crear_task_comment(
    task_id: int,
    payload: TaskCommentCreate,
    db: Session = Depends(get_db),
    scrum_session: Optional[str] = Cookie(default=None),
):
    user = require_user(db, scrum_session)
    task = SqlAlchemyTaskRepository(db).get(task_id)
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
