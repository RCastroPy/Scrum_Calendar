from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from sqlalchemy.orm import joinedload
from sqlalchemy import text

from api.routes import router
from data.db import SessionLocal, engine
from data.models import Base, Sesion, now_py

app = FastAPI(title="Scrum Calendar", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    path = request.url.path
    if request.method == "OPTIONS":
        return await call_next(request)
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
            return response
        token = request.cookies.get("scrum_session")
        if not token:
            return RedirectResponse(url="/ui/login.html")
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        return response
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
        return await call_next(request)
    token = request.cookies.get("scrum_session")
    if not token:
        return JSONResponse(status_code=401, content={"detail": "No autenticado"})
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
            return JSONResponse(status_code=401, content={"detail": "No autenticado"})
        if (
            request.method not in {"GET", "HEAD", "OPTIONS"}
            and session.usuario.rol != "admin"
            and not path.startswith("/tasks")
        ):
            return JSONResponse(status_code=403, content={"detail": "Sin permisos"})
        request.state.user = session.usuario
        return await call_next(request)
    finally:
        db.close()


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
