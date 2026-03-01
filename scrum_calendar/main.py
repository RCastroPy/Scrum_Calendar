from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from sqlalchemy.orm import joinedload
from sqlalchemy import text

from api.routes import router
from config.settings import settings
from core.audit import log_security_event
from data.db import SessionLocal, engine
from data.models import Base, Sesion, now_py

app = FastAPI(
    title="Scrum Calendar",
    version="0.1.0",
    docs_url="/docs" if settings.docs_enabled else None,
    redoc_url="/redoc" if settings.docs_enabled else None,
    openapi_url="/openapi.json" if settings.docs_enabled else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=settings.cors_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _load_valid_session(token: str | None):
    if not token:
        return None
    db = SessionLocal()
    try:
        session = (
            db.query(Sesion)
            .options(joinedload(Sesion.usuario))
            .filter(Sesion.token == token)
            .first()
        )
        if not session or session.expira_en < now_py() or not session.usuario or not session.usuario.activo:
            if session and session.expira_en < now_py():
                db.delete(session)
                db.commit()
            return None
        return session.usuario
    finally:
        db.close()


def _request_ip(request: Request) -> str:
    forwarded = (request.headers.get("x-forwarded-for") or "").strip()
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    real_ip = (request.headers.get("x-real-ip") or "").strip()
    if real_ip:
        return real_ip
    host = request.client.host if request.client else ""
    return host or "unknown"


def _apply_security_headers(response):
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault(
        "Permissions-Policy",
        "geolocation=(), camera=(), microphone=(), payment=()",
    )
    response.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self' data: blob: ws: wss: http: https: 'unsafe-inline'; "
        "object-src 'none'; base-uri 'self'; frame-ancestors 'self'",
    )
    return response


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    path = request.url.path
    if request.method == "OPTIONS":
        return _apply_security_headers(await call_next(request))
    if path.startswith("/ui"):
        static_ext = (
            ".css",
            ".js",
            ".map",
            ".png",
            ".jpg",
            ".jpeg",
            ".svg",
            ".ico",
            ".gif",
            ".webp",
            ".woff",
            ".woff2",
            ".ttf",
            ".eot",
        )
        if (
            path.endswith("/login.html")
            or path.endswith("/retro-public.html")
            or path.endswith("/poker-public.html")
            or path.endswith(static_ext)
        ):
            response = await call_next(request)
            response.headers["Cache-Control"] = "no-store"
            return _apply_security_headers(response)
        token = request.cookies.get("scrum_session")
        user = _load_valid_session(token)
        if not user:
            log_security_event(
                "ui_auth_rejected",
                "WARNING",
                path=path,
                method=request.method,
                ip=_request_ip(request),
                reason="missing_token" if not token else "invalid_session",
            )
            response = RedirectResponse(url="/ui/login.html")
            response.delete_cookie("scrum_session", path="/")
            response.headers["Cache-Control"] = "no-store"
            return _apply_security_headers(response)
        request.state.user = user
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        return _apply_security_headers(response)
    if (
        path == "/"
        or path.startswith("/auth")
        or path.startswith("/public/")
        or path.startswith("/docs")
        or path.startswith("/openapi")
        or path.startswith("/redoc")
        or path == "/retros/public"
        or path == "/poker/public"
        or path.startswith("/retros/public/")
        or path.startswith("/poker/public/")
        or path.startswith("/ws/retros/")
        or path.startswith("/ws/poker/")
    ):
        return _apply_security_headers(await call_next(request))
    token = request.cookies.get("scrum_session")
    if not token:
        log_security_event(
            "api_auth_rejected",
            "WARNING",
            path=path,
            method=request.method,
            ip=_request_ip(request),
            reason="missing_token",
        )
        return _apply_security_headers(JSONResponse(status_code=401, content={"detail": "No autenticado"}))
    user = _load_valid_session(token)
    if not user:
        log_security_event(
            "api_auth_rejected",
            "WARNING",
            path=path,
            method=request.method,
            ip=_request_ip(request),
            reason="invalid_session",
        )
        response = JSONResponse(status_code=401, content={"detail": "No autenticado"})
        response.delete_cookie("scrum_session", path="/")
        return _apply_security_headers(response)
    request.state.user = user
    return _apply_security_headers(await call_next(request))


@app.exception_handler(HTTPException)
async def http_exception_audit_handler(request: Request, exc: HTTPException):
    if exc.status_code in {401, 403, 429}:
        log_security_event(
            "http_exception",
            "WARNING" if exc.status_code in {401, 403} else "INFO",
            path=request.url.path,
            method=request.method,
            ip=_request_ip(request),
            status_code=exc.status_code,
            detail=exc.detail,
        )
    return _apply_security_headers(JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=exc.headers or None,
    ))


@app.get("/")
def healthcheck():
    return {"status": "ok"}


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    # Test suite uses SQLite; these lightweight "migrations" are Postgres-specific.
    if getattr(engine.dialect, "name", "") != "postgresql":
        return
    with engine.begin() as conn:
        columns = conn.execute(
            text(
                "select column_name from information_schema.columns "
                "where table_name = 'release_items'"
            )
        ).fetchall()
        column_names = {row[0] for row in columns}
        if "tipo" not in column_names:
            conn.execute(text("alter table release_items add column tipo varchar(20)"))
        if "quarter" not in column_names:
            conn.execute(text("alter table release_items add column quarter varchar(20)"))
        columns = conn.execute(
            text(
                "select column_name from information_schema.columns "
                "where table_name = 'celulas'"
            )
        ).fetchall()
        column_names = {row[0] for row in columns}
        if "jira_codigo" not in column_names:
            conn.execute(text("alter table celulas add column jira_codigo varchar(20)"))

        # Tasks: add start_date for Kanban/backlog automation (Notion-like).
        columns = conn.execute(
            text(
                "select column_name from information_schema.columns "
                "where table_name = 'tasks'"
            )
        ).fetchall()
        column_names = {row[0] for row in columns}
        if "start_date" not in column_names:
            conn.execute(text("alter table tasks add column start_date date"))
        if "end_date" not in column_names:
            conn.execute(text("alter table tasks add column end_date date"))
        tables = conn.execute(
            text(
                "select table_name from information_schema.tables "
                "where table_name = 'poker_claims'"
            )
        ).fetchall()
        if tables:
            columns = conn.execute(
                text(
                    "select column_name from information_schema.columns "
                    "where table_name = 'poker_claims'"
                )
            ).fetchall()
            column_names = {row[0] for row in columns}
            if "client_id" not in column_names:
                conn.execute(text("alter table poker_claims add column client_id varchar(64)"))

        # Tasks: add new columns if the table already exists (create_all doesn't alter).
        tasks_cols = conn.execute(
            text(
                "select column_name from information_schema.columns "
                "where table_name = 'tasks'"
            )
        ).fetchall()
        if tasks_cols:
            task_col_names = {row[0] for row in tasks_cols}
            if "tipo" not in task_col_names:
                conn.execute(text("alter table tasks add column tipo varchar(30)"))
            if "etiquetas" not in task_col_names:
                conn.execute(text("alter table tasks add column etiquetas text"))
            if "puntos" not in task_col_names:
                conn.execute(text("alter table tasks add column puntos double precision"))
            if "horas_estimadas" not in task_col_names:
                conn.execute(text("alter table tasks add column horas_estimadas double precision"))
            if "importante" not in task_col_names:
                conn.execute(text("alter table tasks add column importante boolean not null default false"))

        # Compras: ensure item ticket-check column exists for cross-device validation.
        compra_items_cols = conn.execute(
            text(
                "select column_name from information_schema.columns "
                "where table_name = 'compra_items'"
            )
        ).fetchall()
        if compra_items_cols:
            compra_items_col_names = {row[0] for row in compra_items_cols}
            if "ticket_validado" not in compra_items_col_names:
                conn.execute(
                    text("alter table compra_items add column ticket_validado boolean not null default false")
                )
            if "ticket_diferente" not in compra_items_col_names:
                conn.execute(
                    text("alter table compra_items add column ticket_diferente boolean not null default false")
                )
            if "precio_ticket_unitario" not in compra_items_col_names:
                conn.execute(
                    text("alter table compra_items add column precio_ticket_unitario integer null")
                )
            if "total_ticket_item" not in compra_items_col_names:
                conn.execute(
                    text("alter table compra_items add column total_ticket_item integer null")
                )


app.include_router(router)

frontend_dir = Path(__file__).resolve().parent / "frontend"
adminlte_dir = Path(__file__).resolve().parent / "ScrumV2" / "dist"
ui_root = adminlte_dir if adminlte_dir.exists() else frontend_dir
if ui_root.exists():
    app.mount(
        "/ui",
        StaticFiles(directory=str(ui_root), html=True),
        name="ui",
    )
