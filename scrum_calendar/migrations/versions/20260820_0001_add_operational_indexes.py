"""Add indexes used by task hierarchy and daily queries.

Revision ID: 20260820_0001
Revises:
"""

from alembic import op

revision = "20260820_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE INDEX IF NOT EXISTS ix_tasks_parent_id ON tasks (parent_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_tasks_estado ON tasks (estado)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_tasks_fecha_vencimiento ON tasks (fecha_vencimiento)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_tasks_celula_sprint ON tasks (celula_id, sprint_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_release_items_issue_key ON release_items (issue_key)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_release_items_celula_sprint ON release_items (celula_id, sprint_id)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_release_items_celula_sprint")
    op.execute("DROP INDEX IF EXISTS ix_release_items_issue_key")
    op.execute("DROP INDEX IF EXISTS ix_tasks_celula_sprint")
    op.execute("DROP INDEX IF EXISTS ix_tasks_fecha_vencimiento")
    op.execute("DROP INDEX IF EXISTS ix_tasks_estado")
    op.execute("DROP INDEX IF EXISTS ix_tasks_parent_id")
