import time
from contextlib import asynccontextmanager
from secrets import compare_digest, token_urlsafe
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from sqlalchemy.orm import joinedload

from api.routes import router
from config.settings import settings
from core.audit import log_security_event
from data.db import SessionLocal, engine
from data.models import Base, Sesion, now_py
from app.modules.tasks.interface.routes import router as tasks_router
from app.modules.daily.interface.routes import router as daily_router
from app.modules.daily.interface.sprint_item_routes import router as daily_sprint_item_router
from app.modules.daily.interface.import_routes import router as daily_import_router
from app.modules.releases.interface.comment_routes import router as release_comment_router
from app.modules.releases.interface.crud_routes import router as release_crud_router
from app.modules.releases.interface.import_routes import router as release_import_router


@asynccontextmanager
async def lifespan(_app):
    startup()
    yield

app = FastAPI(
    title="Scrum Calendar",
    version="0.1.0",
    lifespan=lifespan,
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


def _csrf_exempt(path: str) -> bool:
    return (
        path.startswith("/auth/")
        or path.startswith("/public/")
        or path.startswith("/retros/public")
        or path.startswith("/poker/public")
        or path.startswith("/ws/")
    )


def _csrf_response(response: Response, token: str):
    response.set_cookie(
        "csrf_token",
        token,
        httponly=False,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=14 * 24 * 3600,
        path="/",
    )
    return response


@app.get("/auth/csrf")
def csrf_token(request: Request, response: Response):
    token = request.cookies.get("csrf_token") or token_urlsafe(32)
    _csrf_response(response, token)
    return {"csrf_token": token}


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
    if settings.csrf_enabled and request.method in {"POST", "PUT", "PATCH", "DELETE"} and not _csrf_exempt(path):
        expected = request.cookies.get("csrf_token") or ""
        provided = request.headers.get("X-CSRF-Token") or ""
        if not expected or not provided or not compare_digest(expected, provided):
            return _apply_security_headers(JSONResponse(status_code=403, content={"detail": "CSRF token invalido"}))
    return _apply_security_headers(await call_next(request))


@app.middleware("http")
async def request_context_middleware(request: Request, call_next):
    request_id = (request.headers.get("x-request-id") or "").strip() or uuid4().hex
    request.state.request_id = request_id
    started = time.perf_counter()
    response = await call_next(request)
    response.headers.setdefault("X-Request-ID", request_id)
    response.headers.setdefault(
        "X-Response-Time-Ms",
        f"{(time.perf_counter() - started) * 1000:.2f}",
    )
    return response


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


def startup():
    Base.metadata.create_all(bind=engine)
app.include_router(router)
app.include_router(tasks_router)
app.include_router(daily_router)
app.include_router(daily_sprint_item_router)
app.include_router(daily_import_router)
app.include_router(release_comment_router)
app.include_router(release_crud_router)
app.include_router(release_import_router)

frontend_dir = Path(__file__).resolve().parent / "frontend"
adminlte_dir = Path(__file__).resolve().parent / "ScrumV2" / "dist"
ui_root = adminlte_dir if adminlte_dir.exists() else frontend_dir
if ui_root.exists():
    app.mount(
        "/ui",
        StaticFiles(directory=str(ui_root), html=True),
        name="ui",
    )
