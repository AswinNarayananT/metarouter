import time
import redis
from fastapi import HTTPException
from app.config import settings
from app.core.redis_client import redis_client

# Revoked tokens by jti. Each entry expires when the token itself would, so the list never grows.
# "logout" = revoked now; "rotated:<time>" = a refresh token replaced by a newer one (still accepted for a short grace period)


def _key(jti: str) -> str:
    return f"token-blacklist:{jti}"


def blacklist_token(payload: dict, reason: str = "logout"):
    jti = payload.get("jti")
    remaining = int(payload.get("exp", 0) - time.time())
    if not jti or remaining <= 0:
        return  # Already expired: nothing to revoke
    try:
        redis_client.set(_key(jti), reason, ex=remaining)
    except redis.RedisError:
        raise HTTPException(status_code=503, detail="Service temporarily unavailable. Try again shortly.")


def is_token_revoked(payload: dict) -> bool:
    jti = payload.get("jti")
    # Tokens issued before blacklisting existed have no jti and can't be revoked: treat them as invalid (log in again once)
    if not jti:
        return True

    # Redis down: refuse rather than accept a token that might have been revoked
    try:
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
