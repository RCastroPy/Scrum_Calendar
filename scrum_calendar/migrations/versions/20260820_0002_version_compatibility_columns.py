"""Version compatibility columns previously created during application startup."""

from alembic import op


revision = "20260820_0002"
down_revision = "20260820_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    statements = (
        "ALTER TABLE release_items ADD COLUMN IF NOT EXISTS tipo VARCHAR(20)",
        "ALTER TABLE release_items ADD COLUMN IF NOT EXISTS quarter VARCHAR(20)",
        "ALTER TABLE release_items ADD COLUMN IF NOT EXISTS release_issue_key VARCHAR(60)",
        "ALTER TABLE celulas ADD COLUMN IF NOT EXISTS jira_codigo VARCHAR(20)",
        "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_date DATE",
        "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS end_date DATE",
        "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS segmento VARCHAR(80)",
        "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tipo VARCHAR(30)",
        "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS etiquetas TEXT",
        "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS puntos DOUBLE PRECISION",
        "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS horas_estimadas DOUBLE PRECISION",
        "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS importante BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS release_issue_key VARCHAR(60)",
        "ALTER TABLE poker_claims ADD COLUMN IF NOT EXISTS client_id VARCHAR(64)",
        "ALTER TABLE compra_items ADD COLUMN IF NOT EXISTS ticket_validado BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE compra_items ADD COLUMN IF NOT EXISTS ticket_diferente BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE compra_items ADD COLUMN IF NOT EXISTS precio_ticket_unitario INTEGER",
        "ALTER TABLE compra_items ADD COLUMN IF NOT EXISTS total_ticket_item INTEGER",
    )
    for statement in statements:
        op.execute(statement)


def downgrade() -> None:
    # These columns may predate Alembic; removing them would risk data loss.
    pass
