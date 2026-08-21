from datetime import date
from types import SimpleNamespace

from app.modules.tasks.application.use_cases import apply_task_update, reset_overdue_tasks


TODAY = date(2026, 5, 8)


def payload(**kwargs):
    defaults = {
        "titulo": None,
        "descripcion": None,
        "estado": None,
        "prioridad": None,
        "segmento": None,
        "tipo": None,
        "etiquetas": None,
        "puntos": None,
        "horas_estimadas": None,
        "importante": None,
        "celula_id": None,
        "sprint_id": None,
        "assignee_persona_id": None,
        "start_date": None,
        "end_date": None,
        "fecha_vencimiento": None,
        "orden": None,
        "parent_id": None,
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def task(**kwargs):
    defaults = {
        "titulo": "Task",
        "descripcion": None,
        "estado": "todo",
        "prioridad": "media",
        "segmento": None,
        "tipo": None,
        "etiquetas": None,
        "puntos": None,
        "horas_estimadas": None,
        "importante": False,
        "celula_id": None,
        "sprint_id": None,
        "assignee_persona_id": None,
        "start_date": None,
        "end_date": None,
        "fecha_vencimiento": None,
        "orden": 0.0,
        "parent_id": None,
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def test_apply_task_update_sets_dates_on_done():
    current = task(estado="todo")
    result = apply_task_update(current, payload(estado="done"), {"estado"}, TODAY)

    assert result.status_changed is True
    assert current.estado == "done"
    assert current.start_date == TODAY
    assert current.end_date == TODAY


def test_apply_task_update_clears_dates_on_backlog():
    current = task(estado="doing", start_date=TODAY, end_date=TODAY)
    result = apply_task_update(current, payload(estado="backlog"), {"estado"}, TODAY)

    assert result.prev_status == "doing"
    assert result.prev_start_date == TODAY
    assert current.estado == "backlog"
    assert current.start_date is None
    assert current.end_date is None


def test_apply_task_update_keeps_explicit_fields():
    current = task()
    result = apply_task_update(
        current,
        payload(titulo="Nuevo", prioridad="urgente", celula_id=3, orden=7),
        {"titulo", "prioridad", "celula_id", "orden"},
        TODAY,
    )

    assert result.status_changed is False
    assert current.titulo == "Nuevo"
    assert current.prioridad == "urgente"
    assert current.celula_id == 3
    assert current.orden == 7.0


def test_reset_overdue_tasks_moves_doing_to_todo_and_updates_due_date():
    current = task(estado="doing", fecha_vencimiento=date(2026, 5, 7), end_date=TODAY)
    reset_overdue_tasks([current], TODAY)

    assert current.estado == "todo"
    assert current.fecha_vencimiento == TODAY
    assert current.end_date is None


def test_reset_overdue_tasks_keeps_done_and_archived_unchanged():
    overdue = date(2026, 5, 7)
    done = task(estado="done", fecha_vencimiento=overdue, end_date=overdue)
    archived = task(estado="archived", fecha_vencimiento=overdue, end_date=overdue)

    reset_overdue_tasks([done, archived], TODAY)

    assert done.fecha_vencimiento == overdue
    assert done.end_date == overdue
    assert archived.fecha_vencimiento == overdue
    assert archived.end_date == overdue
