"""add ai settings greeting message

Revision ID: c4f8a2e6d9b1
Revises: b7e2d4a9c1f3
Create Date: 2026-10-31 16:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4f8a2e6d9b1'
down_revision: Union[str, Sequence[str], None] = 'b7e2d4a9c1f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('organization_ai_settings', sa.Column('greeting_message', sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('organization_ai_settings', 'greeting_message')
