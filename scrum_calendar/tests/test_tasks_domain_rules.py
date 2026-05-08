from datetime import date

from app.modules.tasks.domain.rules import apply_status_date_transition, normalize_task_status


TODAY = date(2026, 5, 7)


def test_normalize_task_status():
    assert normalize_task_status(" In Progress ") == "in progress"
    assert normalize_task_status(None) == ""


def test_backlog_to_todo_keeps_dates_empty():
    result = apply_status_date_transition("backlog", "todo", None, None, TODAY, True)
    assert result.start_date is None
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

