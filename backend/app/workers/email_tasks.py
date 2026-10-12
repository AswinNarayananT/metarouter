import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.workers.celery_app import celery_app
from app.config import settings

@celery_app.task(name="send_invitation_email_task", bind=True, max_retries=3)
def send_invitation_email_task(self, to_email: str, name: str, org_name: str, invite_link: str):
    """
    Celery background task to send workspace invitation emails securely via Gmail SMTP.
    """
    subject = f"You've been invited to join {org_name} on MetaRouter"
    
    html_content = f"""
    <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 10px; background-color: #f9fafb;">
        <h2 style="color: #111827;">Welcome to {org_name}, {name}!</h2>
        <p style="color: #374151; font-size: 14px;">You have been invited to join the workspace as a team member.</p>
        <p style="color: #374151; font-size: 14px;">Click the secure button below to set up your password and access your account. This link is valid for 3 days.</p>
        <div style="margin: 30px 0;">
            <a href="{invite_link}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 14px;">Accept Invitation</a>
        </div>
        <p style="color: #6b7280; font-size: 12px;">If you didn't expect this invitation, you can safely ignore this email.</p>
    </div>
    """

    message = MIMEMultipart("alternative")
    message["Subject"] = subject
    message["From"] = settings.EMAILS_FROM_EMAIL
    message["To"] = to_email
    message.attach(MIMEText(html_content, "html"))

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.EMAILS_FROM_EMAIL, to_email, message.as_string())
    except Exception as exc:
        # Retry up to 3 times with an exponential backoff if SMTP fails temporarily
        raise self.retry(exc=exc, countdown=60)