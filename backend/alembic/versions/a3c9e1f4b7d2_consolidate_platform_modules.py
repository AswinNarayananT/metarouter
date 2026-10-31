"""consolidate platform modules

Revision ID: a3c9e1f4b7d2
Revises: f81de90d9d23
Create Date: 2026-10-31 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a3c9e1f4b7d2'
down_revision: Union[str, Sequence[str], None] = 'f81de90d9d23'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Rows as they were before this migration, so downgrade() can put them back
RETIRED_MODULES = [
    ("overview", "Workspace Overview", "Real-time overview metrics, activity trends, and analytics dashboard.", "Core", "LayoutDashboard"),
    ("channels", "WhatsApp Channels", "Connect and manage official Meta WhatsApp Cloud API phone lines.", "Infrastructure", "Cable"),
    ("ai_assistant", "AI Automated Assistant", "Gemini-powered automated customer agent, custom prompts, and fallback logic.", "Intelligence", "Bot"),
    ("tickets", "Customer Ticketing", "Ticketing system, human agent assignment, priority, and resolution tracking.", "Support", "Ticket"),
    ("team_members", "Team Members", "Workspace member directory, roles, and access control.", "Administration", "Users"),
    ("invite_members", "Invite Members", "Generate and dispatch invitations for new team members.", "Administration", "UserPlus"),
    ("settings", "Workspace Settings", "Company profile, business hours, and account settings.", "Administration", "Settings"),
]
OLD_CHATS = ("Customer Live Inbox", "Live 1-on-1 agent conversation inbox, chat history, and media attachments.")
NEW_CHATS = ("Customer Chats", "Live inbox, the AI assistant's replies, and tickets for every customer conversation.")


def upgrade() -> None:
    """Upgrade schema."""
    keys = [m[0] for m in RETIRED_MODULES]

    # 1. Overview, Channels, Settings and Team are always on (core); AI assistant and tickets are part of Customer Chats
    op.execute(sa.text("DELETE FROM platform_modules WHERE key = ANY(:keys)").bindparams(keys=keys))

    # 2. Workspaces' overrides for those modules no longer mean anything
    op.execute(sa.text("UPDATE organizations SET features = features - CAST(:keys AS text[])").bindparams(keys=keys))

    # 3. Customer Chats now covers the AI assistant and tickets
    op.execute(sa.text("UPDATE platform_modules SET name = :name, description = :description WHERE key = 'customer_chats'").bindparams(name=NEW_CHATS[0], description=NEW_CHATS[1]))


def downgrade() -> None:
    """Downgrade schema."""
    op.execute(sa.text("UPDATE platform_modules SET name = :name, description = :description WHERE key = 'customer_chats'").bindparams(name=OLD_CHATS[0], description=OLD_CHATS[1]))
    for key, name, description, category, icon in RETIRED_MODULES:
        op.execute(
            sa.text(
                "INSERT INTO platform_modules (key, name, description, category, icon, is_active, default_enabled, created_at) "
                "VALUES (:key, :name, :description, :category, :icon, true, true, now()) ON CONFLICT (key) DO NOTHING"
            ).bindparams(key=key, name=name, description=description, category=category, icon=icon)
        )
