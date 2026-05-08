from datetime import date

from app.modules.tasks.domain.hierarchy import (
    TaskNode,
    descendants_rollup,
    same_optional_int,
    subtree_info,
    would_create_parent_cycle,
)


def test_same_optional_int():
    assert same_optional_int(None, None)
    assert same_optional_int(1, "1")
    assert not same_optional_int(None, 1)
    assert not same_optional_int(1, 2)


def test_would_create_parent_cycle_detects_direct_and_indirect_cycles():
    parents = {2: 1, 3: 2}

    def get_parent_id(task_id):
        return parents.get(task_id)

    assert would_create_parent_cycle(1, 3, get_parent_id)
    assert would_create_parent_cycle(2, 3, get_parent_id)
    assert not would_create_parent_cycle(4, 3, get_parent_id)


def test_subtree_info_rolls_up_min_date_and_doing_status():
    by_id = {
        1: TaskNode(id=1, status="backlog"),
        2: TaskNode(id=2, parent_id=1, status="done", start_date=date(2026, 5, 5)),
        3: TaskNode(id=3, parent_id=1, status="doing", start_date=date(2026, 5, 2)),
        4: TaskNode(id=4, parent_id=3, status="todo", start_date=date(2026, 5, 1)),
    }
    children = {1: [2, 3], 3: [4]}

    info = subtree_info(by_id, children, 1)
    assert info.min_start_date == date(2026, 5, 1)
    assert info.any_doing is True


def test_descendants_rollup_ignores_parent_self():
    by_id = {
        1: TaskNode(id=1, status="doing", start_date=date(2026, 1, 1)),
        2: TaskNode(id=2, parent_id=1, status="todo", start_date=date(2026, 5, 3)),
    }
    children = {1: [2]}

    info = descendants_rollup(by_id, children, 1)
    assert info.min_start_date == date(2026, 5, 3)
    assert info.any_doing is False

