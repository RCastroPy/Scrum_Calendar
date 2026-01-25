from sqlalchemy import text

from data.db import engine


def migrate():
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS persona_celulas (
                    persona_id INTEGER NOT NULL,
                    celula_id INTEGER NOT NULL,
                    PRIMARY KEY (persona_id, celula_id),
                    FOREIGN KEY(persona_id) REFERENCES personas (id),
                    FOREIGN KEY(celula_id) REFERENCES celulas (id)
                );
                """
            )
        )
        conn.execute(
            text(
                """
                INSERT INTO persona_celulas (persona_id, celula_id)
                SELECT id, celula_id FROM personas
                WHERE celula_id IS NOT NULL
                ON CONFLICT DO NOTHING;
                """
            )
        )
        conn.execute(text("ALTER TABLE personas DROP CONSTRAINT IF EXISTS personas_celula_id_fkey;"))
        conn.execute(text("ALTER TABLE personas DROP COLUMN IF EXISTS celula_id;"))


if __name__ == "__main__":
    migrate()
    print("Migracion persona_celulas completada")
