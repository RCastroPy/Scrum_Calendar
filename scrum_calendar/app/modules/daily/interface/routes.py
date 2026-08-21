from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from api.schemas import DailyItemCommentCreate, DailyItemCommentOut, DailyItemCommentUpdate
from app.modules.daily.infrastructure.repository import list_daily_item_comments
from app.shared.interface.dependencies import get_current_admin
from data.db import get_db
from data.models import DailyItemComment, ReleaseItem, Usuario

router = APIRouter()


def _daily_item_source(source: str) -> str:
    normalized = (source or "").strip().lower()
    if normalized not in {"sprint", "release"}:
        raise HTTPException(status_code=400, detail="Origen de item invalido")
    return normalized


def _require_daily_item(source: str, item_id: int, db: Session) -> ReleaseItem:
    normalized = _daily_item_source(source)
    item = db.get(ReleaseItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado")
    if normalized == "sprint" and item.release_tipo != "tarea":
        raise HTTPException(status_code=404, detail="Item no encontrado")
    return item


@router.get("/daily-items/{item_source}/{item_id}/comments", response_model=List[DailyItemCommentOut])
def listar_daily_item_comments(
    item_source: str,
    item_id: int,
    _: Usuario = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    source = _daily_item_source(item_source)
    _require_daily_item(source, item_id, db)
    return list_daily_item_comments(db, item_source=source, item_id=item_id)


@router.post(
    "/daily-items/{item_source}/{item_id}/comments",
    response_model=DailyItemCommentOut,
    status_code=status.HTTP_201_CREATED,
)
def crear_daily_item_comment(
    item_source: str,
    item_id: int,
    payload: DailyItemCommentCreate,
    user: Usuario = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    source = _daily_item_source(item_source)
    _require_daily_item(source, item_id, db)
    texto = (payload.texto or "").strip()
    if not texto:
        raise HTTPException(status_code=400, detail="Texto requerido")
    comment = DailyItemComment(
        item_source=source,
        item_id=item_id,
        usuario_id=user.id,
        texto=texto,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


@router.put(
    "/daily-items/{item_source}/{item_id}/comments/{comment_id}",
    response_model=DailyItemCommentOut,
)
def actualizar_daily_item_comment(
    item_source: str,
    item_id: int,
    comment_id: int,
    payload: DailyItemCommentUpdate,
    user: Usuario = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    source = _daily_item_source(item_source)
    _require_daily_item(source, item_id, db)
    comment = db.get(DailyItemComment, comment_id)
    if not comment or comment.item_source != source or comment.item_id != item_id:
        raise HTTPException(status_code=404, detail="Comentario no encontrado")
    if user.rol != "admin" and comment.usuario_id != user.id:
        raise HTTPException(status_code=403, detail="Sin permisos")
    texto = (payload.texto or "").strip()
    if not texto:
        raise HTTPException(status_code=400, detail="Texto requerido")
    comment.texto = texto
    db.commit()
    db.refresh(comment)
    return comment


@router.delete("/daily-items/{item_source}/{item_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_daily_item_comment(
    item_source: str,
    item_id: int,
    comment_id: int,
    user: Usuario = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    source = _daily_item_source(item_source)
    _require_daily_item(source, item_id, db)
    comment = db.get(DailyItemComment, comment_id)
    if not comment or comment.item_source != source or comment.item_id != item_id:
        raise HTTPException(status_code=404, detail="Comentario no encontrado")
    if user.rol != "admin" and comment.usuario_id != user.id:
        raise HTTPException(status_code=403, detail="Sin permisos")
    db.delete(comment)
    db.commit()
    return None
