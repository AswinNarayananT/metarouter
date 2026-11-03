import html
import time
from urllib.parse import quote, urlsplit
import requests
from app.workers.celery_app import celery_app
from app.config import settings

EMAIL_TIMEOUT_SECONDS = 20
RETRY_BASE_SECONDS = 60

# App-only Microsoft Graph token, reused by this worker until shortly before it expires
_graph_token = {"value": None, "expires_at": 0.0}


def outlook_configured() -> bool:
    return all([settings.OUTLOOK_TENANT_ID, settings.OUTLOOK_CLIENT_ID, settings.OUTLOOK_CLIENT_SECRET, settings.OUTLOOK_EMAILS_FROM_EMAIL])


def _get_graph_token() -> str:
    # 1. Still valid for at least a minute: reuse it
    if _graph_token["value"] and time.time() < _graph_token["expires_at"] - 60:
        return _graph_token["value"]

    # 2. Client credentials: the app's Application permission Mail.Send
    graph = urlsplit(settings.MS_GRAPH_API_URL)
    response = requests.post(
        f"{settings.OUTLOOK_LOGIN_URL}/{settings.OUTLOOK_TENANT_ID}/oauth2/v2.0/token",
        data={
            "grant_type": "client_credentials",
            "client_id": settings.OUTLOOK_CLIENT_ID,
            "client_secret": settings.OUTLOOK_CLIENT_SECRET,
            "scope": f"{graph.scheme}://{graph.netloc}/.default"
        },
        timeout=EMAIL_TIMEOUT_SECONDS
    )
    if response.status_code != 200:
        raise RuntimeError(f"Outlook token request failed ({response.status_code}): {response.text[:300]}")

    data = response.json()
    _graph_token["value"] = data["access_token"]
    _graph_token["expires_at"] = time.time() + int(data.get("expires_in", 3600))
    return _graph_token["value"]


def send_email(to_email: str, subject: str, html_content: str):
    # Sent as OUTLOOK_EMAILS_FROM_EMAIL through Microsoft Graph; 202 = accepted for delivery
    message = {
        "message": {
            "subject": subject,
            "body": {"contentType": "HTML", "content": html_content},
            "toRecipients": [{"emailAddress": {"address": to_email}}]
        },
        "saveToSentItems": False
    }
    response = requests.post(
        f"{settings.MS_GRAPH_API_URL}/users/{quote(settings.OUTLOOK_EMAILS_FROM_EMAIL)}/sendMail",
        json=message,
        headers={"Authorization": f"Bearer {_get_graph_token()}"},
        timeout=EMAIL_TIMEOUT_SECONDS
    )
    if response.status_code == 401:
        _graph_token["value"] = None  # Revoked or expired early: the retry gets a new token
    if response.status_code != 202:
        raise RuntimeError(f"Outlook sendMail failed ({response.status_code}): {response.text[:300]}")


@celery_app.task(name="send_invitation_email_task", bind=True, max_retries=3)
def send_invitation_email_task(self, to_email: str, name: str, org_name: str, invite_link: str):
    """
    Celery background task to send workspace invitation emails through Outlook (Microsoft Graph).
    """
    # Collapse whitespace so a newline in the org name can't break the subject
    subject = f"You've been invited to join {' '.join(org_name.split())} on MetaRouter"

    # name / org_name are user-provided: escape them so they can't inject HTML or links
    safe_name = html.escape(name)
    safe_org_name = html.escape(org_name)
    safe_link = html.escape(invite_link, quote=True)

    html_content = f"""
    <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 10px; background-color: #f9fafb;">
        <h2 style="color: #111827;">Welcome to {safe_org_name}, {safe_name}!</h2>
        <p style="color: #374151; font-size: 14px;">You have been invited to join the workspace as a team member.</p>
        <p style="color: #374151; font-size: 14px;">Click the secure button below to set up your password and access your account. This link is valid for 3 days.</p>
        <div style="margin: 30px 0;">
            <a href="{safe_link}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 14px;">Accept Invitation</a>
        </div>
        <p style="color: #6b7280; font-size: 12px;">If you didn't expect this invitation, you can safely ignore this email.</p>
    </div>
    """

    try:
        send_email(to_email, subject, html_content)
    except Exception as exc:
        # Retry up to 3 times with exponential backoff: 60s, 120s, 240s
        raise self.retry(exc=exc, countdown=RETRY_BASE_SECONDS * 2 ** self.request.retries)


@celery_app.task(name="send_password_reset_email_task", bind=True, max_retries=3)
def send_password_reset_email_task(self, to_email: str, name: str, reset_link: str, expires_minutes: int):
    """
    Celery background task to send a "forgot password" link.
    """
    subject = "Reset your MetaRouter password"
    safe_name = html.escape(name)
    safe_link = html.escape(reset_link, quote=True)

    html_content = f"""
    <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 10px; background-color: #f9fafb;">
        <h2 style="color: #111827;">Hi {safe_name},</h2>
        <p style="color: #374151; font-size: 14px;">We received a request to reset your MetaRouter password.</p>
        <p style="color: #374151; font-size: 14px;">Click the button below to choose a new password. This link works once and expires in {expires_minutes} minutes.</p>
        <div style="margin: 30px 0;">
            <a href="{safe_link}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 14px;">Reset password</a>
        </div>
        <p style="color: #6b7280; font-size: 12px;">If you didn't ask for this, you can ignore this email. Your password won't change.</p>
    </div>
    """

    try:
        send_email(to_email, subject, html_content)
    except Exception as exc:
        raise self.retry(exc=exc, countdown=RETRY_BASE_SECONDS * 2 ** self.request.retries)


@celery_app.task(name="send_organization_onboarding_email_task", bind=True, max_retries=3)
def send_organization_onboarding_email_task(
    self, to_email: str, org_name: str | None, invite_link: str, expires_days: int = 3
):
    """
    Celery background task to send workspace onboarding invitation emails.
    """
    if not outlook_configured():
        # If Outlook is not configured in environment, log and exit gracefully
        print(f"[EMAIL] Outlook not configured; skipping email dispatch to {to_email}. Link: {invite_link}")
        return

    subject = "You're invited to launch your workspace on MetaRouter"
    safe_org = html.escape(org_name) if org_name else "your new workspace"
    safe_link = html.escape(invite_link, quote=True)

    html_content = f"""
    <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #eaeaea; border-radius: 12px; background-color: #f9fafb;">
        <h2 style="color: #111827; margin-top: 0;">Welcome to MetaRouter</h2>
        <p style="color: #374151; font-size: 14px; line-height: 1.5;">You have been invited to set up <strong>{safe_org}</strong> as a workspace administrator.</p>
        <p style="color: #374151; font-size: 14px; line-height: 1.5;">Click the secure link below to configure your workspace name, set your private password, and activate your account. This link expires in {expires_days} days.</p>
        <div style="margin: 32px 0;">
            <a href="{safe_link}" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block; font-size: 14px;">Set Up Workspace</a>
        </div>
        <p style="color: #6b7280; font-size: 12px; margin-bottom: 0;">Zero-Knowledge Security: Your password is encrypted and private. Platform administrators cannot view or manage your password.</p>
    </div>
    """

    try:
        send_email(to_email, subject, html_content)
    except Exception as exc:
        raise self.retry(exc=exc, countdown=RETRY_BASE_SECONDS * 2 ** self.request.retries)
