"""
Authentication API for Vehicle Management System.

Universal Cross-Device Polling System for all auth flows:
- Manager Login: Manager enters credentials, clicks email link on any device
- Employee Login: Employee enters credentials, manager approves via email
- Password Reset: User requests reset, clicks email link to proceed
- Email Verification: User verifies email ownership via link

Each flow uses the same AuthActionRequest model and polling endpoints.
"""

import uuid
import secrets
import logging
from datetime import timedelta

from ninja import Router, Schema
from ninja.security import django_auth
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth import get_user_model, authenticate, login, logout
from django.contrib.sites.shortcuts import get_current_site
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes, force_str
from django.template.loader import render_to_string
from django.core.mail import EmailMultiAlternatives
from django.utils.html import strip_tags
from django.http import HttpRequest
from django.utils import timezone
from django.conf import settings
from typing import Optional

from .tokens import account_activation_token
from .models import AuthActionRequest

User = get_user_model()
logger = logging.getLogger(__name__)

# Create router without authentication for public endpoints
auth_router = Router(tags=["Authentication"])

# Auth request expiry time in minutes
AUTH_REQUEST_EXPIRY_MINUTES = 5


# =============================================================================
# Schemas
# =============================================================================

class LoginRequestPayload(Schema):
    email: Optional[str] = None
    username: Optional[str] = None
    password: str
    login_type: str = "manager"  # "manager" or "employee"


class PasswordResetPayload(Schema):
    email: Optional[str] = None
    username: Optional[str] = None


class EmailChangePayload(Schema):
    username: str
    password: str
    backup_email: str
    new_email: str


class AuthResponse(Schema):
    success: bool
    message: str
    request_id: Optional[str] = None  # For polling


class PollStatusResponse(Schema):
    status: str  # "pending", "approved", "rejected", "expired"
    message: str
    action_type: Optional[str] = None
    payload: Optional[dict] = None
    reset_token: Optional[str] = None  # For password reset - use this to set new password


class SetPasswordPayload(Schema):
    reset_token: str  # The request_id from password reset approval
    new_password: str


class RegisterPayload(Schema):
    username: str
    email: str
    backup_email: str
    password: str
    confirm_password: str
    business_name: str


class UserOut(Schema):
    id: int
    email: str
    username: str
    is_manager: bool
    is_superuser: bool
    business_name: str
    business_slug: str
    business_logo: Optional[str] = None
    backup_email: Optional[str] = None
    transactions_access: bool = False


class AuthStatusResponse(Schema):
    authenticated: bool
    user: Optional[UserOut] = None


class ErrorResponse(Schema):
    detail: str


# =============================================================================
# Helper Functions
# =============================================================================

def get_client_ip(request: HttpRequest) -> str:
    """Get client IP address from request."""
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        return x_forwarded_for.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR', '')


def get_frontend_url() -> str:
    """Get the frontend URL for redirects after login."""
    if settings.DEBUG:
        return "http://localhost:5173"
    return getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')


def get_backend_url() -> str:
    """Get the backend API URL for email approval links.
    
    CRITICAL: Email links must point directly to the backend API, not the frontend.
    This bypasses React entirely, making it work exactly like a curl request.
    """
    if settings.DEBUG:
        return "http://localhost:8000"
    return getattr(settings, 'BACKEND_URL', 'http://localhost:8000')


def create_auth_request(user, action_type: str, payload: dict = None, ip_address: str = None, expiry_minutes: int = None) -> AuthActionRequest:
    """Create a universal auth request for any action type."""
    expiry = expiry_minutes or AUTH_REQUEST_EXPIRY_MINUTES
    return AuthActionRequest.objects.create(
        request_id=str(uuid.uuid4()),
        approval_token=secrets.token_urlsafe(32),
        action_type=action_type,
        user=user,
        payload=payload or {},
        expires_at=timezone.now() + timedelta(minutes=expiry),
        ip_address=ip_address
    )


def send_auth_email(
    recipient_email: str,
    subject: str,
    action_url: str,
    message_html: str,
    ref_code: Optional[str] = None
):
    """Send an authentication email with an action link."""
    sender_email = (
        getattr(settings, "EMAIL_FROM", "")
        or getattr(settings, "DEFAULT_FROM_EMAIL", "")
        or getattr(settings, "EMAIL_HOST_USER", "")
    )
    recipient_email = (recipient_email or "").strip()

    if not sender_email:
        raise ValueError("Sender email is not configured.")
    if not recipient_email:
        raise ValueError("Recipient email is not configured.")

    if not ref_code:
        ref_code = secrets.token_hex(3).upper()

    # Always ensure subject has a unique security reference code to prevent Gmail thread grouping
    if f"(Ref: #{ref_code})" not in subject and f"Ref: #{ref_code}" not in subject:
        email_subject = f"[DriveBase] {subject} (Ref: #{ref_code})"
    else:
        email_subject = f"[DriveBase] {subject}"

    # Build clean plain-text fallback that includes the actual URL and reference code
    plain_text = (
        f"DriveBase — {subject}\n\n"
        f"Please complete your action using the secure link below:\n"
        f"{action_url}\n\n"
        f"Security Reference: #{ref_code}\n\n"
        f"If you did not request this, please ignore this email.\n"
        f"© DriveBase Dealership Management. All rights reserved."
    )

    email_message = EmailMultiAlternatives(
        subject=email_subject,
        body=plain_text,
        from_email=sender_email,
        to=[recipient_email],
        headers={
            "Auto-Submitted": "auto-generated",
            "X-Auto-Response-Suppress": "All",
        }
    )
    email_message.attach_alternative(message_html, "text/html")
    email_message.send()


def find_user_by_login_identifier(email: Optional[str] = None, username: Optional[str] = None):
    """
    Resolve a user by email or username for login flows.

    Email lookup is case-insensitive and guards against multiple matches so the
    API can return a clean 400 response instead of a server error.
    """
    if email:
        normalized_email = email.lower().strip()
        matching_users = User.objects.filter(email__iexact=normalized_email)
        match_count = matching_users.count()

        if match_count == 1:
            return matching_users.first(), None
        if match_count > 1:
            logger.warning(
                "Multiple users matched login email '%s'; asking client to use username.",
                normalized_email,
            )
            return None, "Multiple accounts found for this email. Please use your username instead."
        return None, "Invalid credentials"

    if username:
        normalized_username = username.strip()
        user = User.objects.filter(username=normalized_username).first()
        if user:
            return user, None
        return None, "Invalid credentials"

    return None, "Email or username is required"


def build_email_html(
    title: str,
    body: str,
    button_text: str,
    button_url: str,
    expiry_mins: int = 5,
    ref_code: Optional[str] = None
) -> str:
    """Build a consistent email HTML template with DriveBase branding."""
    ref_code = ref_code or secrets.token_hex(3).upper()
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #f8fafc;">
    <!-- Preheader preview text for email clients to prevent preview clipping and three-dot trimming -->
    <div style="display: none; max-height: 0px; overflow: hidden; mso-hide: all; font-size: 1px; line-height: 1px; opacity: 0; color: #f8fafc;">
        DriveBase: {title} (Valid for {expiry_mins} mins) &bull; Ref: #{ref_code}
        &zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
    </div>
    <div style="background-color: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <div style="margin-bottom: 24px; border-bottom: 1px solid #f1f5f9; padding-bottom: 16px;">
            <span style="font-size: 22px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px;">Drive<span style="color: #2563eb;">Base</span></span>
        </div>
        <h2 style="color: #0f172a; margin-top: 0; font-size: 20px; font-weight: 700;">{title}</h2>
        <p style="font-size: 15px; line-height: 1.6; color: #334155;">{body}</p>
        <p style="text-align: center; margin: 32px 0;">
            <a href="{button_url}" 
               style="background-color: #2563eb; color: #ffffff; padding: 14px 28px; 
                      text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;
                      display: inline-block; box-shadow: 0 2px 4px rgba(37,99,235,0.2);">
                {button_text}
            </a>
        </p>
        <div style="margin-top: 24px; color: #64748b; font-size: 13px; line-height: 1.5;">
            <p style="margin: 0 0 6px 0;">This link will expire in {expiry_mins} minutes.</p>
            <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                Security Reference: <span style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-weight: 600; color: #475569; background-color: #f1f5f9; padding: 2px 6px; border-radius: 4px;">#{ref_code}</span>
            </p>
        </div>
        <div style="height: 1px; background-color: #f1f5f9; margin: 24px 0 16px 0; line-height: 1px;"></div>
        <p style="color: #94a3b8; font-size: 12px; line-height: 1.5; margin: 0;">
            If you did not request this, please ignore this email.<br>
            &copy; DriveBase Dealership Management. All rights reserved. &bull; Ref: #{ref_code}
        </p>
    </div>
</body>
</html>
"""


# =============================================================================
# Auth Endpoints
# =============================================================================

@auth_router.post("/auth/request-login", response={200: AuthResponse, 400: ErrorResponse})
@csrf_exempt
def request_login(request: HttpRequest, payload: LoginRequestPayload):
    """
    Request login - handles both manager and employee flows.
    
    Returns request_id for frontend polling.
    """
    password = payload.password
    login_type = payload.login_type
    
    user, lookup_error = find_user_by_login_identifier(
        email=payload.email,
        username=payload.username,
    )
    if lookup_error:
        return 400, {"detail": lookup_error}
    
    # Authenticate with password
    authenticated_user = authenticate(request, username=user.username, password=password)
    
    if not authenticated_user:
        return 400, {"detail": "Invalid credentials"}
    
    # Check user type matches login type
    if login_type == "manager" and not authenticated_user.is_manager:
        return 400, {"detail": "This account is not a manager account. Please use employee login."}
    
    if login_type == "employee" and authenticated_user.is_manager:
        return 400, {"detail": "This account is a manager account. Please use manager login."}
    
    # Determine action type
    action_type = "manager_login" if login_type == "manager" else "employee_login"
    
    # Create auth request
    auth_request = create_auth_request(
        user=authenticated_user,
        action_type=action_type,
        ip_address=get_client_ip(request)
    )
    
    # CRITICAL: Email links must point directly to the backend API, not the frontend
    # This bypasses React entirely - exactly like a curl request
    backend_url = get_backend_url()
    approval_url = f"{backend_url}/api/auth/approve/{auth_request.approval_token}"
    ref_code = auth_request.request_id[:6].upper()
    
    # Determine email recipient and message
    if login_type == "employee":
        # Employee login: email goes to manager
        manager = authenticated_user.business.business_users.filter(is_manager=True).exclude(email="").first()
        if not manager:
            return 400, {"detail": "No manager found for this business"}
        recipient_email = manager.email
        email_html = build_email_html(
            title="Employee Login Request",
            body=f"<strong>{authenticated_user.username}</strong> is requesting to log in to DriveBase.",
            button_text="Approve Login",
            button_url=approval_url,
            expiry_mins=AUTH_REQUEST_EXPIRY_MINUTES,
            ref_code=ref_code,
        )
        email_subject = f"Login Request from {authenticated_user.username}"
    else:
        # Manager login: email goes to manager themselves
        recipient_email = authenticated_user.email
        email_html = build_email_html(
            title="Login Verification",
            body="Click the button below to complete your login.",
            button_text="Complete Login",
            button_url=approval_url,
            expiry_mins=AUTH_REQUEST_EXPIRY_MINUTES,
            ref_code=ref_code,
        )
        email_subject = "Login Verification"

    try:
        send_auth_email(recipient_email, email_subject, approval_url, email_html, ref_code=ref_code)
    except Exception:
        logger.exception(
            "Failed to send %s email for user %s during login request.",
            login_type,
            authenticated_user.pk,
        )
        return 400, {"detail": "Failed to send login email. Please try again."}
    
    return {
        "success": True,
        "message": "Check your email for the login link." if login_type == "manager" else "Waiting for manager approval...",
        "request_id": auth_request.request_id
    }


@auth_router.post("/auth/request-password-reset", response={200: AuthResponse, 400: ErrorResponse})
@csrf_exempt
def request_password_reset(request: HttpRequest, payload: PasswordResetPayload):
    """
    Request password reset.
    
    Returns request_id for frontend polling.
    """
    if not payload.email and not payload.username:
        return 400, {"detail": "Email or username is required"}

    user, lookup_error = find_user_by_login_identifier(
        email=payload.email,
        username=payload.username,
    )
    if lookup_error:
        # Don't reveal whether the account exists or whether the email is duplicated.
        return {"success": True, "message": "If an account exists, a reset link has been sent."}
    
    # Only managers can reset password
    if not user.is_manager:
        return 400, {"detail": "Password reset is only available for manager accounts."}
    
    # Create auth request
    auth_request = create_auth_request(
        user=user,
        action_type="password_reset",
        ip_address=get_client_ip(request)
    )
    
    # CRITICAL: Email links must point directly to the backend API
    backend_url = get_backend_url()
    approval_url = f"{backend_url}/api/auth/approve/{auth_request.approval_token}"
    ref_code = auth_request.request_id[:6].upper()
    
    email_html = build_email_html(
        title="Password Reset",
        body="Click the button below to reset your password.",
        button_text="Reset Password",
        button_url=approval_url,
        expiry_mins=AUTH_REQUEST_EXPIRY_MINUTES,
        ref_code=ref_code,
    )
    
    try:
        send_auth_email(user.email, "Password Reset", approval_url, email_html, ref_code=ref_code)
    except Exception:
        logger.exception("Failed to send password reset email for user %s.", user.pk)
        return 400, {"detail": "Failed to send email. Please try again."}
    
    return {
        "success": True,
        "message": "Check your email for the reset link.",
        "request_id": auth_request.request_id
    }


@auth_router.post("/auth/request-email-change", response={200: AuthResponse, 400: ErrorResponse})
@csrf_exempt
def request_email_change(request: HttpRequest, payload: EmailChangePayload):
    """
    Request email change.
    
    Returns request_id for frontend polling.
    """
    username = payload.username.strip()
    password = payload.password
    backup_email = payload.backup_email.lower().strip()
    new_email = payload.new_email.lower().strip()
    
    # Find and authenticate user
    try:
        user = User.objects.get(username=username)
    except User.DoesNotExist:
        return 400, {"detail": "Invalid credentials"}
    
    authenticated_user = authenticate(request, username=user.username, password=password)
    if not authenticated_user:
        return 400, {"detail": "Invalid credentials"}
    
    if not authenticated_user.is_manager:
        return 400, {"detail": "Email change is only available for manager accounts."}
    
    # Verify backup email matches
    user_backup_email = getattr(authenticated_user, 'backup_email', None)
    if user_backup_email and user_backup_email.lower() != backup_email:
        return 400, {"detail": "Backup email does not match."}
    
    # Check new email not already in use
    if User.objects.filter(email=new_email).exclude(pk=authenticated_user.pk).exists():
        return 400, {"detail": "This email is already in use."}
    
    # Create auth request with new email in payload
    auth_request = create_auth_request(
        user=authenticated_user,
        action_type="verify_email",
        payload={"new_email": new_email},
        ip_address=get_client_ip(request)
    )
    
    # CRITICAL: Email links must point directly to the backend API
    backend_url = get_backend_url()
    approval_url = f"{backend_url}/api/auth/approve/{auth_request.approval_token}"
    ref_code = auth_request.request_id[:6].upper()
    
    email_html = build_email_html(
        title="Email Change Verification",
        body=f"Click the button below to verify changing your email to <strong>{new_email}</strong>.",
        button_text="Verify Email Change",
        button_url=approval_url,
        expiry_mins=AUTH_REQUEST_EXPIRY_MINUTES,
        ref_code=ref_code,
    )
    
    try:
        send_auth_email(backup_email, "Email Change Verification", approval_url, email_html, ref_code=ref_code)
    except Exception:
        return 400, {"detail": "Failed to send verification email. Please try again."}
    
    return {
        "success": True,
        "message": "Verification email sent to your backup email address.",
        "request_id": auth_request.request_id
    }


@auth_router.get("/auth/poll-status/{request_id}", response={200: PollStatusResponse, 202: PollStatusResponse, 404: ErrorResponse, 410: ErrorResponse})
def poll_status(request: HttpRequest, request_id: str):
    """
    Poll the status of an auth request.
    
    Called by frontend every 2 seconds.
    THIS IS THE ENDPOINT THAT ISSUES THE SESSION TO THE POLLING DEVICE.
    
    Returns:
    - 202: Still pending, keep polling
    - 200: Approved (issues session cookie for login actions)
    - 410: Expired or rejected
    - 404: Not found
    """
    try:
        auth_request = AuthActionRequest.objects.get(request_id=request_id)
    except AuthActionRequest.DoesNotExist:
        return 404, {"detail": "Auth request not found"}
    
    # Check expiry
    if auth_request.is_expired():
        if auth_request.status == 'pending':
            auth_request.status = 'expired'
            auth_request.save()
        return 410, {"detail": "Request has expired"}
    
    # PENDING - Keep polling
    if auth_request.status == 'pending':
        return 202, {
            "status": "pending",
            "message": "Waiting for approval...",
            "action_type": auth_request.action_type
        }
    
    # APPROVED - This is where we issue the session!
    elif auth_request.status == 'approved':
        # CRITICAL: For login actions, log the user in HERE (not in /approve)
        if auth_request.action_type in ('manager_login', 'employee_login'):
            # Log the user in - this sets the session cookie
            login(request, auth_request.user)
            # Mark as used for login actions
            auth_request.status = 'used'
            auth_request.save()
        
        # For password reset/change, DON'T mark as used yet - they still need to set password
        # Return the request_id as the reset_token
        if auth_request.action_type in ('password_reset', 'password_change'):
            return 200, {
                "status": "approved",
                "message": "Verified! You can now set a new password.",
                "action_type": auth_request.action_type,
                "payload": auth_request.payload,
                "reset_token": str(auth_request.request_id),  # Use request_id as token
            }
        
        # For email verification, check if completed
        if auth_request.action_type == 'verify_email':
            auth_request.status = 'used'
            auth_request.save()
        
        # For settings email/backup changes that completed fully
        if auth_request.action_type in ('email_change_verify_old', 'backup_email_verify_official'):
            auth_request.status = 'used'
            auth_request.save()
        
        return 200, {
            "status": "approved",
            "message": "Approved! Redirecting...",
            "action_type": auth_request.action_type,
            "payload": auth_request.payload
        }
    
    # WAITING FOR NEW EMAIL - Intermediate state for two-stage email change
    elif auth_request.status == 'waiting_for_new_email':
        return 202, {
            "status": "waiting_for_new_email",
            "message": "Old email verified! Now check your NEW email.",
            "action_type": auth_request.action_type,
            "payload": auth_request.payload
        }
    
    # WAITING FOR BACKUP EMAIL - Registration intermediate state
    elif auth_request.status == 'waiting_for_backup_email':
        return 202, {
            "status": "waiting_for_backup_email",
            "message": "Primary email verified! Now check your backup email.",
            "action_type": auth_request.action_type,
            "payload": auth_request.payload
        }
    
    # WAITING FOR ADMIN - Registration: both emails verified, waiting for admin activation
    elif auth_request.status == 'waiting_for_admin':
        return 202, {
            "status": "waiting_for_admin",
            "message": "Emails verified! Waiting for administrator approval.",
            "action_type": auth_request.action_type,
            "payload": auth_request.payload
        }
    
    # REJECTED
    elif auth_request.status == 'rejected':
        return 410, {"detail": "Request was rejected"}
    
    # USED or other - Already processed
    else:
        return 410, {"detail": "Request is no longer valid"}


@auth_router.get("/auth/approve/{token}")
def approve_request(request: HttpRequest, token: str):
    """
    DUMB ENDPOINT: Approve an auth request.
    
    Called when user clicks the email link.
    
    CRITICAL: This endpoint ONLY updates the database.
    It returns styled HTML via template - no JSON, no session, no login.
    The /poll-status endpoint is the ONLY place that logs users in.
    """
    from django.http import HttpResponse
    from django.template.loader import render_to_string
    
    try:
        auth_request = AuthActionRequest.objects.get(approval_token=token)
    except AuthActionRequest.DoesNotExist:
        html = render_to_string('auth/action_success.html', {
            'status': 'error',
            'title': 'Invalid Link',
            'message': 'This link is invalid or has expired.',
            'action_type': None,
        })
        return HttpResponse(html, content_type="text/html")
    
    if auth_request.is_expired():
        auth_request.status = 'expired'
        auth_request.save()
        html = render_to_string('auth/action_success.html', {
            'status': 'expired',
            'title': 'Link Expired',
            'message': 'This link has expired. Please request a new one.',
            'action_type': None,
        })
        return HttpResponse(html, content_type="text/html")
    
    if auth_request.status != 'pending':
        html = render_to_string('auth/action_success.html', {
            'status': 'success',
            'title': 'Already Processed',
            'message': 'This request has already been processed.',
            'action_type': auth_request.action_type,
        })
        return HttpResponse(html, content_type="text/html")
    
    # CRITICAL: ONLY update the database - NO login(), NO session
    auth_request.approved_at = timezone.now()
    
    # Build context for template
    action = auth_request.action_type
    username = auth_request.user.username
    
    if action == 'employee_login':
        auth_request.status = 'approved'
        auth_request.save()
        title = "Login Approved!"
        message = f"{username}'s device will now log in automatically."
    elif action == 'manager_login':
        auth_request.status = 'approved'
        auth_request.save()
        title = "Login Verified!"
        message = "Your other device will now log in automatically."
    elif action == 'password_reset':
        auth_request.status = 'approved'
        auth_request.save()
        title = "Password Reset Verified!"
        message = "You can now set a new password on your original device."
    elif action == 'verify_email':
        # STAGE 1: Backup email verified - now send to NEW email
        # DO NOT update email yet!
        new_email = auth_request.payload.get('new_email') if auth_request.payload else None
        if not new_email:
            auth_request.status = 'used'
            auth_request.save()
            title = "Error"
            message = "No new email address found in request."
        else:
            # Create Stage 2 request for the new email
            confirm_request = create_auth_request(
                user=auth_request.user,
                action_type='confirm_email',
                payload={'new_email': new_email, 'original_request_id': str(auth_request.request_id)},
                ip_address=None
            )
            
            # Send email to the NEW email address
            backend_url = get_backend_url()
            confirm_url = f"{backend_url}/api/auth/approve/{confirm_request.approval_token}"
            ref_code = confirm_request.request_id[:6].upper()
            
            email_html = build_email_html(
                title="Confirm Your New Email",
                body=f"Click the button below to confirm that you own this email address for <strong>{username}</strong>'s account.",
                button_text="Confirm Email",
                button_url=confirm_url,
                expiry_mins=AUTH_REQUEST_EXPIRY_MINUTES,
                ref_code=ref_code,
            )
            send_auth_email(new_email, "Confirm Your New Email", confirm_url, email_html, ref_code=ref_code)
            
            # Update original request to intermediate state
            # Store the new request_id in payload for frontend polling
            auth_request.payload = auth_request.payload or {}
            auth_request.payload['confirm_request_id'] = str(confirm_request.request_id)
            auth_request.status = 'waiting_for_new_email'
            auth_request.save()
            
            title = "Backup Email Verified!"
            message = f"Great! Now check your NEW email ({new_email}) to complete the change."
    elif action == 'confirm_email':
        # STAGE 2: New email confirmed - NOW update the email!
        new_email = auth_request.payload.get('new_email') if auth_request.payload else None
        original_request_id = auth_request.payload.get('original_request_id') if auth_request.payload else None
        
        if new_email:
            user = auth_request.user
            user.email = new_email
            user.save()
            
            # Also mark the original request as completed
            if original_request_id:
                try:
                    original_request = AuthActionRequest.objects.get(request_id=original_request_id)
                    original_request.status = 'approved'
                    original_request.save()
                except AuthActionRequest.DoesNotExist:
                    pass
        
        auth_request.status = 'used'
        auth_request.save()
        title = "Email Updated!"
        message = f"Your email has been changed to {new_email}."
    
    # --- PASSWORD CHANGE (from User Settings) ---
    elif action == 'password_change':
        auth_request.status = 'approved'
        auth_request.save()
        title = "Password Change Verified!"
        message = "You can now set a new password on your original device."
    
    # --- EMAIL CHANGE from Settings: Stage 1 (old email verified) ---
    elif action == 'email_change_verify_old':
        new_email = auth_request.payload.get('new_email') if auth_request.payload else None
        if not new_email:
            auth_request.status = 'used'
            auth_request.save()
            title = "Error"
            message = "No new email address found in request."
        else:
            # Create Stage 2 request for the NEW email
            confirm_request = create_auth_request(
                user=auth_request.user,
                action_type='email_change_verify_new',
                payload={'new_email': new_email, 'original_request_id': str(auth_request.request_id)},
                ip_address=None
            )
            backend_url = get_backend_url()
            confirm_url = f"{backend_url}/api/auth/approve/{confirm_request.approval_token}"
            ref_code = confirm_request.request_id[:6].upper()
            email_html = build_email_html(
                title="Confirm Your New Email",
                body=f"Click the button below to confirm that <strong>{new_email}</strong> is your new email address.",
                button_text="Confirm New Email",
                button_url=confirm_url,
                expiry_mins=AUTH_REQUEST_EXPIRY_MINUTES,
                ref_code=ref_code,
            )
            send_auth_email(new_email, "Confirm Your New Email", confirm_url, email_html, ref_code=ref_code)
            
            auth_request.payload = auth_request.payload or {}
            auth_request.payload['confirm_request_id'] = str(confirm_request.request_id)
            auth_request.status = 'waiting_for_new_email'
            auth_request.save()
            
            title = "Current Email Verified!"
            message = f"Great! Now check your new email ({new_email}) for the confirmation link."
    
    # --- EMAIL CHANGE from Settings: Stage 2 (new email confirmed) ---
    elif action == 'email_change_verify_new':
        new_email = auth_request.payload.get('new_email') if auth_request.payload else None
        original_request_id = auth_request.payload.get('original_request_id') if auth_request.payload else None
        
        if new_email:
            user = auth_request.user
            user.email = new_email
            user.save()
            if original_request_id:
                try:
                    original_request = AuthActionRequest.objects.get(request_id=original_request_id)
                    original_request.status = 'approved'
                    original_request.save()
                except AuthActionRequest.DoesNotExist:
                    pass
        
        auth_request.status = 'used'
        auth_request.save()
        title = "Email Updated!"
        message = f"Your email has been changed to {new_email}."
    
    # --- BACKUP EMAIL CHANGE: Stage 1 (official email verified) ---
    elif action == 'backup_email_verify_official':
        new_backup = auth_request.payload.get('new_backup_email') if auth_request.payload else None
        if not new_backup:
            auth_request.status = 'used'
            auth_request.save()
            title = "Error"
            message = "No backup email address found in request."
        else:
            confirm_request = create_auth_request(
                user=auth_request.user,
                action_type='backup_email_verify_new',
                payload={'new_backup_email': new_backup, 'original_request_id': str(auth_request.request_id)},
                ip_address=None
            )
            backend_url = get_backend_url()
            confirm_url = f"{backend_url}/api/auth/approve/{confirm_request.approval_token}"
            ref_code = confirm_request.request_id[:6].upper()
            email_html = build_email_html(
                title="Confirm Your Backup Email",
                body=f"Click the button below to confirm that <strong>{new_backup}</strong> is your new backup email.",
                button_text="Confirm Backup Email",
                button_url=confirm_url,
                expiry_mins=AUTH_REQUEST_EXPIRY_MINUTES,
                ref_code=ref_code,
            )
            send_auth_email(new_backup, "Confirm Your Backup Email", confirm_url, email_html, ref_code=ref_code)
            
            auth_request.payload = auth_request.payload or {}
            auth_request.payload['confirm_request_id'] = str(confirm_request.request_id)
            auth_request.status = 'waiting_for_new_email'
            auth_request.save()
            
            title = "Official Email Verified!"
            message = f"Great! Now check your new backup email ({new_backup}) for the confirmation link."
    
    # --- BACKUP EMAIL CHANGE: Stage 2 (new backup email confirmed) ---
    elif action == 'backup_email_verify_new':
        new_backup = auth_request.payload.get('new_backup_email') if auth_request.payload else None
        original_request_id = auth_request.payload.get('original_request_id') if auth_request.payload else None
        
        if new_backup:
            user = auth_request.user
            user.backup_email = new_backup
            user.save()
            if original_request_id:
                try:
                    original_request = AuthActionRequest.objects.get(request_id=original_request_id)
                    original_request.status = 'approved'
                    original_request.save()
                except AuthActionRequest.DoesNotExist:
                    pass
        
        auth_request.status = 'used'
        auth_request.save()
        title = "Backup Email Updated!"
        message = f"Your backup email has been changed to {new_backup}."
    
    # --- REGISTRATION: Stage 1 (primary email verified) ---
    elif action == 'register_verify_email':
        user = auth_request.user
        backup_email = user.backup_email
        
        if not backup_email:
            # No backup email - notify admin directly
            admin_email = getattr(settings, 'ADMIN_EMAIL', None)
            if admin_email:
                admin_request = create_auth_request(
                    user=user,
                    action_type='admin_activate',
                    payload={'original_request_id': str(auth_request.request_id)},
                    ip_address=None,
                    expiry_minutes=60 * 24  # 24 hours for admin
                )
                backend_url = get_backend_url()
                activate_url = f"{backend_url}/api/auth/approve/{admin_request.approval_token}"
                ref_code = admin_request.request_id[:6].upper()
                email_html = build_email_html(
                    title="New Manager Registration",
                    body=f"A new manager <strong>{user.username}</strong> ({user.email}) has registered and needs activation.",
                    button_text="Activate Account",
                    button_url=activate_url,
                    expiry_mins=60 * 24,  # 24 hours for admin
                    ref_code=ref_code,
                )
                send_auth_email(admin_email, f"New Registration: {user.username}", activate_url, email_html, ref_code=ref_code)
            
            auth_request.status = 'waiting_for_admin'
            auth_request.save()
            title = "Email Verified!"
            message = "Your email has been verified. Waiting for administrator approval.\n"
        else:
            # Create Stage 2 request for backup email
            backup_request = create_auth_request(
                user=user,
                action_type='register_verify_backup',
                payload={'original_request_id': str(auth_request.request_id)},
                ip_address=None
            )
            backend_url = get_backend_url()
            confirm_url = f"{backend_url}/api/auth/approve/{backup_request.approval_token}"
            ref_code = backup_request.request_id[:6].upper()
            email_html = build_email_html(
                title="Verify Your Backup Email",
                body=f"Click the button below to verify your backup email for <strong>{user.username}</strong>'s account.",
                button_text="Verify Backup Email",
                button_url=confirm_url,
                expiry_mins=AUTH_REQUEST_EXPIRY_MINUTES,
                ref_code=ref_code,
            )
            send_auth_email(backup_email, "Verify Your Backup Email", confirm_url, email_html, ref_code=ref_code)
            
            auth_request.payload = auth_request.payload or {}
            auth_request.payload['backup_request_id'] = str(backup_request.request_id)
            auth_request.status = 'waiting_for_backup_email'
            auth_request.save()
            
            title = "Primary Email Verified!"
            message = f"Now check your backup email ({backup_email}) for the verification link."
    
    # --- REGISTRATION: Stage 2 (backup email verified) → send admin activation ---
    elif action == 'register_verify_backup':
        original_request_id = auth_request.payload.get('original_request_id') if auth_request.payload else None
        user = auth_request.user
        
        # Send admin activation email
        admin_email = getattr(settings, 'ADMIN_EMAIL', None)
        if admin_email:
            admin_request = create_auth_request(
                user=user,
                action_type='admin_activate',
                payload={'original_request_id': str(auth_request.request_id)},
                ip_address=None,
                expiry_minutes=60 * 24  # 24 hours for admin
            )
            backend_url = get_backend_url()
            activate_url = f"{backend_url}/api/auth/approve/{admin_request.approval_token}"
            ref_code = admin_request.request_id[:6].upper()
            email_html = build_email_html(
                title="New Manager Registration",
                body=f"A new manager <strong>{user.username}</strong> ({user.email}) has registered and needs activation.",
                button_text="Activate Account",
                button_url=activate_url,
                expiry_mins=60 * 24,  # 24 hours for admin
                ref_code=ref_code,
            )
            send_auth_email(admin_email, f"New Registration: {user.username}", activate_url, email_html, ref_code=ref_code)
        
        # Update original registration request to waiting_for_admin
        if original_request_id:
            try:
                original_request = AuthActionRequest.objects.get(request_id=original_request_id)
                original_request.status = 'waiting_for_admin'
                original_request.save()
            except AuthActionRequest.DoesNotExist:
                pass
        
        auth_request.status = 'used'
        auth_request.save()
        title = "Backup Email Verified!"
        message = "Both emails verified! Waiting for administrator approval."
    
    # --- ADMIN ACTIVATE: Admin clicks to activate a new user ---
    elif action == 'admin_activate':
        user = auth_request.user
        user.is_active = True
        user.save()
        
        # Trace back through the chain to find and approve the ROOT registration request
        # Chain: register_verify_email -> register_verify_backup -> admin_activate
        # The frontend polls on the root register_verify_email request_id
        original_request_id = auth_request.payload.get('original_request_id') if auth_request.payload else None
        if original_request_id:
            try:
                intermediate_request = AuthActionRequest.objects.get(request_id=original_request_id)
                # Mark intermediate request as used
                intermediate_request.status = 'used'
                intermediate_request.save()
                
                # Check if this intermediate request has its own original_request_id (the root)
                root_request_id = intermediate_request.payload.get('original_request_id') if intermediate_request.payload else None
                if root_request_id:
                    try:
                        root_request = AuthActionRequest.objects.get(request_id=root_request_id)
                        root_request.status = 'approved'
                        root_request.save()
                    except AuthActionRequest.DoesNotExist:
                        pass
                else:
                    # This IS the root request (no backup email scenario)
                    intermediate_request.status = 'approved'
                    intermediate_request.save()
            except AuthActionRequest.DoesNotExist:
                pass
        
        auth_request.status = 'used'
        auth_request.save()
        title = "Account Activated!"
        message = f"The account for {user.username} has been activated successfully."
    
    else:
        auth_request.status = 'approved'
        auth_request.save()
        title = "Approved!"
        message = "The request has been approved."
    
    html = render_to_string('auth/action_success.html', {
        'status': 'success',
        'title': title,
        'message': message,
        'action_type': action,
    })
    return HttpResponse(html, content_type="text/html")


@auth_router.get("/auth/me", response={200: AuthStatusResponse})
def get_current_user(request: HttpRequest):
    """Get current authenticated user info."""
    if not request.user.is_authenticated:
        return {"authenticated": False, "user": None}
    
    user = request.user
    return {
        "authenticated": True,
        "user": {
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "is_manager": user.is_manager,
            "is_superuser": user.is_superuser,
            "business_name": user.business.name if user.business else "",
            "business_slug": user.business.name.lower().replace(" ", "-") if user.business else "",
            "business_logo": user.business.logo.url if user.business and user.business.logo else None,
            "backup_email": user.backup_email or "",
            "transactions_access": user.transactions_access,
        }
    }


@auth_router.post("/auth/logout", response={200: AuthResponse}, auth=django_auth)
def logout_user(request: HttpRequest):
    """Logout the current user."""
    logout(request)
    return {"success": True, "message": "Logged out successfully"}


@auth_router.get("/auth/status", response={200: dict})
def get_auth_status(request: HttpRequest):
    """Simple endpoint to check if user is authenticated."""
    return {
        "authenticated": request.user.is_authenticated,
        "has_session": bool(request.session.session_key),
    }


@auth_router.post("/auth/set-new-password", response={200: AuthResponse, 400: ErrorResponse})
@csrf_exempt
def set_new_password(request: HttpRequest, payload: SetPasswordPayload):
    """
    Set a new password after password reset verification.
    
    The reset_token is the request_id from the approved password reset request.
    """
    reset_token = payload.reset_token
    new_password = payload.new_password
    
    if not new_password or len(new_password) < 8:
        return 400, {"detail": "Password must be at least 8 characters."}
    
    try:
        auth_request = AuthActionRequest.objects.get(request_id=reset_token)
    except AuthActionRequest.DoesNotExist:
        return 400, {"detail": "Invalid or expired reset token."}
    
    # Validate the request
    if auth_request.action_type not in ('password_reset', 'password_change'):
        return 400, {"detail": "Invalid reset token."}
    
    if auth_request.status != 'approved':
        return 400, {"detail": "Reset token has not been verified or has already been used."}
    
    if auth_request.is_expired():
        auth_request.status = 'expired'
        auth_request.save()
        return 400, {"detail": "Reset token has expired."}
    
    # Update the password
    user = auth_request.user
    user.set_password(new_password)
    user.save()
    
    # Mark as used
    auth_request.status = 'used'
    auth_request.save()
    
    return {
        "success": True,
        "message": "Password updated successfully! You can now log in."
    }


# =============================================================================
# Registration Endpoints
# =============================================================================

@auth_router.get("/auth/check-username", response={200: dict})
def check_username(request: HttpRequest, username: str):
    """Check if a username is available."""
    username = username.strip()
    if not username or len(username) < 3:
        return {"available": False, "message": "Username must be at least 3 characters."}
    
    exists = User.objects.filter(username=username).exists()
    return {
        "available": not exists,
        "message": "Username is available." if not exists else "Username is already taken."
    }


@auth_router.post("/auth/register", response={200: AuthResponse, 400: ErrorResponse})
@csrf_exempt
def register_manager(request: HttpRequest, payload: RegisterPayload):
    """
    Register a new manager account.
    
    Creates user with is_active=False, sends email verifications,
    then notifies admin for activation.
    """
    from .models import Business
    
    username = payload.username.strip()
    email = payload.email.lower().strip()
    backup_email = payload.backup_email.lower().strip()
    password = payload.password
    confirm_password = payload.confirm_password
    business_name = payload.business_name.strip()
    
    # Validations
    if not username or len(username) < 3:
        return 400, {"detail": "Username must be at least 3 characters."}
    
    if password != confirm_password:
        return 400, {"detail": "Passwords do not match."}
    
    if len(password) < 8:
        return 400, {"detail": "Password must be at least 8 characters."}
    
    if email == backup_email:
        return 400, {"detail": "Primary and backup email must be different."}
    
    if not business_name:
        return 400, {"detail": "Business name is required."}
    
    if User.objects.filter(username=username).exists():
        return 400, {"detail": "Username already exists."}
    
    if User.objects.filter(email__iexact=email).exists():
        return 400, {"detail": "This email is already in use."}
    
    # Create business
    business, _ = Business.objects.get_or_create(
        name=business_name,
        defaults={}
    )
    
    # Create user with is_active=False
    user = User.objects.create_user(
        username=username,
        email=email,
        password=password,
        is_active=False,
        is_manager=True,
        business=business,
        backup_email=backup_email,
    )
    
    # Create auth request for primary email verification
    auth_request = create_auth_request(
        user=user,
        action_type='register_verify_email',
        ip_address=get_client_ip(request)
    )
    
    backend_url = get_backend_url()
    approval_url = f"{backend_url}/api/auth/approve/{auth_request.approval_token}"
    ref_code = auth_request.request_id[:6].upper()
    
    email_html = build_email_html(
        title="Verify Your Email",
        body=f"Welcome <strong>{username}</strong>! Click the button below to verify your email address.",
        button_text="Verify Email",
        button_url=approval_url,
        expiry_mins=AUTH_REQUEST_EXPIRY_MINUTES,
        ref_code=ref_code,
    )
    
    try:
        send_auth_email(email, "Verify Your Email", approval_url, email_html, ref_code=ref_code)
    except Exception:
        logger.exception("Failed to send registration verification email for user %s.", user.pk)
        # Clean up
        user.delete()
        return 400, {"detail": "Failed to send verification email. Please try again."}
    
    return {
        "success": True,
        "message": "Registration started! Check your email for the verification link.",
        "request_id": auth_request.request_id
    }


# =============================================================================
# DEBUG-ONLY: Direct Login (bypasses 2FA for testing)
# =============================================================================

if settings.DEBUG:
    @auth_router.post("/auth/debug-login", response={200: AuthResponse, 400: ErrorResponse})
    @csrf_exempt
    def debug_login(request: HttpRequest, payload: LoginRequestPayload):
        """
        DEBUG-ONLY: Direct login that bypasses 2FA email verification.
        
        ⚠️  This endpoint only exists when DEBUG=True.
        It directly authenticates and creates a session without email verification.
        NEVER enable this in production.
        """
        # Find user
        user = None
        if payload.username:
            user, lookup_error = find_user_by_login_identifier(username=payload.username)
            if lookup_error:
                return 400, {"detail": lookup_error}
        elif payload.email:
            user, lookup_error = find_user_by_login_identifier(email=payload.email)
            if lookup_error:
                return 400, {"detail": lookup_error}
        else:
            return 400, {"detail": "Username or email is required"}
        
        # Authenticate
        authenticated_user = authenticate(
            request, username=user.username, password=payload.password
        )
        if not authenticated_user:
            return 400, {"detail": "Invalid credentials"}
        
        # Directly log in — no email, no polling
        login(request, authenticated_user)
        
        return {
            "success": True,
            "message": "Logged in directly (DEBUG mode, 2FA bypassed).",
            "request_id": None,
        }

    @auth_router.get("/auth/test-helper/request/{request_id}")
    def test_helper_get_request(request: HttpRequest, request_id: str):
        """DEBUG-ONLY: Retrieve auth request details for E2E testing."""
        from django.http import JsonResponse
        backend_url = getattr(settings, "BACKEND_URL", "http://localhost:8000")
        try:
            auth_req = AuthActionRequest.objects.get(request_id=request_id)
        except AuthActionRequest.DoesNotExist:
            return JsonResponse({"detail": "Not found"}, status=404)
        
        recipient_email = auth_req.user.email if auth_req.user else None
        if auth_req.payload and isinstance(auth_req.payload, dict):
            recipient_email = auth_req.payload.get("new_email") or recipient_email

        return {
            "request_id": auth_req.request_id,
            "approval_token": auth_req.approval_token,
            "approval_url": f"{backend_url}/api/auth/approve/{auth_req.approval_token}",
            "action_type": auth_req.action_type,
            "status": auth_req.status,
            "recipient_email": recipient_email,
            "is_expired": auth_req.is_expired(),
        }

    @auth_router.get("/auth/test-helper/latest")
    def test_helper_get_latest(request: HttpRequest, action_type: Optional[str] = None):
        """DEBUG-ONLY: Retrieve latest auth request for E2E testing."""
        from django.http import JsonResponse
        backend_url = getattr(settings, "BACKEND_URL", "http://localhost:8000")
        qs = AuthActionRequest.objects.all().order_by("-created_at")
        if action_type:
            qs = qs.filter(action_type=action_type)
        auth_req = qs.first()
        if not auth_req:
            return JsonResponse({"detail": "No auth request found"}, status=404)

        recipient_email = auth_req.user.email if auth_req.user else None
        if auth_req.payload and isinstance(auth_req.payload, dict):
            recipient_email = auth_req.payload.get("new_email") or recipient_email

        return {
            "request_id": auth_req.request_id,
            "approval_token": auth_req.approval_token,
            "approval_url": f"{backend_url}/api/auth/approve/{auth_req.approval_token}",
            "action_type": auth_req.action_type,
            "status": auth_req.status,
            "recipient_email": recipient_email,
            "is_expired": auth_req.is_expired(),
        }

    @auth_router.api_operation(["GET", "POST"], "/auth/test-helper/expire/{request_id}")
    def test_helper_expire_request(request: HttpRequest, request_id: str):
        """DEBUG-ONLY: Immediately expire an auth request for testing timeout handling."""
        from django.http import JsonResponse
        from datetime import timedelta
        try:
            auth_req = AuthActionRequest.objects.get(request_id=request_id)
        except AuthActionRequest.DoesNotExist:
            return JsonResponse({"detail": "Not found"}, status=404)
        
        auth_req.expires_at = timezone.now() - timedelta(minutes=1)
        auth_req.status = "expired"
        auth_req.save()
        return {"success": True, "request_id": auth_req.request_id, "status": "expired"}

    @auth_router.api_operation(["GET", "POST"], "/auth/test-helper/activate-user/{username}")
    def test_helper_activate_user(request: HttpRequest, username: str):
        """DEBUG-ONLY: Activate a newly registered user account (simulating admin approval)."""
        from django.http import JsonResponse
        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            return JsonResponse({"detail": "User not found"}, status=404)
        
        user.is_active = True
        user.save()
        return {"success": True, "username": user.username, "is_active": user.is_active}

    @auth_router.api_operation(["GET", "POST"], "/auth/test-helper/reset-user/{username}")
    def test_helper_reset_user(request: HttpRequest, username: str, password: Optional[str] = "password", email: Optional[str] = None):
        """DEBUG-ONLY: Reset a user's password and email back to baseline."""
        from django.http import JsonResponse
        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            return JsonResponse({"detail": "User not found"}, status=404)
        
        if password:
            user.set_password(password)
        if email:
            user.email = email
        user.is_active = True
        user.save()
        return {"success": True, "username": user.username, "email": user.email, "is_active": user.is_active}
