from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from api.schemas import SprintImportItemOut, SprintItemCreate, SprintItemOut, SprintItemUpdate
from app.modules.daily.domain.rules import normalize_issue_key
from app.modules.daily.infrastructure.repository import (
    list_import_sprint_items,
    list_sprint_items,
    sync_manual_sprint_import_item,
)
from app.modules.releases.domain.rules import issue_key_conflict
from app.shared.interface.dependencies import get_current_admin
from data.db import get_db
from data.models import Celula, Persona, ReleaseImportItem, ReleaseItem, Sprint, Usuario

router = APIRouter()


@router.get("/sprint-items", response_model=List[SprintItemOut])
def listar_sprint_items(
    celula_id: Optional[int] = None,
    sprint_id: Optional[int] = None,
    item_status: Optional[str] = Query(default=None, alias="status"),
    limit: Optional[int] = Query(default=None, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    return list_sprint_items(
        db,
        celula_id=celula_id,
        sprint_id=sprint_id,
        item_status=item_status,
        limit=limit,
        offset=offset,
    )


@router.get("/import-sprint-items", response_model=List[SprintImportItemOut])
def listar_import_sprint_items(
    celula_id: Optional[int] = None,
    limit: Optional[int] = Query(default=None, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    return list_import_sprint_items(db, celula_id=celula_id, limit=limit, offset=offset)


@router.post("/sprint-items", response_model=SprintItemOut, status_code=status.HTTP_201_CREATED)
def crear_sprint_item(
    payload: SprintItemCreate,
    _: Usuario = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    celula = db.get(Celula, payload.celula_id)
    if not celula:
        raise HTTPException(status_code=404, detail="Celula no encontrada")
    sprint = db.get(Sprint, payload.sprint_id)
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint no encontrado")
    if sprint.celula_id != celula.id:
        raise HTTPException(status_code=400, detail="Sprint no pertenece a la celula")
    if payload.persona_id is not None and not db.get(Persona, payload.persona_id):
        raise HTTPException(status_code=404, detail="Persona no encontrada")

    issue_key = normalize_issue_key(payload.issue_key)
    if db.query(ReleaseItem).filter(ReleaseItem.issue_key == issue_key).first():
        raise HTTPException(status_code=409, detail=issue_key_conflict(issue_key))

    item = ReleaseItem(
        celula_id=payload.celula_id,
        sprint_id=payload.sprint_id,
        persona_id=payload.persona_id,
        assignee_nombre=payload.assignee_nombre,
        issue_key=issue_key,
        release_issue_key=(payload.release_issue_key or "").strip().upper() or None,
        issue_type=payload.issue_type,
        summary=payload.summary,
        status=payload.status,
        story_points=payload.story_points,
        start_date=payload.start_date,
        end_date=payload.end_date,
        due_date=payload.due_date,
        sprint_nombre=sprint.nombre,
        release_tipo="tarea",
    )
    db.add(item)
    sync_manual_sprint_import_item(
        db,
        issue_key=issue_key,
        celula_id=payload.celula_id,
        sprint_id=payload.sprint_id,
        sprint_nombre=sprint.nombre,
        persona_id=payload.persona_id,
        assignee_nombre=payload.assignee_nombre,
        issue_type=payload.issue_type,
        summary=payload.summary,
        status=payload.status,
        story_points=payload.story_points,
    )
    try:
        db.commit()
        db.refresh(item)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Issue duplicado")
    return item


@router.put("/sprint-items/{item_id}", response_model=SprintItemOut)
def actualizar_sprint_item(
    item_id: int,
    payload: SprintItemUpdate,
    _: Usuario = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    item = db.get(ReleaseItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado")
    data = payload.model_dump(exclude_unset=True)
    if "sprint_id" in data and data["sprint_id"] is not None:
        sprint = db.get(Sprint, data["sprint_id"])
        if not sprint:
            raise HTTPException(status_code=404, detail="Sprint no encontrado")
        if sprint.celula_id != item.celula_id:
            raise HTTPException(status_code=400, detail="Sprint no pertenece a la celula")
    if "persona_id" in data and data["persona_id"] is not None and not db.get(Persona, data["persona_id"]):
        raise HTTPException(status_code=404, detail="Persona no encontrada")
    for key, value in data.items():
        if key == "issue_key":
            value = normalize_issue_key(value)
        elif key == "release_issue_key":
            value = (value or "").strip().upper() or None
        setattr(item, key, value)
    try:
        db.commit()
        db.refresh(item)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Issue duplicado en este sprint")
    return item


@router.delete("/sprint-items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_sprint_item(
    item_id: int,
    _: Usuario = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    item = db.get(ReleaseItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado")
    db.query(ReleaseImportItem).filter(
        ReleaseImportItem.issue_key == item.issue_key,
        ReleaseImportItem.celula_id == item.celula_id,
    ).delete(synchronize_session=False)
    db.delete(item)
    db.commit()
    return None


@router.delete("/import-sprint-items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_import_sprint_item(
    item_id: int,
    _: Usuario = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    item = db.get(ReleaseImportItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado")
    db.query(ReleaseItem).filter(
        ReleaseItem.issue_key == item.issue_key,
        ReleaseItem.celula_id == item.celula_id,
    ).delete(synchronize_session=False)
    db.delete(item)
    db.commit()
    return None


@router.delete("/sprint-items")
def eliminar_sprint_items(
    celula_id: int,
    _: Usuario = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    total = db.query(ReleaseItem).filter(
        ReleaseItem.celula_id == celula_id,
        ReleaseItem.release_tipo == "tarea",
    ).count()
    db.query(ReleaseItem).filter(
        ReleaseItem.celula_id == celula_id,
        ReleaseItem.release_tipo == "tarea",
    ).delete(synchronize_session=False)
    db.query(ReleaseImportItem).filter(
        ReleaseImportItem.celula_id == celula_id,
        ReleaseImportItem.release_tipo == "tarea",
    ).delete(synchronize_session=False)
    db.commit()
    return {"deleted": total}
