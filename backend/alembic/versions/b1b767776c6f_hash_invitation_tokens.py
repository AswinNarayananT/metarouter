"""hash invitation tokens

Revision ID: b1b767776c6f
Revises: d85b6bb64a89
Create Date: 2026-11-05 11:03:17.683373

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b1b767776c6f'
down_revision: Union[str, Sequence[str], None] = 'd85b6bb64a89'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Hash the invite tokens already stored; links in sent emails keep working (same SHA-256 as hash_invite_token)."""
    op.execute("UPDATE invitations SET token = encode(sha256(convert_to(token, 'UTF8')), 'hex')")


def downgrade() -> None:
    """A hash can't be turned back into the token, so stored tokens stay hashed."""
    pass
