from sqlalchemy import text

from data.db import engine


def main() -> None:
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE sprint_items ADD COLUMN IF NOT EXISTS start_date DATE"))
        conn.execute(text("ALTER TABLE sprint_items ADD COLUMN IF NOT EXISTS end_date DATE"))
        conn.execute(text("ALTER TABLE sprint_items ADD COLUMN IF NOT EXISTS due_date DATE"))
        print("Columnas start_date/end_date/due_date agregadas en sprint_items.")


if __name__ == "__main__":
    main()
