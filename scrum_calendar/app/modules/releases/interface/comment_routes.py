from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from api.schemas import ReleaseItemCommentCreate, ReleaseItemCommentOut, ReleaseItemCommentUpdate
from app.modules.releases.infrastructure.repository import SqlAlchemyReleaseRepository
from app.shared.interface.dependencies import get_current_admin
from data.db import get_db
from data.models import ReleaseItem, ReleaseItemComment, Usuario

router = APIRouter()

@router.get("/release-items/{item_id}/comments", response_model=List[ReleaseItemCommentOut])
def listar_release_item_comments(
    item_id: int,
    _: Usuario = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    item = db.get(ReleaseItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Release no encontrado")
    return SqlAlchemyReleaseRepository(db).list_comments(release_item_id=item_id)


@router.post(
    "/release-items/{item_id}/comments",
    response_model=ReleaseItemCommentOut,
    status_code=status.HTTP_201_CREATED,
)
def crear_release_item_comment(
    item_id: int,
    payload: ReleaseItemCommentCreate,
    user: Usuario = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    item = db.get(ReleaseItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Release no encontrado")
    texto = (payload.texto or "").strip()
    if not texto:
        raise HTTPException(status_code=400, detail="Texto requerido")
    comment = ReleaseItemComment(
        release_item_id=item_id,
        usuario_id=user.id,
        texto=texto,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


@router.put("/release-items/{item_id}/comments/{comment_id}", response_model=ReleaseItemCommentOut)
def actualizar_release_item_comment(
    item_id: int,
    comment_id: int,
    payload: ReleaseItemCommentUpdate,
    user: Usuario = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    item = db.get(ReleaseItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Release no encontrado")
    comment = db.get(ReleaseItemComment, comment_id)
    if not comment or comment.release_item_id != item_id:
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


@router.delete("/release-items/{item_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_release_item_comment(
    item_id: int,
    comment_id: int,
    user: Usuario = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    item = db.get(ReleaseItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Release no encontrado")
    comment = db.get(ReleaseItemComment, comment_id)
    if not comment or comment.release_item_id != item_id:
        raise HTTPException(status_code=404, detail="Comentario no encontrado")
    if user.rol != "admin" and comment.usuario_id != user.id:
        raise HTTPException(status_code=403, detail="Sin permisos")
    db.delete(comment)
    db.commit()
    return None
