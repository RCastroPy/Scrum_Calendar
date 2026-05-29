from datetime import date

from app.modules.tasks.domain.rules import apply_status_date_transition, normalize_task_status


TODAY = date(2026, 5, 7)


def test_normalize_task_status():
    assert normalize_task_status(" In Progress ") == "in progress"
    assert normalize_task_status("managed") == "todo"
    assert normalize_task_status("Gestionado") == "todo"
    assert normalize_task_status(None) == ""


def test_backlog_to_todo_sets_start_date():
    result = apply_status_date_transition("backlog", "todo", None, None, TODAY, True)
    assert result.start_date == TODAY
    assert result.end_date is None


def test_todo_to_done_sets_start_and_end_date():
    result = apply_status_date_transition("todo", "done", None, None, TODAY, True)
    assert result.start_date == TODAY
    assert result.end_date == TODAY


def test_done_to_doing_clears_end_date_and_sets_start_date():
    result = apply_status_date_transition("done", "doing", date(2026, 5, 1), TODAY, TODAY, True)
    assert result.start_date == TODAY
    assert result.end_date is None


def test_done_or_doing_to_backlog_clears_dates():
    result = apply_status_date_transition("doing", "backlog", TODAY, TODAY, TODAY, True)
    assert result.start_date is None
    assert result.end_date is None


def test_no_status_change_keeps_dates():
    result = apply_status_date_transition("doing", "doing", date(2026, 5, 1), None, TODAY, False)
    assert result.start_date == date(2026, 5, 1)
    assert result.end_date is None


def test_todo_to_doing_keeps_existing_start_date_and_clears_end_date():
    start_date = date(2026, 5, 1)
    result = apply_status_date_transition("todo", "doing", start_date, None, TODAY, True)
    assert result.start_date == start_date
    assert result.end_date is None


def test_backlog_to_todo_sets_start_date_and_clears_end_date():
    result = apply_status_date_transition("backlog", "todo", None, None, TODAY, True)
    assert result.start_date == TODAY
    assert result.end_date is None


def test_done_to_todo_sets_start_date_and_clears_end_date():
    result = apply_status_date_transition("done", "todo", date(2026, 5, 1), TODAY, TODAY, True)
    assert result.start_date == TODAY
    assert result.end_date is None


def test_doing_to_todo_keeps_existing_start_date_and_clears_end_date():
    start_date = date(2026, 5, 1)
    result = apply_status_date_transition("doing", "todo", start_date, None, TODAY, True)
    assert result.start_date == start_date
    assert result.end_date is None


def test_todo_to_backlog_clears_dates():
    result = apply_status_date_transition("todo", "backlog", TODAY, TODAY, TODAY, True)
    assert result.start_date is None
    assert result.end_date is None


def test_legacy_managed_to_backlog_clears_dates():
    result = apply_status_date_transition("managed", "backlog", TODAY, TODAY, TODAY, True)
    assert result.start_date is None
    assert result.end_date is None
