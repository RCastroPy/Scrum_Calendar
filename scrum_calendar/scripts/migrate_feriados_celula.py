from sqlalchemy import text

from data.db import engine


def migrate():
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                ALTER TABLE feriados
                ADD COLUMN IF NOT EXISTS celula_id INTEGER NULL;
                """
            )
        )
        conn.execute(
            text(
                """
                ALTER TABLE feriados
                ADD CONSTRAINT feriados_celula_id_fkey
                FOREIGN KEY (celula_id) REFERENCES celulas (id);
                """
            )
        )


if __name__ == "__main__":
    migrate()
    print("Migracion feriados celula completada")
