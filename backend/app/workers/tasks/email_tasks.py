import html
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.workers.celery_app import celery_app
from app.config import settings

SMTP_TIMEOUT_SECONDS = 20
RETRY_BASE_SECONDS = 60

@celery_app.task(name="send_invitation_email_task", bind=True, max_retries=3)
def send_invitation_email_task(self, to_email: str, name: str, org_name: str, invite_link: str):
    """
    Celery background task to send workspace invitation emails securely via Gmail SMTP.
    """
    # Collapse whitespace so a newline in the org name can't inject extra headers
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

    # Plain-text alternative: emails without one are more likely to be marked as spam
    text_content = (
        f"Welcome to {org_name}, {name}!\n\n"
        "You have been invited to join the workspace as a team member.\n"
        "Open the link below to set up your password and access your account. "
        "This link is valid for 3 days.\n\n"
        f"{invite_link}\n\n"
        "If you didn't expect this invitation, you can safely ignore this email.\n"
    )

    message = MIMEMultipart("alternative")
    message["Subject"] = subject
    message["From"] = settings.EMAILS_FROM_EMAIL
    message["To"] = to_email
    # Order matters: clients show the last part they support, so HTML goes last
    message.attach(MIMEText(text_content, "plain"))
    message.attach(MIMEText(html_content, "html"))

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=SMTP_TIMEOUT_SECONDS) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.EMAILS_FROM_EMAIL, to_email, message.as_string())
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

    text_content = (
        f"Hi {name},\n\n"
        "We received a request to reset your MetaRouter password.\n"
        f"Open the link below to choose a new password. It works once and expires in {expires_minutes} minutes.\n\n"
        f"{reset_link}\n\n"
        "If you didn't ask for this, you can ignore this email. Your password won't change.\n"
    )

    message = MIMEMultipart("alternative")
    message["Subject"] = subject
    message["From"] = settings.EMAILS_FROM_EMAIL
    message["To"] = to_email
    message.attach(MIMEText(text_content, "plain"))
    message.attach(MIMEText(html_content, "html"))

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=SMTP_TIMEOUT_SECONDS) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.EMAILS_FROM_EMAIL, to_email, message.as_string())
    except Exception as exc:
        raise self.retry(exc=exc, countdown=RETRY_BASE_SECONDS * 2 ** self.request.retries)


@celery_app.task(name="send_organization_onboarding_email_task", bind=True, max_retries=3)
def send_organization_onboarding_email_task(
    self, to_email: str, org_name: str | None, invite_link: str, expires_days: int = 3
):
    """
    Celery background task to send workspace onboarding invitation emails.
    """
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        # If SMTP is not configured in environment, log and exit gracefully
        print(f"[EMAIL] SMTP not configured; skipping email dispatch to {to_email}. Link: {invite_link}")
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

    text_content = (
        f"Welcome to MetaRouter!\n\n"
        f"You have been invited to set up {org_name or 'your workspace'} as a workspace administrator.\n"
        f"Open the link below to configure your workspace and set your password. This link expires in {expires_days} days:\n\n"
        f"{invite_link}\n\n"
        "Your password is private and never visible to platform administrators."
    )

    message = MIMEMultipart("alternative")
    message["Subject"] = subject
    message["From"] = settings.EMAILS_FROM_EMAIL or "no-reply@metarouter.ai"
    message["To"] = to_email
    message.attach(MIMEText(text_content, "plain"))
    message.attach(MIMEText(html_content, "html"))

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=SMTP_TIMEOUT_SECONDS) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.EMAILS_FROM_EMAIL or "no-reply@metarouter.ai", to_email, message.as_string())
    except Exception as exc:
        raise self.retry(exc=exc, countdown=RETRY_BASE_SECONDS * 2 ** self.request.retries)

