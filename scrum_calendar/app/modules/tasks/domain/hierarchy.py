from dataclasses import dataclass
from datetime import date
from typing import Callable, Mapping, Optional


@dataclass(frozen=True)
class TaskNode:
    id: int
    parent_id: Optional[int] = None
    status: str = ""
    start_date: Optional[date] = None


@dataclass(frozen=True)
class SubtreeInfo:
    min_start_date: Optional[date]
    any_doing: bool


def is_in_progress_family(status: str) -> bool:
    normalized = (status or "").strip().lower()
    return normalized in {"doing", "managed"}


def same_optional_int(a: Optional[int], b: Optional[int]) -> bool:
    if a is None and b is None:
        return True
    if a is None or b is None:
        return False
    return int(a) == int(b)


def would_create_parent_cycle(
    child_id: int,
    new_parent_id: int,
    get_parent_id: Callable[[int], Optional[int]],
    max_depth: int = 400,
) -> bool:
    seen = set()
    current_id = int(new_parent_id)
    safety = 0
    while current_id and safety < max_depth:
        safety += 1
        if current_id == int(child_id):
            return True
        if current_id in seen:
            return True
        seen.add(current_id)
        parent_id = get_parent_id(current_id)
        if not parent_id:
            return False
        current_id = int(parent_id)
    return False


def subtree_info(
    by_id: Mapping[int, TaskNode],
    children: Mapping[int, list[int]],
    node_id: int,
    memo: Optional[dict[int, SubtreeInfo]] = None,
    visiting: Optional[set[int]] = None,
) -> SubtreeInfo:
    memo = memo if memo is not None else {}
    visiting = visiting if visiting is not None else set()
    if node_id in memo:
        return memo[node_id]
    if node_id in visiting:
        return SubtreeInfo(None, False)

    visiting.add(node_id)
    node = by_id.get(node_id)
    if not node:
        result = SubtreeInfo(None, False)
        memo[node_id] = result
        visiting.remove(node_id)
        return result

    min_date = node.start_date
    any_doing = is_in_progress_family(node.status or "")
    for child_id in children.get(node_id, []):
        child_info = subtree_info(by_id, children, child_id, memo, visiting)
        if child_info.min_start_date is not None and (
            min_date is None or child_info.min_start_date < min_date
        ):
            min_date = child_info.min_start_date
        if child_info.any_doing:
            any_doing = True

    result = SubtreeInfo(min_date, any_doing)
    memo[node_id] = result
    visiting.remove(node_id)
    return result


def descendants_rollup(
    by_id: Mapping[int, TaskNode],
    children: Mapping[int, list[int]],
    node_id: int,
    memo: Optional[dict[int, SubtreeInfo]] = None,
    visiting: Optional[set[int]] = None,
) -> SubtreeInfo:
    min_date = None
    any_doing = False
    memo = memo if memo is not None else {}
    visiting = visiting if visiting is not None else set()
    for child_id in children.get(node_id, []):
        info = subtree_info(by_id, children, child_id, memo, visiting)
        if info.min_start_date is not None and (min_date is None or info.min_start_date < min_date):
            min_date = info.min_start_date
        if info.any_doing:
            any_doing = True
    return SubtreeInfo(min_date, any_doing)
