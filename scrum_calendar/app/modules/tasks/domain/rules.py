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
    return TaskDates(start_date=current_start_date, end_date=current_end_date)
