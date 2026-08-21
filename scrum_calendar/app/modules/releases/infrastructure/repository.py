from typing import Optional

from sqlalchemy.orm import Session, joinedload

from data.models import ReleaseImportItem, ReleaseItem, ReleaseItemComment


class SqlAlchemyReleaseRepository:
    def __init__(self, db: Session):
        self.db = db

    def list_items(
        self,
        *,
        celula_id: Optional[int] = None,
        quarter: Optional[str] = None,
        status: Optional[str] = None,
        limit: Optional[int] = None,
        offset: int = 0,
    ):
        query = self.db.query(ReleaseItem).order_by(ReleaseItem.creado_en.desc())
        if celula_id is not None:
            query = query.filter(ReleaseItem.celula_id == celula_id)
        if quarter is not None:
            query = query.filter(ReleaseItem.quarter == quarter)
        if status is not None:
            query = query.filter(ReleaseItem.status == status)
        if limit is not None:
            query = query.offset(offset).limit(limit)
        elif offset:
            query = query.offset(offset)
        return query.all()

    def list_import_items(self, *, celula_id: Optional[int] = None):
        query = self.db.query(ReleaseImportItem).order_by(ReleaseImportItem.creado_en.desc())
        if celula_id is not None:
            query = query.filter(ReleaseImportItem.celula_id == celula_id)
        return query.all()

    def list_comments(self, *, release_item_id: int):
        return (
            self.db.query(ReleaseItemComment)
            .options(joinedload(ReleaseItemComment.usuario))
            .filter(ReleaseItemComment.release_item_id == release_item_id)
            .order_by(ReleaseItemComment.creado_en.asc(), ReleaseItemComment.id.asc())
            .all()
        )
