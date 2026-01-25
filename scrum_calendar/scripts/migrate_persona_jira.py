from sqlalchemy import text

from data.db import engine


def column_exists(conn, column_name: str) -> bool:
    if engine.dialect.name == "sqlite":
        rows = conn.execute(text("PRAGMA table_info(personas)")).fetchall()
        return any(row[1] == column_name for row in rows)
    row = conn.execute(
        text(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'personas' AND column_name = :column
            """
        ),
        {"column": column_name},
    ).fetchone()
    return row is not None


def main() -> None:
    with engine.begin() as conn:
        if column_exists(conn, "jira_usuario"):
            print("Columna jira_usuario ya existe.")
            return
        if engine.dialect.name == "sqlite":
            conn.execute(text("ALTER TABLE personas ADD COLUMN jira_usuario VARCHAR(120)"))
        else:
            conn.execute(
                text("ALTER TABLE personas ADD COLUMN IF NOT EXISTS jira_usuario VARCHAR(120)")
            )
        print("Columna jira_usuario creada.")


if __name__ == "__main__":
    main()
