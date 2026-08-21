"""Add indexes for task and release filters."""

from alembic import op


revision = "20260821_0003"
down_revision = "20260820_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE INDEX IF NOT EXISTS ix_tasks_sprint_id ON tasks (sprint_id)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_tasks_assignee_persona_id "
        "ON tasks (assignee_persona_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_release_items_quarter "
        "ON release_items (quarter)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_release_items_status "
        "ON release_items (status)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_release_items_status")
    op.execute("DROP INDEX IF EXISTS ix_release_items_quarter")
    op.execute("DROP INDEX IF EXISTS ix_tasks_assignee_persona_id")
    op.execute("DROP INDEX IF EXISTS ix_tasks_sprint_id")
