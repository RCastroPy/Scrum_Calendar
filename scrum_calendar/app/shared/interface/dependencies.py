from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from data.models import Sesion, Task, Usuario, now_py


def get_user_from_token(db: Session, token: Optional[str]) -> Optional[Usuario]:
    if not token:
        return None
    session = (
        db.query(Sesion)
        .options(joinedload(Sesion.usuario))
        .filter(Sesion.token == token)
        .first()
    )
    if not session:
        return None
    if session.expira_en < now_py():
        db.delete(session)
        db.commit()
        return None
    if not session.usuario or not session.usuario.activo:
        return None
    return session.usuario


def require_user(db: Session, token: Optional[str]) -> Usuario:
    user = get_user_from_token(db, token)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    return user


def require_task_write_access(user: Usuario, task: Task) -> None:
    if user.rol == "admin":
        return
    if task.creado_por_usuario_id != user.id:
        raise HTTPException(status_code=403, detail="Sin permisos")

