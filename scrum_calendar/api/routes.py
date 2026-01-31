import csv
import io
import json
import re
import unicodedata
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional
from zoneinfo import ZoneInfo

import anyio
from fastapi import (
    APIRouter,
    Cookie,
    Depends,
    File,
    Form,
    HTTPException,
    Response,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from starlette.websockets import WebSocketState
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

import openpyxl

from api.schemas import (
    AuthRequest,
    CapacidadSprintOut,
    CelulaCreate,
    CelulaOut,
    CelulaUpdate,
    EventoCreate,
    EventoOut,
    EventoTipoCreate,
    EventoTipoOut,
    EventoTipoUpdate,
    OneOnOneEntryCreate,
    OneOnOneEntryOut,
    OneOnOneNoteCreate,
    OneOnOneNoteOut,
    OneOnOneSessionCreate,
    OneOnOneSessionOut,
    OneOnOneSessionUpdate,
    PokerPublicOut,
    PokerClaimCreate,
    PokerPublicVoteCreate,
    PokerSessionCreate,
    PokerSessionDetailOut,
    PokerSessionOut,
    PokerSessionUpdate,
    PokerVoteOut,
    RetroCreate,
    RetroItemCreate,
    RetroDetailOut,
    RetroItemOut,
    RetroItemUpdate,
    RetroCommitmentOut,
    RetroOut,
    RetroUpdate,
    RetroPublicItemCreate,
    RetroClaimCreate,
    RetroPublicOut,
    ReleaseItemImportOut,
    ReleaseItemOut,
    ReleaseItemUpdate,
    SprintItemCreate,
    SprintItemImportOut,
    SprintItemOut,
    SprintItemUpdate,
    UsuarioCreate,
    UsuarioOut,
    UsuarioUpdate,
    EventoUpdate,
    FeriadoCreate,
    FeriadoOut,
    FeriadoUpdate,
    PersonaCreate,
    PersonaOut,
    PersonaUpdate,
    SprintCreate,
    SprintOut,
    SprintUpdate,
)
from core.calendar_engine import dias_habiles
from core.metrics import porcentaje_capacidad
from core.sprint_capacity import clasificar_estado
from core.security import hash_password, new_session_token, verify_password
from data.db import get_db
from data.models import (
    Celula,
    Evento,
    EventoTipo,
    Feriado,
    OneOnOneEntry,
    OneOnOneNote,
    OneOnOneSession,
    PokerSession,
    PokerVote,
    PokerClaim,
    RetroClaim,
    Retrospective,
    RetrospectiveItem,
    Persona,
    ReleaseItem,
    Sesion,
    Sprint,
    SprintItem,
    Usuario,
    now_py,
    persona_celulas,
)

router = APIRouter()

HORAS_POR_DIA = 7.0
TZ_PY = ZoneInfo("America/Asuncion")
SESSION_COOKIE = "scrum_session"
SESSION_DAYS = 14


def normalize_text(value: str) -> str:
    cleaned = unicodedata.normalize("NFD", value or "")
    cleaned = "".join(ch for ch in cleaned if not unicodedata.combining(ch))
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.strip().lower()


def normalize_name(value: str) -> str:
    cleaned = re.sub(r"\[.*?\]", "", value or "")
    return normalize_text(cleaned)


def normalize_jira_code(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]", "", value or "")
    return cleaned.strip().upper()


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


def require_admin(user: Usuario) -> None:
    if user.rol != "admin":
        raise HTTPException(status_code=403, detail="Sin permisos")


def coerce_cell(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def unique_headers(headers: list[str]) -> list[str]:
    seen: dict[str, int] = {}
    unique: list[str] = []
    for header in headers:
        cleaned = header.strip()
        if not cleaned:
            unique.append(cleaned)
            continue
        count = seen.get(cleaned, 0) + 1
        seen[cleaned] = count
        if count > 1:
            cleaned = f"{cleaned}__{count}"
        unique.append(cleaned)
    return unique


def header_base(value: str) -> str:
    cleaned = normalize_text(value or "")
    return re.sub(r"__\d+$", "", cleaned)


def parse_month(value: str) -> str:
    if not value:
        raise HTTPException(status_code=400, detail="Mes invalido")
    normalized = value.strip()
    if not re.match(r"^\d{4}-\d{2}$", normalized):
        raise HTTPException(status_code=400, detail="Mes invalido")
    return normalized


def decode_json_list(raw: Optional[str]) -> list[dict]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    return data if isinstance(data, list) else []


def encode_json_list(value: list[dict]) -> str:
    return json.dumps(value or [])


def decode_json_value(raw: Optional[str]) -> dict:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def encode_json_value(value: dict) -> str:
    return json.dumps(value or {})


def parse_xlsx(content: bytes) -> tuple[list[str], list[dict]]:
    workbook = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    sheet = workbook.active
    rows = list(sheet.iter_rows(values_only=True))
    header_row = None
    header_index = 0
    for idx, row in enumerate(rows):
        if row and any(cell is not None and str(cell).strip() for cell in row):
            header_row = row
            header_index = idx
            break
    if not header_row:
        return [], []
    headers = unique_headers([coerce_cell(cell) for cell in header_row])
    data_rows = []
    for row in rows[header_index + 1 :]:
        if not row or not any(cell is not None and str(cell).strip() for cell in row):
            continue
        row_dict = {}
        for idx, header in enumerate(headers):
            if not header:
                continue
            value = row[idx] if idx < len(row) else ""
            row_dict[header] = coerce_cell(value)
        data_rows.append(row_dict)
    return headers, data_rows


def decode_csv(content: bytes) -> str:
    encodings = ["utf-8-sig"]
    if b"\x00" in content[:1000]:
        encodings = ["utf-16", "utf-16-le", "utf-16-be"] + encodings
    encodings += ["cp1252", "latin-1"]
    for encoding in encodings:
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    return content.decode("latin-1", errors="replace")


def parse_csv_text(text: str) -> tuple[list[str], list[dict]]:
    sample = text[:4096]
    delimiter = ","
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=[",", ";", "\t", "|"])
        delimiter = dialect.delimiter
    except csv.Error:
        if sample.count(";") > sample.count(","):
            delimiter = ";"
        elif "\t" in sample:
            delimiter = "\t"
        elif "|" in sample:
            delimiter = "|"
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    rows = []
    for row in reader:
        if not row or not any(str(cell).strip() for cell in row):
            continue
        rows.append(row)
    if not rows:
        raise HTTPException(status_code=400, detail="CSV sin encabezados")
    headers = unique_headers([coerce_cell(cell) for cell in rows[0]])
    data_rows = []
    for row in rows[1:]:
        row_dict = {}
        for idx, header in enumerate(headers):
            if not header:
                continue
            value = row[idx] if idx < len(row) else ""
            row_dict[header] = coerce_cell(value)
        data_rows.append(row_dict)
    return headers, data_rows


def impacto_por_dia(eventos: List[Evento], dia: date) -> float:
    total = 0.0
    for evento in eventos:
        if evento.fecha_inicio <= dia <= evento.fecha_fin:
            impacto = min(max(evento.impacto_capacidad, 0.0), 100.0)
            total += impacto
    return min(total, 100.0)


@router.get("/time")
def obtener_tiempo():
    now = datetime.now(TZ_PY)
    return {
        "timezone": "America/Asuncion",
        "now": now.isoformat(),
        "today": now.date().isoformat(),
    }


@router.post("/auth/login", response_model=UsuarioOut)
def login(payload: AuthRequest, response: Response, db: Session = Depends(get_db)):
    username = (payload.username or "").strip().lower()
    if not username or not payload.password:
        raise HTTPException(status_code=400, detail="Credenciales invalidas")
    user = db.query(Usuario).filter(Usuario.username == username).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Credenciales invalidas")
    if not user.activo:
        raise HTTPException(status_code=403, detail="Usuario inactivo")
    token = new_session_token()
    expires_at = now_py() + timedelta(days=SESSION_DAYS)
    session = Sesion(usuario_id=user.id, token=token, expira_en=expires_at)
    db.add(session)
    db.commit()
    response.set_cookie(
        SESSION_COOKIE,
        token,
        httponly=True,
        samesite="lax",
        max_age=SESSION_DAYS * 24 * 3600,
        path="/",
    )
    return user


@router.post("/auth/logout")
def logout(
    response: Response,
    scrum_session: Optional[str] = Cookie(default=None),
    db: Session = Depends(get_db),
):
    if scrum_session:
        db.query(Sesion).filter(Sesion.token == scrum_session).delete(synchronize_session=False)
        db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}


@router.get("/auth/me", response_model=UsuarioOut)
def auth_me(scrum_session: Optional[str] = Cookie(default=None), db: Session = Depends(get_db)):
    user = get_user_from_token(db, scrum_session)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    return user


@router.post("/auth/bootstrap", response_model=UsuarioOut)
def bootstrap(payload: AuthRequest, response: Response, db: Session = Depends(get_db)):
    exists = db.query(Usuario.id).limit(1).first()
    if exists:
        raise HTTPException(status_code=409, detail="Usuarios ya existen")
    username = (payload.username or "").strip().lower()
    if not username or not payload.password:
        raise HTTPException(status_code=400, detail="Credenciales invalidas")
    user = Usuario(
        username=username,
        password_hash=hash_password(payload.password),
        rol="admin",
        activo=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = new_session_token()
    expires_at = now_py() + timedelta(days=SESSION_DAYS)
    session = Sesion(usuario_id=user.id, token=token, expira_en=expires_at)
    db.add(session)
    db.commit()
    response.set_cookie(
        SESSION_COOKIE,
        token,
        httponly=True,
        samesite="lax",
        max_age=SESSION_DAYS * 24 * 3600,
        path="/",
    )
    return user


@router.get("/usuarios", response_model=List[UsuarioOut])
def listar_usuarios(scrum_session: Optional[str] = Cookie(default=None), db: Session = Depends(get_db)):
    user = get_user_from_token(db, scrum_session)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    require_admin(user)
    return db.query(Usuario).order_by(Usuario.id).all()


@router.post("/usuarios", response_model=UsuarioOut, status_code=status.HTTP_201_CREATED)
def crear_usuario(
    payload: UsuarioCreate,
    scrum_session: Optional[str] = Cookie(default=None),
    db: Session = Depends(get_db),
):
    user = get_user_from_token(db, scrum_session)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    require_admin(user)
    username = (payload.username or "").strip().lower()
    if not username or not payload.password:
        raise HTTPException(status_code=400, detail="Credenciales invalidas")
    if db.query(Usuario).filter(Usuario.username == username).first():
        raise HTTPException(status_code=409, detail="Usuario ya existe")
    rol = (payload.rol or "member").strip().lower()
    if rol not in {"admin", "member"}:
        raise HTTPException(status_code=400, detail="Rol invalido")
    nuevo = Usuario(
        username=username,
        password_hash=hash_password(payload.password),
        rol=rol,
        activo=payload.activo,
    )
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)
    return nuevo


@router.put("/usuarios/{user_id}", response_model=UsuarioOut)
def actualizar_usuario(
    user_id: int,
    payload: UsuarioUpdate,
    scrum_session: Optional[str] = Cookie(default=None),
    db: Session = Depends(get_db),
):
    user = get_user_from_token(db, scrum_session)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    require_admin(user)
    target = db.get(Usuario, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if payload.rol is not None:
        rol = payload.rol.strip().lower()
        if rol not in {"admin", "member"}:
            raise HTTPException(status_code=400, detail="Rol invalido")
        if rol != "admin" and target.rol == "admin":
            remaining = (
                db.query(Usuario)
                .filter(Usuario.rol == "admin", Usuario.activo == True, Usuario.id != target.id)
                .count()
            )
            if remaining == 0:
                raise HTTPException(status_code=400, detail="Debe quedar al menos un admin activo")
        target.rol = rol
    if payload.activo is not None:
        if payload.activo is False and target.rol == "admin":
            remaining = (
                db.query(Usuario)
                .filter(Usuario.rol == "admin", Usuario.activo == True, Usuario.id != target.id)
                .count()
            )
            if remaining == 0:
                raise HTTPException(status_code=400, detail="Debe quedar al menos un admin activo")
        target.activo = payload.activo
    if payload.password is not None:
        if not payload.password:
            raise HTTPException(status_code=400, detail="Password invalido")
        target.password_hash = hash_password(payload.password)
    db.commit()
    db.refresh(target)
    return target


def oneonone_to_schema(note: OneOnOneNote) -> dict:
    return {
        "id": note.id,
        "celula_id": note.celula_id,
        "persona_id": note.persona_id,
        "mes": note.mes,
        "checklist": decode_json_list(note.checklist),
        "agreements": decode_json_list(note.agreements),
        "mood": note.mood,
        "feedback_pos": note.feedback_pos,
        "feedback_neg": note.feedback_neg,
        "growth": note.growth,
        "actualizado_en": note.actualizado_en,
    }


def oneonone_entry_to_schema(entry: OneOnOneEntry) -> dict:
    return {
        "id": entry.id,
        "celula_id": entry.celula_id,
        "persona_id": entry.persona_id,
        "mes": entry.mes,
        "tipo": entry.tipo,
        "detalle": decode_json_value(entry.detalle),
        "creado_en": entry.creado_en,
    }


def oneonone_session_to_schema(session: OneOnOneSession) -> dict:
    return {
        "id": session.id,
        "celula_id": session.celula_id,
        "persona_id": session.persona_id,
        "fecha": session.fecha,
        "checklist": decode_json_list(session.checklist),
        "agreements": decode_json_list(session.agreements),
        "mood": session.mood,
        "feedback_pos": session.feedback_pos,
        "feedback_neg": session.feedback_neg,
        "growth": session.growth,
        "actualizado_en": session.actualizado_en,
    }


RETRO_TIPOS = {"bien", "mal", "compromiso"}
RETRO_COMPROMISO_ESTADOS = {"pendiente", "en_progreso", "cerrado"}
RETRO_FASES = {"espera", "bien", "mal", "compromiso"}
RETRO_RETRO_ESTADOS = {"abierta", "cerrada"}
POKER_FASES = {"espera", "votacion", "revelado"}
POKER_ESTADOS = {"abierta", "cerrada"}


class RetroWSManager:
    def __init__(self) -> None:
        self.active: Dict[str, List[WebSocket]] = {}
        self.presence: Dict[str, Dict[WebSocket, dict]] = {}

    async def connect(self, token: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active.setdefault(token, []).append(websocket)
        self.presence.setdefault(token, {})

    def disconnect(self, token: str, websocket: WebSocket) -> None:
        sockets = self.active.get(token, [])
        if websocket in sockets:
            sockets.remove(websocket)
        if not sockets and token in self.active:
            self.active.pop(token, None)
        # Mantener presencia aunque el socket se desconecte (mobile sleep).

    def set_presence(self, token: str, websocket: WebSocket, meta: dict) -> bool:
        presence = self.presence.setdefault(token, {})
        active_sockets = set(self.active.get(token, []) or [])
        for ws in list(presence.keys()):
            if ws not in active_sockets:
                presence.pop(ws, None)
                continue
            if getattr(ws, "application_state", None) is not None:
                if ws.application_state != WebSocketState.CONNECTED:
                    presence.pop(ws, None)
                    continue
            if getattr(ws, "client_state", None) is not None:
                if ws.client_state != WebSocketState.CONNECTED:
                    presence.pop(ws, None)
                    continue
        persona_id = meta.get("persona_id") if isinstance(meta, dict) else None
        nombre = (meta.get("nombre") or "").strip().lower() if isinstance(meta, dict) else ""
        for ws, existing in list(presence.items()):
            if ws == websocket:
                continue
            if not existing:
                continue
            if persona_id is not None and existing.get("persona_id") == persona_id:
                return False
            existing_name = (existing.get("nombre") or "").strip().lower()
            if nombre and existing_name == nombre:
                return False
        presence[websocket] = meta or {}
        return True

    def clear_presence(self, token: str, websocket: WebSocket) -> None:
        presence = self.presence.get(token, {})
        presence.pop(websocket, None)
        if not presence and token in self.presence:
            self.presence.pop(token, None)

    def build_presence_payload(self, token: str) -> dict:
        entries = []
        seen = set()
        for meta in (self.presence.get(token, {}) or {}).values():
            if not meta:
                continue
            nombre = (meta.get("nombre") or "").strip()
            if not nombre:
                continue
            persona_id = meta.get("persona_id")
            key = f"{persona_id}" if persona_id is not None else nombre.lower()
            if key in seen:
                continue
            seen.add(key)
            entries.append({"persona_id": persona_id, "nombre": nombre})
        entries.sort(key=lambda item: (item.get("nombre") or "").lower())
        return {"type": "presence", "total": len(entries), "personas": entries}

    async def broadcast_presence(self, token: str) -> None:
        await self.broadcast(token, self.build_presence_payload(token))

    async def close_all(self, token: str) -> None:
        sockets = list(self.active.get(token, []))
        for websocket in sockets:
            try:
                await websocket.send_json({"type": "presence", "total": 0, "personas": []})
                await websocket.send_json({"type": "retro_closed"})
            except Exception:
                pass
            try:
                await websocket.close()
            except Exception:
                pass
        self.active.pop(token, None)
        self.presence.pop(token, None)

    async def broadcast(self, token: str, payload: dict) -> None:
        sockets = list(self.active.get(token, []))
        for websocket in sockets:
            try:
                await websocket.send_json(payload)
            except Exception:
                self.disconnect(token, websocket)


retro_ws_manager = RetroWSManager()


class PokerWSManager:
    def __init__(self) -> None:
        self.active: Dict[str, List[WebSocket]] = {}
        self.presence: Dict[str, Dict[WebSocket, dict]] = {}

    def prune(self, token: str) -> None:
        sockets = list(self.active.get(token, []) or [])
        if not sockets:
            self.active.pop(token, None)
            self.presence.pop(token, None)
            return
        for ws in list(sockets):
            try:
                if ws.application_state != WebSocketState.CONNECTED:
                    sockets.remove(ws)
                    self.presence.get(token, {}).pop(ws, None)
                    continue
                if ws.client_state != WebSocketState.CONNECTED:
                    sockets.remove(ws)
                    self.presence.get(token, {}).pop(ws, None)
                    continue
            except Exception:
                sockets.remove(ws)
                self.presence.get(token, {}).pop(ws, None)
        if sockets:
            self.active[token] = sockets
        else:
            self.active.pop(token, None)
            self.presence.pop(token, None)

    async def connect(self, token: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active.setdefault(token, []).append(websocket)
        self.presence.setdefault(token, {})

    def disconnect(self, token: str, websocket: WebSocket) -> None:
        sockets = self.active.get(token, [])
        if websocket in sockets:
            sockets.remove(websocket)
        if not sockets and token in self.active:
            self.active.pop(token, None)
        # Mantener presencia aunque el socket se desconecte (mobile sleep).

    def set_presence(self, token: str, websocket: WebSocket, meta: dict) -> bool:
        presence = self.presence.setdefault(token, {})
        self.prune(token)
        persona_id = meta.get("persona_id") if isinstance(meta, dict) else None
        nombre = (meta.get("nombre") or "").strip().lower() if isinstance(meta, dict) else ""
        for ws, existing in list(presence.items()):
            if ws == websocket:
                continue
            if not existing:
                continue
            if persona_id is not None and existing.get("persona_id") == persona_id:
                return False
            existing_name = (existing.get("nombre") or "").strip().lower()
            if nombre and existing_name == nombre:
                return False
        presence[websocket] = meta or {}
        return True

    def clear_presence(self, token: str, websocket: WebSocket) -> None:
        presence = self.presence.get(token, {})
        presence.pop(websocket, None)
        if not presence and token in self.presence:
            self.presence.pop(token, None)

    def build_presence_payload(self, token: str) -> dict:
        self.prune(token)
        entries = []
        seen = set()
        for meta in (self.presence.get(token, {}) or {}).values():
            if not meta:
                continue
            nombre = (meta.get("nombre") or "").strip()
            if not nombre:
                continue
            persona_id = meta.get("persona_id")
            key = f"{persona_id}" if persona_id is not None else nombre.lower()
            if key in seen:
                continue
            seen.add(key)
            entries.append({"persona_id": persona_id, "nombre": nombre})
        entries.sort(key=lambda item: (item.get("nombre") or "").lower())
        return {"type": "presence", "total": len(entries), "personas": entries}

    async def broadcast(self, token: str, payload: dict) -> None:
        sockets = list(self.active.get(token, []))
        for websocket in sockets:
            try:
                await websocket.send_json(payload)
            except Exception:
                self.disconnect(token, websocket)

    async def broadcast_presence(self, token: str) -> None:
        await self.broadcast(token, self.build_presence_payload(token))

    async def close_all(self, token: str) -> None:
        sockets = list(self.active.get(token, []))
        for websocket in sockets:
            try:
                await websocket.send_json({"type": "presence", "total": 0, "personas": []})
                await websocket.send_json({"type": "poker_closed"})
            except Exception:
                pass
            try:
                await websocket.close()
            except Exception:
                pass
        self.active.pop(token, None)
        self.presence.pop(token, None)


poker_ws_manager = PokerWSManager()


def notify_retro(token: str, payload: dict) -> None:
    try:
        anyio.from_thread.run(retro_ws_manager.broadcast, token, payload)
    except RuntimeError:
        pass


def notify_poker(token: str, payload: dict) -> None:
    try:
        anyio.from_thread.run(poker_ws_manager.broadcast, token, payload)
    except RuntimeError:
        pass


def normalize_retro_tipo(value: Optional[str]) -> str:
    cleaned = (value or "").strip().lower()
    if cleaned not in RETRO_TIPOS:
        raise HTTPException(status_code=400, detail="Tipo de retro invalido")
    return cleaned


def normalize_retro_estado(value: Optional[str]) -> str:
    cleaned = (value or "").strip().lower()
    if not cleaned:
        return "pendiente"
    if cleaned not in RETRO_COMPROMISO_ESTADOS:
        raise HTTPException(status_code=400, detail="Estado de compromiso invalido")
    return cleaned


def normalize_retro_fase(value: Optional[str]) -> str:
    cleaned = (value or "").strip().lower()
    if cleaned not in RETRO_FASES:
        raise HTTPException(status_code=400, detail="Fase invalida")
    return cleaned


def normalize_retro_estado_general(value: Optional[str]) -> str:
    cleaned = (value or "").strip().lower()
    if cleaned not in RETRO_RETRO_ESTADOS:
        raise HTTPException(status_code=400, detail="Estado de retro invalido")
    return cleaned


def normalize_poker_fase(value: Optional[str]) -> str:
    cleaned = (value or "").strip().lower()
    if cleaned not in POKER_FASES:
        raise HTTPException(status_code=400, detail="Fase de poker invalida")
    return cleaned


def normalize_poker_estado(value: Optional[str]) -> str:
    cleaned = (value or "").strip().lower()
    if cleaned not in POKER_ESTADOS:
        raise HTTPException(status_code=400, detail="Estado de poker invalido")
    return cleaned


def retro_to_schema(retro: Retrospective, resumen: Optional[Dict[str, int]] = None) -> dict:
    return {
        "id": retro.id,
        "celula_id": retro.celula_id,
        "sprint_id": retro.sprint_id,
        "token": retro.token,
        "estado": retro.estado,
        "fase": retro.fase,
        "creado_en": retro.creado_en,
        "actualizado_en": retro.actualizado_en,
        "resumen": resumen,
    }


def retro_item_to_schema(item: RetrospectiveItem) -> dict:
    return {
        "id": item.id,
        "retro_id": item.retro_id,
        "tipo": item.tipo,
        "detalle": item.detalle,
        "persona_id": item.persona_id,
        "asignado_id": item.asignado_id,
        "fecha_compromiso": item.fecha_compromiso,
        "estado": item.estado,
        "creado_en": item.creado_en,
        "actualizado_en": item.actualizado_en,
    }


def poker_to_schema(sesion: PokerSession) -> dict:
    return {
        "id": sesion.id,
        "celula_id": sesion.celula_id,
        "token": sesion.token,
        "estado": sesion.estado,
        "fase": sesion.fase,
        "creado_en": sesion.creado_en,
        "actualizado_en": sesion.actualizado_en,
    }


def poker_claim_ids(db: Session, session_id: int) -> List[int]:
    return [
        row[0]
        for row in db.query(PokerClaim.persona_id)
        .filter(PokerClaim.sesion_id == session_id)
        .all()
    ]


def retro_claim_ids(db: Session, retro_id: int) -> List[int]:
    return [
        row[0]
        for row in db.query(RetroClaim.persona_id)
        .filter(RetroClaim.retro_id == retro_id)
        .all()
    ]


def poker_vote_to_schema(vote: PokerVote) -> dict:
    nombre = ""
    if vote.persona:
        nombre = f"{vote.persona.nombre} {vote.persona.apellido}".strip()
    return {
        "id": vote.id,
        "sesion_id": vote.sesion_id,
        "persona_id": vote.persona_id,
        "persona_nombre": nombre,
        "valor": vote.valor,
        "creado_en": vote.creado_en,
        "actualizado_en": vote.actualizado_en,
    }


@router.get("/retros/{retro_id}/presence")
def obtener_retro_presencia(
    retro_id: int,
    scrum_session: Optional[str] = Cookie(default=None),
    db: Session = Depends(get_db),
):
    user = get_user_from_token(db, scrum_session)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    require_admin(user)
    retro = db.query(Retrospective).filter(Retrospective.id == retro_id).first()
    if not retro:
        raise HTTPException(status_code=404, detail="Retro no encontrada")
    return retro_ws_manager.build_presence_payload(retro.token)


@router.websocket("/ws/retros/{token}")
async def retro_ws(websocket: WebSocket, token: str) -> None:
    await retro_ws_manager.connect(token, websocket)
    await retro_ws_manager.broadcast_presence(token)
    try:
        while True:
            message = await websocket.receive_text()
            if not message or message == "ping":
                continue
            try:
                payload = json.loads(message)
            except json.JSONDecodeError:
                continue
            if not isinstance(payload, dict):
                continue
            if payload.get("type") == "join":
                persona_id = payload.get("persona_id")
                nombre = payload.get("nombre")
                retro_ws_manager.set_presence(
                    token,
                    websocket,
                    {
                        "persona_id": persona_id,
                        "nombre": nombre,
                    },
                )
                await retro_ws_manager.broadcast_presence(token)
            elif payload.get("type") == "leave":
                retro_ws_manager.clear_presence(token, websocket)
                await retro_ws_manager.broadcast_presence(token)
    except WebSocketDisconnect:
        retro_ws_manager.disconnect(token, websocket)
        await retro_ws_manager.broadcast_presence(token)
    except Exception:
        retro_ws_manager.disconnect(token, websocket)
        await retro_ws_manager.broadcast_presence(token)


@router.websocket("/ws/poker/{token}")
async def poker_ws(websocket: WebSocket, token: str) -> None:
    await poker_ws_manager.connect(token, websocket)
    await poker_ws_manager.broadcast_presence(token)
    try:
        while True:
            message = await websocket.receive_text()
            if not message or message == "ping":
                continue
            try:
                payload = json.loads(message)
            except json.JSONDecodeError:
                continue
            if not isinstance(payload, dict):
                continue
            if payload.get("type") == "join":
                persona_id = payload.get("persona_id")
                nombre = payload.get("nombre")
                accepted = poker_ws_manager.set_presence(
                    token,
                    websocket,
                    {"persona_id": persona_id, "nombre": nombre},
                )
                await poker_ws_manager.broadcast_presence(token)
            elif payload.get("type") == "leave":
                poker_ws_manager.clear_presence(token, websocket)
                await poker_ws_manager.broadcast_presence(token)
    except WebSocketDisconnect:
        poker_ws_manager.disconnect(token, websocket)
        await poker_ws_manager.broadcast_presence(token)
    except Exception:
        poker_ws_manager.disconnect(token, websocket)
        await poker_ws_manager.broadcast_presence(token)


@router.get("/oneonone-notes", response_model=OneOnOneNoteOut)
def obtener_oneonone(
    celula_id: int,
    persona_id: int,
    month: str,
    scrum_session: Optional[str] = Cookie(default=None),
    db: Session = Depends(get_db),
):
    user = get_user_from_token(db, scrum_session)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    require_admin(user)
    mes = parse_month(month)
    note = (
        db.query(OneOnOneNote)
        .filter(
            OneOnOneNote.celula_id == celula_id,
            OneOnOneNote.persona_id == persona_id,
            OneOnOneNote.mes == mes,
        )
        .first()
    )
    if not note:
        raise HTTPException(status_code=404, detail="Sin notas")
    return oneonone_to_schema(note)


@router.post("/oneonone-notes", response_model=OneOnOneNoteOut)
def guardar_oneonone(
    payload: OneOnOneNoteCreate,
    scrum_session: Optional[str] = Cookie(default=None),
    db: Session = Depends(get_db),
):
    user = get_user_from_token(db, scrum_session)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    require_admin(user)
    mes = parse_month(payload.mes)
    note = (
        db.query(OneOnOneNote)
        .filter(
            OneOnOneNote.celula_id == payload.celula_id,
            OneOnOneNote.persona_id == payload.persona_id,
            OneOnOneNote.mes == mes,
        )
        .first()
    )
    if not note:
        note = OneOnOneNote(
            celula_id=payload.celula_id,
            persona_id=payload.persona_id,
            mes=mes,
        )
        db.add(note)
    mood = (payload.mood or "").strip()
    note.checklist = encode_json_list(payload.checklist)
    note.agreements = encode_json_list(payload.agreements)
    note.mood = mood or None
    note.feedback_pos = (payload.feedback_pos or "").strip() or None
    note.feedback_neg = (payload.feedback_neg or "").strip() or None
    note.growth = (payload.growth or "").strip() or None
    note.actualizado_en = now_py()
    db.commit()
    db.refresh(note)
    return oneonone_to_schema(note)


@router.get("/oneonone-entries", response_model=List[OneOnOneEntryOut])
def listar_oneonone_entries(
    celula_id: int,
    persona_id: int,
    month: Optional[str] = None,
    scrum_session: Optional[str] = Cookie(default=None),
    db: Session = Depends(get_db),
):
    user = get_user_from_token(db, scrum_session)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    require_admin(user)
    query = db.query(OneOnOneEntry).filter(
        OneOnOneEntry.celula_id == celula_id,
        OneOnOneEntry.persona_id == persona_id,
    )
    if month:
        query = query.filter(OneOnOneEntry.mes == parse_month(month))
    entries = query.order_by(OneOnOneEntry.creado_en.desc()).all()
    return [oneonone_entry_to_schema(entry) for entry in entries]


@router.post("/oneonone-entries", response_model=OneOnOneEntryOut, status_code=status.HTTP_201_CREATED)
def crear_oneonone_entry(
    payload: OneOnOneEntryCreate,
    scrum_session: Optional[str] = Cookie(default=None),
    db: Session = Depends(get_db),
):
    user = get_user_from_token(db, scrum_session)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    require_admin(user)
    mes = parse_month(payload.mes)
    entry = OneOnOneEntry(
        celula_id=payload.celula_id,
        persona_id=payload.persona_id,
        mes=mes,
        tipo=(payload.tipo or "").strip().lower(),
        detalle=encode_json_value(payload.detalle),
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return oneonone_entry_to_schema(entry)


@router.get("/oneonone-sessions", response_model=List[OneOnOneSessionOut])
def listar_oneonone_sessions(
    celula_id: int,
    persona_id: int,
    scrum_session: Optional[str] = Cookie(default=None),
    db: Session = Depends(get_db),
):
    user = get_user_from_token(db, scrum_session)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    require_admin(user)
    sessions = (
        db.query(OneOnOneSession)
        .filter(
            OneOnOneSession.celula_id == celula_id,
            OneOnOneSession.persona_id == persona_id,
        )
        .order_by(OneOnOneSession.fecha.desc(), OneOnOneSession.id.desc())
        .all()
    )
    return [oneonone_session_to_schema(session) for session in sessions]


@router.post("/oneonone-sessions", response_model=OneOnOneSessionOut, status_code=status.HTTP_201_CREATED)
def crear_oneonone_session(
    payload: OneOnOneSessionCreate,
    scrum_session: Optional[str] = Cookie(default=None),
    db: Session = Depends(get_db),
):
    user = get_user_from_token(db, scrum_session)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    require_admin(user)
    session = OneOnOneSession(
        celula_id=payload.celula_id,
        persona_id=payload.persona_id,
        fecha=payload.fecha or now_py().date(),
        checklist=encode_json_list(payload.checklist),
        agreements=encode_json_list(payload.agreements),
        mood=(payload.mood or "").strip() or None,
        feedback_pos=(payload.feedback_pos or "").strip() or None,
        feedback_neg=(payload.feedback_neg or "").strip() or None,
        growth=(payload.growth or "").strip() or None,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return oneonone_session_to_schema(session)


@router.put("/oneonone-sessions/{session_id}", response_model=OneOnOneSessionOut)
def actualizar_oneonone_session(
    session_id: int,
    payload: OneOnOneSessionUpdate,
    scrum_session: Optional[str] = Cookie(default=None),
    db: Session = Depends(get_db),
):
    user = get_user_from_token(db, scrum_session)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    require_admin(user)
    session = db.get(OneOnOneSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    if payload.fecha is not None:
        session.fecha = payload.fecha
    if payload.checklist is not None:
        session.checklist = encode_json_list(payload.checklist)
    if payload.agreements is not None:
        session.agreements = encode_json_list(payload.agreements)
    if payload.mood is not None:
        session.mood = payload.mood.strip() or None
    if payload.feedback_pos is not None:
        session.feedback_pos = payload.feedback_pos.strip() or None
    if payload.feedback_neg is not None:
        session.feedback_neg = payload.feedback_neg.strip() or None
    if payload.growth is not None:
        session.growth = payload.growth.strip() or None
    session.actualizado_en = now_py()
    db.commit()
    db.refresh(session)
    return oneonone_session_to_schema(session)


@router.delete("/oneonone-sessions/{session_id}")
def eliminar_oneonone_session(
    session_id: int,
    scrum_session: Optional[str] = Cookie(default=None),
    db: Session = Depends(get_db),
):
    user = get_user_from_token(db, scrum_session)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    require_admin(user)
    session = db.get(OneOnOneSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    db.delete(session)
    db.commit()
    return {"ok": True}


@router.get("/retros", response_model=List[RetroOut])
def listar_retros(
    celula_id: int,
    sprint_id: Optional[int] = None,
    scrum_session: Optional[str] = Cookie(default=None),
    db: Session = Depends(get_db),
):
    user = get_user_from_token(db, scrum_session)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    require_admin(user)
    query = (
        db.query(Retrospective)
        .options(joinedload(Retrospective.items))
        .filter(Retrospective.celula_id == celula_id)
    )
    if sprint_id:
        query = query.filter(Retrospective.sprint_id == sprint_id)
    retros = query.order_by(Retrospective.actualizado_en.desc()).all()
    results = []
    for retro in retros:
        counts = {"bien": 0, "mal": 0, "compromiso": 0}
        for item in retro.items:
            if item.tipo in counts:
                counts[item.tipo] += 1
        results.append(retro_to_schema(retro, counts))
    return results


@router.get("/retros/compromisos", response_model=List[RetroCommitmentOut])
def listar_compromisos(
    celula_id: int,
    scrum_session: Optional[str] = Cookie(default=None),
    db: Session = Depends(get_db),
):
    user = get_user_from_token(db, scrum_session)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    require_admin(user)
    items = (
        db.query(RetrospectiveItem)
        .join(Retrospective, RetrospectiveItem.retro_id == Retrospective.id)
        .options(
            joinedload(RetrospectiveItem.retro).joinedload(Retrospective.sprint),
            joinedload(RetrospectiveItem.asignado),
        )
        .filter(
            Retrospective.celula_id == celula_id,
            RetrospectiveItem.tipo == "compromiso",
        )
        .order_by(Retrospective.sprint_id.desc(), RetrospectiveItem.fecha_compromiso.desc())
        .all()
    )
    results: list[dict] = []
    for item in items:
        sprint_nombre = ""
        if item.retro and item.retro.sprint:
            sprint_nombre = item.retro.sprint.nombre
        asignado_nombre = ""
        if item.asignado:
            asignado_nombre = f"{item.asignado.nombre} {item.asignado.apellido}".strip()
        results.append(
            {
                "id": item.id,
                "retro_id": item.retro_id,
                "sprint_id": item.retro.sprint_id if item.retro else 0,
                "sprint_nombre": sprint_nombre,
                "tipo": item.tipo,
                "detalle": item.detalle,
                "asignado_id": item.asignado_id,
                "asignado_nombre": asignado_nombre,
                "fecha_compromiso": item.fecha_compromiso,
                "estado": item.estado,
            }
        )
    return results


@router.post("/retros", response_model=RetroOut, status_code=status.HTTP_201_CREATED)
def crear_retro(
    payload: RetroCreate,
    scrum_session: Optional[str] = Cookie(default=None),
    db: Session = Depends(get_db),
):
    user = get_user_from_token(db, scrum_session)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    require_admin(user)
    retro = (
        db.query(Retrospective)
        .filter(
            Retrospective.celula_id == payload.celula_id,
            Retrospective.sprint_id == payload.sprint_id,
        )
        .first()
    )
    if retro:
        return retro_to_schema(retro)
    token = new_session_token()
    retro = Retrospective(
        celula_id=payload.celula_id,
        sprint_id=payload.sprint_id,
        token=token,
        fase="espera",
        creado_por=user.id,
    )
    db.add(retro)
    db.commit()
    db.refresh(retro)
    return retro_to_schema(retro)


@router.post(
    "/retros/{retro_id}/items",
    response_model=RetroItemOut,
    status_code=status.HTTP_201_CREATED,
)
def crear_retro_item(
    retro_id: int,
    payload: RetroItemCreate,
    scrum_session: Optional[str] = Cookie(default=None),
    db: Session = Depends(get_db),
):
    user = get_user_from_token(db, scrum_session)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    require_admin(user)
    retro = db.get(Retrospective, retro_id)
    if not retro:
        raise HTTPException(status_code=404, detail="Retrospectiva no encontrada")
    tipo = normalize_retro_tipo(payload.tipo)
    detalle = (payload.detalle or "").strip()
    if not detalle:
        raise HTTPException(status_code=400, detail="Detalle requerido")
    if tipo == "compromiso":
        if not payload.asignado_id or not payload.fecha_compromiso:
            raise HTTPException(status_code=400, detail="Compromiso requiere asignado y fecha")
    estado = normalize_retro_estado(payload.estado) if tipo == "compromiso" else "pendiente"
    item = RetrospectiveItem(
        retro_id=retro_id,
        tipo=tipo,
        detalle=detalle,
        persona_id=payload.persona_id,
        asignado_id=payload.asignado_id,
        fecha_compromiso=payload.fecha_compromiso,
        estado=estado,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    notify_retro(
        retro.token,
        {
            "type": "item_added",
            "retro_id": retro.id,
            "item": retro_item_to_schema(item),
        },
    )
    return retro_item_to_schema(item)


@router.put("/retros/{retro_id}/items/{item_id}", response_model=RetroItemOut)
def actualizar_retro_item(
    retro_id: int,
    item_id: int,
    payload: RetroItemUpdate,
    scrum_session: Optional[str] = Cookie(default=None),
    db: Session = Depends(get_db),
):
    user = get_user_from_token(db, scrum_session)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    require_admin(user)
    item = (
        db.query(RetrospectiveItem)
        .filter(RetrospectiveItem.retro_id == retro_id, RetrospectiveItem.id == item_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    if payload.detalle is not None:
        item.detalle = payload.detalle.strip()
    if payload.persona_id is not None:
        item.persona_id = payload.persona_id
    if payload.asignado_id is not None:
        item.asignado_id = payload.asignado_id
    if payload.fecha_compromiso is not None:
        item.fecha_compromiso = payload.fecha_compromiso
    if payload.estado is not None:
        item.estado = normalize_retro_estado(payload.estado)
    item.actualizado_en = now_py()
    db.commit()
    db.refresh(item)
    retro = db.get(Retrospective, retro_id)
    if retro:
        notify_retro(
            retro.token,
            {
                "type": "item_updated",
                "retro_id": retro.id,
                "item": retro_item_to_schema(item),
            },
        )
    return retro_item_to_schema(item)


@router.delete("/retros/{retro_id}/items/{item_id}")
def eliminar_retro_item(
    retro_id: int,
    item_id: int,
    scrum_session: Optional[str] = Cookie(default=None),
    db: Session = Depends(get_db),
):
    user = get_user_from_token(db, scrum_session)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    require_admin(user)
    item = (
        db.query(RetrospectiveItem)
        .filter(RetrospectiveItem.retro_id == retro_id, RetrospectiveItem.id == item_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    db.delete(item)
    db.commit()
    retro = db.get(Retrospective, retro_id)
    if retro:
        notify_retro(
            retro.token,
            {"type": "item_deleted", "retro_id": retro.id, "item_id": item_id},
        )
    return {"ok": True}


@router.get("/retros/public/{token}", response_model=RetroPublicOut)
def obtener_retro_publico(token: str, db: Session = Depends(get_db)):
    retro = (
        db.query(Retrospective)
        .options(joinedload(Retrospective.celula), joinedload(Retrospective.sprint))
        .filter(Retrospective.token == token)
        .first()
    )
    if not retro:
        raise HTTPException(status_code=404, detail="Retrospectiva no encontrada")
    personas = (
        db.query(Persona)
        .join(persona_celulas, persona_celulas.c.persona_id == Persona.id)
        .filter(persona_celulas.c.celula_id == retro.celula_id, Persona.activo.is_(True))
        .order_by(Persona.nombre, Persona.apellido)
        .all()
    )
    return {
        "id": retro.id,
        "celula_id": retro.celula_id,
        "sprint_id": retro.sprint_id,
        "celula_nombre": retro.celula.nombre if retro.celula else "",
        "sprint_nombre": retro.sprint.nombre if retro.sprint else "",
        "estado": retro.estado,
        "fase": retro.fase,
        "token": retro.token,
        "personas": [
            {
                "id": p.id,
                "nombre": p.nombre,
                "apellido": p.apellido,
                "activo": p.activo,
            }
            for p in personas
        ],
        "claimed_persona_ids": retro_claim_ids(db, retro.id),
    }


@router.get("/retros/public", response_model=RetroPublicOut)
def obtener_retro_publico_por_sprint(
    celula_id: int,
    sprint_id: int,
    db: Session = Depends(get_db),
):
    retro = (
        db.query(Retrospective)
        .options(joinedload(Retrospective.celula), joinedload(Retrospective.sprint))
        .filter(
            Retrospective.celula_id == celula_id,
            Retrospective.sprint_id == sprint_id,
            Retrospective.estado == "abierta",
        )
        .order_by(Retrospective.actualizado_en.desc())
        .first()
    )
    if not retro:
        raise HTTPException(status_code=404, detail="Retrospectiva no encontrada")
    personas = (
        db.query(Persona)
        .join(persona_celulas, persona_celulas.c.persona_id == Persona.id)
        .filter(persona_celulas.c.celula_id == retro.celula_id, Persona.activo.is_(True))
        .order_by(Persona.nombre, Persona.apellido)
        .all()
    )
    return {
        "id": retro.id,
        "celula_id": retro.celula_id,
        "sprint_id": retro.sprint_id,
        "celula_nombre": retro.celula.nombre if retro.celula else "",
        "sprint_nombre": retro.sprint.nombre if retro.sprint else "",
        "estado": retro.estado,
        "fase": retro.fase,
        "token": retro.token,
        "personas": [
            {
                "id": p.id,
                "nombre": p.nombre,
                "apellido": p.apellido,
                "activo": p.activo,
            }
            for p in personas
        ],
        "claimed_persona_ids": retro_claim_ids(db, retro.id),
    }


@router.post("/retros/public/{token}/claim")
def reclamar_retro_persona(
    token: str,
    payload: RetroClaimCreate,
    db: Session = Depends(get_db),
):
    retro = db.query(Retrospective).filter(Retrospective.token == token).first()
    if not retro:
        raise HTTPException(status_code=404, detail="Retrospectiva no encontrada")
    if retro.estado != "abierta":
        raise HTTPException(status_code=403, detail="Retrospectiva cerrada")
    persona = (
        db.query(Persona)
        .join(persona_celulas, persona_celulas.c.persona_id == Persona.id)
        .filter(
            Persona.id == payload.persona_id,
            persona_celulas.c.celula_id == retro.celula_id,
            Persona.activo.is_(True),
        )
        .first()
    )
    if not persona:
        raise HTTPException(status_code=404, detail="Persona no encontrada")
    existing = (
        db.query(RetroClaim)
        .filter(RetroClaim.retro_id == retro.id, RetroClaim.persona_id == persona.id)
        .first()
    )
    if existing:
        if payload.client_id and existing.client_id == payload.client_id:
            claims = retro_claim_ids(db, retro.id)
            return {"ok": True, "claimed": claims}
        raise HTTPException(status_code=409, detail="Nombre ya seleccionado")
    claim = RetroClaim(
        retro_id=retro.id,
        persona_id=persona.id,
        client_id=payload.client_id,
    )
    db.add(claim)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Nombre ya seleccionado")
    claims = retro_claim_ids(db, retro.id)
    notify_retro(retro.token, {"type": "claims_updated", "claims": claims})
    return {"ok": True, "claimed": claims}


@router.delete("/retros/public/{token}/claim/{persona_id}")
def liberar_retro_persona(
    token: str,
    persona_id: int,
    db: Session = Depends(get_db),
):
    retro = db.query(Retrospective).filter(Retrospective.token == token).first()
    if not retro:
        raise HTTPException(status_code=404, detail="Retrospectiva no encontrada")
    db.query(RetroClaim).filter(
        RetroClaim.retro_id == retro.id, RetroClaim.persona_id == persona_id
    ).delete()
    db.commit()
    claims = retro_claim_ids(db, retro.id)
    notify_retro(retro.token, {"type": "claims_updated", "claims": claims})
    return {"ok": True, "claimed": claims}


@router.get("/retros/{retro_id}", response_model=RetroDetailOut)
def obtener_retro(
    retro_id: int,
    scrum_session: Optional[str] = Cookie(default=None),
    db: Session = Depends(get_db),
):
    user = get_user_from_token(db, scrum_session)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    require_admin(user)
    retro = (
        db.query(Retrospective)
        .options(joinedload(Retrospective.items))
        .filter(Retrospective.id == retro_id)
        .first()
    )
    if not retro:
        raise HTTPException(status_code=404, detail="Retrospectiva no encontrada")
    items = [retro_item_to_schema(item) for item in retro.items]
    return {"retro": retro_to_schema(retro), "items": items}


@router.post(
    "/retros/public/{token}/items",
    response_model=RetroItemOut,
    status_code=status.HTTP_201_CREATED,
)
def crear_retro_item_publico(
    token: str,
    payload: RetroPublicItemCreate,
    db: Session = Depends(get_db),
):
    retro = db.query(Retrospective).filter(Retrospective.token == token).first()
    if not retro:
        raise HTTPException(status_code=404, detail="Retrospectiva no encontrada")
    if retro.estado != "abierta":
        raise HTTPException(status_code=403, detail="Retrospectiva cerrada")
    if retro.fase not in {"bien", "mal"}:
        raise HTTPException(status_code=403, detail="Esperando inicio del SM")
    tipo = normalize_retro_tipo(payload.tipo)
    if tipo == "compromiso":
        raise HTTPException(status_code=403, detail="Compromisos solo SM")
    if retro.fase != tipo:
        raise HTTPException(status_code=400, detail="Fase actual distinta")
    detalle = (payload.detalle or "").strip()
    if not detalle:
        raise HTTPException(status_code=400, detail="Detalle requerido")
    estado = "pendiente" if tipo == "compromiso" else "pendiente"
    item = RetrospectiveItem(
        retro_id=retro.id,
        tipo=tipo,
        detalle=detalle,
        persona_id=payload.persona_id,
        asignado_id=payload.asignado_id,
        fecha_compromiso=payload.fecha_compromiso,
        estado=estado,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    notify_retro(
        retro.token,
        {
            "type": "item_added",
            "retro_id": retro.id,
            "item": retro_item_to_schema(item),
        },
    )
    return retro_item_to_schema(item)


@router.get("/poker/sessions", response_model=List[PokerSessionOut])
def listar_poker_sesiones(
    celula_id: Optional[int] = None,
    scrum_session: Optional[str] = Cookie(default=None),
    db: Session = Depends(get_db),
):
    user = get_user_from_token(db, scrum_session)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    require_admin(user)
    query = db.query(PokerSession)
    if celula_id:
        query = query.filter(PokerSession.celula_id == celula_id)
    sesiones = query.order_by(PokerSession.actualizado_en.desc()).all()
    return [poker_to_schema(sesion) for sesion in sesiones]


@router.post("/poker/sessions", response_model=PokerSessionOut, status_code=status.HTTP_201_CREATED)
def crear_poker_sesion(
    payload: PokerSessionCreate,
    scrum_session: Optional[str] = Cookie(default=None),
    db: Session = Depends(get_db),
):
    user = get_user_from_token(db, scrum_session)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    require_admin(user)
    existente = (
        db.query(PokerSession)
        .filter(PokerSession.celula_id == payload.celula_id, PokerSession.estado == "abierta")
        .first()
    )
    if existente:
        # Reinicia presencia para permitir nueva seleccion de nombres
        poker_ws_manager.presence.pop(existente.token, None)
        db.query(PokerClaim).filter(PokerClaim.sesion_id == existente.id).delete()
        db.commit()
        try:
            anyio.from_thread.run(
                poker_ws_manager.broadcast_presence, existente.token
            )
        except RuntimeError:
            pass
        try:
            notify_poker(
                existente.token,
                {"type": "claims_updated", "claims": []},
            )
        except Exception:
            pass
        if existente.fase != "votacion":
            existente.fase = "votacion"
            existente.actualizado_en = now_py()
            db.commit()
            db.refresh(existente)
        return poker_to_schema(existente)
    token = new_session_token()
    sesion = PokerSession(
        celula_id=payload.celula_id,
        token=token,
        estado="abierta",
        fase="votacion",
        creado_por=user.id,
    )
    db.add(sesion)
    db.commit()
    db.refresh(sesion)
    return poker_to_schema(sesion)


@router.get("/poker/sessions/{session_id}", response_model=PokerSessionDetailOut)
def obtener_poker_sesion(
    session_id: int,
    scrum_session: Optional[str] = Cookie(default=None),
    db: Session = Depends(get_db),
):
    user = get_user_from_token(db, scrum_session)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    require_admin(user)
    sesion = (
        db.query(PokerSession)
        .options(joinedload(PokerSession.votos).joinedload(PokerVote.persona))
        .filter(PokerSession.id == session_id)
        .first()
    )
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesion no encontrada")
    votos = [poker_vote_to_schema(vote) for vote in sesion.votos]
    return {"sesion": poker_to_schema(sesion), "votos": votos}


@router.put("/poker/sessions/{session_id}", response_model=PokerSessionOut)
def actualizar_poker_sesion(
    session_id: int,
    payload: PokerSessionUpdate,
    scrum_session: Optional[str] = Cookie(default=None),
    db: Session = Depends(get_db),
):
    user = get_user_from_token(db, scrum_session)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    require_admin(user)
    sesion = db.get(PokerSession, session_id)
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesion no encontrada")
    closing = False
    if payload.estado is not None:
        sesion.estado = normalize_poker_estado(payload.estado)
        closing = sesion.estado == "cerrada"
    if payload.fase is not None:
        next_fase = normalize_poker_fase(payload.fase)
        if next_fase == "votacion":
            db.query(PokerVote).filter(PokerVote.sesion_id == sesion.id).delete()
        sesion.fase = next_fase
    sesion.actualizado_en = now_py()
    db.commit()
    db.refresh(sesion)
    notify_poker(sesion.token, {"type": "session_updated", "session_id": sesion.id})
    if closing:
        db.query(PokerClaim).filter(PokerClaim.sesion_id == sesion.id).delete()
        db.commit()
        try:
            notify_poker(
                sesion.token,
                {"type": "claims_updated", "claims": []},
            )
        except Exception:
            pass
        try:
            anyio.from_thread.run(poker_ws_manager.close_all, sesion.token)
        except RuntimeError:
            pass
    return poker_to_schema(sesion)


@router.get("/poker/sessions/{session_id}/presence")
def obtener_poker_presencia(
    session_id: int,
    scrum_session: Optional[str] = Cookie(default=None),
    db: Session = Depends(get_db),
):
    user = get_user_from_token(db, scrum_session)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    require_admin(user)
    sesion = db.get(PokerSession, session_id)
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesion no encontrada")
    return poker_ws_manager.build_presence_payload(sesion.token)


@router.get("/poker/public/{token}", response_model=PokerPublicOut)
def obtener_poker_publico(token: str, db: Session = Depends(get_db)):
    sesion = (
        db.query(PokerSession)
        .options(joinedload(PokerSession.celula))
        .filter(PokerSession.token == token)
        .first()
    )
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesion no encontrada")
    personas = (
        db.query(Persona)
        .join(persona_celulas, persona_celulas.c.persona_id == Persona.id)
        .filter(persona_celulas.c.celula_id == sesion.celula_id, Persona.activo.is_(True))
        .order_by(Persona.nombre, Persona.apellido)
        .all()
    )
    return {
        "id": sesion.id,
        "celula_id": sesion.celula_id,
        "celula_nombre": sesion.celula.nombre if sesion.celula else "",
        "estado": sesion.estado,
        "fase": sesion.fase,
        "token": sesion.token,
        "personas": [
            {"id": p.id, "nombre": p.nombre, "apellido": p.apellido, "activo": p.activo}
            for p in personas
        ],
        "claimed_persona_ids": poker_claim_ids(db, sesion.id),
    }


@router.get("/poker/public", response_model=PokerPublicOut)
def obtener_poker_publico_por_celula(celula_id: int, db: Session = Depends(get_db)):
    sesion = (
        db.query(PokerSession)
        .options(joinedload(PokerSession.celula))
        .filter(PokerSession.celula_id == celula_id, PokerSession.estado == "abierta")
        .order_by(PokerSession.actualizado_en.desc())
        .first()
    )
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesion no encontrada")
    personas = (
        db.query(Persona)
        .join(persona_celulas, persona_celulas.c.persona_id == Persona.id)
        .filter(persona_celulas.c.celula_id == sesion.celula_id, Persona.activo.is_(True))
        .order_by(Persona.nombre, Persona.apellido)
        .all()
    )
    return {
        "id": sesion.id,
        "celula_id": sesion.celula_id,
        "celula_nombre": sesion.celula.nombre if sesion.celula else "",
        "estado": sesion.estado,
        "fase": sesion.fase,
        "token": sesion.token,
        "personas": [
            {"id": p.id, "nombre": p.nombre, "apellido": p.apellido, "activo": p.activo}
            for p in personas
        ],
        "claimed_persona_ids": poker_claim_ids(db, sesion.id),
    }


@router.post("/poker/public/{token}/claim")
def reclamar_poker_persona(
    token: str,
    payload: PokerClaimCreate,
    db: Session = Depends(get_db),
):
    sesion = db.query(PokerSession).filter(PokerSession.token == token).first()
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesion no encontrada")
    if sesion.estado != "abierta":
        raise HTTPException(status_code=403, detail="Sesion cerrada")
    persona = (
        db.query(Persona)
        .join(persona_celulas, persona_celulas.c.persona_id == Persona.id)
        .filter(
            Persona.id == payload.persona_id,
            persona_celulas.c.celula_id == sesion.celula_id,
            Persona.activo.is_(True),
        )
        .first()
    )
    if not persona:
        raise HTTPException(status_code=404, detail="Persona no encontrada")
    existing = (
        db.query(PokerClaim)
        .filter(PokerClaim.sesion_id == sesion.id, PokerClaim.persona_id == persona.id)
        .first()
    )
    if existing:
        if payload.client_id and existing.client_id == payload.client_id:
            claims = poker_claim_ids(db, sesion.id)
            return {"ok": True, "claimed": claims}
        raise HTTPException(status_code=409, detail="Nombre ya seleccionado")
    claim = PokerClaim(
        sesion_id=sesion.id,
        persona_id=persona.id,
        client_id=payload.client_id,
    )
    db.add(claim)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Nombre ya seleccionado")
    claims = poker_claim_ids(db, sesion.id)
    notify_poker(sesion.token, {"type": "claims_updated", "claims": claims})
    return {"ok": True, "claimed": claims}


@router.delete("/poker/public/{token}/claim/{persona_id}")
def liberar_poker_persona(
    token: str,
    persona_id: int,
    db: Session = Depends(get_db),
):
    sesion = db.query(PokerSession).filter(PokerSession.token == token).first()
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesion no encontrada")
    db.query(PokerClaim).filter(
        PokerClaim.sesion_id == sesion.id, PokerClaim.persona_id == persona_id
    ).delete()
    db.commit()
    claims = poker_claim_ids(db, sesion.id)
    notify_poker(sesion.token, {"type": "claims_updated", "claims": claims})
    return {"ok": True, "claimed": claims}


@router.post(
    "/poker/public/{token}/vote",
    response_model=PokerVoteOut,
    status_code=status.HTTP_201_CREATED,
)
def crear_poker_voto_publico(
    token: str,
    payload: PokerPublicVoteCreate,
    db: Session = Depends(get_db),
):
    sesion = db.query(PokerSession).filter(PokerSession.token == token).first()
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesion no encontrada")
    if sesion.estado != "abierta":
        raise HTTPException(status_code=403, detail="Sesion cerrada")
    if sesion.fase not in {"votacion", "espera"}:
        raise HTTPException(status_code=403, detail="Votacion no habilitada")
    if payload.valor not in {1, 2, 3, 5, 8, 13, 21}:
        raise HTTPException(status_code=400, detail="Valor invalido")
    persona = (
        db.query(Persona)
        .join(persona_celulas, persona_celulas.c.persona_id == Persona.id)
        .filter(
            Persona.id == payload.persona_id,
            persona_celulas.c.celula_id == sesion.celula_id,
            Persona.activo.is_(True),
        )
        .first()
    )
    if not persona:
        raise HTTPException(status_code=404, detail="Persona no encontrada")
    vote = (
        db.query(PokerVote)
        .filter(PokerVote.sesion_id == sesion.id, PokerVote.persona_id == persona.id)
        .first()
    )
    if not vote:
        vote = PokerVote(
            sesion_id=sesion.id,
            persona_id=persona.id,
            valor=payload.valor,
        )
        db.add(vote)
    else:
        vote.valor = payload.valor
    vote.actualizado_en = now_py()
    db.commit()
    db.refresh(vote)
    notify_poker(
        sesion.token,
        {
            "type": "vote_cast",
            "session_id": sesion.id,
            "persona_id": vote.persona_id,
            "valor": vote.valor,
        },
    )
    return poker_vote_to_schema(vote)


@router.put("/retros/{retro_id}", response_model=RetroOut)
def actualizar_retro(
    retro_id: int,
    payload: RetroUpdate,
    scrum_session: Optional[str] = Cookie(default=None),
    db: Session = Depends(get_db),
):
    user = get_user_from_token(db, scrum_session)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    require_admin(user)
    retro = db.get(Retrospective, retro_id)
    if not retro:
        raise HTTPException(status_code=404, detail="Retrospectiva no encontrada")
    closing = False
    if payload.estado is not None:
        retro.estado = normalize_retro_estado_general(payload.estado)
        closing = retro.estado == "cerrada"
    if payload.fase is not None:
        retro.fase = normalize_retro_fase(payload.fase)
    retro.actualizado_en = now_py()
    db.commit()
    db.refresh(retro)
    notify_retro(
        retro.token,
        {
            "type": "retro_updated",
            "retro_id": retro.id,
            "fase": retro.fase,
            "estado": retro.estado,
        },
    )
    if closing:
        db.query(RetroClaim).filter(RetroClaim.retro_id == retro.id).delete()
        db.commit()
        try:
            notify_retro(retro.token, {"type": "claims_updated", "claims": []})
        except Exception:
            pass
        try:
            anyio.from_thread.run(retro_ws_manager.close_all, retro.token)
        except RuntimeError:
            pass
    return retro_to_schema(retro)


@router.delete("/retros/{retro_id}")
def eliminar_retro(
    retro_id: int,
    scrum_session: Optional[str] = Cookie(default=None),
    db: Session = Depends(get_db),
):
    user = get_user_from_token(db, scrum_session)
    if not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    require_admin(user)
    retro = db.get(Retrospective, retro_id)
    if not retro:
        raise HTTPException(status_code=404, detail="Retrospectiva no encontrada")
    token = retro.token
    db.delete(retro)
    db.commit()
    notify_retro(token, {"type": "retro_deleted", "retro_id": retro_id})
    return {"ok": True}


@router.get("/celulas", response_model=List[CelulaOut])
def listar_celulas(db: Session = Depends(get_db)):
    return db.query(Celula).order_by(Celula.id).all()


@router.post("/celulas", response_model=CelulaOut, status_code=status.HTTP_201_CREATED)
def crear_celula(payload: CelulaCreate, db: Session = Depends(get_db)):
    existente = db.query(Celula).filter(Celula.nombre == payload.nombre).first()
    if existente:
        raise HTTPException(status_code=409, detail="Celula ya existe")
    jira_codigo = normalize_jira_code(payload.jira_codigo)
    if not jira_codigo:
        raise HTTPException(status_code=400, detail="Codigo JIRA requerido")
    existe_codigo = db.query(Celula).filter(Celula.jira_codigo == jira_codigo).first()
    if existe_codigo:
        raise HTTPException(status_code=409, detail="Codigo JIRA ya existe")
    celula = Celula(nombre=payload.nombre, jira_codigo=jira_codigo, activa=payload.activa)
    db.add(celula)
    db.commit()
    db.refresh(celula)
    return celula


@router.put("/celulas/{celula_id}", response_model=CelulaOut)
def actualizar_celula(celula_id: int, payload: CelulaUpdate, db: Session = Depends(get_db)):
    celula = db.get(Celula, celula_id)
    if not celula:
        raise HTTPException(status_code=404, detail="Celula no encontrada")
    if payload.nombre is not None:
        celula.nombre = payload.nombre
    if payload.jira_codigo is not None:
        jira_codigo = normalize_jira_code(payload.jira_codigo)
        if not jira_codigo:
            raise HTTPException(status_code=400, detail="Codigo JIRA requerido")
        existe_codigo = (
            db.query(Celula)
            .filter(Celula.jira_codigo == jira_codigo, Celula.id != celula_id)
            .first()
        )
        if existe_codigo:
            raise HTTPException(status_code=409, detail="Codigo JIRA ya existe")
        celula.jira_codigo = jira_codigo
    if payload.activa is not None:
        celula.activa = payload.activa
    db.commit()
    db.refresh(celula)
    return celula


@router.delete("/celulas/{celula_id}", response_model=CelulaOut)
def desactivar_celula(celula_id: int, db: Session = Depends(get_db)):
    celula = db.get(Celula, celula_id)
    if not celula:
        raise HTTPException(status_code=404, detail="Celula no encontrada")
    sprint_ids = [
        sprint_id for (sprint_id,) in db.query(Sprint.id).filter(Sprint.celula_id == celula_id).all()
    ]
    if sprint_ids:
        db.query(Evento).filter(Evento.sprint_id.in_(sprint_ids)).delete(
            synchronize_session=False
        )
    db.query(Sprint).filter(Sprint.celula_id == celula_id).delete(synchronize_session=False)
    db.execute(persona_celulas.delete().where(persona_celulas.c.celula_id == celula_id))
    db.delete(celula)
    db.commit()
    return celula


@router.get("/personas", response_model=List[PersonaOut])
def listar_personas(db: Session = Depends(get_db)):
    return db.query(Persona).order_by(Persona.id).all()


@router.post("/personas", response_model=PersonaOut, status_code=status.HTTP_201_CREATED)
def crear_persona(payload: PersonaCreate, db: Session = Depends(get_db)):
    celulas = []
    if payload.celulas_ids is not None:
        if payload.celulas_ids:
            celulas = db.query(Celula).filter(Celula.id.in_(payload.celulas_ids)).all()
            if len(celulas) != len(payload.celulas_ids):
                raise HTTPException(status_code=404, detail="Celula no encontrada")
    persona = Persona(
        nombre=payload.nombre,
        apellido=payload.apellido,
        rol=payload.rol,
        capacidad_diaria_horas=payload.capacidad_diaria_horas,
        fecha_cumple=payload.fecha_cumple,
        jira_usuario=(payload.jira_usuario or None),
        activo=payload.activo,
        celulas=celulas,
    )
    db.add(persona)
    db.commit()
    db.refresh(persona)
    return persona


@router.put("/personas/{persona_id}", response_model=PersonaOut)
def actualizar_persona(persona_id: int, payload: PersonaUpdate, db: Session = Depends(get_db)):
    persona = db.get(Persona, persona_id)
    if not persona:
        raise HTTPException(status_code=404, detail="Persona no encontrada")
    if payload.celulas_ids is not None:
        if payload.celulas_ids:
            celulas = db.query(Celula).filter(Celula.id.in_(payload.celulas_ids)).all()
            if len(celulas) != len(payload.celulas_ids):
                raise HTTPException(status_code=404, detail="Celula no encontrada")
            persona.celulas = celulas
        else:
            persona.celulas = []
    if payload.nombre is not None:
        persona.nombre = payload.nombre
    if payload.apellido is not None:
        persona.apellido = payload.apellido
    if payload.rol is not None:
        persona.rol = payload.rol
    if payload.capacidad_diaria_horas is not None:
        persona.capacidad_diaria_horas = payload.capacidad_diaria_horas
    if payload.fecha_cumple is not None:
        persona.fecha_cumple = payload.fecha_cumple
    if payload.jira_usuario is not None:
        persona.jira_usuario = payload.jira_usuario or None
    if payload.activo is not None:
        persona.activo = payload.activo
    db.commit()
    db.refresh(persona)
    return persona


@router.delete("/personas/{persona_id}", response_model=PersonaOut)
def desactivar_persona(persona_id: int, db: Session = Depends(get_db)):
    persona = db.get(Persona, persona_id)
    if not persona:
        raise HTTPException(status_code=404, detail="Persona no encontrada")
    db.query(Evento).filter(Evento.persona_id == persona_id).delete(synchronize_session=False)
    db.execute(
        persona_celulas.delete().where(persona_celulas.c.persona_id == persona_id)
    )
    db.delete(persona)
    db.commit()
    return persona


@router.get("/feriados", response_model=List[FeriadoOut])
def listar_feriados(db: Session = Depends(get_db)):
    return db.query(Feriado).order_by(Feriado.fecha).all()


@router.post("/feriados", response_model=FeriadoOut, status_code=status.HTTP_201_CREATED)
def crear_feriado(payload: FeriadoCreate, db: Session = Depends(get_db)):
    existente = db.query(Feriado).filter(Feriado.fecha == payload.fecha).first()
    if existente:
        raise HTTPException(status_code=409, detail="Feriado ya existe")
    if payload.tipo == "interno" and not payload.celula_id:
        raise HTTPException(status_code=400, detail="Feriado interno requiere celula")
    if payload.celula_id is not None and not db.get(Celula, payload.celula_id):
        raise HTTPException(status_code=404, detail="Celula no encontrada")
    feriado = Feriado(
        fecha=payload.fecha,
        nombre=payload.nombre,
        tipo=payload.tipo,
        celula_id=payload.celula_id,
        activo=payload.activo,
    )
    db.add(feriado)
    db.commit()
    db.refresh(feriado)
    return feriado


@router.put("/feriados/{feriado_id}", response_model=FeriadoOut)
def actualizar_feriado(feriado_id: int, payload: FeriadoUpdate, db: Session = Depends(get_db)):
    feriado = db.get(Feriado, feriado_id)
    if not feriado:
        raise HTTPException(status_code=404, detail="Feriado no encontrado")
    if payload.fecha is not None:
        existente = db.query(Feriado).filter(Feriado.fecha == payload.fecha, Feriado.id != feriado_id).first()
        if existente:
            raise HTTPException(status_code=409, detail="Feriado ya existe")
        feriado.fecha = payload.fecha
    if payload.nombre is not None:
        feriado.nombre = payload.nombre
    if payload.tipo is not None:
        feriado.tipo = payload.tipo
    if payload.celula_id is not None:
        if not db.get(Celula, payload.celula_id):
            raise HTTPException(status_code=404, detail="Celula no encontrada")
        feriado.celula_id = payload.celula_id
    if feriado.tipo == "interno" and not feriado.celula_id:
        raise HTTPException(status_code=400, detail="Feriado interno requiere celula")
    if payload.activo is not None:
        feriado.activo = payload.activo
    db.commit()
    db.refresh(feriado)
    return feriado


@router.delete("/feriados/{feriado_id}", response_model=FeriadoOut)
def desactivar_feriado(feriado_id: int, db: Session = Depends(get_db)):
    feriado = db.get(Feriado, feriado_id)
    if not feriado:
        raise HTTPException(status_code=404, detail="Feriado no encontrado")
    db.delete(feriado)
    db.commit()
    return feriado


@router.get("/sprints", response_model=List[SprintOut])
def listar_sprints(db: Session = Depends(get_db)):
    return db.query(Sprint).order_by(Sprint.fecha_inicio.desc()).all()


@router.post("/sprints", response_model=SprintOut, status_code=status.HTTP_201_CREATED)
def crear_sprint(payload: SprintCreate, db: Session = Depends(get_db)):
    if payload.fecha_inicio > payload.fecha_fin:
        raise HTTPException(status_code=400, detail="Rango de fechas invalido")
    celula = db.get(Celula, payload.celula_id)
    if not celula:
        raise HTTPException(status_code=404, detail="Celula no encontrada")
    sprint = Sprint(
        nombre=payload.nombre,
        celula_id=payload.celula_id,
        fecha_inicio=payload.fecha_inicio,
        fecha_fin=payload.fecha_fin,
    )
    db.add(sprint)
    db.commit()
    db.refresh(sprint)
    return sprint


@router.put("/sprints/{sprint_id}", response_model=SprintOut)
def actualizar_sprint(sprint_id: int, payload: SprintUpdate, db: Session = Depends(get_db)):
    sprint = db.get(Sprint, sprint_id)
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint no encontrado")
    if payload.celula_id is not None:
        celula = db.get(Celula, payload.celula_id)
        if not celula:
            raise HTTPException(status_code=404, detail="Celula no encontrada")
        sprint.celula_id = payload.celula_id
    if payload.nombre is not None:
        sprint.nombre = payload.nombre
    if payload.fecha_inicio is not None:
        sprint.fecha_inicio = payload.fecha_inicio
    if payload.fecha_fin is not None:
        sprint.fecha_fin = payload.fecha_fin
    if sprint.fecha_inicio > sprint.fecha_fin:
        raise HTTPException(status_code=400, detail="Rango de fechas invalido")
    db.commit()
    db.refresh(sprint)
    return sprint


@router.delete("/sprints/{sprint_id}", response_model=SprintOut)
def eliminar_sprint(sprint_id: int, db: Session = Depends(get_db)):
    sprint = db.get(Sprint, sprint_id)
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint no encontrado")
    db.query(SprintItem).filter(SprintItem.sprint_id == sprint_id).delete(
        synchronize_session=False
    )
    db.query(Evento).filter(Evento.sprint_id == sprint_id).delete(synchronize_session=False)
    db.delete(sprint)
    db.commit()
    return sprint


@router.get("/eventos", response_model=List[EventoOut])
def listar_eventos(db: Session = Depends(get_db)):
    return db.query(Evento).order_by(Evento.creado_en.desc()).all()


@router.get("/eventos-tipo", response_model=List[EventoTipoOut])
def listar_eventos_tipo(db: Session = Depends(get_db)):
    return db.query(EventoTipo).order_by(EventoTipo.nombre).all()


@router.post("/eventos-tipo", response_model=EventoTipoOut, status_code=status.HTTP_201_CREATED)
def crear_evento_tipo(payload: EventoTipoCreate, db: Session = Depends(get_db)):
    nombre = payload.nombre.strip()
    existente = db.query(EventoTipo).filter(func.lower(EventoTipo.nombre) == nombre.lower()).first()
    if existente:
        raise HTTPException(status_code=409, detail="Tipo de evento ya existe")
    tipo = EventoTipo(
        nombre=nombre,
        impacto_capacidad=payload.impacto_capacidad,
        planificado=payload.planificado,
        prioridad=(payload.prioridad or "normal").strip().lower(),
        activo=payload.activo,
    )
    db.add(tipo)
    db.commit()
    db.refresh(tipo)
    return tipo


@router.put("/eventos-tipo/{tipo_id}", response_model=EventoTipoOut)
def actualizar_evento_tipo(
    tipo_id: int, payload: EventoTipoUpdate, db: Session = Depends(get_db)
):
    tipo = db.get(EventoTipo, tipo_id)
    if not tipo:
        raise HTTPException(status_code=404, detail="Tipo de evento no encontrado")
    if payload.nombre is not None:
        nombre = payload.nombre.strip()
        existente = (
            db.query(EventoTipo)
            .filter(func.lower(EventoTipo.nombre) == nombre.lower(), EventoTipo.id != tipo_id)
            .first()
        )
        if existente:
            raise HTTPException(status_code=409, detail="Tipo de evento ya existe")
        tipo.nombre = nombre
    if payload.impacto_capacidad is not None:
        tipo.impacto_capacidad = payload.impacto_capacidad
    if payload.planificado is not None:
        tipo.planificado = payload.planificado
    if payload.prioridad is not None:
        tipo.prioridad = payload.prioridad.strip().lower()
    if payload.activo is not None:
        tipo.activo = payload.activo
    db.commit()
    db.refresh(tipo)
    return tipo


@router.delete("/eventos-tipo/{tipo_id}", response_model=EventoTipoOut)
def eliminar_evento_tipo(tipo_id: int, db: Session = Depends(get_db)):
    tipo = db.get(EventoTipo, tipo_id)
    if not tipo:
        raise HTTPException(status_code=404, detail="Tipo de evento no encontrado")
    en_uso = (
        db.query(Evento).filter(Evento.tipo_evento_id == tipo_id).first()
    )
    if en_uso:
        raise HTTPException(status_code=409, detail="Tipo de evento en uso")
    db.delete(tipo)
    db.commit()
    return tipo


@router.get("/sprint-items", response_model=List[SprintItemOut])
def listar_sprint_items(
    celula_id: Optional[int] = None,
    sprint_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    query = db.query(SprintItem).order_by(SprintItem.creado_en.desc())
    if celula_id is not None:
        query = query.filter(SprintItem.celula_id == celula_id)
    if sprint_id is not None:
        query = query.filter(SprintItem.sprint_id == sprint_id)
    return query.all()


@router.post("/sprint-items", response_model=SprintItemOut, status_code=status.HTTP_201_CREATED)
def crear_sprint_item(payload: SprintItemCreate, db: Session = Depends(get_db)):
    celula = db.get(Celula, payload.celula_id)
    if not celula:
        raise HTTPException(status_code=404, detail="Celula no encontrada")
    sprint = db.get(Sprint, payload.sprint_id)
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint no encontrado")
    if sprint.celula_id != celula.id:
        raise HTTPException(status_code=400, detail="Sprint no pertenece a la celula")
    if payload.persona_id is not None:
        persona = db.get(Persona, payload.persona_id)
        if not persona:
            raise HTTPException(status_code=404, detail="Persona no encontrada")

    item = SprintItem(
        celula_id=payload.celula_id,
        sprint_id=payload.sprint_id,
        persona_id=payload.persona_id,
        assignee_nombre=payload.assignee_nombre,
        issue_key=payload.issue_key,
        issue_type=payload.issue_type,
        summary=payload.summary,
        status=payload.status,
        story_points=payload.story_points,
        start_date=payload.start_date,
        end_date=payload.end_date,
        due_date=payload.due_date,
    )
    try:
        db.add(item)
        db.commit()
        db.refresh(item)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="Issue ya existe en este sprint"
        )
    return item


@router.put("/sprint-items/{item_id}", response_model=SprintItemOut)
def actualizar_sprint_item(
    item_id: int, payload: SprintItemUpdate, db: Session = Depends(get_db)
):
    item = db.get(SprintItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado")
    data = payload.model_dump(exclude_unset=True)
    if "sprint_id" in data and data["sprint_id"] is not None:
        sprint = db.get(Sprint, data["sprint_id"])
        if not sprint:
            raise HTTPException(status_code=404, detail="Sprint no encontrado")
        if sprint.celula_id != item.celula_id:
            raise HTTPException(status_code=400, detail="Sprint no pertenece a la celula")
        item.sprint_id = data["sprint_id"]
    if "persona_id" in data:
        persona_id = data["persona_id"]
        if persona_id is not None:
            persona = db.get(Persona, persona_id)
            if not persona:
                raise HTTPException(status_code=404, detail="Persona no encontrada")
        item.persona_id = persona_id
    if "assignee_nombre" in data:
        item.assignee_nombre = data["assignee_nombre"]
    if "issue_key" in data:
        item.issue_key = data["issue_key"]
    if "issue_type" in data:
        item.issue_type = data["issue_type"]
    if "summary" in data:
        item.summary = data["summary"]
    if "status" in data:
        item.status = data["status"]
    if "story_points" in data:
        item.story_points = data["story_points"]
    if "start_date" in data:
        item.start_date = data["start_date"]
    if "end_date" in data:
        item.end_date = data["end_date"]
    if "due_date" in data:
        item.due_date = data["due_date"]
    try:
        db.commit()
        db.refresh(item)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Issue duplicado en este sprint")
    return item


@router.delete("/sprint-items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_sprint_item(item_id: int, db: Session = Depends(get_db)):
    item = db.get(SprintItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado")
    db.delete(item)
    db.commit()
    return None


@router.post("/imports/sprint-items", response_model=SprintItemImportOut)
async def importar_sprint_items(
    celula_id: Optional[int] = Form(None),
    file: UploadFile = File(...),
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

    headers: dict[str, list[str]] = {}
    for header in fieldnames:
        if not header:
            continue
        key = header_base(header)
        headers.setdefault(key, []).append(header)
    header_aliases = {
        "issue_type": ["issue type", "issuetype", "type"],
        "issue_key": ["issue key", "issuekey", "key"],
        "summary": ["summary", "resumen"],
        "status": ["status", "estado"],
        "story_points": ["custom field (story points)", "story points", "puntos"],
        "assignee": ["assignee", "responsable"],
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
        if field != "sprint"
    }
    sprint_headers = resolve_headers("sprint")
    missing_headers = [
        field
        for field, header in resolved.items()
        if header is None and field != "quarter"
    ]
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
        start_date = parse_date_value(get_value(row, resolved["start_date"]))
        end_date = parse_date_value(get_value(row, resolved["end_date"]))
        due_date = parse_date_value(get_value(row, resolved["due_date"]))
        start_date = None
        end_date = None
        due_date = None

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

            item = (
                db.query(SprintItem)
                .filter(
                    SprintItem.issue_key == issue_key,
                    SprintItem.sprint_id == sprint.id,
                )
                .first()
            )
            if item:
                changed = False
                if item.celula_id != row_celula_id:
                    item.celula_id = row_celula_id
                    changed = True
                if item.persona_id != persona_id:
                    item.persona_id = persona_id
                    changed = True
                if (item.assignee_nombre or "") != (assignee_raw or ""):
                    item.assignee_nombre = assignee_raw or None
                    changed = True
                if item.status != status:
                    item.status = status
                    changed = True
                if item.story_points != story_points:
                    item.story_points = story_points
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
                if changed:
                    updated += 1
            else:
                db.add(
                    SprintItem(
                        celula_id=row_celula_id,
                        sprint_id=sprint.id,
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
                    )
                )
                created += 1

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


@router.delete("/sprint-items")
def eliminar_sprint_items(
    celula_id: int,
    db: Session = Depends(get_db),
):
    total = db.query(SprintItem).filter(SprintItem.celula_id == celula_id).count()
    db.query(SprintItem).filter(SprintItem.celula_id == celula_id).delete(
        synchronize_session=False
    )
    db.commit()
    return {"deleted": total}


@router.get("/release-items", response_model=List[ReleaseItemOut])
def listar_release_items(
    celula_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    query = db.query(ReleaseItem).order_by(ReleaseItem.creado_en.desc())
    if celula_id is not None:
        query = query.filter(ReleaseItem.celula_id == celula_id)
    return query.all()


@router.put("/release-items/{item_id}", response_model=ReleaseItemOut)
def actualizar_release_item(
    item_id: int,
    payload: ReleaseItemUpdate,
    db: Session = Depends(get_db),
):
    item = db.get(ReleaseItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Release no encontrado")
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


@router.post("/imports/release-items", response_model=ReleaseItemImportOut)
async def importar_release_items(
    celula_id: Optional[int] = Form(None),
    tipo_release: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    tipo_release = normalize_text(tipo_release)
    if tipo_release not in {"comprometido", "nuevo"}:
        raise HTTPException(status_code=400, detail="Tipo de release invalido")

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
        start_date = parse_date_value(get_value(row, resolved["start_date"]))
        end_date = parse_date_value(get_value(row, resolved["end_date"]))
        due_date = parse_date_value(get_value(row, resolved["due_date"]))
        start_date = None
        end_date = None
        due_date = None

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
            sprint_map_by_celula[row_celula_id] = sprint

        if sprint and sprint.nombre not in detected_sprints:
            detected_sprints.append(sprint.nombre)

        raw_data = json.dumps(row, ensure_ascii=False)

        item = db.query(ReleaseItem).filter(ReleaseItem.issue_key == issue_key).first()
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
            if item.raw_data != raw_data:
                item.raw_data = raw_data
                changed = True
            if changed:
                updated += 1
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
            created += 1

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


@router.delete("/release-items")
def eliminar_release_items(
    celula_id: int,
    db: Session = Depends(get_db),
):
    total = db.query(ReleaseItem).filter(ReleaseItem.celula_id == celula_id).count()
    db.query(ReleaseItem).filter(ReleaseItem.celula_id == celula_id).delete(
        synchronize_session=False
    )
    db.commit()
    return {"deleted": total}


@router.delete("/release-items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_release_item(
    item_id: int,
    db: Session = Depends(get_db),
):
    item = db.get(ReleaseItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Release no encontrado")
    db.delete(item)
    db.commit()
    return None


@router.post("/eventos", response_model=EventoOut, status_code=status.HTTP_201_CREATED)
def crear_evento(payload: EventoCreate, db: Session = Depends(get_db)):
    if payload.fecha_inicio > payload.fecha_fin:
        raise HTTPException(status_code=400, detail="Rango de fechas invalido")
    if payload.jornada not in {"completo", "am", "pm"}:
        raise HTTPException(status_code=400, detail="Jornada invalida")
    persona = db.get(Persona, payload.persona_id)
    if not persona:
        raise HTTPException(status_code=404, detail="Persona no encontrada")
    tipo_evento = db.get(EventoTipo, payload.tipo_evento_id)
    if not tipo_evento:
        raise HTTPException(status_code=404, detail="Tipo de evento no encontrado")
    if payload.sprint_id is not None:
        sprint = db.get(Sprint, payload.sprint_id)
        if not sprint:
            raise HTTPException(status_code=404, detail="Sprint no encontrado")

    factor_jornada = 1.0 if payload.jornada == "completo" else 0.5
    impacto = min(tipo_evento.impacto_capacidad * factor_jornada, 100.0)

    evento = Evento(
        persona_id=payload.persona_id,
        tipo_evento_id=payload.tipo_evento_id,
        sprint_id=payload.sprint_id,
        fecha_inicio=payload.fecha_inicio,
        fecha_fin=payload.fecha_fin,
        jornada=payload.jornada,
        impacto_capacidad=impacto,
        planificado=tipo_evento.planificado,
        descripcion=payload.descripcion,
    )
    db.add(evento)
    db.commit()
    db.refresh(evento)
    return evento


@router.put("/eventos/{evento_id}", response_model=EventoOut)
def actualizar_evento(evento_id: int, payload: EventoUpdate, db: Session = Depends(get_db)):
    evento = db.get(Evento, evento_id)
    if not evento:
        raise HTTPException(status_code=404, detail="Evento no encontrado")
    tipo_evento = evento.tipo_evento

    if payload.persona_id is not None:
        persona = db.get(Persona, payload.persona_id)
        if not persona:
            raise HTTPException(status_code=404, detail="Persona no encontrada")
        evento.persona_id = payload.persona_id
    if payload.tipo_evento_id is not None:
        tipo_evento = db.get(EventoTipo, payload.tipo_evento_id)
        if not tipo_evento:
            raise HTTPException(status_code=404, detail="Tipo de evento no encontrado")
        evento.tipo_evento_id = payload.tipo_evento_id
        evento.planificado = tipo_evento.planificado
    if payload.sprint_id is not None:
        sprint = db.get(Sprint, payload.sprint_id)
        if not sprint:
            raise HTTPException(status_code=404, detail="Sprint no encontrado")
        evento.sprint_id = payload.sprint_id
    if payload.fecha_inicio is not None:
        evento.fecha_inicio = payload.fecha_inicio
    if payload.fecha_fin is not None:
        evento.fecha_fin = payload.fecha_fin
    if payload.jornada is not None:
        if payload.jornada not in {"completo", "am", "pm"}:
            raise HTTPException(status_code=400, detail="Jornada invalida")
        evento.jornada = payload.jornada
    if payload.descripcion is not None:
        evento.descripcion = payload.descripcion
    if evento.fecha_inicio > evento.fecha_fin:
        raise HTTPException(status_code=400, detail="Rango de fechas invalido")

    factor_jornada = 1.0 if evento.jornada == "completo" else 0.5
    evento.impacto_capacidad = min(tipo_evento.impacto_capacidad * factor_jornada, 100.0)

    db.commit()
    db.refresh(evento)
    return evento


@router.delete("/eventos/{evento_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_evento(evento_id: int, db: Session = Depends(get_db)):
    evento = db.get(Evento, evento_id)
    if not evento:
        raise HTTPException(status_code=404, detail="Evento no encontrado")
    db.delete(evento)
    db.commit()
    return None


@router.get("/sprints/{sprint_id}/capacidad", response_model=CapacidadSprintOut)
def obtener_capacidad(sprint_id: int, db: Session = Depends(get_db)):
    sprint = db.get(Sprint, sprint_id)
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint no encontrado")

    personas = (
        db.query(Persona)
        .join(persona_celulas, persona_celulas.c.persona_id == Persona.id)
        .filter(
            persona_celulas.c.celula_id == sprint.celula_id,
            Persona.activo.is_(True),
        )
        .order_by(Persona.id)
        .distinct()
        .all()
    )
    feriados = (
        db.query(Feriado)
        .filter(
            Feriado.activo.is_(True),
            Feriado.fecha >= sprint.fecha_inicio,
            Feriado.fecha <= sprint.fecha_fin,
            ((Feriado.celula_id.is_(None)) | (Feriado.celula_id == sprint.celula_id)),
        )
        .all()
    )
    feriados_set = {feriado.fecha for feriado in feriados}
    dias_laborales = dias_habiles(sprint.fecha_inicio, sprint.fecha_fin, feriados_set)

    persona_ids = [persona.id for persona in personas]
    eventos = (
        db.query(Evento)
        .options(joinedload(Evento.tipo_evento))
        .filter(
            Evento.persona_id.in_(persona_ids) if persona_ids else False,
            Evento.fecha_inicio <= sprint.fecha_fin,
            Evento.fecha_fin >= sprint.fecha_inicio,
        )
        .all()
    )
    eventos_por_persona: Dict[int, List[Evento]] = {}
    for evento in eventos:
        eventos_por_persona.setdefault(evento.persona_id, []).append(evento)

    detalle_por_persona = []
    capacidad_teorica_total = 0.0
    capacidad_real_total = 0.0

    def factor_dia(dia: date) -> float:
        if dia == sprint.fecha_inicio and dia == sprint.fecha_fin:
            return 1.0
        if dia == sprint.fecha_inicio or dia == sprint.fecha_fin:
            return 0.5
        return 1.0

    excluded_roles = {"sm", "po"}
    for persona in personas:
        if persona.rol and persona.rol.strip().lower() in excluded_roles:
            detalle_por_persona.append(
                {
                    "persona_id": persona.id,
                    "nombre": persona.nombre,
                    "apellido": persona.apellido,
                    "capacidad_teorica": 0.0,
                    "capacidad_real": 0.0,
                    "capacidad_teorica_dias": 0.0,
                    "capacidad_real_dias": 0.0,
                    "porcentaje": 0.0,
                }
            )
            continue
        capacidad_diaria = persona.capacidad_diaria_horas
        capacidad_teorica = sum(capacidad_diaria * factor_dia(dia) for dia in dias_laborales)
        capacidad_teorica_total += capacidad_teorica

        descuentos = 0.0
        eventos_persona = eventos_por_persona.get(persona.id, [])
        for dia in dias_laborales:
            impacto = impacto_por_dia(eventos_persona, dia)
            descuentos += (capacidad_diaria * factor_dia(dia)) * (impacto / 100.0)

        capacidad_real = max(capacidad_teorica - descuentos, 0.0)
        capacidad_real_total += capacidad_real
        detalle_por_persona.append(
            {
                "persona_id": persona.id,
                "nombre": persona.nombre,
                "apellido": persona.apellido,
                "capacidad_teorica": capacidad_teorica,
                "capacidad_real": capacidad_real,
                "capacidad_teorica_dias": capacidad_teorica / HORAS_POR_DIA,
                "capacidad_real_dias": capacidad_real / HORAS_POR_DIA,
                "porcentaje": porcentaje_capacidad(capacidad_real, capacidad_teorica),
            }
        )

    porcentaje_total = porcentaje_capacidad(capacidad_real_total, capacidad_teorica_total)
    estado = clasificar_estado(porcentaje_total)

    return {
        "sprint_id": sprint_id,
        "capacidad_teorica": capacidad_teorica_total,
        "capacidad_real": capacidad_real_total,
        "capacidad_teorica_dias": capacidad_teorica_total / HORAS_POR_DIA,
        "capacidad_real_dias": capacidad_real_total / HORAS_POR_DIA,
        "porcentaje": porcentaje_total,
        "estado": estado,
        "detalle_por_persona": detalle_por_persona,
    }
