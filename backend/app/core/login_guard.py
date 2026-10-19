from fastapi import HTTPException, Request
from app.config import settings
from app.core.redis_client import redis_client

# Failed logins are counted per email + IP (stops guessing one account) and per IP (stops trying many accounts).
# Browsers call the API directly, so request.client.host is the user's IP; behind a load balancer use its forwarded IP.


def _keys(scope: str, email: str, request: Request) -> tuple[str, str]:
    ip = request.client.host if request.client else "unknown"
    return f"login-fail:{scope}:{email.lower()}:{ip}", f"login-fail:{scope}:ip:{ip}"


def check_login_allowed(scope: str, email: str, request: Request):
    account_key, ip_key = _keys(scope, email, request)
    account_failures = int(redis_client.get(account_key) or 0)
    ip_failures = int(redis_client.get(ip_key) or 0)

    if account_failures >= settings.LOGIN_MAX_ATTEMPTS or ip_failures >= settings.LOGIN_MAX_ATTEMPTS_PER_IP:
        raise HTTPException(status_code=429, detail=f"Too many failed login attempts. Try again in {settings.LOGIN_LOCKOUT_MINUTES} minutes.")


def record_failed_login(scope: str, email: str, request: Request):
    # The window starts at the first failure and isn't extended by later ones
    for key in _keys(scope, email, request):
        if redis_client.incr(key) == 1:
            redis_client.expire(key, settings.LOGIN_LOCKOUT_MINUTES * 60)


def clear_failed_logins(scope: str, email: str, request: Request):
    account_key, _ = _keys(scope, email, request)
    redis_client.delete(account_key)
