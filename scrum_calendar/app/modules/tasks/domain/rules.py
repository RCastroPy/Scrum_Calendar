from dataclasses import dataclass
from datetime import date
from typing import Optional


@dataclass(frozen=True)
class TaskDates:
    start_date: Optional[date]
    end_date: Optional[date]


def normalize_task_status(value: Optional[str]) -> str:
    return (value or "").strip().lower()


def apply_status_date_transition(
    previous_status: Optional[str],
    next_status: Optional[str],
    current_start_date: Optional[date],
    current_end_date: Optional[date],
    business_today: date,
    status_changed: bool,
) -> TaskDates:
    if not status_changed:
        return TaskDates(start_date=current_start_date, end_date=current_end_date)

    normalized_next = normalize_task_status(next_status)
    normalized_previous = normalize_task_status(previous_status)
    if normalized_next in {"backlog", "todo"}:
        return TaskDates(start_date=None, end_date=None)
    if normalized_next == "done":
        return TaskDates(start_date=current_start_date or business_today, end_date=business_today)
    if normalized_next in {"doing", "managed"}:
        should_reset_start = current_start_date is None or normalized_previous in {"backlog", "todo", "done"}
        return TaskDates(
            start_date=business_today if should_reset_start else current_start_date,
            end_date=None,
        )

    return TaskDates(start_date=current_start_date, end_date=current_end_date)
