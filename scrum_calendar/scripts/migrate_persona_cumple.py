from sqlalchemy import text

from data.db import engine


def migrate():
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                ALTER TABLE personas
                ADD COLUMN IF NOT EXISTS fecha_cumple DATE NULL;
                """
            )
        )


if __name__ == "__main__":
    migrate()
    print("Migracion fecha_cumple completada")
