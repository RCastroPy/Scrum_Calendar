import json
import re
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from api.schemas import SprintItemImportOut
from app.modules.daily.application.import_rules import (
    derive_sprint_dates,
    extract_issue_prefix,
    normalize_sprint_name,
    parse_import_date,
    resolve_import_columns,
    resolve_sprint,
)
from app.modules.daily.infrastructure.repository import upsert_imported_daily_item, upsert_imported_release_item
from app.shared.domain.text import normalize_text
from app.shared.infrastructure.tabular import coerce_cell, decode_csv, parse_csv_text, parse_xlsx
from app.shared.interface.dependencies import get_current_admin
from data.db import get_db
from data.models import Celula, Persona, ReleaseImportItem, ReleaseItem, Sprint, Usuario, now_py, persona_celulas

router = APIRouter()


def normalize_name(value: str) -> str:
    cleaned = re.sub(r"\[.*?\]", "", value or "")
    return normalize_text(cleaned)


def normalize_jira_code(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]", "", value or "").strip().upper()


@router.post("/imports/sprint-items", response_model=SprintItemImportOut)
async def importar_sprint_items(
    celula_id: Optional[int] = Form(None),
    file: UploadFile = File(...),
    _: Usuario = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Archivo vacio")
    filename = (file.filename or "").lower()
    if filename.endswith(".xls") and not filename.endswith(".xlsx"):
        raise HTTPException(
            status_code=400,
            detail="Formato .xls no soportado. Exporta a .xlsx.",
        )
    fieldnames: list[str] = []
    rows: list[dict] = []
    is_xlsx = (
        filename.endswith(".xlsx")
        or (file.content_type and "spreadsheet" in file.content_type)
        or content[:2] == b"PK"
    )
    if is_xlsx:
        try:
            fieldnames, rows = parse_xlsx(content)
        except Exception:
            fieldnames = []
            rows = []
    if not fieldnames:
        text = decode_csv(content)
        fieldnames, rows = parse_csv_text(text)

    if not fieldnames:
        raise HTTPException(status_code=400, detail="Archivo sin encabezados")

    resolved, sprint_headers, missing_headers = resolve_import_columns(fieldnames)
    if missing_headers:
        raise HTTPException(
            status_code=400,
            detail=f"Faltan columnas en archivo: {', '.join(missing_headers)}",
        )

    celulas = db.query(Celula).all()
    if not celulas:
        raise HTTPException(status_code=400, detail="No hay celulas configuradas")
    celula_by_id = {celula.id: celula for celula in celulas}
    celula_by_code = {
        normalize_jira_code(celula.jira_codigo): celula
        for celula in celulas
        if celula.jira_codigo
    }
    persona_map_by_celula: dict[int, dict[str, int]] = {}
    for celula in celulas:
        personas = (
            db.query(Persona)
            .join(persona_celulas, persona_celulas.c.persona_id == Persona.id)
            .filter(persona_celulas.c.celula_id == celula.id, Persona.activo.is_(True))
            .all()
        )
        persona_map: dict[str, int] = {}
        for persona in personas:
            nombre = f"{persona.nombre} {persona.apellido}".strip()
            persona_map[normalize_name(nombre)] = persona.id
            if persona.jira_usuario:
                persona_map[normalize_name(persona.jira_usuario)] = persona.id
        persona_map_by_celula[celula.id] = persona_map

    sprints_by_celula: dict[int, list[Sprint]] = {}
    for celula in celulas:
        sprints_by_celula[celula.id] = (
            db.query(Sprint).filter(Sprint.celula_id == celula.id).all()
        )

    sprint_map_by_celula: dict[int, dict[str, Sprint]] = {}
    for celula_id_key, sprints in sprints_by_celula.items():
        sprint_map_by_celula[celula_id_key] = {
            normalize_sprint_name(sprint.nombre): sprint for sprint in sprints
        }

    created = 0
    updated = 0
    skipped = 0
    detected_sprints: list[str] = []
    missing_personas: set[str] = set()
    missing_sprints: set[str] = set()
    missing_celulas: set[str] = set()
    import_item_cache: dict[str, ReleaseImportItem] = {}
    item_cache: dict[str, ReleaseItem] = {}

    def get_value(row: dict, key: Optional[str]) -> str:
        if not key:
            return ""
        return coerce_cell(row.get(key))

    for row in rows:
        issue_key = get_value(row, resolved["issue_key"])
        if not issue_key:
            skipped += 1
            continue
        prefix = extract_issue_prefix(issue_key)
        celula = celula_by_code.get(prefix)
        if not celula and celula_id is not None:
            celula = celula_by_id.get(celula_id)
        if not celula:
            missing_celulas.add(prefix or issue_key)
            skipped += 1
            continue
        row_celula_id = celula.id
        persona_map = persona_map_by_celula.get(row_celula_id, {})
        sprint_map = sprint_map_by_celula.get(row_celula_id, {})

        sprint_values: list[str] = []
        for header in sprint_headers:
            value = get_value(row, header)
            if value and value not in sprint_values:
                sprint_values.append(value)
        if not sprint_values:
            skipped += 1
            continue

        assignee_raw = get_value(row, resolved["assignee"])
        persona_id = None
        if assignee_raw:
            persona_id = persona_map.get(normalize_name(assignee_raw))
            if persona_id is None:
                missing_personas.add(assignee_raw)

        issue_type = get_value(row, resolved["issue_type"]) or "Task"
        is_release_issue = normalize_text(issue_type) == "release"
        summary = get_value(row, resolved["summary"]) or "-"
        status = get_value(row, resolved["status"]) or "-"
        story_points_raw = get_value(row, resolved["story_points"])
        story_points = None
        if story_points_raw:
            try:
                story_points = float(story_points_raw.replace(",", "."))
            except ValueError:
                story_points = None
        quarter_raw = get_value(row, resolved.get("quarter"))
        quarter = quarter_raw.strip() if quarter_raw else None
        start_date = parse_import_date(get_value(row, resolved["start_date"]))
        end_date = parse_import_date(get_value(row, resolved["end_date"]))
        due_date = parse_import_date(get_value(row, resolved["due_date"]))
        raw_data = json.dumps(row, ensure_ascii=False)

        created_flag = False
        updated_flag = False

        for sprint_name in sprint_values:
            sprint = resolve_sprint(sprint_name, sprint_map) if sprint_name else None
            if not sprint:
                if sprint_name:
                    dates = derive_sprint_dates(sprint_name)
                    if dates is None:
                        today = now_py().date()
                        dates = (today, today + timedelta(days=13))
                    sprint = Sprint(
                        nombre=sprint_name,
                        celula_id=row_celula_id,
                        fecha_inicio=dates[0],
                        fecha_fin=dates[1],
                    )
                    db.add(sprint)
                    db.flush()
                    sprint_map[normalize_sprint_name(sprint_name)] = sprint
                    sprint_map_by_celula[row_celula_id] = sprint_map
                else:
                    skipped += 1
                    continue

            if sprint.nombre not in detected_sprints:
                detected_sprints.append(sprint.nombre)

            cache_key = f"{row_celula_id}:{issue_key}"
            import_item = import_item_cache.get(cache_key)
            if import_item is None:
                import_item = (
                    db.query(ReleaseImportItem)
                    .filter(
                        ReleaseImportItem.issue_key == issue_key,
                        ReleaseImportItem.celula_id == row_celula_id,
                    )
                    .first()
                )
                if import_item:
                    import_item_cache[cache_key] = import_item
            import_item, was_created, was_changed = upsert_imported_daily_item(
                db,
                import_item,
                celula_id=row_celula_id,
                sprint_id=sprint.id,
                sprint_nombre=sprint.nombre,
                persona_id=persona_id,
                assignee_nombre=assignee_raw or None,
                issue_key=issue_key,
                issue_type=issue_type,
                summary=summary,
                status=status,
                story_points=story_points,
                release_tipo="release" if is_release_issue else "tarea",
                quarter=quarter,
                raw_data=raw_data,
            )
            import_item_cache[cache_key] = import_item
            created_flag = created_flag or was_created
            updated_flag = updated_flag or (was_changed and not was_created)

            item = item_cache.get(cache_key)
            if item is None:
                item = (
                    db.query(ReleaseItem)
                    .filter(
                        ReleaseItem.issue_key == issue_key,
                        ReleaseItem.celula_id == row_celula_id,
                    )
                    .first()
                )
                if item:
                    item_cache[cache_key] = item
            item, was_created, was_changed = upsert_imported_release_item(
                db,
                item,
                celula_id=row_celula_id,
                sprint_id=sprint.id,
                sprint_nombre=sprint.nombre,
                persona_id=persona_id,
                assignee_nombre=assignee_raw or None,
                issue_key=issue_key,
                issue_type=issue_type,
                summary=summary,
                status=status,
                story_points=story_points,
                start_date=start_date,
                end_date=end_date,
                due_date=due_date,
                release_tipo="release" if is_release_issue else "tarea",
                quarter=quarter,
                raw_data=raw_data,
            )
            item_cache[cache_key] = item
            created_flag = created_flag or was_created
            updated_flag = updated_flag or (was_changed and not was_created)

        if created_flag:
            created += 1
        elif updated_flag:
            updated += 1

    db.commit()

    return {
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "sprints_detected": detected_sprints,
        "missing_personas": sorted(missing_personas),
        "missing_sprints": sorted(missing_sprints),
        "missing_celulas": sorted(missing_celulas),
    }


