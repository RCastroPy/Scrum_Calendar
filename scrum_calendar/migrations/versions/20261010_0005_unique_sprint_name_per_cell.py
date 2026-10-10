"""Prevent duplicate sprint names within the same cell."""

from alembic import op


revision = "20261010_0005"
down_revision = "20261010_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_sprints_celula_nombre_ci "
        "ON sprints (celula_id, lower(trim(nombre)))"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_sprints_celula_nombre_ci")
