"""Add the missing release issue reference to existing sprint items."""

from alembic import op


revision = "20261010_0004"
down_revision = "20260821_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE sprint_items ADD COLUMN IF NOT EXISTS release_issue_key VARCHAR(60)"
    )


def downgrade() -> None:
    # Keep historical issue references on rollback.
    pass
