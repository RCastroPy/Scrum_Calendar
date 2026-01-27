from datetime import date, datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class CelulaCreate(BaseModel):
    nombre: str
    jira_codigo: str
    activa: bool = True


class AuthRequest(BaseModel):
    username: str
    password: str


class UsuarioCreate(BaseModel):
    username: str
    password: str
    rol: str = "member"
    activo: bool = True


class UsuarioUpdate(BaseModel):
    password: Optional[str] = None
    rol: Optional[str] = None
    activo: Optional[bool] = None


class UsuarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    rol: str
    activo: bool
    creado_en: datetime


class OneOnOneNoteCreate(BaseModel):
    celula_id: int
    persona_id: int
    mes: str
    checklist: List[Dict[str, Any]] = Field(default_factory=list)
    agreements: List[Dict[str, Any]] = Field(default_factory=list)
    mood: Optional[str] = None
    feedback_pos: Optional[str] = None
    feedback_neg: Optional[str] = None
    growth: Optional[str] = None


class OneOnOneNoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    celula_id: int
    persona_id: int
    mes: str
    checklist: List[Dict[str, Any]]
    agreements: List[Dict[str, Any]]
    mood: Optional[str]
    feedback_pos: Optional[str]
    feedback_neg: Optional[str]
    growth: Optional[str]
    actualizado_en: datetime


class OneOnOneEntryCreate(BaseModel):
    celula_id: int
    persona_id: int
    mes: str
    tipo: str
    detalle: Dict[str, Any] = Field(default_factory=dict)


class OneOnOneEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    celula_id: int
    persona_id: int
    mes: str
    tipo: str
    detalle: Dict[str, Any]
    creado_en: datetime


class OneOnOneSessionCreate(BaseModel):
    celula_id: int
    persona_id: int
    fecha: Optional[date] = None
    checklist: List[Dict[str, Any]] = Field(default_factory=list)
    agreements: List[Dict[str, Any]] = Field(default_factory=list)
    mood: Optional[str] = None
    feedback_pos: Optional[str] = None
    feedback_neg: Optional[str] = None
    growth: Optional[str] = None


class OneOnOneSessionUpdate(BaseModel):
    fecha: Optional[date] = None
    checklist: Optional[List[Dict[str, Any]]] = None
    agreements: Optional[List[Dict[str, Any]]] = None
    mood: Optional[str] = None
    feedback_pos: Optional[str] = None
    feedback_neg: Optional[str] = None
    growth: Optional[str] = None


class OneOnOneSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    celula_id: int
    persona_id: int
    fecha: date
    checklist: List[Dict[str, Any]]
    agreements: List[Dict[str, Any]]
    mood: Optional[str]
    feedback_pos: Optional[str]
    feedback_neg: Optional[str]
    growth: Optional[str]
    actualizado_en: datetime


class RetroCreate(BaseModel):
    celula_id: int
    sprint_id: int


class RetroOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    celula_id: int
    sprint_id: int
    token: str
    estado: str
    fase: str
    creado_en: datetime
    actualizado_en: datetime
    resumen: Optional[Dict[str, int]] = None


class RetroUpdate(BaseModel):
    estado: Optional[str] = None
    fase: Optional[str] = None


class RetroItemCreate(BaseModel):
    retro_id: Optional[int] = None
    tipo: str
    detalle: str
    persona_id: Optional[int] = None
    asignado_id: Optional[int] = None
    fecha_compromiso: Optional[date] = None
    estado: Optional[str] = None


class RetroItemUpdate(BaseModel):
    detalle: Optional[str] = None
    persona_id: Optional[int] = None
    asignado_id: Optional[int] = None
    fecha_compromiso: Optional[date] = None
    estado: Optional[str] = None


class RetroItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    retro_id: int
    tipo: str
    detalle: str
    persona_id: Optional[int]
    asignado_id: Optional[int]
    fecha_compromiso: Optional[date]
    estado: str
    creado_en: datetime
    actualizado_en: datetime


class RetroCommitmentOut(BaseModel):
    id: int
    retro_id: int
    sprint_id: int
    sprint_nombre: str
    tipo: str
    detalle: str
    asignado_id: Optional[int]
    asignado_nombre: str
    fecha_compromiso: Optional[date]
    estado: str


class RetroDetailOut(BaseModel):
    retro: RetroOut
    items: List[RetroItemOut]


class PersonaLite(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    apellido: str
    activo: Optional[bool] = True


class PokerSessionCreate(BaseModel):
    celula_id: int


class PokerSessionUpdate(BaseModel):
    estado: Optional[str] = None
    fase: Optional[str] = None


class PokerSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    celula_id: int
    token: str
    estado: str
    fase: str
    creado_en: datetime
    actualizado_en: datetime


class PokerVoteOut(BaseModel):
    id: int
    sesion_id: int
    persona_id: int
    persona_nombre: str
    valor: int
    creado_en: datetime
    actualizado_en: datetime


class PokerSessionDetailOut(BaseModel):
    sesion: PokerSessionOut
    votos: List[PokerVoteOut]


class PokerPublicOut(BaseModel):
    id: int
    celula_id: int
    celula_nombre: str
    estado: str
    fase: str
    token: str
    personas: List[PersonaLite]
    claimed_persona_ids: List[int] = []


class PokerClaimCreate(BaseModel):
    persona_id: int


class PokerPublicVoteCreate(BaseModel):
    persona_id: int
    valor: int


class RetroPublicOut(BaseModel):
    id: int
    celula_id: int
    sprint_id: int
    celula_nombre: str
    sprint_nombre: str
    estado: str
    fase: str
    token: str
    personas: List[PersonaLite]


class RetroPublicItemCreate(BaseModel):
    tipo: str
    detalle: str
    persona_id: Optional[int] = None
    asignado_id: Optional[int] = None
    fecha_compromiso: Optional[date] = None


class CelulaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    jira_codigo: Optional[str] = None
    activa: bool
    fecha_creacion: datetime


class CelulaUpdate(BaseModel):
    nombre: Optional[str] = None
    jira_codigo: Optional[str] = None
    activa: Optional[bool] = None


class PersonaCreate(BaseModel):
    nombre: str
    apellido: str
    rol: str
    capacidad_diaria_horas: float = Field(ge=0)
    celulas_ids: Optional[List[int]] = None
    fecha_cumple: Optional[date] = None
    jira_usuario: Optional[str] = None
    activo: bool = True


class CelulaRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    jira_codigo: Optional[str] = None


class PersonaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    apellido: str
    rol: str
    capacidad_diaria_horas: float
    fecha_cumple: Optional[date]
    jira_usuario: Optional[str] = None
    celulas: List[CelulaRef]
    activo: bool


class PersonaUpdate(BaseModel):
    nombre: Optional[str] = None
    apellido: Optional[str] = None
    rol: Optional[str] = None
    capacidad_diaria_horas: Optional[float] = Field(default=None, ge=0)
    celulas_ids: Optional[List[int]] = None
    fecha_cumple: Optional[date] = None
    jira_usuario: Optional[str] = None
    activo: Optional[bool] = None


class FeriadoCreate(BaseModel):
    fecha: date
    nombre: str
    tipo: str = "nacional"
    celula_id: Optional[int] = None
    activo: bool = True


class FeriadoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    fecha: date
    nombre: str
    tipo: str
    celula_id: Optional[int]
    activo: bool


class FeriadoUpdate(BaseModel):
    fecha: Optional[date] = None
    nombre: Optional[str] = None
    tipo: Optional[str] = None
    celula_id: Optional[int] = None
    activo: Optional[bool] = None


class SprintCreate(BaseModel):
    nombre: str
    celula_id: int
    fecha_inicio: date
    fecha_fin: date


class SprintOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    celula_id: int
    fecha_inicio: date
    fecha_fin: date


class SprintUpdate(BaseModel):
    nombre: Optional[str] = None
    celula_id: Optional[int] = None
    fecha_inicio: Optional[date] = None
    fecha_fin: Optional[date] = None


class EventoCreate(BaseModel):
    persona_id: int
    tipo_evento_id: int
    sprint_id: Optional[int] = None
    fecha_inicio: date
    fecha_fin: date
    jornada: str = "completo"
    descripcion: Optional[str] = None


class EventoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    persona_id: int
    tipo_evento_id: int
    sprint_id: Optional[int]
    fecha_inicio: date
    fecha_fin: date
    jornada: str
    impacto_capacidad: float
    planificado: bool
    descripcion: Optional[str]
    creado_en: datetime


class EventoTipoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nombre: str
    impacto_capacidad: float
    planificado: bool
    prioridad: str
    activo: bool


class EventoTipoCreate(BaseModel):
    nombre: str
    impacto_capacidad: float = Field(ge=0, le=100)
    planificado: bool = True
    prioridad: str = "normal"
    activo: bool = True


class EventoTipoUpdate(BaseModel):
    nombre: Optional[str] = None
    impacto_capacidad: Optional[float] = Field(default=None, ge=0, le=100)
    planificado: Optional[bool] = None
    prioridad: Optional[str] = None
    activo: Optional[bool] = None


class SprintItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    celula_id: int
    sprint_id: int
    persona_id: Optional[int]
    assignee_nombre: Optional[str]
    issue_key: str
    issue_type: str
    summary: str
    status: str
    story_points: Optional[float]
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    due_date: Optional[date] = None
    creado_en: datetime


class SprintItemCreate(BaseModel):
    celula_id: int
    sprint_id: int
    persona_id: Optional[int] = None
    assignee_nombre: Optional[str] = None
    issue_key: str
    issue_type: str
    summary: str
    status: str
    story_points: Optional[float] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    due_date: Optional[date] = None


class SprintItemUpdate(BaseModel):
    persona_id: Optional[int] = None
    assignee_nombre: Optional[str] = None
    issue_key: Optional[str] = None
    issue_type: Optional[str] = None
    summary: Optional[str] = None
    status: Optional[str] = None
    story_points: Optional[float] = None
    sprint_id: Optional[int] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    due_date: Optional[date] = None


class SprintItemImportOut(BaseModel):
    created: int
    updated: int
    skipped: int
    sprints_detected: List[str] = Field(default_factory=list)
    missing_personas: List[str] = Field(default_factory=list)
    missing_sprints: List[str] = Field(default_factory=list)
    missing_celulas: List[str] = Field(default_factory=list)


class ReleaseItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    celula_id: int
    sprint_id: Optional[int]
    persona_id: Optional[int]
    issue_type: str
    issue_key: str
    issue_id: Optional[str]
    summary: str
    reporter: Optional[str]
    reporter_id: Optional[str]
    status: str
    story_points: Optional[float]
    assignee_nombre: Optional[str]
    assignee_id: Optional[str]
    sprint_nombre: Optional[str]
    release_tipo: str
    tipo: Optional[str] = None
    quarter: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    due_date: Optional[date] = None
    creado_en: datetime


class ReleaseItemUpdate(BaseModel):
    status: Optional[str] = None
    tipo: Optional[str] = None
    quarter: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    due_date: Optional[date] = None


class ReleaseItemImportOut(BaseModel):
    created: int
    updated: int
    skipped: int
    sprints_detected: List[str] = Field(default_factory=list)
    missing_personas: List[str] = Field(default_factory=list)
    missing_sprints: List[str] = Field(default_factory=list)
    missing_celulas: List[str] = Field(default_factory=list)


class EventoUpdate(BaseModel):
    persona_id: Optional[int] = None
    tipo_evento_id: Optional[int] = None
    sprint_id: Optional[int] = None
    fecha_inicio: Optional[date] = None
    fecha_fin: Optional[date] = None
    jornada: Optional[str] = None
    descripcion: Optional[str] = None


class PersonaCapacidadOut(BaseModel):
    persona_id: int
    nombre: str
    apellido: str
    capacidad_teorica: float
    capacidad_real: float
    capacidad_teorica_dias: float
    capacidad_real_dias: float
    porcentaje: float


class CapacidadSprintOut(BaseModel):
    sprint_id: int
    capacidad_teorica: float
    capacidad_real: float
    capacidad_teorica_dias: float
    capacidad_real_dias: float
    porcentaje: float
    estado: str
    detalle_por_persona: List[PersonaCapacidadOut]
