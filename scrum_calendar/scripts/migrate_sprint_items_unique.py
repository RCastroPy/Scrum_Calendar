from sqlalchemy import text

from data.db import engine


def main() -> None:
    with engine.begin() as conn:
        if engine.dialect.name == "sqlite":
            print("SQLite no soporta alter de constraints facilmente. Omite migracion.")
            return
        conn.execute(text("ALTER TABLE sprint_items DROP CONSTRAINT IF EXISTS sprint_items_issue_key_key"))
        conn.execute(
            text(
                "ALTER TABLE sprint_items ADD CONSTRAINT uq_sprint_items_issue_sprint UNIQUE (issue_key, sprint_id)"
            )
        )
        print("Constraint actualizado para (issue_key, sprint_id).")


if __name__ == "__main__":
    main()
