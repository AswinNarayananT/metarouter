import time
import redis
from fastapi import HTTPException
from app.config import settings
from app.core.redis_client import redis_client

# Revoked tokens by jti. Each entry expires when the token itself would, so the list never grows.
# "logout" = revoked now; "rotated:<time>" = a refresh token replaced by a newer one (still accepted for a short grace period)


def _key(jti: str) -> str:
    return f"token-blacklist:{jti}"


def _family_key(family: str) -> str:
    return f"token-family-revoked:{family}"


def blacklist_token(payload: dict, reason: str = "logout", only_first: bool = False):
    # only_first: keep an earlier entry (a token's rotation time is set once, so replays can't extend its grace period)
    jti = payload.get("jti")
    remaining = int(payload.get("exp", 0) - time.time())
    if not jti or remaining <= 0:
        return  # Already expired: nothing to revoke
    try:
        redis_client.set(_key(jti), reason, ex=remaining, nx=only_first)
    except redis.RedisError:
        raise HTTPException(status_code=503, detail="Service temporarily unavailable. Try again shortly.")


def revoke_token_family(payload: dict):
    # Ends every refresh token of one login (logout, or a replaced token used again after its grace period)
    family = payload.get("family")
    if not family:
        return
    try:
        redis_client.set(_family_key(family), "1", ex=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60)
    except redis.RedisError:
        raise HTTPException(status_code=503, detail="Service temporarily unavailable. Try again shortly.")


def is_token_revoked(payload: dict) -> bool:
    jti = payload.get("jti")
    # Tokens issued before blacklisting existed have no jti and can't be revoked: treat them as invalid (log in again once)
    if not jti:
        return True

    # Redis down: refuse rather than accept a token that might have been revoked
    try:
        family = payload.get("family")
        if family and redis_client.exists(_family_key(family)):
            return True
        value = redis_client.get(_key(jti))
    except redis.RedisError:
        raise HTTPException(status_code=503, detail="Service temporarily unavailable. Try again shortly.")

    if value is None:
        return False

    # A refresh token replaced moments ago still works, so parallel tabs refreshing together don't log the user out
    value = value.decode()
    if value.startswith("rotated:"):
        return time.time() - float(value.split(":", 1)[1]) > settings.REFRESH_ROTATION_GRACE_SECONDS
    return True


def rotation_marker() -> str:
    return f"rotated:{time.time()}"
