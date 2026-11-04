from typing import Optional

# Which customer chats a role can see (Settings > Workspace); admins always see everything.
#   all         every chat
#   handovered  chats with the team (human takeover), plus their own
#   assigned    only the chats assigned to them
CHAT_VISIBILITY_OPTIONS = ("all", "handovered", "assigned")
DEFAULT_CHAT_VISIBILITY = {"manager": "all", "service": "all"}
HUMAN_TAKEOVER_STATUS = "human_takeover"  # ConversationStatus.HUMAN_TAKEOVER (models import this file)


def role_chat_visibility(rules: Optional[dict], role: str) -> str:
    # A role without a valid rule sees only its own chats
    if role == "admin":
        return "all"
    rule = (rules or {}).get(role)
    return rule if rule in CHAT_VISIBILITY_OPTIONS else "assigned"


def chat_rule_allows(rule: str, user_id: int, status: Optional[str], assigned_user_id: Optional[int]) -> bool:
    # The one place that decides; the database filter in conversation_service mirrors it
    if rule == "all" or assigned_user_id == user_id:
        return True
    return rule == "handovered" and status == HUMAN_TAKEOVER_STATUS
