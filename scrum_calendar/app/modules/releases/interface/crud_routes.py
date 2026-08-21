from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from api.schemas import ReleaseImportItemOut, ReleaseItemCreate, ReleaseItemOut, ReleaseItemUpdate
from app.shared.interface.dependencies import get_current_admin
from app.shared.domain.text import normalize_text
from app.modules.releases.infrastructure.repository import SqlAlchemyReleaseRepository
from data.db import get_db
from data.models import Celula, Persona, ReleaseImportItem, ReleaseItem, ReleaseItemComment, Sprint, Usuario

router = APIRouter()

@router.get("/release-items", response_model=List[ReleaseItemOut])
def listar_release_items(
    celula_id: Optional[int] = None,
    quarter: Optional[str] = None,
    release_status: Optional[str] = Query(default=None, alias="status"),
    limit: Optional[int] = Query(default=None, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    return SqlAlchemyReleaseRepository(db).list_items(
        celula_id=celula_id,
        quarter=quarter,
        status=release_status,
        limit=limit,
        offset=offset,
    )


@router.get("/import-release-items", response_model=List[ReleaseImportItemOut])
def listar_import_release_items(
    celula_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    return SqlAlchemyReleaseRepository(db).list_import_items(celula_id=celula_id)


@router.post("/release-items", response_model=ReleaseItemOut, status_code=status.HTTP_201_CREATED)
def crear_release_item(
    payload: ReleaseItemCreate,
    _: Usuario = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    celula = db.get(Celula, payload.celula_id)
    if not celula:
        raise HTTPException(status_code=400, detail="Celula no encontrada")
    if payload.sprint_id is not None and not db.get(Sprint, payload.sprint_id):
        raise HTTPException(status_code=400, detail="Sprint no encontrado")
    if payload.persona_id is not None and not db.get(Persona, payload.persona_id):
        raise HTTPException(status_code=400, detail="Persona no encontrada")

    issue_key = (payload.issue_key or "").strip().upper()
    if not issue_key:
        raise HTTPException(status_code=400, detail="Issue requerido")
    summary = (payload.summary or "").strip()
    if not summary:
        raise HTTPException(status_code=400, detail="Resumen requerido")
    release_tipo = normalize_text(payload.release_tipo)
    if release_tipo not in {"comprometido", "nuevo"}:
        raise HTTPException(status_code=400, detail="Tipo de release invalido")

    item = ReleaseItem(
        celula_id=payload.celula_id,
        sprint_id=payload.sprint_id,
        persona_id=payload.persona_id,
        issue_type=(payload.issue_type or "").strip() or "Release",
        issue_key=issue_key,
        release_issue_key=(payload.release_issue_key or "").strip().upper() or None,
        summary=summary,
        reporter=(payload.reporter or "").strip() or None,
        reporter_id=(payload.reporter_id or "").strip() or None,
        status=(payload.status or "").strip() or "Backlog",
        story_points=payload.story_points,
        assignee_nombre=(payload.assignee_nombre or "").strip() or None,
        assignee_id=(payload.assignee_id or "").strip() or None,
        sprint_nombre=(payload.sprint_nombre or "").strip() or None,
        release_tipo=release_tipo,
        tipo=(payload.tipo or "").strip() or None,
        quarter=(payload.quarter or "").strip() or None,
        start_date=payload.start_date,
        end_date=payload.end_date,
        due_date=payload.due_date,
        raw_data=payload.raw_data,
    )
    db.add(item)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Ya existe un release con ese issue")
    db.refresh(item)
    return item


@router.put("/release-items/{item_id}", response_model=ReleaseItemOut)
def actualizar_release_item(
    item_id: int,
    payload: ReleaseItemUpdate,
    _: Usuario = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    item = db.get(ReleaseItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Release no encontrado")
    data = payload.model_dump(exclude_unset=True)
    if "celula_id" in data and data["celula_id"] is not None and not db.get(Celula, data["celula_id"]):
        raise HTTPException(status_code=400, detail="Celula no encontrada")
    if "sprint_id" in data and data["sprint_id"] is not None and not db.get(Sprint, data["sprint_id"]):
        raise HTTPException(status_code=400, detail="Sprint no encontrado")
    if "persona_id" in data and data["persona_id"] is not None and not db.get(Persona, data["persona_id"]):
        raise HTTPException(status_code=400, detail="Persona no encontrada")
    if "issue_key" in data:
        data["issue_key"] = (data["issue_key"] or "").strip().upper() or None
    if "release_issue_key" in data:
        data["release_issue_key"] = (data["release_issue_key"] or "").strip().upper() or None
    if "release_tipo" in data and data["release_tipo"] is not None:
        data["release_tipo"] = normalize_text(data["release_tipo"])
        if data["release_tipo"] not in {"comprometido", "nuevo"}:
            raise HTTPException(status_code=400, detail="Tipo de release invalido")
    for key, value in data.items():
        setattr(item, key, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Ya existe un release con ese issue")
    db.refresh(item)
    return item



@router.delete("/release-items")
def eliminar_release_items(
    celula_id: int,
    _: Usuario = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    total = db.query(ReleaseItem).filter(ReleaseItem.celula_id == celula_id).count()
    db.query(ReleaseItem).filter(ReleaseItem.celula_id == celula_id).delete(
        synchronize_session=False
    )
    db.query(ReleaseImportItem).filter(ReleaseImportItem.celula_id == celula_id).delete(
        synchronize_session=False
    )
    db.commit()
    return {"deleted": total}


@router.delete("/release-items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_release_item(
    item_id: int,
    _: Usuario = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    item = db.get(ReleaseItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Release no encontrado")
    db.query(ReleaseItemComment).filter(
        ReleaseItemComment.release_item_id == item.id
    ).delete(synchronize_session=False)
    db.query(ReleaseImportItem).filter(
        ReleaseImportItem.issue_key == item.issue_key,
        ReleaseImportItem.celula_id == item.celula_id,
    ).delete(synchronize_session=False)
    db.delete(item)
    db.commit()
    return None


@router.delete("/import-release-items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_import_release_item(
    item_id: int,
    _: Usuario = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    item = db.get(ReleaseImportItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Release no encontrado")
    db.query(ReleaseItem).filter(
        ReleaseItem.issue_key == item.issue_key,
        ReleaseItem.celula_id == item.celula_id,
    ).delete(synchronize_session=False)
    db.delete(item)
    db.commit()
    return None
