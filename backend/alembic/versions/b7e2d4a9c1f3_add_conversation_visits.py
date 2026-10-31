"""add conversation visits

Revision ID: b7e2d4a9c1f3
Revises: a3c9e1f4b7d2
Create Date: 2026-10-31 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7e2d4a9c1f3'
down_revision: Union[str, Sequence[str], None] = 'a3c9e1f4b7d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('conversations', sa.Column('visit_started_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('conversations', sa.Column('intent', sa.String(length=20), nullable=True))
    op.add_column('conversations', sa.Column('menu_sent_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('conversations', 'menu_sent_at')
    op.drop_column('conversations', 'intent')
    op.drop_column('conversations', 'visit_started_at')
