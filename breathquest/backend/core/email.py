"""
core/email.py — sends OTP verification codes via Gmail SMTP. Deliberately
plain smtplib rather than a transactional-email SDK: this is one templated
message, low volume (login-gate OTPs, not marketing/bulk mail), so a full
provider integration would be more dependency than the job needs.
"""

import smtplib
import ssl
from email.mime.text import MIMEText

from core.config import get_settings

settings = get_settings()


def send_otp_email(to_email: str, code: str) -> None:
    if not settings.SMTP_HOST or not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        # Fails loudly rather than silently no-op'ing -- a verification
        # flow that "succeeds" without actually sending anything would be
        # a much worse failure mode than an explicit 500 here.
        raise RuntimeError(
            "SMTP is not configured (SMTP_HOST/SMTP_USER/SMTP_PASSWORD) -- "
            "cannot send OTP email"
        )

    message = MIMEText(
        f"Your verification code is: {code}\n\nThis code expires in 10 minutes."
    )
    message["Subject"] = "Your verification code"
    message["From"] = settings.SMTP_USER
    message["To"] = to_email

    context = ssl.create_default_context()
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
        server.starttls(context=context)
        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.sendmail(settings.SMTP_USER, [to_email], message.as_string())
