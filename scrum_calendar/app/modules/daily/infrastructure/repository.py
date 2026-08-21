import json
from typing import Optional

from sqlalchemy.orm import Session, joinedload

from data.models import DailyItemComment, ReleaseImportItem, ReleaseItem


def sync_manual_sprint_import_item(
    db: Session,
    *,
    issue_key: str,
    celula_id: int,
    sprint_id: int,
    sprint_nombre: str,
    persona_id: Optional[int],
    assignee_nombre: Optional[str],
    issue_type: str,
    summary: str,
    status: str,
    story_points: Optional[float],
) -> ReleaseImportItem:
    """Keep manual Daily entries visible in the import-compatible read model."""
    import_item = (
        db.query(ReleaseImportItem)
        .filter(ReleaseImportItem.issue_key == issue_key)
        .first()
    )
    if not import_item:
        import_item = ReleaseImportItem(
            celula_id=celula_id,
            sprint_id=sprint_id,
            persona_id=persona_id,
            assignee_nombre=assignee_nombre,
            issue_key=issue_key,
            issue_type=issue_type,
            summary=summary,
            status=status,
            story_points=story_points,
            sprint_nombre=sprint_nombre,
            release_tipo="tarea",
            raw_data=json.dumps({"source": "manual"}, ensure_ascii=False),
        )
        db.add(import_item)
        return import_item

    import_item.celula_id = celula_id
    import_item.sprint_id = sprint_id
    import_item.persona_id = persona_id
    import_item.assignee_nombre = assignee_nombre
    import_item.issue_type = issue_type
    import_item.summary = summary
    import_item.status = status
    import_item.story_points = story_points
    import_item.sprint_nombre = sprint_nombre
    import_item.release_tipo = "tarea"
    if not import_item.raw_data:
        import_item.raw_data = json.dumps({"source": "manual"}, ensure_ascii=False)
    return import_item


def list_sprint_items(
    db: Session,
    *,
    celula_id: Optional[int] = None,
    sprint_id: Optional[int] = None,
    item_status: Optional[str] = None,
    limit: Optional[int] = None,
    offset: int = 0,
):
    query = (
        db.query(ReleaseItem)
        .filter(ReleaseItem.release_tipo == "tarea", ReleaseItem.sprint_id.isnot(None))
        .order_by(ReleaseItem.creado_en.desc())
    )
    if celula_id is not None:
        query = query.filter(ReleaseItem.celula_id == celula_id)
    if sprint_id is not None:
        query = query.filter(ReleaseItem.sprint_id == sprint_id)
    if item_status is not None:
        query = query.filter(ReleaseItem.status == item_status)
    if limit is not None:
        query = query.offset(offset).limit(limit)
    elif offset:
        query = query.offset(offset)
    return query.all()


def list_import_sprint_items(
    db: Session,
    *,
    celula_id: Optional[int] = None,
    limit: Optional[int] = None,
    offset: int = 0,
):
    query = (
        db.query(ReleaseImportItem)
        .filter(ReleaseImportItem.release_tipo == "tarea", ReleaseImportItem.sprint_id.isnot(None))
        .order_by(ReleaseImportItem.creado_en.desc())
    )
    if celula_id is not None:
        query = query.filter(ReleaseImportItem.celula_id == celula_id)
    if limit is not None:
        query = query.offset(offset).limit(limit)
    elif offset:
        query = query.offset(offset)
    return query.all()


def list_daily_item_comments(db: Session, *, item_source: str, item_id: int):
    return (
        db.query(DailyItemComment)
        .options(joinedload(DailyItemComment.usuario))
        .filter(
            DailyItemComment.item_source == item_source,
            DailyItemComment.item_id == item_id,
        )
        .order_by(DailyItemComment.creado_en.asc(), DailyItemComment.id.asc())
        .all()
    )


def upsert_imported_daily_item(
    db: Session,
    existing: Optional[ReleaseImportItem],
    *,
    celula_id: int,
    sprint_id: int,
    sprint_nombre: str,
    persona_id: Optional[int],
    assignee_nombre: Optional[str],
    issue_key: str,
    issue_type: str,
    summary: str,
    status: str,
    story_points: Optional[float],
    release_tipo: str,
    quarter: Optional[str],
    raw_data: str,
) -> tuple[ReleaseImportItem, bool, bool]:
    created = existing is None
    item = existing or ReleaseImportItem(issue_key=issue_key)
    values = {
        "celula_id": celula_id,
        "sprint_id": sprint_id,
        "persona_id": persona_id,
        "assignee_nombre": assignee_nombre,
        "issue_type": issue_type,
        "summary": summary,
        "status": status,
        "story_points": story_points,
        "sprint_nombre": sprint_nombre,
        "release_tipo": release_tipo,
        "quarter": quarter,
        "raw_data": raw_data,
    }
    changed = created
    for key, value in values.items():
        if getattr(item, key) != value:
            setattr(item, key, value)
            changed = True
    if created:
        db.add(item)
    return item, created, changed


def upsert_imported_release_item(
    db: Session,
    existing: Optional[ReleaseItem],
    *,
    celula_id: int,
    sprint_id: int,
    sprint_nombre: str,
    persona_id: Optional[int],
    assignee_nombre: Optional[str],
    issue_key: str,
    issue_type: str,
    summary: str,
    status: str,
    story_points: Optional[float],
    start_date,
    end_date,
    due_date,
    release_tipo: str,
    quarter: Optional[str],
    raw_data: str,
) -> tuple[ReleaseItem, bool, bool]:
    created = existing is None
    item = existing or ReleaseItem(issue_key=issue_key)
    values = {
        "celula_id": celula_id,
        "sprint_id": sprint_id,
        "persona_id": persona_id,
        "assignee_nombre": assignee_nombre,
        "issue_type": issue_type,
        "summary": summary,
        "status": status,
        "story_points": story_points,
        "sprint_nombre": sprint_nombre,
        "release_tipo": release_tipo,
        "quarter": quarter,
        "raw_data": raw_data,
    }
    changed = created
    for key, value in values.items():
        if getattr(item, key) != value:
            setattr(item, key, value)
            changed = True
    if item.start_date is None and start_date is not None:
        item.start_date = start_date
        changed = True
    if item.end_date is None and end_date is not None:
        item.end_date = end_date
        changed = True
    if item.due_date is None and due_date is not None:
        item.due_date = due_date
        changed = True
    if created:
        item.start_date = start_date
        item.end_date = end_date
        item.due_date = due_date
        db.add(item)
    return item, created, changed
