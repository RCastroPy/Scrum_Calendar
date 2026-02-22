#!/usr/bin/env python3
"""
Credential rotation helper for docker-compose deployments.

This script runs from host and does:
1) Rotate PostgreSQL password for DATABASE_URL user (via `docker compose exec db psql`).
2) Invalidate active app sessions (`DELETE FROM sesiones`).
3) Update host env file (`.env`) with new DATABASE_URL + DB_* vars.

Default mode is dry-run. Use --apply to execute.
"""

from __future__ import annotations

import argparse
import os
import secrets
import subprocess
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit


def _read_env_file(path: Path) -> list[str]:
    if not path.exists():
        return []
    return path.read_text(encoding="utf-8").splitlines()


def _parse_env_map(path: Path) -> dict[str, str]:
    data: dict[str, str] = {}
    for line in _read_env_file(path):
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        data[key.strip()] = value.strip()
    return data


def _write_env_file(path: Path, values: dict[str, str]) -> None:
    lines = _read_env_file(path)
    output: list[str] = []
    pending = dict(values)

    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in line:
            output.append(line)
            continue
        key, _old = line.split("=", 1)
        key = key.strip()
        if key in pending:
            output.append(f"{key}={pending.pop(key)}")
        else:
            output.append(line)

    if pending:
        if output and output[-1].strip():
            output.append("")
        output.append("# Updated by scripts/rotate_credentials.py")
        for key in sorted(pending.keys()):
            output.append(f"{key}={pending[key]}")

    path.write_text("\n".join(output) + "\n", encoding="utf-8")


def _mask_database_url(raw: str) -> str:
    try:
        parsed = urlsplit(raw)
        host = parsed.hostname or "db"
        port = parsed.port or 5432
        user = unquote(parsed.username or "")
        db_name = parsed.path.lstrip("/")
        return f"{parsed.scheme}://{user}:***@{host}:{port}/{db_name}"
    except Exception:
        return raw


def _run_sql(project_dir: Path, db_user: str, db_name: str, sql: str) -> int:
    cmd = [
        "docker",
        "compose",
        "exec",
        "-T",
        "db",
        "psql",
        "-U",
        db_user,
        "-d",
        db_name,
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        sql,
    ]
    proc = subprocess.run(cmd, cwd=str(project_dir), capture_output=True, text=True)
    if proc.returncode != 0:
        stderr = (proc.stderr or "").strip()
        stdout = (proc.stdout or "").strip()
        raise RuntimeError(stderr or stdout or "psql execution failed")
    out = (proc.stdout or "").strip()
    if out:
        print(out)
    return proc.returncode


def _build_database_url(scheme: str, user: str, password: str, host: str, port: int, db_name: str) -> str:
    q_user = quote(user, safe="")
    q_password = quote(password, safe="")
    return f"{scheme}://{q_user}:{q_password}@{host}:{port}/{db_name}"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Rotate DB credentials + invalidate sessions.")
    parser.add_argument("--env-file", default=".env", help="Env file to read/write (default: .env)")
    parser.add_argument(
        "--fallback-env-file",
        default=".env.example",
        help="Fallback env source when --env-file does not contain DATABASE_URL.",
    )
    parser.add_argument("--new-password", default="", help="Set explicit DB password (optional).")
    parser.add_argument("--password-length", type=int, default=32, help="Length for generated password.")
    parser.add_argument(
        "--no-rotate-db-password",
        action="store_true",
        help="Skip DB password rotation.",
    )
    parser.add_argument(
        "--no-invalidate-sessions",
        action="store_true",
        help="Skip session invalidation.",
    )
    parser.add_argument("--apply", action="store_true", help="Apply changes.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    project_dir = Path(__file__).resolve().parents[1]
    env_file = (project_dir / args.env_file).resolve()
    fallback_env_file = (project_dir / args.fallback_env_file).resolve()

    rotate_password = not args.no_rotate_db_password
    invalidate_sessions = not args.no_invalidate_sessions

    env_data = _parse_env_map(env_file)
    fallback_data = _parse_env_map(fallback_env_file)
    database_url = (
        os.environ.get("DATABASE_URL")
        or env_data.get("DATABASE_URL")
        or fallback_data.get("DATABASE_URL")
        or ""
    ).strip()
    if not database_url:
        raise SystemExit("ERROR: DATABASE_URL not found in environment or env files.")

    parsed = urlsplit(database_url)
    scheme = parsed.scheme
    if not scheme.startswith("postgresql"):
        raise SystemExit("ERROR: only PostgreSQL DATABASE_URL is supported.")
    db_user = unquote(parsed.username or "")
    db_name = parsed.path.lstrip("/")
    db_host = parsed.hostname or "db"
    db_port = parsed.port or 5432
    if not db_user or not db_name:
        raise SystemExit("ERROR: DATABASE_URL must include username and database name.")

    new_password = args.new_password.strip()
    if rotate_password and not new_password:
        size = max(16, int(args.password_length or 32))
        new_password = secrets.token_urlsafe(size)[:size]

    if rotate_password:
        new_database_url = _build_database_url(
            scheme=scheme,
            user=db_user,
            password=new_password,
            host=db_host,
            port=db_port,
            db_name=db_name,
        )
    else:
        new_database_url = database_url

    print("=== Rotation Plan ===")
    print(f"- Apply mode: {'YES' if args.apply else 'NO (dry-run)'}")
    print(f"- Current DATABASE_URL: {_mask_database_url(database_url)}")
    print(f"- Rotate DB password: {'YES' if rotate_password else 'NO'}")
    print(f"- Invalidate sessions: {'YES' if invalidate_sessions else 'NO'}")
    print(f"- Env file target: {env_file}")
    if rotate_password:
        print(f"- New DATABASE_URL: {_mask_database_url(new_database_url)}")

    if not args.apply:
        print("Dry-run completed. Re-run with --apply to execute.")
        return 0

    if rotate_password:
        escaped_password = new_password.replace("'", "''")
        escaped_role = db_user.replace('"', '""')
        _run_sql(
            project_dir,
            db_user,
            db_name,
            f"ALTER ROLE \"{escaped_role}\" WITH PASSWORD '{escaped_password}';",
        )

    if invalidate_sessions:
        _run_sql(project_dir, db_user, db_name, "DELETE FROM sesiones;")

    if rotate_password:
        _write_env_file(
            env_file,
            {
                "DATABASE_URL": new_database_url,
                "DB_USER": db_user,
                "DB_PASSWORD": new_password,
                "DB_NAME": db_name,
            },
        )

    print("=== Rotation Result ===")
    if rotate_password:
        print("- DB password rotated successfully.")
        print("- Env file updated.")
    if invalidate_sessions:
        print("- Sessions invalidated.")
    print("Next step: restart services with `docker compose up -d --build`.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
