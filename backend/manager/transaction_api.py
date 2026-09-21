"""
Django Ninja API for Transaction Management.

This module provides REST API endpoints for:
- Transaction CRUD operations
- Dynamic choice management
- Financial summaries
- PDF generation triggers
"""

from ninja import Router, Query, Form, File
from ninja.files import UploadedFile
from ninja.security import django_auth
from django.shortcuts import get_object_or_404
from django.http import FileResponse
from django.db.models import Sum, Case, When, FloatField, Q
from django.core.paginator import Paginator
from typing import Optional
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
from datetime import date
import pandas
import io
import re

from .models import Transaction, Vehicle, Business, Currency, ActivityLog, Category, Subcategory, PaymentMethod
from .transaction_schemas import (
    TransactionListItem, TransactionDetail, TransactionCreate, TransactionUpdate,
    TransactionStatusUpdate, TransactionFilters, PaginatedTransactions, TransactionFinancialSummary,
    TransactionsResponse, TransactionChoices, SubcategoriesResponse, ImportTransactionsResponse
)
from .schemas import ErrorResponse, SuccessResponse

# Create router with session authentication
router = Router(auth=django_auth, tags=["Transactions"])


# =============================================================================
# Helper Functions
# =============================================================================

def get_user_business(request):
    """Get the authenticated user's business"""
    return request.user.business


TX_STATUS_MAP_DE = {
    'confirmed': 'Bestätigt',
    'review_required': 'Prüfung erforderlich',
    'inactive': 'Inaktiv',
}


def log_activity(
    request,
    action: str,
    entity_type: str,
    entity_id: int = None,
    entity_name: str = "",
    details = ""
):
    """
    Log a user activity.
    """
    import json
    if isinstance(details, dict):
        details_str = json.dumps(details, ensure_ascii=False)
    else:
        details_str = str(details or "")

    print(f"[ActivityLog-TX] ========== LOGGING ACTIVITY ==========")
    print(f"[ActivityLog-TX] Action: {action}, Entity: {entity_type}, ID: {entity_id}, Name: {entity_name}")
    
    try:
        user = getattr(request, 'user', None)
        business = getattr(user, 'business', None) if user else None
        print(f"[ActivityLog-TX] User: {user}, Business: {business}")
        
        if not user or not user.is_authenticated or not business:
            print(f"[ActivityLog-TX] ERROR: Invalid user or business!")
            return
        
        log_entry = ActivityLog.objects.create(
            business=business,
            user=user,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            entity_name=entity_name,
            details=details_str
        )
        print(f"[ActivityLog-TX] SUCCESS! Created log ID: {log_entry.id}")
    except Exception as e:
        import traceback
        print(f"[ActivityLog-TX] EXCEPTION: {type(e).__name__}: {e}")
        traceback.print_exc()


def serialize_transaction_list(tx: Transaction):
    """Serialize a Transaction for list display"""
    return {
        "id": tx.id,
        "internal_id": tx.internal_id,
        "status": tx.status,
        "status_display": tx.get_status_display() if tx.status else None,
        
        # Transaction info
        "category": tx.category,
        "category_display": tx.get_category_display() if tx.category else None,
        "subcategory": tx.subcategory,
        
        # Amount & currency
        "amount": tx.amount,
        "currency": tx.currency,
        "tax": tx.tax,
        
        # Date & method
        "date": tx.date,
        "method": tx.method,
        "method_display": tx.get_method_display() if tx.method else None,
        "from_or_to": tx.from_or_to,
        
        # Vehicle info
        "vehicle_id": tx.vehicle.id if tx.vehicle else None,
        "vehicle_internal_id": tx.vehicle.internal_id if tx.vehicle else None,
        "vehicle_display": str(tx.vehicle) if tx.vehicle else None,
        
        # Contract availability
        "can_generate_pdf": (
            tx.status == "confirmed" and 
            tx.amount is not None and 
            tx.date is not None and 
            tx.category is not None and 
            tx.subcategory is not None and 
            (tx.tax is not None and tx.tax >= 0)
        ),
    }


def serialize_transaction_detail(tx: Transaction, business):
    """Serialize a Transaction for detail/edit view"""
    detail = serialize_transaction_list(tx)
    
    # Add extra fields for edit
    detail["description"] = tx.description
    detail["internal_comments"] = tx.internal_comments
    detail["datetime"] = tx.datetime
    
    # Computed price breakdown
    if tx.amount and tx.tax:
        try:
            gross = Decimal(tx.amount)
            tax_pct = Decimal(tx.tax or 0)
            denom = Decimal('1') + (tax_pct / Decimal('100'))
            net = (gross / denom).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            tax_amount = gross - net
            detail["net_amount"] = net
            detail["tax_amount"] = tax_amount.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        except (InvalidOperation, ZeroDivisionError):
            detail["net_amount"] = tx.amount
            detail["tax_amount"] = Decimal('0')
    else:
        detail["net_amount"] = tx.amount
        detail["tax_amount"] = Decimal('0')
    
    # Navigation - get prev/next transaction
    all_txs = Transaction.objects.filter(business=business).exclude(status='inactive').order_by('internal_id')
    
    prev_tx = all_txs.filter(internal_id__lt=tx.internal_id).order_by('-internal_id').first()
    next_tx = all_txs.filter(internal_id__gt=tx.internal_id).order_by('internal_id').first()
    
    detail["prev_transaction_internal_id"] = prev_tx.internal_id if prev_tx else None
    detail["next_transaction_internal_id"] = next_tx.internal_id if next_tx else None
    
    # Navigation for review_required transactions
    review_txs = Transaction.objects.filter(business=business, status='review_required').order_by('internal_id')
    
    prev_review = review_txs.filter(internal_id__lt=tx.internal_id).order_by('-internal_id').first()
    next_review = review_txs.filter(internal_id__gt=tx.internal_id).order_by('internal_id').first()
    
    detail["prev_review_required_internal_id"] = prev_review.internal_id if prev_review else None
    detail["next_review_required_internal_id"] = next_review.internal_id if next_review else None
    
    return detail


def apply_transaction_filters(qs, filters: TransactionFilters):
    """Apply filters to transaction queryset"""

    # General search across transaction and linked vehicle fields
    if filters.search:
        search_term = filters.search
        query = (
            Q(status__icontains=search_term) |
            Q(category__icontains=search_term) |
            Q(subcategory__icontains=search_term) |
            Q(currency__icontains=search_term) |
            Q(method__icontains=search_term) |
            Q(from_or_to__icontains=search_term) |
            Q(description__icontains=search_term) |
            Q(internal_comments__icontains=search_term) |
            Q(vehicle__make__name__icontains=search_term) |
            Q(vehicle__model__name__icontains=search_term) |
            Q(vehicle__chassis_number__icontains=search_term) |
            Q(vehicle__official_license_plate__icontains=search_term) |
            Q(vehicle__motor_vehicle_registration_number__icontains=search_term) |
            Q(category_fk__name__icontains=search_term) |
            Q(subcategory_fk__name__icontains=search_term)
        )

        try:
            num = int(search_term)
            query |= Q(internal_id=num)
            query |= Q(vehicle__internal_id=num)
        except ValueError:
            pass

        try:
            dec = Decimal(search_term)
            query |= Q(amount=dec)
            query |= Q(tax=dec)
        except Exception:
            pass

        qs = qs.filter(query)
    
    # Quick search by internal_id
    if filters.internal_id:
        qs = qs.filter(internal_id=filters.internal_id)
    
    # Status filter (default: exclude inactive unless explicitly requested)
    if filters.status:
        qs = qs.filter(status=filters.status)
    else:
        qs = qs.exclude(status='inactive')
    
    # Category/subcategory filters
    if filters.category:
        qs = qs.filter(category=filters.category)
    if filters.subcategory:
        qs = qs.filter(subcategory=filters.subcategory)
    
    # Currency & method filters
    if filters.currency:
        qs = qs.filter(currency=filters.currency)
    if filters.method:
        qs = qs.filter(method=filters.method)
    
    # Vehicle filter (Frontend sends internal_id)
    if filters.vehicle:
        qs = qs.filter(vehicle__internal_id=filters.vehicle)
    
    # Amount range
    if filters.min_amount is not None:
        qs = qs.filter(amount__gte=filters.min_amount)
    if filters.max_amount is not None:
        qs = qs.filter(amount__lte=filters.max_amount)
    
    # Date range
    if filters.min_date:
        qs = qs.filter(date__gte=filters.min_date)
    if filters.max_date:
        qs = qs.filter(date__lte=filters.max_date)
    
    return qs


def apply_transaction_sorting(qs, filters: TransactionFilters):
    """Apply sorting to transaction queryset"""
    sort_field = filters.sort or 'internal_id'
    order = filters.order or 'desc'
    
    # Map sort field names
    sort_mapping = {
        'internal_id': 'internal_id',
        'status': 'status',
        'category': 'category',
        'subcategory': 'subcategory',
        'amount': 'amount',
        'date': 'date',
        'method': 'method',
        'vehicle': 'vehicle__make__name',
    }
    
    field = sort_mapping.get(sort_field, 'internal_id')
    if order == 'desc':
        field = f'-{field}'
    
    return qs.order_by(field)


def calculate_financial_summary(qs):
    """Calculate financial summary for a transaction queryset"""
    # Filter out inactive transactions
    active_qs = qs.exclude(status='inactive')
    
    # Calculate using Transaction classmethod
    net_revenue = Transaction.get_net_total_revenue_from_queryset(active_qs)
    net_expenses = Transaction.get_net_total_expenses_from_queryset(active_qs)
    net_difference = net_revenue - net_expenses
    
    tax_revenue = Transaction.get_tax_total_revenue_from_queryset(active_qs)
    tax_expenses = Transaction.get_tax_total_expenses_from_queryset(active_qs)
    tax_difference = tax_revenue + tax_expenses
    
    gross_revenue = Transaction.get_gross_total_revenue_from_queryset(active_qs)
    gross_expenses = Transaction.get_gross_total_expenses_from_queryset(active_qs)
    gross_difference = gross_revenue - gross_expenses
    
    return TransactionFinancialSummary(
        net_total_revenue=net_revenue,
        net_total_expenses=net_expenses,
        net_difference=net_difference,
        tax_total_revenue=tax_revenue,
        tax_total_expenses=tax_expenses,
        tax_difference=tax_difference,
        gross_total_revenue=gross_revenue,
        gross_total_expenses=gross_expenses,
        gross_difference=gross_difference,
    )


# =============================================================================
# Transaction CRUD Endpoints
# =============================================================================

# IMPORTANT: Static routes must be defined BEFORE parameterized routes
# to prevent /{internal_id} from capturing "choices" or "subcategories"

@router.get("/next-id", response={200: dict})
def get_next_transaction_id(request):
    """
    Get the projected next internal ID for a new transaction.
    This is a projection based on MAX(internal_id) + 1.
    """
    business = get_user_business(request)
    
    # Get the highest internal_id for this business
    last_transaction = Transaction.objects.filter(business=business).order_by('-internal_id').first()
    next_id = (last_transaction.internal_id + 1) if last_transaction and last_transaction.internal_id else 1
    
    return {"next_id": next_id}


@router.get("/choices", response=TransactionChoices)
def get_transaction_choices(request):
    """
    Get all form dropdown options.
    Called once when the transaction form loads.
    """
    business = get_user_business(request)
    
    # Get category choices from Category model (dynamic, user-created)
    categories = Category.objects.filter(business=business, is_active=True).order_by('name')
    category_choices = [
        {"value": str(c.id), "label": c.name}
        for c in categories
    ]
    
    # Get method choices from PaymentMethod model (dynamic, user-created)
    methods = PaymentMethod.objects.filter(business=business, is_active=True).order_by('name')
    method_choices = [
        {"value": str(m.id), "label": m.name}
        for m in methods
    ]
    
    # Get currency choices from Currency model (dynamic, user-created)
    currencies = Currency.objects.filter(business=business, is_active=True).order_by('name')
    currency_choices = [
        {"value": str(c.id), "label": f"{c.name} ({c.code})"}
        for c in currencies
    ]
    
    # Get vehicles for this business
    vehicles = Vehicle.objects.filter(business=business).exclude(status='inactive').order_by('-internal_id')
    vehicle_choices = [
        {"value": v.internal_id, "label": str(v)}  # Use internal_id for vehicle routes
        for v in vehicles
    ]
    
    return TransactionChoices(
        category_choices=category_choices,
        method_choices=method_choices,
        currency_choices=currency_choices,
        vehicle_choices=vehicle_choices,
    )


@router.get("/subcategories/{category_id}", response=SubcategoriesResponse)
def get_subcategories(request, category_id: int):
    """
    Get subcategories for a specific category by ID.
    Returns subcategories from the Subcategory model.
    """
    business = get_user_business(request)
    
    # Get subcategories linked to this category
    subcategories = Subcategory.objects.filter(
        business=business,
        category_id=category_id,
        is_active=True
    ).order_by('name')
    
    # Return list of subcategory objects with id and name
    subcategory_list = [
        {"id": s.id, "name": s.name}
        for s in subcategories
    ]
    
    return SubcategoriesResponse(subcategories=subcategory_list)


@router.post("/choices/category", response={201: dict, 400: ErrorResponse})
def create_category(request, name: str = Form(...)):
    """
    Create a new transaction category.
    Validates uniqueness within the business (active records only).
    """
    business = get_user_business(request)
    
    # Check if category already exists (active only)
    if Category.objects.filter(business=business, name__iexact=name.strip(), is_active=True).exists():
        return 400, ErrorResponse(message=f"Category '{name}' already exists")
    
    # Create new category
    category = Category.objects.create(
        business=business,
        name=name.strip(),
        is_active=True
    )
    
    return 201, {"id": category.id, "name": category.name}


@router.post("/choices/subcategory", response={201: dict, 400: ErrorResponse})
def create_subcategory(request, name: str = Form(...), category_id: int = Form(...)):
    """
    Create a new subcategory under a specific category.
    Validates uniqueness within the category (active records only).
    """
    business = get_user_business(request)
    
    # Get the parent category
    category = get_object_or_404(Category, id=category_id, business=business)
    
    # Check if subcategory already exists within this category (active only)
    if Subcategory.objects.filter(
        business=business,
        category=category,
        name__iexact=name.strip(),
        is_active=True
    ).exists():
        return 400, ErrorResponse(message=f"Subcategory '{name}' already exists in this category")
    
    # Create new subcategory
    subcategory = Subcategory.objects.create(
        business=business,
        category=category,
        name=name.strip(),
        is_active=True
    )
    
    return 201, {"id": subcategory.id, "name": subcategory.name}


@router.post("/choices/method", response={201: dict, 400: ErrorResponse})
def create_method(request, name: str = Form(...)):
    """
    Create a new payment method.
    Validates uniqueness within the business (active records only).
    """
    business = get_user_business(request)
    
    # Check if method already exists (active only)
    if PaymentMethod.objects.filter(business=business, name__iexact=name.strip(), is_active=True).exists():
        return 400, ErrorResponse(message=f"Payment method '{name}' already exists")
    
    # Create new method
    method = PaymentMethod.objects.create(
        business=business,
        name=name.strip(),
        is_active=True
    )
    
    return 201, {"id": method.id, "name": method.name}


@router.post("/choices/currency", response={201: dict, 400: ErrorResponse})
def create_currency(request, name: str = Form(...), code: str = Form(...)):
    """
    Create a new currency.
    Validates uniqueness by code within the business (active records only).
    """
    business = get_user_business(request)
    
    # Check if currency already exists by code (active only)
    if Currency.objects.filter(business=business, code__iexact=code.strip(), is_active=True).exists():
        return 400, ErrorResponse(message=f"Currency with code '{code}' already exists")
    
    # Create new currency
    currency = Currency.objects.create(
        business=business,
        name=name.strip(),
        code=code.strip().upper(),
        is_active=True
    )
    
    return 201, {"id": currency.id, "name": f"{currency.name} ({currency.code})"}


@router.get("/", response=TransactionsResponse)
def list_transactions(request, filters: TransactionFilters = Query(...)):
    """
    List transactions with filtering, sorting, and pagination.
    Returns both paginated transactions and financial summary.
    """
    business = get_user_business(request)
    
    # DEBUG: Log what we're querying
    print(f"[DEBUG] Fetching transactions for business: {business}")
    
    # Base queryset
    qs = Transaction.objects.filter(business=business).select_related(
        'vehicle',
        'vehicle__make',
        'vehicle__model',
        'category_fk',
        'subcategory_fk',
    )
    
    # DEBUG: Log count before filters
    print(f"[DEBUG] Total transactions before filters: {qs.count()}")
    
    # Apply filters
    qs = apply_transaction_filters(qs, filters)
    
    # DEBUG: Log count after filters
    print(f"[DEBUG] Total transactions after filters: {qs.count()}")
    
    # Calculate financial summary BEFORE pagination (on filtered results)
    financial_summary = calculate_financial_summary(qs)
    
    # Apply sorting
    qs = apply_transaction_sorting(qs, filters)
    
    # Paginate
    paginator = Paginator(qs, filters.per_page)
    page_obj = paginator.get_page(filters.page)
    
    # Serialize
    items = [serialize_transaction_list(tx) for tx in page_obj.object_list]
    
    # DEBUG: Log items count
    print(f"[DEBUG] Returning {len(items)} transactions")
    
    return TransactionsResponse(
        transactions=PaginatedTransactions(
            total=paginator.count,
            page=filters.page,
            per_page=filters.per_page,
            pages=paginator.num_pages,
            items=items,
        ),
        financial_summary=financial_summary,
    )


@router.get("/export-pdf")
def export_transactions_pdf(request, filters: TransactionFilters = Query(...)):
    """
    Export filtered transactions as a PDF summary report.
    """
    business = get_user_business(request)
    
    # Base queryset
    qs = Transaction.objects.filter(business=business).select_related(
        'vehicle', 'vehicle__make', 'vehicle__model', 'category_fk', 'subcategory_fk'
    )
    
    # Apply same filters and sorting as the list view
    qs = apply_transaction_filters(qs, filters)
    qs = apply_transaction_sorting(qs, filters)
    
    # Generate the PDF
    from .views import generate_transactions_summary_pdf
    pdf_buffer = generate_transactions_summary_pdf(
        business=business,
        transactions_queryset=qs,
        start_date=filters.min_date,
        end_date=filters.max_date
    )
    
    # Filename
    filename = f"Kontoauszug_{business.name.replace(' ', '_')}"
    if filters.min_date: filename += f"_{filters.min_date}"
    if filters.max_date: filename += f"_{filters.max_date}"
    filename += ".pdf"
    
    response = FileResponse(pdf_buffer, content_type='application/pdf')
    response['Content-Disposition'] = f'inline; filename="{filename}"'
    return response


@router.get("/{internal_id}", response={200: TransactionDetail, 404: ErrorResponse})
def get_transaction(request, internal_id: int):
    """Get single transaction details by internal ID"""
    business = get_user_business(request)
    
    tx = get_object_or_404(Transaction, business=business, internal_id=internal_id)
    
    return 200, serialize_transaction_detail(tx, business)


@router.post("/", response={201: TransactionDetail, 400: ErrorResponse})
def create_transaction(request, payload: TransactionCreate):
    """Create a new transaction"""
    business = get_user_business(request)
    
    # Build transaction data
    tx_data = {
        'business': business,
        'category': payload.category,
        'subcategory': payload.subcategory,
        'amount': payload.amount,
        'currency': payload.currency,
        'tax': payload.tax,
        'date': payload.date,
        'method': payload.method,
        'from_or_to': payload.from_or_to,
        'description': payload.description,
        'internal_comments': payload.internal_comments,
        # NOTE: status is auto-computed in Transaction.save()
    }
    
    # Link vehicle if provided - NOTE: frontend sends internal_id as vehicle_id
    if payload.vehicle_id:
        vehicle = get_object_or_404(Vehicle, business=business, internal_id=payload.vehicle_id)
        tx_data['vehicle'] = vehicle
    
    # Create transaction
    tx = Transaction.objects.create(**tx_data)
    
    # Log the create action
    log_activity(
        request,
        action='create',
        entity_type='transaction',
        entity_id=tx.internal_id,
        entity_name=f"Transaction #{tx.internal_id}"
    )
    
    return 201, serialize_transaction_detail(tx, business)


@router.put("/{internal_id}", response={200: TransactionDetail, 404: ErrorResponse})
def update_transaction(request, internal_id: int, payload: TransactionUpdate):
    """Update transaction details. Only provided fields will be updated."""
    business = get_user_business(request)
    
    tx = get_object_or_404(Transaction, business=business, internal_id=internal_id)
    
    # Update only provided fields
    update_data = payload.dict(exclude_unset=True)
    
    # Handle vehicle FK specially - NOTE: frontend sends internal_id as vehicle_id
    if 'vehicle_id' in update_data:
        vehicle_internal_id = update_data.pop('vehicle_id')
        if vehicle_internal_id:
            tx.vehicle = get_object_or_404(Vehicle, business=business, internal_id=vehicle_internal_id)
        else:
            tx.vehicle = None
    
    # Apply other updates
    for field, value in update_data.items():
        setattr(tx, field, value)
    
    # Auto-compute status on field edit if not explicitly set
    if 'status' not in update_data and tx.status != 'inactive':
        has_category = bool((tx.category and str(tx.category).strip()) or tx.category_fk_id)
        has_subcategory = bool((tx.subcategory and str(tx.subcategory).strip()) or tx.subcategory_fk_id)
        has_tax = tx.tax is not None
        has_date = bool(tx.date)
        has_method = bool((tx.method and str(tx.method).strip()) or tx.payment_method_fk_id)
        has_from_or_to = bool(tx.from_or_to and str(tx.from_or_to).strip())
        has_amount = tx.amount is not None
        has_currency = bool((tx.currency and str(tx.currency).strip()) or tx.currency_fk_id)

        all_mandatory = (has_category and has_subcategory and has_tax and
                         has_date and has_method and has_from_or_to and
                         has_amount and has_currency)
        if all_mandatory:
            tx.status = 'confirmed'
        else:
            tx.status = 'review_required'

    tx.save()
    
    # Log the update action
    log_activity(
        request,
        action='update',
        entity_type='transaction',
        entity_id=tx.internal_id,
        entity_name=f"Transaction #{tx.internal_id}"
    )
    
    return 200, serialize_transaction_detail(tx, business)


@router.post("/{internal_id}/status", response={200: TransactionDetail, 400: ErrorResponse, 404: ErrorResponse})
def update_transaction_status(request, internal_id: int, payload: TransactionStatusUpdate):
    """Explicitly change the status of a transaction (e.g. from footer buttons)"""
    business = get_user_business(request)
    tx = get_object_or_404(Transaction, business=business, internal_id=internal_id)
    
    new_status = payload.status
    if new_status not in ['confirmed', 'review_required', 'inactive']:
        return 400, ErrorResponse(message=f"Invalid status '{new_status}'")
    
    # Check mandatory fields if setting to confirmed
    if new_status == 'confirmed':
        has_category = bool((tx.category and str(tx.category).strip()) or tx.category_fk_id)
        has_subcategory = bool((tx.subcategory and str(tx.subcategory).strip()) or tx.subcategory_fk_id)
        has_tax = tx.tax is not None
        has_date = bool(tx.date)
        has_method = bool((tx.method and str(tx.method).strip()) or tx.payment_method_fk_id)
        has_from_or_to = bool(tx.from_or_to and str(tx.from_or_to).strip())
        has_amount = tx.amount is not None
        has_currency = bool((tx.currency and str(tx.currency).strip()) or tx.currency_fk_id)
        
        all_mandatory = (has_category and has_subcategory and has_tax and
                         has_date and has_method and has_from_or_to and
                         has_amount and has_currency)
        if not all_mandatory:
            return 400, ErrorResponse(message="All mandatory fields must be filled to set status to confirmed")
    
    old_status = tx.status
    tx.status = new_status
    tx.save()
    
    # Log the status change
    old_status_de = TX_STATUS_MAP_DE.get(old_status, old_status)
    new_status_de = TX_STATUS_MAP_DE.get(new_status, new_status)
    log_activity(
        request,
        action='status_change',
        entity_type='transaction',
        entity_id=tx.internal_id,
        entity_name=f"Transaction #{tx.internal_id}",
        details={
            "en": f"Status changed from {old_status} to {new_status}",
            "de": f"Status geändert von {old_status_de} auf {new_status_de}"
        }
    )
    
    return 200, serialize_transaction_detail(tx, business)


@router.delete("/{internal_id}", response={200: SuccessResponse, 404: ErrorResponse})
def delete_transaction(request, internal_id: int):
    """Soft delete a transaction (set status to inactive)"""
    business = get_user_business(request)
    
    tx = get_object_or_404(Transaction, business=business, internal_id=internal_id)
    tx.status = 'inactive'
    tx.save()
    
    # Log the delete action
    log_activity(
        request,
        action='delete',
        entity_type='transaction',
        entity_id=tx.internal_id,
        entity_name=f"Transaction #{tx.internal_id}"
    )
    
    return 200, SuccessResponse(message="Transaction deactivated successfully")


@router.post("/{internal_id}/activate", response={200: SuccessResponse, 404: ErrorResponse})
def activate_transaction(request, internal_id: int):
    """Reactivate an inactive transaction"""
    business = get_user_business(request)
    
    tx = get_object_or_404(Transaction, business=business, internal_id=internal_id)
    tx.status = 'review_required'
    tx.save()
    
    # Log the status change
    log_activity(
        request,
        action='status_change',
        entity_type='transaction',
        entity_id=tx.internal_id,
        entity_name=f"Transaction #{tx.internal_id}",
        details={
            "en": "Reactivated (inactive → review_required)",
            "de": "Reaktiviert (Inaktiv → Prüfung erforderlich)"
        }
    )
    
    return 200, SuccessResponse(message="Transaction activated successfully")

@router.get("/{internal_id}/pdf")
def download_transaction_pdf(request, internal_id: int):
    """Download a single transaction as PDF"""
    business = get_user_business(request)
    tx = get_object_or_404(Transaction, business=business, internal_id=internal_id)

    from .pdf_generators.transaction_pdfs import generate_transaction_pdf_with_data
    pdf_buffer = generate_transaction_pdf_with_data(tx, business)

    filename = f"Transaction_{tx.internal_id}.pdf"
    response = FileResponse(pdf_buffer, content_type='application/pdf')
    response['Content-Disposition'] = f'inline; filename="{filename}"'
    return response


# =============================================================================
# CSV Import Endpoint
# =============================================================================

@router.post("/import/csv/", response={200: ImportTransactionsResponse, 400: ErrorResponse})
def import_transactions_csv(
    request,
    transactions_file: UploadedFile = File(...),
    method: str = Form(...)
):
    """
    Import transactions from a StarMoney CSV export file.
    
    OPTIMIZED for large files (5000+ rows):
    - Pre-loads currencies into memory (avoids N queries)
    - Pre-loads existing transactions as dict for O(1) lookup
    - Uses bulk_create for new transactions + bulk_update for duplicates
    - Wrapped in atomic transaction
    
    UPSERT BEHAVIOR:
    - Hash key = date|amount|counterparty|description (method NOT included)
    - New rows: bulk_create with assigned internal_id
    - Duplicate rows: bulk_update the method field to the user's current selection
    - This allows users to re-import the same file with a different bank/method
    
    StarMoney Export Format:
    - Encoding: UTF-8
    - Delimiter: Semicolon (;)
    - Decimal: Comma (,) e.g., 1.000,00 or -50,50
    - Thousand separator: Dot (.)
    
    Required Columns (German headers):
    - Buchungstag: Date in DD.MM.YYYY format (e.g., 17.1.2023)
    - Begünstigter/Absender - Name: Counterparty name
    - Betrag: Amount (includes sign: positive=incoming, negative=outgoing)
    - Betrag - Währung: Currency code (e.g., EUR, USD)
    - Verwendungszweckzeile 1: Description/purpose
    """
    from django.db import transaction as db_transaction
    from django.db.models import Max
    
    business = get_user_business(request)
    
    # =========================================================================
    # Resolve PaymentMethod ID to name
    # The frontend sends the PaymentMethod.id, but we need to store the name
    # =========================================================================
    method_name = None
    if method:
        try:
            payment_method = PaymentMethod.objects.filter(
                business=business,
                id=int(method),
                is_active=True
            ).first()
            if payment_method:
                method_name = payment_method.name
            else:
                # Fallback: Maybe it's the actual method key (e.g., 'sparkasse')
                method_name = method
        except (ValueError, TypeError):
            # If method is not a valid ID, use it directly as the name
            method_name = method
    
    # =========================================================================
    # Get current max internal_id (for manual assignment since bulk_create skips save())
    # =========================================================================
    current_max_id = Transaction.objects.filter(business=business).aggregate(
        max_id=Max('internal_id')
    )['max_id'] or 0
    
    # Read and decode file (try utf-8-sig first for BOM handling, then utf-8)
    try:
        file_content = transactions_file.read()
        try:
            csv_text = file_content.decode('utf-8-sig')
        except UnicodeDecodeError:
            csv_text = file_content.decode('utf-8')
    except UnicodeDecodeError:
        return 400, ErrorResponse(message="Please upload a valid UTF-8 encoded .csv file.")
    
    # Parse CSV with pandas (semicolon delimiter)
    try:
        data_table = pandas.read_csv(io.StringIO(csv_text), sep=';', dtype=str)
        data_table = data_table.reset_index(drop=True)
    except Exception as e:
        return 400, ErrorResponse(message=f"Failed to parse CSV: {str(e)}")
    
    # Map expected German column names
    column_mapping = {
        'Buchungstag': 'date',
        'Begünstigter/Absender - Name': 'from_or_to',
        'Betrag': 'amount',
        'Betrag - Währung': 'currency',
        'Verwendungszweckzeile 1': 'description',
    }
    
    # Validate required columns exist
    missing_columns = [col for col in column_mapping.keys() if col not in data_table.columns]
    if missing_columns:
        return 400, ErrorResponse(
            message=f"CSV file is invalid. Missing columns: {', '.join(missing_columns)}. "
                    f"Expected StarMoney format with columns: {', '.join(column_mapping.keys())}"
        )
    
    # =========================================================================
    # OPTIMIZATION: Pre-load data into memory (avoid N queries)
    # =========================================================================
    
    # Pre-load all existing currencies for this business into a dict: {code: "Name (Code)"}
    currency_cache = {}
    for c in Currency.objects.filter(business=business, is_active=True):
        currency_cache[c.code.upper()] = f"{c.name} ({c.code})"
    
    # Build hardcoded currency name lookup from Transaction.CURRENCY_CHOICES
    hardcoded_currencies = {}
    if hasattr(Transaction, 'CURRENCY_CHOICES'):
        for name, code in Transaction.CURRENCY_CHOICES:
            hardcoded_currencies[code] = name
    
    # Pre-load all existing transaction unique keys as dict: {hash_key: Transaction object}
    # This allows us to both detect duplicates AND update them in-place
    existing_tx_map = {}
    for tx in Transaction.objects.filter(business=business).only('id', 'datetime', 'method'):
        if tx.datetime:
            existing_tx_map[tx.datetime] = tx
    
    # Also track keys we've seen in the current file (for within-file dedup)
    seen_keys_in_file = set()
    
    # =========================================================================
    # Helper functions (use cached data)
    # =========================================================================
    
    def parse_german_amount(amount_str: str) -> Decimal:
        """Parse German currency format to Decimal."""
        if not amount_str or pandas.isna(amount_str):
            return Decimal('0')
        try:
            amount_str = str(amount_str).strip()
            is_negative = amount_str.startswith('-') or amount_str.startswith('–')
            amount_str = amount_str.lstrip('-–')
            amount_str = amount_str.replace('.', '')  # Remove thousand separator
            amount_str = amount_str.replace(',', '.')  # Convert decimal separator
            result = Decimal(amount_str)
            return -result if is_negative else result
        except (InvalidOperation, ValueError):
            return Decimal('0')
    
    def parse_german_date(date_str: str) -> str:
        """Parse German date format to ISO format."""
        if not date_str or pandas.isna(date_str):
            return None
        try:
            date_str = str(date_str).strip()
            parts = date_str.split('.')
            if len(parts) != 3:
                return None
            day, month, year = parts
            if len(year) == 2:
                year = '20' + year if int(year) < 50 else '19' + year
            return f"{year}-{int(month):02d}-{int(day):02d}"
        except (ValueError, IndexError):
            return None
    
    # Track currencies that need to be created
    currencies_to_create = {}  # {code: Currency object}
    
    def get_currency_label(code: str) -> str:
        """Get currency label from cache or prepare for creation."""
        if not code or pandas.isna(code):
            return currency_cache.get('EUR', 'EUR')
        
        code = str(code).strip().upper()
        
        # Check cache first
        if code in currency_cache:
            return currency_cache[code]
        
        # Check if we're already planning to create this currency
        if code in currencies_to_create:
            c = currencies_to_create[code]
            return f"{c.name} ({c.code})"
        
        # Need to create - prepare the object (will bulk create later)
        currency_name = hardcoded_currencies.get(code, code)
        new_currency = Currency(
            business=business,
            name=currency_name,
            code=code,
            is_active=True
        )
        currencies_to_create[code] = new_currency
        
        # Return the label we'll use
        label = f"{currency_name} ({code})"
        currency_cache[code] = label  # Add to cache for future lookups in same batch
        return label
    
    # =========================================================================
    # Process rows: sort into to_create and to_update lists
    # =========================================================================
    
    transactions_to_create = []
    transactions_to_update = []  # Existing DB transactions that need method updated
    created_count = 0
    updated_count = 0
    skipped_count = 0
    error_count = 0
    error_details = []
    
    for index, row in data_table.iterrows():
        try:
            # Extract values
            date_str = row.get('Buchungstag', '')
            from_or_to = row.get('Begünstigter/Absender - Name', '')
            amount_str = row.get('Betrag', '')
            currency_code = row.get('Betrag - Währung', 'EUR')
            description = row.get('Verwendungszweckzeile 1', '')
            
            # Parse values
            parsed_date = parse_german_date(date_str)
            parsed_amount = parse_german_amount(amount_str)
            currency_label = get_currency_label(currency_code)
            
            # Clean strings
            from_or_to = str(from_or_to).strip() if from_or_to and pandas.notna(from_or_to) else ''
            description = str(description).strip() if description and pandas.notna(description) else ''
            
            # Validate
            if not parsed_date:
                error_details.append(f"Row {index + 2}: Invalid date '{date_str}'")
                error_count += 1
                continue
            
            if parsed_amount == Decimal('0') and amount_str and str(amount_str).strip() not in ['0', '0,00', '0.00']:
                error_details.append(f"Row {index + 2}: Failed to parse amount '{amount_str}'")
                error_count += 1
                continue
            
            # Create unique key for duplicate detection
            # IMPORTANT: method is NOT included in the hash so re-importing
            # with a different payment method updates existing records
            unique_key = f"{parsed_date}|{parsed_amount}|{from_or_to}|{description[:50]}"
            
            # Skip within-file duplicates (same row appearing twice in the CSV)
            if unique_key in seen_keys_in_file:
                skipped_count += 1
                continue
            seen_keys_in_file.add(unique_key)
            
            # Check if this transaction already exists in the database
            existing_tx = existing_tx_map.get(unique_key)
            
            if existing_tx:
                # DUPLICATE FOUND — update the method field on the existing record
                if existing_tx.method != method_name:
                    existing_tx.method = method_name
                    transactions_to_update.append(existing_tx)
                    updated_count += 1
                else:
                    # Same method, nothing to change
                    skipped_count += 1
            else:
                # NEW TRANSACTION — prepare for bulk_create
                current_max_id += 1
                
                new_tx = Transaction(
                    business=business,
                    internal_id=current_max_id,  # Manually assign since bulk_create skips save()
                    status="review_required",
                    datetime=unique_key,
                    method=method_name,  # Use resolved PaymentMethod name, not ID
                    amount=parsed_amount,
                    date=parsed_date,
                    description=description,
                    currency=currency_label,
                    from_or_to=from_or_to,
                    tax=None,
                    category=None,
                    subcategory=None,
                    vehicle=None,
                    internal_comments='',
                )
                transactions_to_create.append(new_tx)
                # Add to map so subsequent rows in same file can detect it
                existing_tx_map[unique_key] = new_tx
                created_count += 1
            
        except Exception as e:
            print(f"[IMPORT ERROR] Row {index + 2}: {str(e)}")
            error_details.append(f"Row {index + 2}: {str(e)}")
            error_count += 1
            continue
    
    # =========================================================================
    # Bulk create + bulk update in atomic transaction
    # =========================================================================
    
    try:
        with db_transaction.atomic():
            # First, create any new currencies
            if currencies_to_create:
                Currency.objects.bulk_create(list(currencies_to_create.values()))
                print(f"[IMPORT] Created {len(currencies_to_create)} new currencies")
            
            # Bulk CREATE new transactions in batches of 1000
            if transactions_to_create:
                batch_size = 1000
                for i in range(0, len(transactions_to_create), batch_size):
                    batch = transactions_to_create[i:i + batch_size]
                    Transaction.objects.bulk_create(batch)
                    print(f"[IMPORT] Created batch {i // batch_size + 1}: {len(batch)} transactions")
            
            # Bulk UPDATE existing transactions' method in batches of 1000
            if transactions_to_update:
                batch_size = 1000
                for i in range(0, len(transactions_to_update), batch_size):
                    batch = transactions_to_update[i:i + batch_size]
                    Transaction.objects.bulk_update(batch, ['method'])
                    print(f"[IMPORT] Updated batch {i // batch_size + 1}: {len(batch)} transactions (method)")
                    
    except Exception as e:
        print(f"[IMPORT ERROR] Bulk operation failed: {str(e)}")
        return 400, ErrorResponse(message=f"Failed to save transactions: {str(e)}")
    
    # Build result message
    parts = []
    if created_count > 0:
        parts.append(f"{created_count} created")
    if updated_count > 0:
        parts.append(f"{updated_count} updated (method)")
    if skipped_count > 0:
        parts.append(f"{skipped_count} unchanged")
    if error_count > 0:
        parts.append(f"{error_count} errors")
    
    message = f"Import completed: {', '.join(parts) if parts else 'no changes'}"
    if error_count > 0 and error_details[:5]:
        message += f". First errors: {'; '.join(error_details[:5])}"
    
    return 200, ImportTransactionsResponse(
        success=True,
        message=message,
        created_count=created_count,
        updated_count=updated_count,
        error_count=error_count
    )


