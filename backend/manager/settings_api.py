"""
Settings API for User Management and Business Settings.

Provides REST API endpoints for:
- Employee management (list, create, update)
- Business settings (get, update)
- Branch management (create, update)
"""

from ninja import Router, Schema, File
from ninja.security import django_auth
from ninja.files import UploadedFile
from django.http import HttpRequest, HttpResponse
from typing import Optional, List
from pydantic import Field
from django.conf import settings as django_settings
from django.core.serializers.json import DjangoJSONEncoder
import zipfile
import json
import io
import os

from .models import (
    User, Business, Branch, AuthActionRequest, LegalEntity, Vehicle, Transaction,
    Make, VehicleModel, VehicleType, BodyType, Color, FuelType, DamageType,
    DoorsChoice, TaxPercentage, PaymentMethod, Currency, Category, Subcategory, KeyNumber,
    VehicleExpenseEarning, MobileDeSettings
)
from .schemas import MobileDeSettingsOut, MobileDeSettingsIn, MobileDeTestConnectionOut
from .services.mobile_de_service import get_mobile_de_service

# Create router with session authentication
settings_router = Router(auth=django_auth, tags=["Settings"])


# =============================================================================
# Schemas
# =============================================================================

class EmployeeOut(Schema):
    id: int
    username: str
    is_active: bool
    transactions_access: bool
    legal_entities_access: bool


class EmployeeCreate(Schema):
    username: str
    password: str
    transactions_access: bool = False
    legal_entities_access: bool = False


class EmployeeUpdate(Schema):
    username: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None
    transactions_access: Optional[bool] = None
    legal_entities_access: Optional[bool] = None


class BranchOut(Schema):
    id: int
    name: str
    address: str
    is_active: bool


class BranchCreate(Schema):
    name: str
    address: str = ""


class BranchUpdate(Schema):
    name: Optional[str] = None
    address: Optional[str] = None
    is_active: Optional[bool] = None


class BusinessOut(Schema):
    id: int
    name: str
    logo_url: Optional[str] = None
    # Address
    address_country: Optional[str] = None
    address_city: Optional[str] = None
    address_street: Optional[str] = None
    address_street_number: Optional[str] = None
    address_postal_code: Optional[str] = None
    # Contact
    telephone_number: Optional[str] = None
    fax_number: Optional[str] = None
    email: Optional[str] = None
    # Bank
    bank_name: Optional[str] = None
    bank_bic_swift: Optional[str] = None
    bank_iban: Optional[str] = None
    # Company Registration
    managing_director: Optional[str] = None
    tax_id: Optional[str] = None
    eori_number: Optional[str] = None
    ust_id_nr: Optional[str] = None
    headquarters_city: Optional[str] = None
    court_district: Optional[str] = None
    court_registration_number: Optional[str] = None
    # Preferences
    target_annual_return: float = 10.00
    target_days_on_stock: int = 45
    # Branches
    branches: List[BranchOut] = []


class BusinessUpdate(Schema):
    name: Optional[str] = None
    address_country: Optional[str] = None
    address_city: Optional[str] = None
    address_street: Optional[str] = None
    address_street_number: Optional[str] = None
    address_postal_code: Optional[str] = None
    telephone_number: Optional[str] = None
    fax_number: Optional[str] = None
    email: Optional[str] = None
    bank_name: Optional[str] = None
    bank_bic_swift: Optional[str] = None
    bank_iban: Optional[str] = None
    managing_director: Optional[str] = None
    tax_id: Optional[str] = None
    eori_number: Optional[str] = None
    ust_id_nr: Optional[str] = None
    headquarters_city: Optional[str] = None
    court_district: Optional[str] = None
    court_registration_number: Optional[str] = None
    target_annual_return: Optional[float] = None
    target_days_on_stock: Optional[int] = None


class ErrorResponse(Schema):
    detail: str


class SuccessResponse(Schema):
    success: bool
    message: str


# =============================================================================
# Helper Functions
# =============================================================================

def get_user_business(request: HttpRequest) -> Business:
    """Get the authenticated user's business."""
    return request.user.business


def require_manager(request: HttpRequest) -> bool:
    """Check if user is a manager or superuser."""
    return bool(getattr(request.user, 'is_manager', False) or getattr(request.user, 'is_superuser', False))


# =============================================================================
# Employee Management Endpoints
# =============================================================================

@settings_router.get("/users", response={200: List[EmployeeOut], 403: ErrorResponse})
def list_employees(request: HttpRequest):
    """List all employees for the business (managers only)."""
    if not require_manager(request):
        return 403, {"detail": "Only managers can access user management."}
    
    business = get_user_business(request)
    employees = User.objects.filter(
        business=business,
        is_manager=False
    ).order_by('username')
    
    return [
        {
            "id": emp.id,
            "username": emp.username,
            "is_active": emp.is_active,
            "transactions_access": emp.transactions_access,
            "legal_entities_access": emp.legal_entities_access,
        }
        for emp in employees
    ]


@settings_router.post("/users", response={200: EmployeeOut, 400: ErrorResponse, 403: ErrorResponse})
def create_employee(request: HttpRequest, payload: EmployeeCreate):
    """Create a new employee (managers only)."""
    if not require_manager(request):
        return 403, {"detail": "Only managers can create employees."}
    
    business = get_user_business(request)
    
    # Check if username already exists
    if User.objects.filter(username=payload.username).exists():
        return 400, {"detail": "Username already exists."}
    
    employee = User.objects.create_user(
        username=payload.username,
        password=payload.password,
        business=business,
        is_manager=False,
        transactions_access=payload.transactions_access,
        legal_entities_access=payload.legal_entities_access,
    )
    
    return {
        "id": employee.id,
        "username": employee.username,
        "is_active": employee.is_active,
        "transactions_access": employee.transactions_access,
        "legal_entities_access": employee.legal_entities_access,
    }


@settings_router.put("/users/{user_id}", response={200: EmployeeOut, 400: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse})
def update_employee(request: HttpRequest, user_id: int, payload: EmployeeUpdate):
    """Update an employee (managers only)."""
    if not require_manager(request):
        return 403, {"detail": "Only managers can update employees."}
    
    business = get_user_business(request)
    
    try:
        employee = User.objects.get(id=user_id, business=business, is_manager=False)
    except User.DoesNotExist:
        return 404, {"detail": "Employee not found."}
    
    # Update fields if provided
    if payload.username is not None:
        # Check if new username already exists (excluding current user)
        if User.objects.filter(username=payload.username).exclude(id=user_id).exists():
            return 400, {"detail": "Username already exists."}
        employee.username = payload.username
    
    if payload.password is not None and payload.password.strip():
        employee.set_password(payload.password)
    
    if payload.is_active is not None:
        employee.is_active = payload.is_active
    
    if payload.transactions_access is not None:
        employee.transactions_access = payload.transactions_access
    
    if payload.legal_entities_access is not None:
        employee.legal_entities_access = payload.legal_entities_access
    
    employee.save()
    
    return {
        "id": employee.id,
        "username": employee.username,
        "is_active": employee.is_active,
        "transactions_access": employee.transactions_access,
        "legal_entities_access": employee.legal_entities_access,
    }


# =============================================================================
# Business Settings Endpoints
# =============================================================================

@settings_router.get("/business", response={200: BusinessOut, 403: ErrorResponse})
def get_business(request: HttpRequest):
    """Get business details (managers only)."""
    if not require_manager(request):
        return 403, {"detail": "Only managers can access business settings."}
    
    business = get_user_business(request)
    branches = Branch.objects.filter(business=business).order_by('name')
    
    return {
        "id": business.id,
        "name": business.name,
        "logo_url": business.logo.url if business.logo else None,
        "address_country": business.address_country,
        "address_city": business.address_city,
        "address_street": business.address_street,
        "address_street_number": business.address_street_number,
        "address_postal_code": business.address_postal_code,
        "telephone_number": business.telephone_number,
        "fax_number": business.fax_number,
        "email": business.email,
        "bank_name": business.bank_name,
        "bank_bic_swift": business.bank_bic_swift,
        "bank_iban": business.bank_iban,
        "managing_director": business.managing_director,
        "tax_id": business.tax_id,
        "eori_number": business.eori_number,
        "ust_id_nr": business.ust_id_nr,
        "headquarters_city": business.headquarters_city,
        "court_district": business.court_district,
        "court_registration_number": business.court_registration_number,
        "target_annual_return": float(business.target_annual_return) if business.target_annual_return else 10.00,
        "target_days_on_stock": business.target_days_on_stock,
        "branches": [
            {
                "id": b.id,
                "name": b.name,
                "address": b.address,
                "is_active": b.is_active,
            }
            for b in branches
        ],
    }


@settings_router.put("/business", response={200: SuccessResponse, 403: ErrorResponse})
def update_business(request: HttpRequest, payload: BusinessUpdate):
    """Update business details (managers only)."""
    if not require_manager(request):
        return 403, {"detail": "Only managers can update business settings."}
    
    business = get_user_business(request)
    
    # Update all provided fields
    update_fields = [
        'name', 'address_country', 'address_city', 'address_street',
        'address_street_number', 'address_postal_code', 'telephone_number',
        'fax_number', 'email', 'bank_name', 'bank_bic_swift', 'bank_iban',
        'managing_director', 'tax_id', 'eori_number', 'ust_id_nr',
        'headquarters_city', 'court_district', 'court_registration_number',
        'target_annual_return', 'target_days_on_stock'
    ]
    
    for field in update_fields:
        value = getattr(payload, field, None)
        if value is not None:
            setattr(business, field, value)
    
    business.save()
    
    return {"success": True, "message": "Business settings updated successfully."}


@settings_router.post("/business/logo", response={200: SuccessResponse, 400: ErrorResponse, 403: ErrorResponse})
def upload_business_logo(request: HttpRequest, logo: UploadedFile = File(...)):
    """Upload business logo (managers only)."""
    if not require_manager(request):
        return 403, {"detail": "Only managers can update business settings."}
    
    business = get_user_business(request)
    
    # Validate file type
    allowed_types = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if logo.content_type not in allowed_types:
        return 400, {"detail": "Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed."}
    
    # Validate file size (max 5MB)
    if logo.size > 5 * 1024 * 1024:
        return 400, {"detail": "File too large. Maximum size is 5MB."}
    
    # Delete old logo if exists
    if business.logo:
        business.logo.delete(save=False)
    
    # Save new logo
    business.logo = logo
    business.save()
    
    return {"success": True, "message": "Logo updated successfully."}


# =============================================================================
# mobile.de Integration Endpoints
# =============================================================================

@settings_router.get("/mobile-de", response={200: MobileDeSettingsOut, 403: ErrorResponse})
def get_mobile_de_settings(request: HttpRequest):
    """Retrieve mobile.de settings for the business (managers only)."""
    if not require_manager(request):
        return 403, {"detail": "Only managers can access marketplace settings."}
    
    business = get_user_business(request)
    settings_obj, _ = MobileDeSettings.objects.get_or_create(business=business)
    
    return {
        "is_configured": settings_obj.is_configured,
        "seller_id": settings_obj.seller_id,
        "api_username": settings_obj.api_username,
        "last_connection_test": settings_obj.last_connection_test,
        "last_connection_status": settings_obj.last_connection_status,
        "last_connection_error": settings_obj.last_connection_error,
    }


@settings_router.put("/mobile-de", response={200: MobileDeSettingsOut, 400: ErrorResponse, 403: ErrorResponse})
def update_mobile_de_settings(request: HttpRequest, payload: MobileDeSettingsIn):
    """Update mobile.de credentials and settings (managers only)."""
    if not require_manager(request):
        return 403, {"detail": "Only managers can update marketplace settings."}
    
    business = get_user_business(request)
    settings_obj, _ = MobileDeSettings.objects.get_or_create(business=business)
    
    if payload.seller_id is not None:
        settings_obj.seller_id = payload.seller_id.strip() if payload.seller_id else None
    if payload.api_username is not None:
        settings_obj.api_username = payload.api_username.strip() if payload.api_username else None
    if payload.api_password is not None and payload.api_password.strip():
        settings_obj.api_password = payload.api_password.strip()
    
    settings_obj.save()
    
    return {
        "is_configured": settings_obj.is_configured,
        "seller_id": settings_obj.seller_id,
        "api_username": settings_obj.api_username,
        "last_connection_test": settings_obj.last_connection_test,
        "last_connection_status": settings_obj.last_connection_status,
        "last_connection_error": settings_obj.last_connection_error,
    }


@settings_router.post("/mobile-de/test-connection", response={200: MobileDeTestConnectionOut, 400: ErrorResponse, 403: ErrorResponse})
def test_mobile_de_connection(request: HttpRequest):
    """Test connection to mobile.de or developer simulator (managers only)."""
    if not require_manager(request):
        return 403, {"detail": "Only managers can test marketplace connection."}
    
    business = get_user_business(request)
    settings_obj, _ = MobileDeSettings.objects.get_or_create(business=business)
    
    service = get_mobile_de_service(business)
    if not service:
        return 400, {"detail": "mobile.de service could not be initialized."}
    
    success, message = service.test_connection()
    return 200, {
        "success": success,
        "message": message
    }


# =============================================================================
# Branch Management Endpoints
# =============================================================================

@settings_router.post("/branches", response={200: BranchOut, 400: ErrorResponse, 403: ErrorResponse})
def create_branch(request: HttpRequest, payload: BranchCreate):
    """Create a new branch (managers only)."""
    if not require_manager(request):
        return 403, {"detail": "Only managers can create branches."}
    
    business = get_user_business(request)
    
    if not payload.name.strip():
        return 400, {"detail": "Branch name is required."}
    
    branch = Branch.objects.create(
        business=business,
        name=payload.name,
        address=payload.address,
        is_active=True,
    )
    
    return {
        "id": branch.id,
        "name": branch.name,
        "address": branch.address,
        "is_active": branch.is_active,
    }


@settings_router.put("/branches/{branch_id}", response={200: BranchOut, 400: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse})
def update_branch(request: HttpRequest, branch_id: int, payload: BranchUpdate):
    """Update a branch (managers only)."""
    if not require_manager(request):
        return 403, {"detail": "Only managers can update branches."}
    
    business = get_user_business(request)
    
    try:
        branch = Branch.objects.get(id=branch_id, business=business)
    except Branch.DoesNotExist:
        return 404, {"detail": "Branch not found."}
    
    if payload.name is not None:
        if not payload.name.strip():
            return 400, {"detail": "Branch name cannot be empty."}
        branch.name = payload.name
    
    if payload.address is not None:
        branch.address = payload.address
    
    if payload.is_active is not None:
        branch.is_active = payload.is_active
    
    branch.save()
    
    return {
        "id": branch.id,
        "name": branch.name,
        "address": branch.address,
        "is_active": branch.is_active,
    }


# =============================================================================
# Manager Account Settings Endpoints
# =============================================================================

class ManagerProfileOut(Schema):
    id: int
    username: str
    email: str
    backup_email: Optional[str] = None


class UsernameUpdate(Schema):
    username: str


class PasswordChangeRequest(Schema):
    new_password: str
    confirm_password: str


class EmailChangeRequest(Schema):
    new_email: str


class BackupEmailChangeRequest(Schema):
    new_backup_email: str


@settings_router.get("/me", response={200: ManagerProfileOut, 403: ErrorResponse})
def get_manager_profile(request: HttpRequest):
    """Get the current manager's account profile."""
    if not require_manager(request):
        return 403, {"detail": "Only managers can access user settings."}
    
    user = request.user
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "backup_email": user.backup_email or "",
    }


@settings_router.put("/me/username", response={200: SuccessResponse, 400: ErrorResponse, 403: ErrorResponse})
def update_username(request: HttpRequest, payload: UsernameUpdate):
    """Update the manager's username (instant, no email verification)."""
    if not require_manager(request):
        return 403, {"detail": "Only managers can access user settings."}
    
    new_username = payload.username.strip()
    
    if not new_username or len(new_username) < 3:
        return 400, {"detail": "Username must be at least 3 characters."}
    
    # Check uniqueness (excluding current user)
    if User.objects.filter(username=new_username).exclude(id=request.user.id).exists():
        return 400, {"detail": "Username already exists."}
    
    request.user.username = new_username
    request.user.save()
    
    return {"success": True, "message": "Username updated successfully."}


@settings_router.post("/me/password", response={200: dict, 400: ErrorResponse, 403: ErrorResponse})
def request_password_change(request: HttpRequest, payload: PasswordChangeRequest):
    """
    Initiate a password change with email verification.
    
    Flow:
    1. Manager enters new password + confirm
    2. Verification email sent to manager's official email
    3. Manager clicks the link → password is updated via set-new-password endpoint
    """
    if not require_manager(request):
        return 403, {"detail": "Only managers can access user settings."}
    
    user = request.user
    
    if payload.new_password != payload.confirm_password:
        return 400, {"detail": "Passwords do not match."}
    
    if len(payload.new_password) < 8:
        return 400, {"detail": "Password must be at least 8 characters."}
    
    # Import helpers from auth_api
    from .auth_api import (
        create_auth_request, get_backend_url, build_email_html,
        send_auth_email, AUTH_REQUEST_EXPIRY_MINUTES, get_client_ip
    )
    
    # Create auth request for password change verification
    auth_request = create_auth_request(
        user=user,
        action_type='password_change',
        payload={'new_password_hash': 'deferred'},  # Password set after verification
        ip_address=get_client_ip(request)
    )
    
    backend_url = get_backend_url()
    approval_url = f"{backend_url}/api/auth/approve/{auth_request.approval_token}"
    
    email_html = build_email_html(
        title="Confirm Password Change",
        body=f"Click the button below to confirm your password change for <strong>{user.username}</strong>.",
        button_text="Confirm Password Change",
        button_url=approval_url,
        expiry_mins=AUTH_REQUEST_EXPIRY_MINUTES
    )
    
    send_auth_email(user.email, "Confirm Password Change", approval_url, email_html)
    
    return {
        "success": True,
        "message": "Verification email sent. Check your email to confirm the password change.",
        "request_id": auth_request.request_id
    }


@settings_router.post("/me/email", response={200: dict, 400: ErrorResponse, 403: ErrorResponse})
def request_email_change(request: HttpRequest, payload: EmailChangeRequest):
    """
    Initiate email change with dual-stage verification.
    
    Flow:
    1. Verification email sent to CURRENT/OLD email
    2. After old email verified → confirmation sent to NEW email
    3. After new email confirmed → email updated in DB
    """
    if not require_manager(request):
        return 403, {"detail": "Only managers can access user settings."}
    
    user = request.user
    new_email = payload.new_email.lower().strip()
    
    if not new_email:
        return 400, {"detail": "New email address is required."}
    
    if new_email == user.email:
        return 400, {"detail": "New email must be different from your current email."}
    
    if User.objects.filter(email__iexact=new_email).exclude(id=user.id).exists():
        return 400, {"detail": "This email is already in use by another account."}
    
    from .auth_api import (
        create_auth_request, get_backend_url, build_email_html,
        send_auth_email, AUTH_REQUEST_EXPIRY_MINUTES, get_client_ip
    )
    
    # Stage 1: Send verification to OLD email
    auth_request = create_auth_request(
        user=user,
        action_type='email_change_verify_old',
        payload={'new_email': new_email},
        ip_address=get_client_ip(request)
    )
    
    backend_url = get_backend_url()
    approval_url = f"{backend_url}/api/auth/approve/{auth_request.approval_token}"
    
    email_html = build_email_html(
        title="Confirm Email Change",
        body=f"Someone is trying to change the email for <strong>{user.username}</strong>'s account to <strong>{new_email}</strong>. Click the button to authorize this change.",
        button_text="Authorize Email Change",
        button_url=approval_url,
        expiry_mins=AUTH_REQUEST_EXPIRY_MINUTES
    )
    
    send_auth_email(user.email, "Confirm Email Change", approval_url, email_html)
    
    return {
        "success": True,
        "message": "Verification email sent to your current email. Check your inbox.",
        "request_id": auth_request.request_id
    }


@settings_router.post("/me/backup-email", response={200: dict, 400: ErrorResponse, 403: ErrorResponse})
def request_backup_email_change(request: HttpRequest, payload: BackupEmailChangeRequest):
    """
    Initiate backup email change with dual-stage verification.
    
    Flow:
    1. Verification email sent to OFFICIAL email
    2. After official email verified → confirmation sent to NEW backup email
    3. After new backup email confirmed → backup_email updated in DB
    """
    if not require_manager(request):
        return 403, {"detail": "Only managers can access user settings."}
    
    user = request.user
    new_backup = payload.new_backup_email.lower().strip()
    
    if not new_backup:
        return 400, {"detail": "New backup email address is required."}
    
    if new_backup == user.email:
        return 400, {"detail": "Backup email cannot be the same as your primary email."}
    
    if new_backup == user.backup_email:
        return 400, {"detail": "New backup email must be different from your current backup email."}
    
    from .auth_api import (
        create_auth_request, get_backend_url, build_email_html,
        send_auth_email, AUTH_REQUEST_EXPIRY_MINUTES, get_client_ip
    )
    
    # Stage 1: Send verification to OFFICIAL email
    auth_request = create_auth_request(
        user=user,
        action_type='backup_email_verify_official',
        payload={'new_backup_email': new_backup},
        ip_address=get_client_ip(request)
    )
    
    backend_url = get_backend_url()
    approval_url = f"{backend_url}/api/auth/approve/{auth_request.approval_token}"
    
    email_html = build_email_html(
        title="Confirm Backup Email Change",
        body=f"Click the button below to authorize changing the backup email for <strong>{user.username}</strong>'s account to <strong>{new_backup}</strong>.",
        button_text="Authorize Changes",
        button_url=approval_url,
        expiry_mins=AUTH_REQUEST_EXPIRY_MINUTES
    )
    
    send_auth_email(user.email, "Confirm Backup Email Change", approval_url, email_html)
    
    return {
        "success": True,
        "message": "Verification email sent to your official email. Check your inbox.",
        "request_id": auth_request.request_id
    }


@settings_router.get("/business/export-data")
def export_business_data(request: HttpRequest):
    """
    Export all business data as a downloadable ZIP file.
    Manager only. Scoped strictly to request.user.business.
    
    ZIP contains:
    - data/business.json
    - data/legal_entities.json
    - data/vehicles.json
    - data/transactions.json
    - data/choices.json
    - media/images/vehicles/* (all uploaded vehicle images)
    - media/logo/* (business logo if it exists)
    """
    if not require_manager(request):
        return HttpResponse(status=403)
    
    business = get_user_business(request)
    if not business:
        return HttpResponse("No business associated with user.", status=400)
    
    # Build the ZIP in memory
    zip_buffer = io.BytesIO()
    
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        
        # --- data/business.json ---
        business_data = {
            "name": business.name,
            "address_country": business.address_country,
            "address_city": business.address_city,
            "address_street": business.address_street,
            "address_street_number": business.address_street_number,
            "address_postal_code": business.address_postal_code,
            "telephone_number": business.telephone_number,
            "fax_number": business.fax_number,
            "email": business.email,
            "bank_name": business.bank_name,
            "bank_bic_swift": business.bank_bic_swift,
            "bank_iban": business.bank_iban,
            "managing_director": business.managing_director,
            "tax_id": business.tax_id,
            "eori_number": business.eori_number,
            "ust_id_nr": business.ust_id_nr,
            "headquarters_city": business.headquarters_city,
            "court_district": business.court_district,
            "court_registration_number": business.court_registration_number,
            "target_annual_return": str(business.target_annual_return) if business.target_annual_return else None,
            "target_days_on_stock": business.target_days_on_stock,
            "branches": list(
                Branch.objects.filter(business=business).values(
                    'id', 'name', 'address', 'is_active'
                )
            ),
        }
        zf.writestr(
            "data/business.json",
            json.dumps(business_data, indent=2, cls=DjangoJSONEncoder)
        )
        
        # --- data/legal_entities.json ---
        entities = list(
            LegalEntity.objects.filter(business=business).values(
                'internal_id', 'name', 'address_street', 'address_street_number',
                'address_postal_code', 'address_city', 'address_country',
                'status', 'email', 'phone_number', 'type',
                'tax_identification_number', 'date_created'
            )
        )
        zf.writestr(
            "data/legal_entities.json",
            json.dumps(entities, indent=2, cls=DjangoJSONEncoder)
        )
        
        # --- data/vehicles.json ---
        vehicles_qs = Vehicle.objects.filter(business=business).select_related(
            'make', 'model', 'vehicle_type', 'body_type', 'color',
            'fuel_type', 'damage_type', 'doors', 'buy_tax', 'sale_tax',
            'buy_payment_method', 'sale_payment_method', 'seller', 'buyer',
            'branch'
        )
        vehicles_data = []
        for v in vehicles_qs:
            vehicles_data.append({
                "internal_id": v.internal_id,
                "status": v.status,
                "description": v.description,
                "internal_comments": v.internal_comments,
                "chassis_number": v.chassis_number,
                "motor_vehicle_registration_number": v.motor_vehicle_registration_number,
                "official_license_plate": v.official_license_plate,
                "make": v.make.name if v.make else None,
                "model": v.model.name if v.model else None,
                "vehicle_type": v.vehicle_type.name if v.vehicle_type else None,
                "body_type": v.body_type.name if v.body_type else None,
                "color": v.color.name if v.color else None,
                "fuel_type": v.fuel_type.name if v.fuel_type else None,
                "damage_type": v.damage_type.name if v.damage_type else None,
                "doors": v.doors.name if v.doors else None,
                "year_of_construction": v.year_of_construction,
                "kilometer": v.kilometer,
                "power_kw": v.power_kw,
                "branch": v.branch.name if v.branch else None,
                "first_registration_date": v.first_registration_date.isoformat() if v.first_registration_date else None,
                # Buy details
                "buy_date": v.buy_date.isoformat() if v.buy_date else None,
                "buy_price": str(v.buy_price) if v.buy_price else None,
                "buy_tax_percentage": str(v.buy_tax.percentage) if v.buy_tax else None,
                "buy_payment_method": v.buy_payment_method.name if v.buy_payment_method else None,
                "buy_delivery_collection_date": v.buy_delivery_collection_date.isoformat() if v.buy_delivery_collection_date else None,
                "seller_internal_id": v.seller.internal_id if v.seller else None,
                "buyer_internal_id": v.buyer.internal_id if v.buyer else None,
                # Sale details
                "sale_date": v.sale_date.isoformat() if v.sale_date else None,
                "sale_price": str(v.sale_price) if v.sale_price else None,
                "sale_tax_percentage": str(v.sale_tax.percentage) if v.sale_tax else None,
                "sale_payment_method": v.sale_payment_method.name if v.sale_payment_method else None,
                "sale_delivery_collection_date": v.sale_delivery_collection_date.isoformat() if v.sale_delivery_collection_date else None,
                "sale_invoice_number": v.sale_invoice_number,
                # Image path (relative)
                "image": v.image.name if v.image else None,
                "date_created": v.date_created.isoformat() if v.date_created else None,
            })
        zf.writestr(
            "data/vehicles.json",
            json.dumps(vehicles_data, indent=2, cls=DjangoJSONEncoder)
        )
        
        # --- data/vehicle_expenses_earnings.json ---
        expenses_earnings_qs = VehicleExpenseEarning.objects.filter(business=business).select_related(
            'vehicle', 'category', 'subcategory'
        )
        expenses_earnings_data = []
        for ee in expenses_earnings_qs:
            expenses_earnings_data.append({
                "vehicle_internal_id": ee.vehicle.internal_id if ee.vehicle else None,
                "type": ee.type,
                "amount": str(ee.amount) if ee.amount else None,
                "category": ee.category.name if ee.category else None,
                "subcategory": ee.subcategory.name if ee.subcategory else None,
                "is_active": ee.is_active,
                "created_at": ee.created_at.isoformat() if ee.created_at else None,
            })
        zf.writestr(
            "data/vehicle_expenses_earnings.json",
            json.dumps(expenses_earnings_data, indent=2, cls=DjangoJSONEncoder)
        )
        
        # --- data/transactions.json ---
        transactions_qs = Transaction.objects.filter(business=business).select_related(
            'vehicle', 'category_fk', 'subcategory_fk', 'currency_fk', 'payment_method'
        )
        transactions_data = []
        for t in transactions_qs:
            transactions_data.append({
                "internal_id": t.internal_id,
                "date": t.date.isoformat() if t.date else None,
                "datetime": t.datetime,
                "status": t.status,
                "description": t.description,
                "amount": str(t.amount) if t.amount else None,
                "currency": t.currency_fk.name if t.currency_fk else None,
                "payment_method": t.payment_method.name if t.payment_method else None,
                "tax_percentage": str(t.tax) if t.tax is not None else None,
                "category": t.category_fk.name if t.category_fk else None,
                "subcategory": t.subcategory_fk.name if t.subcategory_fk else None,
                "vehicle_internal_id": t.vehicle.internal_id if t.vehicle else None,
                "from_or_to": t.from_or_to,
                "internal_comments": t.internal_comments,
            })
        zf.writestr(
            "data/transactions.json",
            json.dumps(transactions_data, indent=2, cls=DjangoJSONEncoder)
        )
        
        # --- data/choices.json ---
        choices_data = {
            "makes": list(Make.objects.filter(business=business).values('name', 'is_active')),
            "vehicle_models": [
                {"make": m.make.name, "name": m.name, "is_active": m.is_active}
                for m in VehicleModel.objects.filter(business=business).select_related('make')
            ],
            "vehicle_types": list(VehicleType.objects.filter(business=business).values('name', 'is_active')),
            "body_types": list(BodyType.objects.filter(business=business).values('name', 'is_active', 'mobile_de_mapping', 'is_protected')),
            "colors": list(Color.objects.filter(business=business).values('name', 'is_active', 'mobile_de_mapping', 'is_protected')),
            "fuel_types": list(FuelType.objects.filter(business=business).values('name', 'is_active', 'mobile_de_mapping', 'is_protected')),
            "damage_types": list(DamageType.objects.filter(business=business).values('name', 'is_active')),
            "doors": list(DoorsChoice.objects.filter(business=business).values('name', 'is_active', 'mobile_de_mapping', 'is_protected')),
            "tax_percentages": list(TaxPercentage.objects.filter(business=business).values('name', 'percentage', 'is_active')),
            "payment_methods": list(PaymentMethod.objects.filter(business=business).values('name', 'is_active', 'applies_to_buy', 'applies_to_sale', 'applies_to_transactions')),
            "currencies": list(Currency.objects.filter(business=business).values('name', 'code', 'is_active')),
            "categories": list(Category.objects.filter(business=business).values('name', 'is_active')),
            "subcategories": [
                {"category": s.category.name, "name": s.name, "is_active": s.is_active}
                for s in Subcategory.objects.filter(business=business).select_related('category')
            ],
            "key_numbers": [
                {
                    "number": k.number,
                    "is_active": k.is_active,
                    "assigned_to_vehicle_internal_id": k.vehicle.internal_id if k.vehicle else None
                }
                for k in KeyNumber.objects.filter(business=business).select_related('vehicle')
            ],
        }
        zf.writestr(
            "data/choices.json",
            json.dumps(choices_data, indent=2, cls=DjangoJSONEncoder)
        )
        
        # --- media/images/vehicles/* ---
        # Include all uploaded vehicle images
        media_root = django_settings.MEDIA_ROOT
        vehicle_images_dir = os.path.join(media_root, 'images', 'vehicles')
        
        if os.path.exists(vehicle_images_dir):
            for filename in os.listdir(vehicle_images_dir):
                file_path = os.path.join(vehicle_images_dir, filename)
                if os.path.isfile(file_path):
                    zf.write(file_path, f"media/images/vehicles/{filename}")
        
        # Also include business logo if it exists
        if business.logo:
            try:
                logo_path = business.logo.path
                if os.path.exists(logo_path):
                    logo_filename = os.path.basename(logo_path)
                    zf.write(logo_path, f"media/logo/{logo_filename}")
            except Exception:
                pass
    
    # Prepare response
    zip_buffer.seek(0)
    date_str = __import__('datetime').date.today().isoformat()
    filename = f"acar_export_{business.name.lower().replace(' ', '_')}_{date_str}.zip"
    
    response = HttpResponse(zip_buffer.read(), content_type='application/zip')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response
