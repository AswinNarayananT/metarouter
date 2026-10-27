"""keep only real organization feature overrides

Revision ID: 61c07f05ed84
Revises: 15519ab60474
Create Date: 2026-10-27 16:17:10.852555

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '61c07f05ed84'
down_revision: Union[str, Sequence[str], None] = '15519ab60474'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Workspaces were created with every module copied in, so a module's default never reached them.
    # Keep only values that differ from the module's default, and drop keys of modules that don't exist.
    op.execute("""
        UPDATE organizations o
        SET features = COALESCE((
            SELECT jsonb_object_agg(f.key, f.value)
            FROM jsonb_each(o.features) f
            JOIN platform_modules m ON m.key = f.key
            WHERE f.value::text::boolean IS DISTINCT FROM m.default_enabled
        ), '{}'::jsonb)
    """)


def downgrade() -> None:
    """Downgrade schema."""
    pass
