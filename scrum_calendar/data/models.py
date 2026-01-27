from datetime import date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()
TZ_PY = ZoneInfo("America/Asuncion")


def now_py() -> datetime:
    return datetime.now(TZ_PY).replace(tzinfo=None)

persona_celulas = Table(
    "persona_celulas",
    Base.metadata,
    Column("persona_id", ForeignKey("personas.id"), primary_key=True),
    Column("celula_id", ForeignKey("celulas.id"), primary_key=True),
)


class Celula(Base):
    __tablename__ = "celulas"

    id = Column(Integer, primary_key=True)
    nombre = Column(String(120), nullable=False, unique=True)
    jira_codigo = Column(String(20), nullable=True, unique=True)
    activa = Column(Boolean, nullable=False, default=True)
    fecha_creacion = Column(DateTime, nullable=False, default=now_py)

    personas = relationship("Persona", secondary=persona_celulas, back_populates="celulas")
    sprints = relationship("Sprint", back_populates="celula")
    sprint_items = relationship("SprintItem", back_populates="celula")
    release_items = relationship(
        "ReleaseItem",
        back_populates="celula",
        cascade="all, delete-orphan",
    )
    oneonone_notas = relationship(
        "OneOnOneNote",
        back_populates="celula",
        cascade="all, delete-orphan",
    )
    oneonone_entries = relationship(
        "OneOnOneEntry",
        back_populates="celula",
        cascade="all, delete-orphan",
    )
    retrospectives = relationship(
        "Retrospective",
        back_populates="celula",
        cascade="all, delete-orphan",
    )
    poker_sessions = relationship(
        "PokerSession",
        back_populates="celula",
        cascade="all, delete-orphan",
    )


class Persona(Base):
    __tablename__ = "personas"

    id = Column(Integer, primary_key=True)
    nombre = Column(String(120), nullable=False)
    apellido = Column(String(120), nullable=False)
    rol = Column(String(50), nullable=False)
    capacidad_diaria_horas = Column(Float, nullable=False, default=0.0)
    fecha_cumple = Column(Date, nullable=True)
    jira_usuario = Column(String(120), nullable=True)
    activo = Column(Boolean, nullable=False, default=True)

    celulas = relationship("Celula", secondary=persona_celulas, back_populates="personas")
    eventos = relationship("Evento", back_populates="persona")
    sprint_items = relationship("SprintItem", back_populates="persona")
    release_items = relationship("ReleaseItem", back_populates="persona")
    oneonone_notas = relationship(
        "OneOnOneNote",
        back_populates="persona",
        cascade="all, delete-orphan",
    )
    oneonone_entries = relationship(
        "OneOnOneEntry",
        back_populates="persona",
        cascade="all, delete-orphan",
    )
    retro_items = relationship(
        "RetrospectiveItem",
        foreign_keys="RetrospectiveItem.persona_id",
    )
    retro_assigned_items = relationship(
        "RetrospectiveItem",
        foreign_keys="RetrospectiveItem.asignado_id",
    )
    poker_votes = relationship(
        "PokerVote",
        back_populates="persona",
        cascade="all, delete-orphan",
    )


class Sprint(Base):
    __tablename__ = "sprints"

    id = Column(Integer, primary_key=True)
    nombre = Column(String(120), nullable=False)
    celula_id = Column(Integer, ForeignKey("celulas.id"), nullable=False)
    fecha_inicio = Column(Date, nullable=False)
    fecha_fin = Column(Date, nullable=False)

    celula = relationship("Celula", back_populates="sprints")
    eventos = relationship("Evento", back_populates="sprint")
    sprint_items = relationship("SprintItem", back_populates="sprint")
    retrospectives = relationship("Retrospective", back_populates="sprint")


class EventoTipo(Base):
    __tablename__ = "eventos_tipo"

    id = Column(Integer, primary_key=True)
    nombre = Column(String(120), nullable=False, unique=True)
    impacto_capacidad = Column(Float, nullable=False)
    planificado = Column(Boolean, nullable=False, default=True)
    prioridad = Column(String(20), nullable=False, default="media")
    activo = Column(Boolean, nullable=False, default=True)

    eventos = relationship("Evento", back_populates="tipo_evento")


class Evento(Base):
    __tablename__ = "eventos"

    id = Column(Integer, primary_key=True)
    persona_id = Column(Integer, ForeignKey("personas.id"), nullable=False)
    tipo_evento_id = Column(Integer, ForeignKey("eventos_tipo.id"), nullable=False)
    sprint_id = Column(Integer, ForeignKey("sprints.id"), nullable=True)
    fecha_inicio = Column(Date, nullable=False)
    fecha_fin = Column(Date, nullable=False)
    jornada = Column(String(10), nullable=False, default="completo")
    impacto_capacidad = Column(Float, nullable=False, default=0.0)
    planificado = Column(Boolean, nullable=False, default=True)
    descripcion = Column(Text, nullable=True)
    creado_en = Column(DateTime, nullable=False, default=now_py)

    persona = relationship("Persona", back_populates="eventos")
    tipo_evento = relationship("EventoTipo", back_populates="eventos")
    sprint = relationship("Sprint", back_populates="eventos")


class Feriado(Base):
    __tablename__ = "feriados"

    id = Column(Integer, primary_key=True)
    fecha = Column(Date, nullable=False, unique=True)
    nombre = Column(String(120), nullable=False)
    tipo = Column(String(20), nullable=False, default="nacional")
    celula_id = Column(Integer, ForeignKey("celulas.id"), nullable=True)
    activo = Column(Boolean, nullable=False, default=True)


class SprintItem(Base):
    __tablename__ = "sprint_items"
    __table_args__ = (
        UniqueConstraint("issue_key", "sprint_id", name="uq_sprint_items_issue_sprint"),
    )

    id = Column(Integer, primary_key=True)
    celula_id = Column(Integer, ForeignKey("celulas.id"), nullable=False)
    sprint_id = Column(Integer, ForeignKey("sprints.id"), nullable=False)
    persona_id = Column(Integer, ForeignKey("personas.id"), nullable=True)
    assignee_nombre = Column(String(160), nullable=True)
    issue_key = Column(String(60), nullable=False)
    issue_type = Column(String(60), nullable=False)
    summary = Column(String(255), nullable=False)
    status = Column(String(80), nullable=False)
    story_points = Column(Float, nullable=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    due_date = Column(Date, nullable=True)
    creado_en = Column(DateTime, nullable=False, default=now_py)

    celula = relationship("Celula", back_populates="sprint_items")
    sprint = relationship("Sprint", back_populates="sprint_items")
    persona = relationship("Persona", back_populates="sprint_items")


class ReleaseItem(Base):
    __tablename__ = "release_items"
    __table_args__ = (
        UniqueConstraint("issue_key", name="uq_release_items_issue_key"),
    )

    id = Column(Integer, primary_key=True)
    celula_id = Column(Integer, ForeignKey("celulas.id"), nullable=False)
    sprint_id = Column(Integer, ForeignKey("sprints.id"), nullable=True)
    persona_id = Column(Integer, ForeignKey("personas.id"), nullable=True)
    issue_type = Column(String(60), nullable=False)
    issue_key = Column(String(60), nullable=False)
    issue_id = Column(String(60), nullable=True)
    summary = Column(String(255), nullable=False)
    reporter = Column(String(160), nullable=True)
    reporter_id = Column(String(120), nullable=True)
    status = Column(String(80), nullable=False)
    story_points = Column(Float, nullable=True)
    assignee_nombre = Column(String(160), nullable=True)
    assignee_id = Column(String(120), nullable=True)
    sprint_nombre = Column(String(160), nullable=True)
    release_tipo = Column(String(40), nullable=False, default="comprometido")
    tipo = Column(String(20), nullable=True)
    quarter = Column(String(20), nullable=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    due_date = Column(Date, nullable=True)
    raw_data = Column(Text, nullable=True)
    creado_en = Column(DateTime, nullable=False, default=now_py)

    celula = relationship("Celula", back_populates="release_items")
    sprint = relationship("Sprint")
    persona = relationship("Persona", back_populates="release_items")


class OneOnOneNote(Base):
    __tablename__ = "oneonone_notes"
    __table_args__ = (
        UniqueConstraint("celula_id", "persona_id", "mes", name="uq_oneonone_mes"),
    )

    id = Column(Integer, primary_key=True)
    celula_id = Column(Integer, ForeignKey("celulas.id"), nullable=False)
    persona_id = Column(Integer, ForeignKey("personas.id"), nullable=False)
    mes = Column(String(7), nullable=False)
    checklist = Column(Text, nullable=True)
    agreements = Column(Text, nullable=True)
    mood = Column(String(20), nullable=True)
    feedback_pos = Column(Text, nullable=True)
    feedback_neg = Column(Text, nullable=True)
    growth = Column(Text, nullable=True)
    creado_en = Column(DateTime, nullable=False, default=now_py)
    actualizado_en = Column(DateTime, nullable=False, default=now_py, onupdate=now_py)

    celula = relationship("Celula", back_populates="oneonone_notas")
    persona = relationship("Persona", back_populates="oneonone_notas")


class OneOnOneEntry(Base):
    __tablename__ = "oneonone_entries"

    id = Column(Integer, primary_key=True)
    celula_id = Column(Integer, ForeignKey("celulas.id"), nullable=False)
    persona_id = Column(Integer, ForeignKey("personas.id"), nullable=False)
    mes = Column(String(7), nullable=False)
    tipo = Column(String(30), nullable=False)
    detalle = Column(Text, nullable=True)
    creado_en = Column(DateTime, nullable=False, default=now_py)

    celula = relationship("Celula", back_populates="oneonone_entries")
    persona = relationship("Persona", back_populates="oneonone_entries")


class OneOnOneSession(Base):
    __tablename__ = "oneonone_sessions"

    id = Column(Integer, primary_key=True)
    celula_id = Column(Integer, ForeignKey("celulas.id"), nullable=False)
    persona_id = Column(Integer, ForeignKey("personas.id"), nullable=False)
    fecha = Column(Date, nullable=False, default=date.today)
    checklist = Column(Text, nullable=True)
    agreements = Column(Text, nullable=True)
    mood = Column(String(20), nullable=True)
    feedback_pos = Column(Text, nullable=True)
    feedback_neg = Column(Text, nullable=True)
    growth = Column(Text, nullable=True)
    creado_en = Column(DateTime, nullable=False, default=now_py)
    actualizado_en = Column(DateTime, nullable=False, default=now_py, onupdate=now_py)

    celula = relationship("Celula")
    persona = relationship("Persona")


class Retrospective(Base):
    __tablename__ = "retrospectives"
    __table_args__ = (
        UniqueConstraint("celula_id", "sprint_id", name="uq_retros_celula_sprint"),
    )

    id = Column(Integer, primary_key=True)
    celula_id = Column(Integer, ForeignKey("celulas.id"), nullable=False)
    sprint_id = Column(Integer, ForeignKey("sprints.id"), nullable=False)
    token = Column(String(120), nullable=False, unique=True)
    estado = Column(String(20), nullable=False, default="abierta")
    fase = Column(String(20), nullable=False, default="espera")
    creado_por = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    creado_en = Column(DateTime, nullable=False, default=now_py)
    actualizado_en = Column(DateTime, nullable=False, default=now_py, onupdate=now_py)

    celula = relationship("Celula", back_populates="retrospectives")
    sprint = relationship("Sprint", back_populates="retrospectives")
    items = relationship(
        "RetrospectiveItem",
        back_populates="retro",
        cascade="all, delete-orphan",
    )
    usuario = relationship("Usuario")


class RetrospectiveItem(Base):
    __tablename__ = "retro_items"

    id = Column(Integer, primary_key=True)
    retro_id = Column(Integer, ForeignKey("retrospectives.id"), nullable=False)
    tipo = Column(String(20), nullable=False)
    detalle = Column(Text, nullable=False)
    persona_id = Column(Integer, ForeignKey("personas.id"), nullable=True)
    asignado_id = Column(Integer, ForeignKey("personas.id"), nullable=True)
    fecha_compromiso = Column(Date, nullable=True)
    estado = Column(String(20), nullable=False, default="pendiente")
    creado_en = Column(DateTime, nullable=False, default=now_py)
    actualizado_en = Column(DateTime, nullable=False, default=now_py, onupdate=now_py)

    retro = relationship("Retrospective", back_populates="items")


class PokerSession(Base):
    __tablename__ = "poker_sessions"

    id = Column(Integer, primary_key=True)
    celula_id = Column(Integer, ForeignKey("celulas.id"), nullable=False)
    token = Column(String(120), nullable=False, unique=True)
    estado = Column(String(20), nullable=False, default="abierta")
    fase = Column(String(20), nullable=False, default="espera")
    creado_por = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    creado_en = Column(DateTime, nullable=False, default=now_py)
    actualizado_en = Column(DateTime, nullable=False, default=now_py, onupdate=now_py)

    celula = relationship("Celula", back_populates="poker_sessions")
    usuario = relationship("Usuario")
    votos = relationship(
        "PokerVote",
        back_populates="sesion",
        cascade="all, delete-orphan",
    )
    claims = relationship(
        "PokerClaim",
        back_populates="sesion",
        cascade="all, delete-orphan",
    )


class PokerVote(Base):
    __tablename__ = "poker_votes"
    __table_args__ = (
        UniqueConstraint("sesion_id", "persona_id", name="uq_poker_sesion_persona"),
    )

    id = Column(Integer, primary_key=True)
    sesion_id = Column(Integer, ForeignKey("poker_sessions.id"), nullable=False)
    persona_id = Column(Integer, ForeignKey("personas.id"), nullable=False)
    valor = Column(Integer, nullable=False)
    creado_en = Column(DateTime, nullable=False, default=now_py)
    actualizado_en = Column(DateTime, nullable=False, default=now_py, onupdate=now_py)

    sesion = relationship("PokerSession", back_populates="votos")
    persona = relationship("Persona", back_populates="poker_votes")


class PokerClaim(Base):
    __tablename__ = "poker_claims"
    __table_args__ = (
        UniqueConstraint("sesion_id", "persona_id", name="uq_poker_claim"),
    )

    id = Column(Integer, primary_key=True)
    sesion_id = Column(Integer, ForeignKey("poker_sessions.id"), nullable=False)
    persona_id = Column(Integer, ForeignKey("personas.id"), nullable=False)
    creado_en = Column(DateTime, nullable=False, default=now_py)
    actualizado_en = Column(DateTime, nullable=False, default=now_py, onupdate=now_py)

    sesion = relationship("PokerSession", back_populates="claims")
    persona = relationship("Persona")


class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True)
    username = Column(String(80), nullable=False, unique=True)
    password_hash = Column(String(255), nullable=False)
    rol = Column(String(30), nullable=False, default="member")
    activo = Column(Boolean, nullable=False, default=True)
    creado_en = Column(DateTime, nullable=False, default=now_py)

    sesiones = relationship("Sesion", back_populates="usuario", cascade="all, delete-orphan")


class Sesion(Base):
    __tablename__ = "sesiones"

    id = Column(Integer, primary_key=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    token = Column(String(255), nullable=False, unique=True)
    expira_en = Column(DateTime, nullable=False)
    creado_en = Column(DateTime, nullable=False, default=now_py)

    usuario = relationship("Usuario", back_populates="sesiones")
