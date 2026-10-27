"""store organization invite tokens as hashes

Revision ID: 1d4d5480a23c
Revises: 61c07f05ed84
Create Date: 2026-10-27 16:39:26.287639

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1d4d5480a23c'
down_revision: Union[str, Sequence[str], None] = '61c07f05ed84'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Replace each stored invite link with its SHA-256 hash (same as app.core.security.hash_invite_token),
    # so links already emailed keep working but the database no longer holds usable links
    op.execute("UPDATE organization_invitations SET token = encode(sha256(convert_to(token, 'UTF8')), 'hex')")


def downgrade() -> None:
    """Downgrade schema."""
    pass
