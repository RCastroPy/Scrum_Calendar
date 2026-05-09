from dataclasses import dataclass
from datetime import date
from typing import Optional, Set

from app.modules.tasks.domain.rules import apply_status_date_transition, normalize_task_status
from app.modules.tasks.domain.hierarchy import descendants_rollup


@dataclass(frozen=True)
class TaskUpdateResult:
    status_changed: bool
    prev_status: Optional[str]
    prev_start_date: Optional[date]


def apply_task_update(task, payload, fields_set: Set[str], business_today: date) -> TaskUpdateResult:
    prev_status = getattr(task, "estado", None)
    prev_start_date = getattr(task, "start_date", None)

    if payload.titulo is not None:
        task.titulo = payload.titulo
    if payload.descripcion is not None:
        task.descripcion = payload.descripcion
    if "release_issue_key" in fields_set:
        task.release_issue_key = payload.release_issue_key
    if payload.estado is not None:
        task.estado = payload.estado
    if payload.prioridad is not None:
        task.prioridad = payload.prioridad
    if payload.segmento is not None:
        task.segmento = payload.segmento
    if payload.tipo is not None:
        task.tipo = payload.tipo
    if payload.etiquetas is not None:
        task.etiquetas = payload.etiquetas
    if payload.puntos is not None:
        task.puntos = payload.puntos
    if payload.horas_estimadas is not None:
        task.horas_estimadas = payload.horas_estimadas
    if payload.importante is not None:
        task.importante = bool(payload.importante)
    if "celula_id" in fields_set:
        task.celula_id = payload.celula_id
    if payload.sprint_id is not None:
        task.sprint_id = payload.sprint_id
    if payload.assignee_persona_id is not None:
        task.assignee_persona_id = payload.assignee_persona_id
    if "start_date" in fields_set:
        task.start_date = payload.start_date
    if "end_date" in fields_set:
        task.end_date = payload.end_date
    if "fecha_vencimiento" in fields_set:
        task.fecha_vencimiento = payload.fecha_vencimiento
    if payload.orden is not None:
        task.orden = float(payload.orden)
    if "parent_id" in fields_set:
        task.parent_id = payload.parent_id

    prev_status_norm = normalize_task_status(prev_status)
    next_status_norm = normalize_task_status(getattr(task, "estado", None))
    status_changed = "estado" in fields_set and prev_status_norm != next_status_norm
    if status_changed:
        dates = apply_status_date_transition(
            previous_status=prev_status_norm,
            next_status=next_status_norm,
            current_start_date=getattr(task, "start_date", None),
            current_end_date=getattr(task, "end_date", None),
            business_today=business_today,
            status_changed=status_changed,
        )
        task.start_date = dates.start_date
        task.end_date = dates.end_date

    return TaskUpdateResult(
        status_changed=status_changed,
        prev_status=prev_status,
        prev_start_date=prev_start_date,
    )


def cascade_task_parents_for_inprogress(repo, task) -> None:
    if not task or not task.parent_id:
        return
    by_id, model_by_id, children = repo.tree_by_celula(task.celula_id)
    memo = {}
    visiting = set()

    current_id = int(task.parent_id)
    safety = 0
    while current_id and safety < 200:
        safety += 1
        parent = model_by_id.get(current_id)
        if not parent:
            break

        rollup = descendants_rollup(by_id, children, current_id, memo, visiting)
        if getattr(parent, "start_date", None) != rollup.min_start_date:
            parent.start_date = rollup.min_start_date
        if rollup.any_doing and (getattr(parent, "estado", "") or "") != "doing":
            parent.estado = "doing"

        current_id = int(parent.parent_id) if parent.parent_id else 0
