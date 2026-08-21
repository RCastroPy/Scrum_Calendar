import json
import re
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from api.schemas import ReleaseItemImportOut
from app.shared.domain.text import normalize_text
from app.shared.infrastructure.tabular import coerce_cell, decode_csv, header_base, parse_csv_text, parse_xlsx
from app.shared.interface.dependencies import get_current_admin
from data.db import get_db
from data.models import Celula, Persona, ReleaseImportItem, ReleaseItem, Sprint, Usuario, now_py, persona_celulas

router = APIRouter()


def normalize_name(value: str) -> str:
    cleaned = re.sub(r"\[.*?\]", "", value or "")
    return normalize_text(cleaned)


def normalize_jira_code(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]", "", value or "").strip().upper()

@router.post("/imports/release-items", response_model=ReleaseItemImportOut)
async def importar_release_items(
    celula_id: Optional[int] = Form(None),
    tipo_release: str = Form(...),
    file: UploadFile = File(...),
    _: Usuario = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    tipo_release = normalize_text(tipo_release)
    if tipo_release not in {"comprometido", "nuevo"}:
        raise HTTPException(status_code=400, detail="Tipo de release invalido")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Archivo vacio")
    filename = (file.filename or "").lower()
    file_quarter: Optional[str] = None
    if filename:
        match = re.search(r"q([1-4])[^0-9]*([0-9]{2,4})", filename)
        if match:
            quarter_num = int(match.group(1))
            year_raw = match.group(2)
            year_num = int(year_raw)
            if year_num < 100:
                year_num += 2000
            file_quarter = f"Q{quarter_num} {year_num}"
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

    headers: dict[str, list[str]] = {}
    for header in fieldnames:
        if not header:
            continue
        key = header_base(header)
        headers.setdefault(key, []).append(header)
    header_aliases = {
        "issue_type": ["issue type", "issuetype", "type"],
        "issue_key": ["issue key", "issuekey", "key"],
        "issue_id": ["issue id"],
        "summary": ["summary", "resumen"],
        "reporter": ["reporter"],
        "reporter_id": ["reporter id"],
        "status": ["status", "estado"],
        "story_points": [
            "custom field (story points)",
            "story points",
            "custom field (story point estimate)",
        ],
        "assignee": ["assignee", "responsable"],
        "assignee_id": ["assignee id"],
        "start_date": ["custom field (start date)", "start date", "inicio"],
        "end_date": ["custom field (end date)", "end date", "fin"],
        "due_date": ["due date", "duedate", "fecha limite"],
        "sprint": ["sprint"],
        "quarter": ["quarter", "trimestre", "q"],
    }

    def resolve_header(field: str) -> Optional[str]:
        for alias in header_aliases[field]:
            key = header_base(alias)
            if key in headers:
                return headers[key][0]
        return None

    def resolve_headers(field: str) -> list[str]:
        resolved_headers: list[str] = []
        for alias in header_aliases[field]:
            key = header_base(alias)
            resolved_headers.extend(headers.get(key, []))
        return resolved_headers

    resolved = {
        field: resolve_header(field)
        for field in header_aliases
        if field not in {"sprint", "quarter"}
    }
    quarter_header = resolve_header("quarter")
    sprint_headers = resolve_headers("sprint")
    missing_headers = [field for field, header in resolved.items() if header is None]
    if not sprint_headers:
        missing_headers.append("sprint")
    if missing_headers:
        raise HTTPException(
            status_code=400,
            detail=f"Faltan columnas en archivo: {', '.join(missing_headers)}",
        )

    def parse_date_value(value: str) -> Optional[date]:
        if not value:
            return None
        cleaned = value.strip()
        if not cleaned:
            return None
        formats = [
            "%d/%b/%y %I:%M %p",
            "%d/%b/%y",
            "%Y-%m-%d",
            "%d/%m/%Y",
            "%d/%m/%y",
        ]
        for fmt in formats:
            try:
                return datetime.strptime(cleaned, fmt).date()
            except ValueError:
                continue
        if " " in cleaned:
            base = cleaned.split(" ")[0]
            for fmt in ["%d/%b/%y", "%d/%m/%Y", "%d/%m/%y", "%Y-%m-%d"]:
                try:
                    return datetime.strptime(base, fmt).date()
                except ValueError:
                    continue
        return None

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

    def normalize_sprint_name(value: str) -> str:
        cleaned = normalize_text(value)
        cleaned = cleaned.replace("sprint", "").strip()
        cleaned = re.sub(r"[^a-z0-9]+", "", cleaned)
        return cleaned

    sprint_map_by_celula: dict[int, dict[str, Sprint]] = {}
    for celula_id_key, sprints in sprints_by_celula.items():
        sprint_map_by_celula[celula_id_key] = {
            normalize_sprint_name(sprint.nombre): sprint for sprint in sprints
        }

    def derive_sprint_dates(name: str) -> Optional[tuple[date, date]]:
        match = re.search(r"(\d{4})(\d{2})", name)
        if not match:
            return None
        year = int(match.group(1))
        week = int(match.group(2))
        if week < 1 or week > 53:
            return None
        start = date.fromisocalendar(year, week, 1)
        end = start + timedelta(days=13)
        return start, end

    def resolve_sprint(name: str, sprint_map: dict[str, Sprint]) -> Optional[Sprint]:
        if not name:
            return None
        normalized = normalize_sprint_name(name)
        if normalized in sprint_map:
            return sprint_map[normalized]
        digits = re.findall(r"\d+", normalized)
        if digits:
            token = digits[0]
            matches = [s for key, s in sprint_map.items() if token in key]
            if len(matches) == 1:
                return matches[0]
        matches = [s for key, s in sprint_map.items() if normalized in key or key in normalized]
        if len(matches) == 1:
            return matches[0]
        return None

    def extract_issue_prefix(issue_key: str) -> str:
        match = re.match(r"\s*([A-Za-z0-9]+)[-_]", issue_key or "")
        if match:
            return normalize_jira_code(match.group(1))
        token = (issue_key or "").split("-")[0]
        return normalize_jira_code(token)

    created = 0
    updated = 0
    skipped = 0
    detected_sprints: list[str] = []
    missing_personas: set[str] = set()
    missing_sprints: set[str] = set()
    missing_celulas: set[str] = set()

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

        issue_type = get_value(row, resolved["issue_type"]) or "Release"
        issue_id = get_value(row, resolved["issue_id"])
        summary = get_value(row, resolved["summary"]) or "-"
        reporter = get_value(row, resolved["reporter"]) or None
        reporter_id = get_value(row, resolved["reporter_id"]) or None
        status = get_value(row, resolved["status"]) or "-"
        story_points_raw = get_value(row, resolved["story_points"])
        story_points = None
        if story_points_raw:
            try:
                story_points = float(story_points_raw.replace(",", "."))
            except ValueError:
                story_points = None
        assignee_raw = get_value(row, resolved["assignee"])
        assignee_id = get_value(row, resolved["assignee_id"]) or None
        persona_id = None
        if assignee_raw:
            persona_id = persona_map.get(normalize_name(assignee_raw))
            if persona_id is None:
                missing_personas.add(assignee_raw)
        quarter_raw = get_value(row, quarter_header)
        quarter = quarter_raw.strip() if quarter_raw else None
        if not quarter and file_quarter:
            quarter = file_quarter
        start_date = parse_date_value(get_value(row, resolved["start_date"]))
        end_date = parse_date_value(get_value(row, resolved["end_date"]))
        due_date = parse_date_value(get_value(row, resolved["due_date"]))

        sprint_values: list[str] = []
        for header in sprint_headers:
            value = get_value(row, header)
            if value and value not in sprint_values:
                sprint_values.append(value)
        sprint_nombre = sprint_values[0] if sprint_values else None
        sprint = resolve_sprint(sprint_nombre, sprint_map) if sprint_nombre else None
        if sprint_nombre and not sprint:
            missing_sprints.add(sprint_nombre)
            dates = derive_sprint_dates(sprint_nombre)
            if dates is None:
                today = now_py().date()
                dates = (today, today + timedelta(days=13))
            sprint = Sprint(
                nombre=sprint_nombre,
                celula_id=row_celula_id,
                fecha_inicio=dates[0],
                fecha_fin=dates[1],
            )
            db.add(sprint)
            db.flush()
            sprint_map[normalize_sprint_name(sprint_nombre)] = sprint
            sprint_map_by_celula[row_celula_id] = sprint_map

        if sprint and sprint.nombre not in detected_sprints:
            detected_sprints.append(sprint.nombre)

        raw_data = json.dumps(row, ensure_ascii=False)

        created_flag = False
        updated_flag = False

        import_item = (
            db.query(ReleaseImportItem)
            .filter(
                ReleaseImportItem.issue_key == issue_key,
                ReleaseImportItem.celula_id == row_celula_id,
            )
            .first()
        )
        if import_item:
            changed = False
            if import_item.celula_id != row_celula_id:
                import_item.celula_id = row_celula_id
                changed = True
            if import_item.sprint_id != (sprint.id if sprint else None):
                import_item.sprint_id = sprint.id if sprint else None
                changed = True
            if import_item.persona_id != persona_id:
                import_item.persona_id = persona_id
                changed = True
            if import_item.issue_type != issue_type:
                import_item.issue_type = issue_type
                changed = True
            if import_item.issue_id != issue_id:
                import_item.issue_id = issue_id
                changed = True
            if import_item.summary != summary:
                import_item.summary = summary
                changed = True
            if import_item.reporter != reporter:
                import_item.reporter = reporter
                changed = True
            if import_item.reporter_id != reporter_id:
                import_item.reporter_id = reporter_id
                changed = True
            if import_item.status != status:
                import_item.status = status
                changed = True
            if import_item.story_points != story_points:
                import_item.story_points = story_points
                changed = True
            if (import_item.assignee_nombre or "") != (assignee_raw or ""):
                import_item.assignee_nombre = assignee_raw or None
                changed = True
            if import_item.assignee_id != assignee_id:
                import_item.assignee_id = assignee_id
                changed = True
            if import_item.sprint_nombre != sprint_nombre:
                import_item.sprint_nombre = sprint_nombre
                changed = True
            if import_item.release_tipo != tipo_release:
                import_item.release_tipo = tipo_release
                changed = True
            if import_item.quarter != quarter:
                import_item.quarter = quarter
                changed = True
            if import_item.raw_data != raw_data:
                import_item.raw_data = raw_data
                changed = True
            if changed:
                updated_flag = True
        else:
            db.add(
                ReleaseImportItem(
                    celula_id=row_celula_id,
                    sprint_id=sprint.id if sprint else None,
                    persona_id=persona_id,
                    issue_type=issue_type,
                    issue_key=issue_key,
                    issue_id=issue_id or None,
                    summary=summary,
                    reporter=reporter,
                    reporter_id=reporter_id,
                    status=status,
                    story_points=story_points,
                    assignee_nombre=assignee_raw or None,
                    assignee_id=assignee_id,
                    sprint_nombre=sprint_nombre,
                    release_tipo=tipo_release,
                    quarter=quarter,
                    raw_data=raw_data,
                )
            )
            created_flag = True

        item = (
            db.query(ReleaseItem)
            .filter(
                ReleaseItem.issue_key == issue_key,
                ReleaseItem.celula_id == row_celula_id,
            )
            .first()
        )
        if item:
            changed = False
            if item.issue_type != issue_type:
                item.issue_type = issue_type
                changed = True
            if item.issue_id != issue_id:
                item.issue_id = issue_id
                changed = True
            if item.summary != summary:
                item.summary = summary
                changed = True
            if changed:
                updated_flag = True
        else:
            db.add(
                ReleaseItem(
                    celula_id=row_celula_id,
                    sprint_id=sprint.id if sprint else None,
                    persona_id=persona_id,
                    issue_type=issue_type,
                    issue_key=issue_key,
                    issue_id=issue_id or None,
                    summary=summary,
                    reporter=reporter,
                    reporter_id=reporter_id,
                    status=status,
                    story_points=story_points,
                    assignee_nombre=assignee_raw or None,
                    assignee_id=assignee_id,
                    sprint_nombre=sprint_nombre,
                    release_tipo=tipo_release,
                    quarter=quarter,
                    start_date=start_date,
                    end_date=end_date,
                    due_date=due_date,
                    raw_data=raw_data,
                )
            )
            created_flag = True

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



