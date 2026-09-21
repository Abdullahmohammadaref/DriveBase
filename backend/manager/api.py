"""
Django Ninja API for Vehicle Management System.

This module provides REST API endpoints for:
- Vehicle CRUD operations
- Dynamic choice management (Makes, Colors, etc.)
- PDF generation triggers
- Financial summaries

Authentication: Uses Django session authentication (same-domain SPA).
"""

from ninja import Router, Query, File, Form
from ninja.files import UploadedFile
from ninja.security import django_auth
from django.shortcuts import get_object_or_404
from django.http import FileResponse, HttpResponse
from django.db.models import Q, Sum, Case, When, F, Value, DecimalField
from django.db.models.functions import Coalesce
from django.core.paginator import Paginator
from django.utils import timezone
from typing import Optional, List
from decimal import Decimal
from datetime import datetime
import io

from .models import (
    Vehicle, Business, Branch, LegalEntity,
    VehicleType, BodyType, Make, VehicleModel,
    Color, FuelType, DamageType, DoorsChoice,
    PaymentMethod, TaxPercentage, Currency, Category, Subcategory,
    ActivityLog, KeyNumber, Country, City,
    VehicleExpenseEarning
)
from .schemas import (
    VehicleListOut, VehicleDetailOut, VehicleCreate, VehicleUpdate,
    VehicleFilters, PaginatedVehicles, FinancialSummary, AllChoices,
    VehiclesResponse, ChoiceBase, ChoiceCreate, ChoiceCreatedResponse,
    TaxPercentageOut, TaxPercentageCreate, VehicleModelOut,
    VehicleModelCreate, LegalEntityOut, LegalEntityCreate,
    LegalEntityListOut, LegalEntityUpdate, LegalEntityFilters, LegalEntitiesListResponse,
    BranchOut, ErrorResponse, SuccessResponse,
    ChoiceUpdatePayload, KeyNumberOut,
    VehicleExpenseEarningOut, VehicleExpenseEarningCreate
)
from .image_processing import process_vehicle_image

# Create router with session authentication
router = Router(auth=django_auth, tags=["Vehicles"])

VEHICLE_DETAIL_RELATIONS = (
    'branch', 'make', 'model', 'body_type', 'color', 'fuel_type',
    'doors', 'damage_type', 'vehicle_type', 'buy_tax', 'sale_tax',
    'buy_payment_method', 'sale_payment_method', 'seller', 'buyer'
)


# =============================================================================
# Helper Functions
# =============================================================================

def get_user_business(request) -> Business:
    """Get the authenticated user's business"""
    return request.user.business


VEHICLE_STATUS_MAP_DE = {
    'available': 'Verfügbar',
    'reserved': 'Reserviert',
    'sold': 'Verkauft',
    'purchased': 'Gekauft',
    'in_preparation': 'In Aufbereitung',
    'in_stock': 'Auf Lager',
    'offer': 'Angebot',
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
    
    Args:
        request: The HTTP request (to get user and business)
        action: One of 'create', 'update', 'delete', 'status_change'
        entity_type: One of 'vehicle', 'transaction', 'legal_entity', 'user', 'business_settings', 'choice'
        entity_id: Internal ID of the affected entity (optional)
        entity_name: Display name for the entity (e.g., "BMW X5", "Transaction #123")
        details: Additional details about the action (str or dict for bilingual {en, de})
    """
    import json
    if isinstance(details, dict):
        details_str = json.dumps(details, ensure_ascii=False)
    else:
        details_str = str(details or "")

    print(f"[ActivityLog] ========== LOGGING ACTIVITY ==========")
    print(f"[ActivityLog] Action: {action}")
    print(f"[ActivityLog] Entity Type: {entity_type}")
    print(f"[ActivityLog] Entity ID: {entity_id}")
    print(f"[ActivityLog] Entity Name: {entity_name}")
    print(f"[ActivityLog] Details: {details_str}")
    
    try:
        # Check user context
        user = getattr(request, 'user', None)
        print(f"[ActivityLog] User from request: {user}")
        print(f"[ActivityLog] User is authenticated: {user.is_authenticated if user else 'N/A'}")
        
        if not user or not user.is_authenticated:
            print(f"[ActivityLog] ERROR: User is not authenticated or missing!")
            return
        
        business = getattr(user, 'business', None)
        print(f"[ActivityLog] Business: {business}")
        
        if not business:
            print(f"[ActivityLog] ERROR: User has no business!")
            return
        
        # Create the log entry
        print(f"[ActivityLog] Creating ActivityLog entry...")
        log_entry = ActivityLog.objects.create(
            business=business,
            user=user,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            entity_name=entity_name,
            details=details_str
        )
        print(f"[ActivityLog] SUCCESS! Created log entry with ID: {log_entry.id}")
        print(f"[ActivityLog] =========================================")
        
    except Exception as e:
        import traceback
        print(f"[ActivityLog] EXCEPTION OCCURRED: {type(e).__name__}: {e}")
        print(f"[ActivityLog] Traceback:")
        traceback.print_exc()
        print(f"[ActivityLog] =========================================")


def serialize_vehicle_list(vehicle: Vehicle) -> dict:
    """Serialize a Vehicle for list display"""
    # Get status display and convert lazy translation to string
    status_display = None
    if vehicle.status:
        status_choices_dict = dict(Vehicle.STATUS_CHOICES)
        status_display = str(status_choices_dict.get(vehicle.status, vehicle.status))
    
    # Determine if buy contract can be generated
    # Requires: buy_price, buy_date, buy_payment_method, seller
    can_generate_buy = all([
        vehicle.buy_price,
        vehicle.buy_date,
        vehicle.buy_payment_method,
        vehicle.seller,
    ])
    
    # Determine if sale contract can be generated
    # Requires: sale_price, sale_date, sale_payment_method, buyer
    can_generate_sale = all([
        vehicle.sale_price,
        vehicle.sale_date,
        vehicle.sale_payment_method,
        vehicle.buyer,
    ])
    
    # Pipeline transition rules
    ALLOWED_TRANSITIONS = {
        'purchased': ['ready_for_sale', 'reserved'],
        'ready_for_sale': ['purchased', 'reserved', 'sold'],
        'reserved': ['purchased', 'ready_for_sale', 'sold'],
        'sold': ['ready_for_sale', 'reserved'],
        'inactive': ['purchased', 'ready_for_sale', 'reserved', 'sold'],
    }
    
    can_move_to = ALLOWED_TRANSITIONS.get(vehicle.status, [])
    
    return {
        "id": vehicle.id,
        "internal_id": vehicle.internal_id,
        "status": vehicle.status,
        "status_display": status_display,
        "make_name": vehicle.make.name if vehicle.make else None,
        "model_name": vehicle.model.name if vehicle.model else (vehicle.manufacturer_model or None),  # Fallback to legacy field
        "body_type_name": vehicle.body_type.name if vehicle.body_type else None,
        "color_name": vehicle.color.name if vehicle.color else None,
        "year_of_construction": vehicle.year_of_construction,
        "kilometer": vehicle.kilometer,
        "power_kw": vehicle.power_kw,
        "fuel_type_name": vehicle.fuel_type.name if vehicle.fuel_type else None,
        "buy_price": vehicle.buy_price,
        "buy_price_net": vehicle.buy_price_net,
        "sale_price": vehicle.sale_price,
        "sale_price_net": vehicle.sale_price_net,
        "buy_date": vehicle.buy_date,
        "sale_date": vehicle.sale_date,
        "active_for": vehicle.active_for,
        "chassis_number": vehicle.chassis_number,
        "official_license_plate": vehicle.official_license_plate,
        "sale_invoice_number": vehicle.sale_invoice_number,
        "image_url": vehicle.image.url if vehicle.image else None,
        # Additional fields for VehicleCard
        "branch_name": vehicle.branch.name if vehicle.branch else None,
        "doors_name": vehicle.doors.name if vehicle.doors else None,
        "vehicle_type_name": vehicle.vehicle_type.name if vehicle.vehicle_type else None,
        "damage_type_name": vehicle.damage_type.name if vehicle.damage_type else None,
        "motor_vehicle_registration_number": vehicle.motor_vehicle_registration_number,
        "internal_comments": vehicle.internal_comments,
        # Contract availability flags
        "can_generate_buy_contract": can_generate_buy,
        "can_generate_sale_contract": can_generate_sale,
        # Pipeline availability
        "can_move_to": can_move_to,
    }


def serialize_vehicle_detail(vehicle: Vehicle) -> dict:
    """Serialize a Vehicle for detail/edit view"""
    data = serialize_vehicle_list(vehicle)
    
    # Add additional detail fields
    data.update({
        "description": vehicle.description,
        "internal_comments": vehicle.internal_comments,
        
        # Branch
        "branch_id": vehicle.branch_id,
        "branch_name": vehicle.branch.name if vehicle.branch else None,
        
        # Official details
        "motor_vehicle_registration_number": vehicle.motor_vehicle_registration_number,
        
        # Usage details
        "damage_type_id": vehicle.damage_type_id,
        "damage_type_name": vehicle.damage_type.name if vehicle.damage_type else None,
        "first_registration_date": vehicle.first_registration_date,
        
        # Vehicle details (FK IDs for form binding)
        "vehicle_type_id": vehicle.vehicle_type_id,
        "vehicle_type_name": vehicle.vehicle_type.name if vehicle.vehicle_type else None,
        "body_type_id": vehicle.body_type_id,
        "make_id": vehicle.make_id,
        "make_name": vehicle.make.name if vehicle.make else None,
        "model_id": vehicle.model_id,
        "model_name": vehicle.model.name if vehicle.model else (vehicle.manufacturer_model or None),
        "color_id": vehicle.color_id,
        "doors_id": vehicle.doors_id,
        "doors_name": vehicle.doors.name if vehicle.doors else None,
        "fuel_type_id": vehicle.fuel_type_id,
        
        # Buy details
        "buy_tax_id": vehicle.buy_tax_id,
        "buy_tax_name": vehicle.buy_tax.name if vehicle.buy_tax else None,
        "buy_tax_percentage": vehicle.buy_tax.percentage if vehicle.buy_tax else None,
        "buy_delivery_collection_date": vehicle.buy_delivery_collection_date,
        "buy_payment_method_id": vehicle.buy_payment_method_id,
        "buy_payment_method_name": vehicle.buy_payment_method.name if vehicle.buy_payment_method else None,
        "seller_id": vehicle.seller_id,
        "seller_name": vehicle.seller.name if vehicle.seller else None,
        
        # Sale details
        "sale_tax_id": vehicle.sale_tax_id,
        "sale_tax_name": vehicle.sale_tax.name if vehicle.sale_tax else None,
        "sale_tax_percentage": vehicle.sale_tax.percentage if vehicle.sale_tax else None,
        "sale_delivery_collection_date": vehicle.sale_delivery_collection_date,
        "sale_payment_method_id": vehicle.sale_payment_method_id,
        "sale_payment_method_name": vehicle.sale_payment_method.name if vehicle.sale_payment_method else None,
        "buyer_id": vehicle.buyer_id,
        "buyer_name": vehicle.buyer.name if vehicle.buyer else None,
        
        # Computed properties
        "buy_price_after_tax": vehicle.buy_price_after_tax,
        "sale_price_after_tax": vehicle.sale_price_after_tax,
        
        # Financial summary from transactions
        "total_revenue": vehicle.total_revenue,
        "total_expenses": vehicle.total_expenses,
        "net_profit": vehicle.net_profit,
        "transactions": [
            {
                "id": t.id,
                "internal_id": t.internal_id,
                "date": t.date,
                "amount": t.amount,
                "tax": t.tax,
                "description": t.description,
                "category": t.category,
                "category_display": t.category_display,
                "subcategory": t.subcategory,
                "status": t.status,
            }
            for t in vehicle.vehicle_transactions.exclude(status='inactive')
        ],
        
        # Metadata
        "date_created": vehicle.date_created,

        # Key Number (reverse OneToOne)
        "key_number_id": vehicle.key_number.id if hasattr(vehicle, 'key_number') and vehicle.key_number else None,
        "key_number_value": vehicle.key_number.number if hasattr(vehicle, 'key_number') and vehicle.key_number else None,

        # Expenses/Earnings (lightweight, no FK to Transaction)
        "expenses_earnings": [
            {
                "id": ee.id,
                "type": ee.type,
                "amount": ee.amount,
                "category_id": ee.category_id,
                "category_name": ee.category.name if ee.category else None,
                "subcategory_id": ee.subcategory_id,
                "subcategory_name": ee.subcategory.name if ee.subcategory else None,
                "created_at": ee.created_at,
            }
            for ee in vehicle.expenses_earnings.filter(is_active=True)
                .select_related('category', 'subcategory')
        ],
    })
    
    return data


def build_vehicle_detail_response(business: Business, vehicle: Vehicle) -> dict:
    """Serialize a vehicle and include prev/next navigation metadata."""
    detail = serialize_vehicle_detail(vehicle)

    all_vehicles = Vehicle.objects.filter(business=business).exclude(status='inactive').order_by('internal_id')
    prev_vehicle = all_vehicles.filter(internal_id__lt=vehicle.internal_id).order_by('-internal_id').first()
    next_vehicle = all_vehicles.filter(internal_id__gt=vehicle.internal_id).order_by('internal_id').first()

    detail["prev_vehicle_internal_id"] = prev_vehicle.internal_id if prev_vehicle else None
    detail["next_vehicle_internal_id"] = next_vehicle.internal_id if next_vehicle else None

    return detail


def apply_vehicle_filters(qs, filters: VehicleFilters):
    """Apply filters to vehicle queryset"""
    
    # General search across multiple fields
    if filters.search:
        search_term = filters.search
        
        # Base string queries
        query = (
            Q(status__icontains=search_term) |
            Q(chassis_number__icontains=search_term) |
            Q(make__name__icontains=search_term) |
            Q(model__name__icontains=search_term) |
            Q(official_license_plate__icontains=search_term) |
            Q(color__name__icontains=search_term) |
            Q(fuel_type__name__icontains=search_term) |
            Q(vehicle_type__name__icontains=search_term) |
            Q(body_type__name__icontains=search_term) |
            Q(damage_type__name__icontains=search_term) |
            Q(doors__name__icontains=search_term) |
            Q(sale_invoice_number__icontains=search_term) |
            Q(motor_vehicle_registration_number__icontains=search_term) |
            Q(description__icontains=search_term) |
            Q(internal_comments__icontains=search_term) |
            Q(branch__name__icontains=search_term) |
            Q(seller__name__icontains=search_term) |
            Q(buyer__name__icontains=search_term) |
            Q(buy_tax__name__icontains=search_term) |
            Q(sale_tax__name__icontains=search_term) |
            Q(buy_payment_method__name__icontains=search_term) |
            Q(sale_payment_method__name__icontains=search_term)
        )

        # Numerical queries (integer)
        try:
            num = int(search_term)
            query |= Q(internal_id=num)
            query |= Q(year_of_construction=num)
            query |= Q(kilometer=num)
            query |= Q(power_kw=num)
        except ValueError:
            pass

        # Numerical queries (decimal)
        try:
            dec = Decimal(search_term)
            query |= Q(buy_price=dec)
            query |= Q(sale_price=dec)
        except Exception:
            pass
            
        qs = qs.filter(query)
    # Quick search filters
    if filters.vehicle_id_search:
        qs = qs.filter(internal_id=filters.vehicle_id_search)
    
    if filters.chassis_number_search:
        qs = qs.filter(chassis_number__icontains=filters.chassis_number_search)
    
    if filters.motor_vehicle_registration_search:
        qs = qs.filter(
            motor_vehicle_registration_number__icontains=filters.motor_vehicle_registration_search
        )
    
    if filters.official_license_plate_search:
        qs = qs.filter(
            official_license_plate__icontains=filters.official_license_plate_search
        )
    
    if filters.sale_invoice_number_search:
        qs = qs.filter(
            sale_invoice_number__icontains=filters.sale_invoice_number_search
        )
    
    # Vehicle detail filters
    if filters.status:
        qs = qs.filter(status=filters.status)
    
    if filters.make:
        qs = qs.filter(make_id=filters.make)
    
    if filters.model:
        qs = qs.filter(model_id=filters.model)
    
    if filters.branch:
        qs = qs.filter(branch_id=filters.branch)
    
    if filters.vehicle_type:
        qs = qs.filter(vehicle_type_id=filters.vehicle_type)
    
    if filters.body_type:
        qs = qs.filter(body_type_id=filters.body_type)
    
    if filters.doors:
        qs = qs.filter(doors_id=filters.doors)
    
    if filters.fuel_type:
        qs = qs.filter(fuel_type_id=filters.fuel_type)
    
    if filters.color:
        qs = qs.filter(color_id=filters.color)
    
    if filters.damage_type:
        qs = qs.filter(damage_type_id=filters.damage_type)
    
    # Price range filters
    if filters.min_buy_price:
        qs = qs.filter(buy_price__gte=filters.min_buy_price)
    
    if filters.max_buy_price:
        qs = qs.filter(buy_price__lte=filters.max_buy_price)
    
    if filters.specific_buy_price:
        qs = qs.filter(buy_price=filters.specific_buy_price)
    
    if filters.min_sale_price:
        qs = qs.filter(sale_price__gte=filters.min_sale_price)
    
    if filters.max_sale_price:
        qs = qs.filter(sale_price__lte=filters.max_sale_price)
    
    if filters.specific_sale_price:
        qs = qs.filter(sale_price=filters.specific_sale_price)
    
    # Date range filters
    if filters.min_buy_date:
        qs = qs.filter(buy_date__gte=filters.min_buy_date)
    
    if filters.max_buy_date:
        qs = qs.filter(buy_date__lte=filters.max_buy_date)
    
    if filters.min_sale_date:
        qs = qs.filter(sale_date__gte=filters.min_sale_date)
    
    if filters.max_sale_date:
        qs = qs.filter(sale_date__lte=filters.max_sale_date)
    
    # Technical spec filters
    if filters.min_year:
        qs = qs.filter(year_of_construction__gte=filters.min_year)
    
    if filters.max_year:
        qs = qs.filter(year_of_construction__lte=filters.max_year)
    
    if filters.min_kilometer:
        qs = qs.filter(kilometer__gte=filters.min_kilometer)
    
    if filters.max_kilometer:
        qs = qs.filter(kilometer__lte=filters.max_kilometer)
    
    if filters.min_power_kw:
        qs = qs.filter(power_kw__gte=filters.min_power_kw)
    
    if filters.max_power_kw:
        qs = qs.filter(power_kw__lte=filters.max_power_kw)
    
    return qs


def apply_vehicle_sorting(qs, filters: VehicleFilters):
    """Apply sorting to vehicle queryset"""
    sort_field = filters.sort or "internal_id"
    
    # Map frontend sort keys to model fields
    sort_mapping = {
        "internal_id": "internal_id",
        "status": "status",
        "make": "make__name",
        "buy_price": "buy_price",
        "sale_price": "sale_price",
        "buy_date": "buy_date",
        "sale_date": "sale_date",
        "kilometer": "kilometer",
        "year_of_construction": "year_of_construction",
    }
    
    db_field = sort_mapping.get(sort_field, "internal_id")
    
    if filters.order == "desc":
        db_field = f"-{db_field}"
    
    return qs.order_by(db_field)


def calculate_financial_summary(vehicles_qs) -> dict:
    """Calculate financial summary for a vehicle queryset based on vehicle financial rules"""
    gross_revenue = Decimal("0")
    net_revenue = Decimal("0")
    gross_expenses = Decimal("0")
    net_expenses = Decimal("0")
    gross_profit = Decimal("0")
    net_profit = Decimal("0")
    total_vat_liability = Decimal("0")
    total_profit = Decimal("0")

    total_active_days = 0
    vehicle_count = 0

    # Prefetch relations for performance
    vehicles = vehicles_qs.prefetch_related('expenses_earnings', 'buy_tax', 'sale_tax')

    for vehicle in vehicles:
        if vehicle.status == 'inactive':
            continue

        vehicle_count += 1
        total_active_days += (vehicle.active_for or 0)

        # 1. Buy Details & Tax
        buy_gross = Decimal(str(vehicle.buy_price)) if vehicle.buy_price is not None else Decimal("0")
        buy_net = Decimal(str(vehicle.buy_price_net)) if vehicle.buy_price_net is not None else buy_gross
        buy_tax_amount = buy_gross - buy_net

        # 2. Net Expenses & Earnings (signed: earnings - expenses)
        net_exp_earn = Decimal("0")
        for ee in vehicle.expenses_earnings.all():
            amt = Decimal(str(ee.amount)) if ee.amount is not None else Decimal("0")
            if ee.type == 'earning':
                net_exp_earn += amt
            elif ee.type == 'expense':
                net_exp_earn -= amt

        # 3. COGS & Gross COGS
        # COGS = buy_net + net_exp_earn
        # Gross COGS = buy_gross + net_exp_earn
        cogs = buy_net + net_exp_earn
        gross_cogs = buy_gross + net_exp_earn

        net_expenses += cogs
        gross_expenses += gross_cogs

        # 4. Sale Details & Tax
        if vehicle.sale_price is not None:
            sale_gross = Decimal(str(vehicle.sale_price))
            sale_net = Decimal(str(vehicle.sale_price_net)) if vehicle.sale_price_net is not None else sale_gross
            sale_tax_amount = sale_gross - sale_net

            gross_revenue += sale_gross
            net_revenue += sale_net

            v_vat_liability = abs(sale_tax_amount - buy_tax_amount)
            total_vat_liability += v_vat_liability

            # Gross Profit = (sale_gross - buy_gross) + net_exp_earn
            # Net Profit = (sale_net - buy_net) + net_exp_earn
            # Total Profit = net_profit - v_vat_liability
            v_gross_profit = (sale_gross - buy_gross) + net_exp_earn
            v_net_profit = (sale_net - buy_net) + net_exp_earn
            v_total_profit = v_net_profit - v_vat_liability

            gross_profit += v_gross_profit
            net_profit += v_net_profit
            total_profit += v_total_profit

    avg_days = Decimal(total_active_days) / Decimal(vehicle_count) if vehicle_count > 0 else Decimal("0")
    avg_roi = (gross_profit / net_expenses * Decimal("100")) if net_expenses > 0 else Decimal("0")
    avg_margin = (gross_profit / net_revenue * Decimal("100")) if net_revenue > 0 else Decimal("0")

    return {
        "net_total_revenue": net_revenue,
        "net_total_expenses": net_expenses,
        "net_difference": net_profit,
        "tax_total_revenue": Decimal("0"),
        "tax_total_expenses": Decimal("0"),
        "tax_difference": total_vat_liability,
        "gross_total_revenue": gross_revenue,
        "gross_total_expenses": gross_expenses,
        "gross_difference": gross_profit,
        "avg_days_on_stock": avg_days.quantize(Decimal("0.1")),
        "avg_roi": avg_roi.quantize(Decimal("0.01")),
        "avg_profit_margin": avg_margin.quantize(Decimal("0.01")),
        "total_profit": total_profit,
    }


# =============================================================================
# Vehicle CRUD Endpoints
# =============================================================================

@router.get("/vehicles", response=VehiclesResponse)
def list_vehicles(request, filters: VehicleFilters = Query(...)):
    """
    List vehicles with filtering, sorting, and pagination.
    Returns both paginated vehicles and financial summary.
    """
    business = get_user_business(request)
    
    # Base queryset - exclude inactive by default unless specifically requested
    qs = Vehicle.objects.filter(business=business).select_related(
        'branch', 'make', 'model', 'body_type', 'color', 'fuel_type',
        'doors', 'damage_type', 'vehicle_type', 'buy_tax', 'sale_tax',
        'buy_payment_method', 'sale_payment_method', 'seller', 'buyer'
    )
    
    if filters.status != 'inactive':
        qs = qs.exclude(status='inactive')
    
    # Apply filters
    qs = apply_vehicle_filters(qs, filters)
    
    # Calculate financial summary BEFORE pagination
    financial_summary = calculate_financial_summary(qs)
    
    # Apply sorting
    qs = apply_vehicle_sorting(qs, filters)
    
    # Pagination
    total = qs.count()
    pages = (total + filters.per_page - 1) // filters.per_page
    offset = (filters.page - 1) * filters.per_page
    vehicles = qs[offset:offset + filters.per_page]
    
    return {
        "vehicles": {
            "items": [serialize_vehicle_list(v) for v in vehicles],
            "total": total,
            "page": filters.page,
            "per_page": filters.per_page,
            "pages": pages,
        },
        "financial_summary": financial_summary,
    }


@router.get("/vehicles/next-id", response={200: dict})
def get_next_vehicle_id(request):
    """
    Get the projected next internal ID for a new vehicle.
    This is a projection based on MAX(internal_id) + 1.
    """
    business = get_user_business(request)
    
    # Get the highest internal_id for this business
    last_vehicle = Vehicle.objects.filter(business=business).order_by('-internal_id').first()
    next_id = (last_vehicle.internal_id + 1) if last_vehicle and last_vehicle.internal_id else 1
    
    return {"next_id": next_id}


@router.get("/vehicles/{internal_id}", response={200: VehicleDetailOut, 404: ErrorResponse})
def get_vehicle(request, internal_id: int):
    """Get single vehicle details by internal ID"""
    business = get_user_business(request)
    
    vehicle = get_object_or_404(
        Vehicle.objects.select_related(*VEHICLE_DETAIL_RELATIONS),
        business=business,
        internal_id=internal_id
    )

    return build_vehicle_detail_response(business, vehicle)


@router.post("/vehicles", response={201: VehicleDetailOut, 400: ErrorResponse})
def create_vehicle(
    request,
    payload: VehicleCreate
):
    """Create a new vehicle"""
    business = get_user_business(request)
    
    # Validate foreign keys belong to the same business
    branch = get_object_or_404(Branch, id=payload.branch_id, business=business)
    vehicle_type = get_object_or_404(VehicleType, id=payload.vehicle_type_id, business=business)
    body_type = get_object_or_404(BodyType, id=payload.body_type_id, business=business)
    make = get_object_or_404(Make, id=payload.make_id, business=business)
    color = get_object_or_404(Color, id=payload.color_id, business=business)
    doors = get_object_or_404(DoorsChoice, id=payload.doors_id, business=business)
    fuel_type = get_object_or_404(FuelType, id=payload.fuel_type_id, business=business)
    damage_type = get_object_or_404(DamageType, id=payload.damage_type_id, business=business)
    payment_method = get_object_or_404(PaymentMethod, id=payload.buy_payment_method_id, business=business)
    seller = get_object_or_404(LegalEntity, id=payload.seller_id, business=business)
    
    buy_tax = None
    if payload.buy_tax_id:
        buy_tax = get_object_or_404(TaxPercentage, id=payload.buy_tax_id, business=business)
    else:
        buy_tax = TaxPercentage.objects.filter(business=business, is_no_tax=True, is_active=True).first()
    
    # Get model if provided
    vehicle_model = None
    if payload.model_id:
        vehicle_model = get_object_or_404(VehicleModel, id=payload.model_id, make=make, business=business)
    
    # Create vehicle
    vehicle = Vehicle(
        business=business,
        status='purchased',  # Default status for new vehicles
        branch=branch,
        vehicle_type=vehicle_type,
        body_type=body_type,
        make=make,
        model=vehicle_model,
        color=color,
        doors=doors,
        fuel_type=fuel_type,
        power_kw=payload.power_kw,
        damage_type=damage_type,
        first_registration_date=payload.first_registration_date,
        year_of_construction=payload.year_of_construction,
        kilometer=payload.kilometer,
        chassis_number=payload.chassis_number.upper(),
        motor_vehicle_registration_number=payload.motor_vehicle_registration_number,
        official_license_plate=payload.official_license_plate,
        buy_price=payload.buy_price,
        buy_tax=buy_tax,
        buy_date=payload.buy_date,
        buy_delivery_collection_date=payload.buy_delivery_collection_date,
        buy_payment_method=payment_method,
        seller=seller,
        description=payload.description,
        internal_comments=payload.internal_comments,
    )
    
    vehicle.save()

    # Handle key number assignment if provided
    if payload.key_number_id:
        key_number = get_object_or_404(KeyNumber, id=payload.key_number_id, business=business)
        # Clear any previous vehicle this key might have been assigned to (safety check)
        key_number.vehicle = vehicle
        key_number.save()
    
    # Log the create action
    vehicle_name = f"{vehicle.make.name if vehicle.make else ''} {vehicle.model.name if vehicle.model else ''}".strip() or f"Vehicle #{vehicle.internal_id}"
    log_activity(
        request,
        action='create',
        entity_type='vehicle',
        entity_id=vehicle.internal_id,
        entity_name=vehicle_name
    )

    vehicle = Vehicle.objects.select_related(*VEHICLE_DETAIL_RELATIONS).get(id=vehicle.id)
    return 201, build_vehicle_detail_response(business, vehicle)


@router.patch("/vehicles/{internal_id}", response={200: VehicleDetailOut, 400: ErrorResponse, 404: ErrorResponse})
def update_vehicle(
    request,
    internal_id: int,
    payload: VehicleUpdate
):
    """Update vehicle details. Only provided fields will be updated."""
    business = get_user_business(request)
    
    vehicle = get_object_or_404(Vehicle, business=business, internal_id=internal_id)
    
    # Get the payload as a dict, excluding None values
    update_data = payload.dict(exclude_unset=True, exclude_none=True)
    
    # Handle FK fields - validate they belong to the business
    fk_mappings = {
        'branch_id': (Branch, 'branch'),
        'vehicle_type_id': (VehicleType, 'vehicle_type'),
        'body_type_id': (BodyType, 'body_type'),
        'make_id': (Make, 'make'),
        'model_id': (VehicleModel, 'model'),
        'color_id': (Color, 'color'),
        'doors_id': (DoorsChoice, 'doors'),
        'fuel_type_id': (FuelType, 'fuel_type'),
        'damage_type_id': (DamageType, 'damage_type'),
        'buy_tax_id': (TaxPercentage, 'buy_tax'),
        'sale_tax_id': (TaxPercentage, 'sale_tax'),
        'buy_payment_method_id': (PaymentMethod, 'buy_payment_method'),
        'sale_payment_method_id': (PaymentMethod, 'sale_payment_method'),
        'seller_id': (LegalEntity, 'seller'),
        'buyer_id': (LegalEntity, 'buyer'),
    }
    
    for field_id, (model_class, field_name) in fk_mappings.items():
        if field_id in update_data:
            fk_value = update_data.pop(field_id)
            if fk_value is not None:
                obj = get_object_or_404(model_class, id=fk_value, business=business)
                setattr(vehicle, field_name, obj)
            else:
                setattr(vehicle, field_name, None)
    
    # Update regular fields
    for field, value in update_data.items():
        if field == 'chassis_number' and value:
            value = value.upper()
        if field == 'key_number_id':
            continue  # handled below
        setattr(vehicle, field, value)
    
    vehicle.save()

    # Handle key_number assignment (reverse OneToOne, not a direct FK on Vehicle)
    if 'key_number_id' in payload.dict(exclude_unset=True):
        key_number_id = payload.key_number_id
        # Clear any existing key assigned to this vehicle
        KeyNumber.objects.filter(vehicle=vehicle).update(vehicle=None)
        
        if key_number_id is not None:
            key = get_object_or_404(KeyNumber, id=key_number_id, business=business, is_active=True)
            # Clear previous vehicle from this key (if any)
            key.vehicle = vehicle
            key.save()
    
    # Reload with related objects
    vehicle = Vehicle.objects.select_related(*VEHICLE_DETAIL_RELATIONS).get(id=vehicle.id)
    
    # Log the update action
    vehicle_name = f"{vehicle.make.name if vehicle.make else ''} {vehicle.model.name if vehicle.model else ''}".strip() or f"Vehicle #{vehicle.internal_id}"
    log_activity(
        request,
        action='update',
        entity_type='vehicle',
        entity_id=vehicle.internal_id,
        entity_name=vehicle_name
    )

    return build_vehicle_detail_response(business, vehicle)


@router.delete("/vehicles/{internal_id}", response={200: SuccessResponse, 404: ErrorResponse})
def delete_vehicle(request, internal_id: int):
    """Soft delete a vehicle (set status to inactive)"""
    business = get_user_business(request)
    
    vehicle = get_object_or_404(Vehicle, business=business, internal_id=internal_id)
    old_status = vehicle.status
    vehicle.status = 'inactive'
    vehicle.save()
    
    # Log the delete action
    vehicle_name = f"{vehicle.make.name if vehicle.make else ''} {vehicle.model.name if vehicle.model else ''}".strip() or f"Vehicle #{vehicle.internal_id}"
    old_status_de = VEHICLE_STATUS_MAP_DE.get(old_status, old_status)
    log_activity(
        request,
        action='delete',
        entity_type='vehicle',
        entity_id=vehicle.internal_id,
        entity_name=vehicle_name,
        details={
            "en": f"Status changed from {old_status} to inactive",
            "de": f"Status geändert von {old_status_de} auf Inaktiv"
        }
    )
    
    return {"success": True, "message": "Vehicle deactivated successfully"}


@router.post("/vehicles/{internal_id}/activate", response={200: SuccessResponse, 400: ErrorResponse, 404: ErrorResponse})
def activate_vehicle(request, internal_id: int):
    """Reactivate an inactive vehicle"""
    business = get_user_business(request)
    
    vehicle = get_object_or_404(Vehicle, business=business, internal_id=internal_id)
    
    if vehicle.status != 'inactive':
        return 400, {"detail": "Vehicle is not inactive"}
    
    # Set to purchased as default reactivation status
    vehicle.status = 'purchased'
    vehicle.save()
    
    # Log the status change
    vehicle_name = f"{vehicle.make.name if vehicle.make else ''} {vehicle.model.name if vehicle.model else ''}".strip() or f"Vehicle #{vehicle.internal_id}"
    log_activity(
        request,
        action='status_change',
        entity_type='vehicle',
        entity_id=vehicle.internal_id,
        entity_name=vehicle_name,
        details={
            "en": "Reactivated (inactive → purchased)",
            "de": "Reaktiviert (Inaktiv → Gekauft)"
        }
    )
    
    return {"success": True, "message": "Vehicle activated successfully"}


@router.post("/vehicles/{internal_id}/change-status", response={200: VehicleDetailOut, 400: ErrorResponse})
def change_vehicle_status(request, internal_id: int, status: str = Form(...)):
    """Change vehicle status"""
    business = get_user_business(request)
    
    valid_statuses = ['purchased', 'ready_for_sale', 'reserved', 'sold', 'inactive']
    if status not in valid_statuses:
        return 400, {"detail": f"Invalid status. Must be one of: {', '.join(valid_statuses)}"}
    
    vehicle = get_object_or_404(Vehicle, business=business, internal_id=internal_id)
    old_status = vehicle.status

    if old_status == status:
        vehicle = Vehicle.objects.select_related(*VEHICLE_DETAIL_RELATIONS).get(id=vehicle.id)
        return build_vehicle_detail_response(business, vehicle)

    # Pipeline transition rules
    ALLOWED_TRANSITIONS = {
        'purchased': ['ready_for_sale', 'reserved'],
        'ready_for_sale': ['purchased', 'reserved', 'sold'],
        'reserved': ['purchased', 'ready_for_sale', 'sold'],
        'sold': ['ready_for_sale', 'reserved'],
        'inactive': ['purchased', 'ready_for_sale', 'reserved', 'sold'], # Allowed to move back to active statuses
    }

    if status not in ALLOWED_TRANSITIONS.get(old_status, []):
        return 400, {"detail": f"Cannot transition from {old_status} to {status}."}

    # Sold gate
    if status == 'sold':
        can_generate_sale = all([
            vehicle.sale_price,
            vehicle.sale_date,
            vehicle.sale_payment_method,
            vehicle.buyer
        ])
        if not can_generate_sale:
            return 400, {"detail": "Cannot mark as sold. All sale fields must be completed."}

    vehicle.status = status
    vehicle.save()
    
    # Log the status change
    vehicle_name = f"{vehicle.make.name if vehicle.make else ''} {vehicle.model.name if vehicle.model else ''}".strip() or f"Vehicle #{vehicle.internal_id}"
    old_status_de = VEHICLE_STATUS_MAP_DE.get(old_status, old_status)
    new_status_de = VEHICLE_STATUS_MAP_DE.get(status, status)
    log_activity(
        request,
        action='status_change',
        entity_type='vehicle',
        entity_id=vehicle.internal_id,
        entity_name=vehicle_name,
        details={
            "en": f"Status changed: {old_status} → {status}",
            "de": f"Status geändert: {old_status_de} → {new_status_de}"
        }
    )
    
    vehicle = Vehicle.objects.select_related(*VEHICLE_DETAIL_RELATIONS).get(id=vehicle.id)

    return build_vehicle_detail_response(business, vehicle)


@router.post("/vehicles/{internal_id}/image", response={200: VehicleDetailOut, 400: ErrorResponse, 404: ErrorResponse})
def upload_vehicle_image(request, internal_id: int, image: UploadedFile = File(...)):
    """Upload or replace the image for a vehicle."""
    business = get_user_business(request)
    vehicle = get_object_or_404(Vehicle, business=business, internal_id=internal_id)
    timestamp_suffix = timezone.now().strftime("%Y%m%d%H%M%S%f")

    try:
        processed_image = process_vehicle_image(
            image,
            filename_stem=f"vehicle-{vehicle.internal_id}-{timestamp_suffix}",
        )
    except ValueError as exc:
        return 400, {"detail": str(exc)}

    if vehicle.image:
        vehicle.image.delete(save=False)

    vehicle.image.save(processed_image.name, processed_image, save=False)
    vehicle.save(update_fields=["image"])

    vehicle = Vehicle.objects.select_related(*VEHICLE_DETAIL_RELATIONS).get(id=vehicle.id)
    vehicle_name = f"{vehicle.make.name if vehicle.make else ''} {vehicle.model.name if vehicle.model else ''}".strip() or f"Vehicle #{vehicle.internal_id}"
    log_activity(
        request,
        action='update',
        entity_type='vehicle',
        entity_id=vehicle.internal_id,
        entity_name=vehicle_name,
        details={
            "en": "Vehicle image updated",
            "de": "Fahrzeugbild aktualisiert"
        }
    )

    return build_vehicle_detail_response(business, vehicle)


# =============================================================================
# Vehicle Expenses & Earnings Endpoints
# =============================================================================

@router.get(
    "/vehicles/{internal_id}/expenses-earnings",
    response=List[VehicleExpenseEarningOut],
)
def list_vehicle_expenses_earnings(request, internal_id: int):
    """List active expense/earning entries for a vehicle."""
    business = get_user_business(request)
    vehicle = get_object_or_404(Vehicle, business=business, internal_id=internal_id)

    qs = (
        VehicleExpenseEarning.objects
        .filter(vehicle=vehicle, is_active=True)
        .select_related('category', 'subcategory')
    )

    return [
        {
            "id": ee.id,
            "type": ee.type,
            "amount": ee.amount,
            "category_id": ee.category_id,
            "category_name": ee.category.name if ee.category else None,
            "subcategory_id": ee.subcategory_id,
            "subcategory_name": ee.subcategory.name if ee.subcategory else None,
            "created_at": ee.created_at,
        }
        for ee in qs
    ]


@router.post(
    "/vehicles/{internal_id}/expenses-earnings",
    response={201: VehicleExpenseEarningOut, 400: ErrorResponse, 404: ErrorResponse},
)
def create_vehicle_expense_earning(
    request,
    internal_id: int,
    payload: VehicleExpenseEarningCreate,
):
    """Create a new expense/earning for a vehicle."""
    business = get_user_business(request)
    vehicle = get_object_or_404(Vehicle, business=business, internal_id=internal_id)

    category = get_object_or_404(Category, id=payload.category_id, business=business, is_active=True)
    subcategory = get_object_or_404(
        Subcategory, id=payload.subcategory_id, category=category, business=business, is_active=True
    )

    ee = VehicleExpenseEarning.objects.create(
        business=business,
        vehicle=vehicle,
        category=category,
        subcategory=subcategory,
        type=payload.type,
        amount=payload.amount,
    )

    type_de = "Ausgabe" if payload.type == "expense" else "Einnahme"
    type_en = payload.type.title()
    log_activity(
        request,
        action='create',
        entity_type='vehicle',
        entity_id=vehicle.internal_id,
        entity_name=str(vehicle),
        details={
            "en": f"{type_en} of {payload.amount} added ({category.name} / {subcategory.name})",
            "de": f"{type_de} in Höhe von {payload.amount} hinzugefügt ({category.name} / {subcategory.name})"
        }
    )

    return 201, {
        "id": ee.id,
        "type": ee.type,
        "amount": ee.amount,
        "category_id": ee.category_id,
        "category_name": category.name,
        "subcategory_id": ee.subcategory_id,
        "subcategory_name": subcategory.name,
        "created_at": ee.created_at,
    }


@router.delete(
    "/vehicles/{internal_id}/expenses-earnings/{ee_id}",
    response={200: SuccessResponse, 404: ErrorResponse},
)
def delete_vehicle_expense_earning(request, internal_id: int, ee_id: int):
    """Soft-delete an expense/earning entry (set is_active=False)."""
    business = get_user_business(request)
    vehicle = get_object_or_404(Vehicle, business=business, internal_id=internal_id)

    ee = get_object_or_404(
        VehicleExpenseEarning, id=ee_id, vehicle=vehicle, is_active=True
    )
    ee.is_active = False
    ee.save(update_fields=['is_active'])

    type_de = "Ausgabe" if ee.type == "expense" else "Einnahme"
    type_en = ee.type.title()
    log_activity(
        request,
        action='delete',
        entity_type='vehicle',
        entity_id=vehicle.internal_id,
        entity_name=str(vehicle),
        details={
            "en": f"{type_en} of {ee.amount} removed",
            "de": f"{type_de} in Höhe von {ee.amount} entfernt"
        }
    )

    return {"success": True, "message": "Entry deleted"}


# =============================================================================
# Dynamic Choices Endpoints
# =============================================================================

@router.get("/choices", response=AllChoices)
def get_all_choices(request, vehicle_id: Optional[int] = Query(None)):
    """
    Get all form dropdown options.
    Called once when the vehicle form loads.
    """
    business = get_user_business(request)
    
    # Generate year choices (current year + 2 down to 1900)
    current_year = datetime.now().year
    year_choices = list(range(current_year + 2, 1899, -1))
    
    # Determine available key numbers
    # Exclude keys assigned to non-inactive vehicles, UNLESS it's the current vehicle
    taken_keys_q = Q(vehicle__isnull=False) & ~Q(vehicle__status="inactive")
    if vehicle_id:
        taken_keys_q = taken_keys_q & ~Q(vehicle__id=vehicle_id)
        
    available_keys = KeyNumber.objects.filter(business=business, is_active=True).exclude(taken_keys_q)
    
    return {
        "branches": list(Branch.objects.filter(business=business, is_active=True).values('id', 'name', 'address', 'is_active')),
        "vehicle_types": list(VehicleType.objects.filter(business=business, is_active=True).values('id', 'name')),
        "body_types": list(BodyType.objects.filter(business=business, is_active=True).values('id', 'name')),
        "makes": list(Make.objects.filter(business=business, is_active=True).values('id', 'name')),
        "colors": list(Color.objects.filter(business=business, is_active=True).values('id', 'name')),
        "fuel_types": list(FuelType.objects.filter(business=business, is_active=True).values('id', 'name')),
        "damage_types": list(DamageType.objects.filter(business=business, is_active=True).values('id', 'name')),
        "doors": list(DoorsChoice.objects.filter(business=business, is_active=True).values('id', 'name')),
        "payment_methods": list(PaymentMethod.objects.filter(business=business, is_active=True).values('id', 'name')),
        "tax_percentages": list(TaxPercentage.objects.filter(business=business, is_active=True).values('id', 'name', 'percentage', 'is_no_tax')),
        "legal_entities": list(LegalEntity.objects.filter(business=business).exclude(status='inactive').annotate(
            address_city_name=F('address_city__name'),
            address_country_name=F('address_country__name')
        ).values(
            'id', 'internal_id', 'name', 'type', 
            'address_street', 'address_street_number', 'address_postal_code',
            'address_city_id', 'address_city_name', 'address_country_id', 'address_country_name', 'email', 'phone_number',
            'tax_identification_number'
        )),
        "categories": list(Category.objects.filter(business=business, is_active=True).values('id', 'name')),
        "subcategories": list(Subcategory.objects.filter(business=business, is_active=True).values('id', 'name', 'category_id')),
        "currencies": list(Currency.objects.filter(business=business, is_active=True).values('id', 'name', 'code')),
        "countries": list(Country.objects.filter(business=business, is_active=True).values('id', 'name')),
        "cities": list(City.objects.filter(business=business, is_active=True).values('id', 'name', 'country_id')),
        "key_numbers": [{"id": k.id, "name": str(k.number)} for k in available_keys],
        "status_choices": [
            {"value": "purchased", "label": "Purchased"},
            {"value": "ready_for_sale", "label": "Ready for Sale"},
            {"value": "reserved", "label": "Reserved"},
            {"value": "sold", "label": "Sold"},
            {"value": "inactive", "label": "Inactive"},
        ],
        "year_choices": year_choices,
    }


@router.get("/choices/models/{make_id}", response=List[VehicleModelOut])
def get_models_for_make(request, make_id: int):
    """Get models for a specific make"""
    business = get_user_business(request)
    
    models = VehicleModel.objects.filter(
        make_id=make_id,
        business=business,
        is_active=True
    ).select_related('make')
    
    return [
        {
            "id": m.id,
            "name": m.name,
            "make_id": m.make_id,
            "make_name": m.make.name,
        }
        for m in models
    ]


@router.get("/choices/key-numbers/next-available")
def get_next_available_key(request):
    """
    Returns the next available key number for a new vehicle.

    Logic:
    1. Find all active KeyNumber records for this business.
    2. Find all key numbers currently assigned to non-inactive vehicles.
    3. Determine the smallest integer >= 1 not in the taken set.
    4. If that integer exists as an active KeyNumber → return it.
    5. If not → create a new KeyNumber → return it.

    Response: { "id": int, "number": int, "name": str }
    """
    from django.db import transaction as db_transaction

    business = get_user_business(request)

    # Step 1: All active key numbers for this business
    all_keys = KeyNumber.objects.filter(business=business, is_active=True)

    # Step 2: Key numbers currently taken by non-inactive vehicles
    taken_key_ids = set(
        KeyNumber.objects.filter(
            business=business,
            is_active=True,
            vehicle__isnull=False,
        )
        .exclude(vehicle__status="inactive")
        .values_list("id", flat=True)
    )

    # Step 3: Build a set of taken numbers from the taken keys
    taken_numbers = set()
    for key in all_keys.filter(id__in=taken_key_ids):
        try:
            taken_numbers.add(key.number)
        except (ValueError, TypeError):
            pass  # Safety: skip any unexpected values

    # Step 4: Find the smallest integer >= 1 not in taken_numbers
    candidate = 1
    while candidate in taken_numbers:
        candidate += 1

    # Step 5: Check if candidate exists as an active KeyNumber
    existing = KeyNumber.objects.filter(
        business=business,
        number=candidate,
        is_active=True,
    ).first()

    if existing:
        return {"id": existing.id, "number": existing.number, "name": str(existing.number)}

    # Step 6: Create new KeyNumber with race condition handling
    max_retries = 5
    for attempt in range(max_retries):
        try:
            with db_transaction.atomic():
                new_key = KeyNumber.objects.create(
                    business=business,
                    number=candidate,
                    is_active=True,
                )
            return {"id": new_key.id, "number": new_key.number, "name": str(new_key.number)}
        except Exception:
            # Key was created by another request — increment and retry
            candidate += 1
            while candidate in taken_numbers:
                candidate += 1

    # Fallback: try to return whatever exists for the last candidate
    fallback = KeyNumber.objects.filter(
        business=business,
        number=candidate,
    ).first()
    if fallback:
        return {"id": fallback.id, "number": fallback.number, "name": str(fallback.number)}

    return {"id": 0, "number": candidate, "name": str(candidate)}


@router.get("/choices/management")
def get_choices_for_management(request):
    """
    Get all choices with active/inactive split for the management page.
    Returns structured data for all choice types, including parent-child relationships.
    """
    business = get_user_business(request)
    
    # Gather all choice types with active/inactive items
    choice_types = {
        'make': {
            'name': 'Manufacturers',
            'displayName': 'Hersteller',
            'active': list(Make.objects.filter(business=business, is_active=True).values('id', 'name')),
            'inactive': list(Make.objects.filter(business=business, is_active=False).values('id', 'name')),
        },
        'vehicle_type': {
            'name': 'Vehicle Types',
            'displayName': 'Fahrzeugtypen',
            'active': list(VehicleType.objects.filter(business=business, is_active=True).values('id', 'name')),
            'inactive': list(VehicleType.objects.filter(business=business, is_active=False).values('id', 'name')),
        },
        'body_type': {
            'name': 'Body Types',
            'displayName': 'Karosserietypen',
            'active': list(BodyType.objects.filter(business=business, is_active=True).values('id', 'name')),
            'inactive': list(BodyType.objects.filter(business=business, is_active=False).values('id', 'name')),
        },
        'color': {
            'name': 'Colors',
            'displayName': 'Farben',
            'active': list(Color.objects.filter(business=business, is_active=True).values('id', 'name')),
            'inactive': list(Color.objects.filter(business=business, is_active=False).values('id', 'name')),
        },
        'fuel_type': {
            'name': 'Fuel Types',
            'displayName': 'Kraftstoffarten',
            'active': list(FuelType.objects.filter(business=business, is_active=True).values('id', 'name')),
            'inactive': list(FuelType.objects.filter(business=business, is_active=False).values('id', 'name')),
        },
        'damage_type': {
            'name': 'Damage Types',
            'displayName': 'Schadensarten',
            'active': list(DamageType.objects.filter(business=business, is_active=True).values('id', 'name')),
            'inactive': list(DamageType.objects.filter(business=business, is_active=False).values('id', 'name')),
        },
        'doors': {
            'name': 'Door Options',
            'displayName': 'Türoptionen',
            'active': list(DoorsChoice.objects.filter(business=business, is_active=True).values('id', 'name')),
            'inactive': list(DoorsChoice.objects.filter(business=business, is_active=False).values('id', 'name')),
        },
        'payment_method': {
            'name': 'Payment Methods',
            'displayName': 'Zahlungsmethoden',
            'active': list(PaymentMethod.objects.filter(business=business, is_active=True).values('id', 'name')),
            'inactive': list(PaymentMethod.objects.filter(business=business, is_active=False).values('id', 'name')),
        },
        'tax_percentage': {
            'name': 'Tax Percentages',
            'displayName': 'Steuersätze',
            'active': [{'id': t.id, 'name': str(t), 'percentage': float(t.percentage) if t.percentage else 0, 'is_protected': t.is_no_tax} for t in TaxPercentage.objects.filter(business=business, is_active=True)],
            'inactive': [{'id': t.id, 'name': str(t), 'percentage': float(t.percentage) if t.percentage else 0, 'is_protected': t.is_no_tax} for t in TaxPercentage.objects.filter(business=business, is_active=False)],
        },
        'currency': {
            'name': 'Currencies',
            'displayName': 'Währungen',
            'active': [{'id': c.id, 'name': str(c)} for c in Currency.objects.filter(business=business, is_active=True)],
            'inactive': [{'id': c.id, 'name': str(c)} for c in Currency.objects.filter(business=business, is_active=False)],
        },
        'category': {
            'name': 'Categories',
            'displayName': 'Kategorien',
            'active': list(Category.objects.filter(business=business, is_active=True).values('id', 'name')),
            'inactive': list(Category.objects.filter(business=business, is_active=False).values('id', 'name')),
        },
        'country': {
            'name': 'Countries',
            'displayName': 'Länder',
            'active': list(Country.objects.filter(business=business, is_active=True).values('id', 'name')),
            'inactive': list(Country.objects.filter(business=business, is_active=False).values('id', 'name')),
        },
        'key_number': {
            'name': 'Key Numbers',
            'displayName': 'Schlüsselnummern',
            'active': [{'id': k.id, 'name': str(k.number), 'vehicle_id': k.vehicle_id, 'vehicle_name': f"{k.vehicle.make.name if k.vehicle and k.vehicle.make else ''} {k.vehicle.model.name if k.vehicle and k.vehicle.model else ''} (#{k.vehicle.internal_id})" if k.vehicle else None} for k in KeyNumber.objects.filter(business=business, is_active=True).select_related('vehicle', 'vehicle__make', 'vehicle__model')],
            'inactive': [{'id': k.id, 'name': str(k.number)} for k in KeyNumber.objects.filter(business=business, is_active=False)],
        },
    }
    
    # Get makes with their models for parent-child management
    makes_with_models = []
    for mk in Make.objects.filter(business=business, is_active=True).order_by('name'):
        models_active = list(VehicleModel.objects.filter(make=mk, is_active=True).values('id', 'name'))
        models_inactive = list(VehicleModel.objects.filter(make=mk, is_active=False).values('id', 'name'))
        makes_with_models.append({
            'id': mk.id,
            'name': mk.name,
            'models_active': models_active,
            'models_inactive': models_inactive,
        })
    
    # Get categories with their subcategories for parent-child management
    categories_with_subcategories = []
    for cat in Category.objects.filter(business=business, is_active=True).order_by('name'):
        subs_active = list(Subcategory.objects.filter(category=cat, is_active=True).values('id', 'name'))
        subs_inactive = list(Subcategory.objects.filter(category=cat, is_active=False).values('id', 'name'))
        categories_with_subcategories.append({
            'id': cat.id,
            'name': cat.name,
            'subs_active': subs_active,
            'subs_inactive': subs_inactive,
        })
    
    # Get countries with their cities for parent-child management
    countries_with_cities = []
    for country in Country.objects.filter(business=business, is_active=True).order_by('name'):
        cities_active = list(City.objects.filter(country=country, is_active=True).values('id', 'name'))
        cities_inactive = list(City.objects.filter(country=country, is_active=False).values('id', 'name'))
        countries_with_cities.append({
            'id': country.id,
            'name': country.name,
            'cities_active': cities_active,
            'cities_inactive': cities_inactive,
        })
    
    return {
        'choice_types': choice_types,
        'makes_with_models': makes_with_models,
        'manufacturers_with_models': makes_with_models,
        'categories_with_subcategories': categories_with_subcategories,
        'countries_with_cities': countries_with_cities,
    }


@router.post("/choices/{choice_type}", response={201: ChoiceCreatedResponse, 400: ErrorResponse, 403: ErrorResponse})
def create_choice(
    request,
    choice_type: str,
    name: str = Form(...),
    percentage: Optional[Decimal] = Form(None),
    make_id: Optional[int] = Form(None),
    category_id: Optional[int] = Form(None),
    country_id: Optional[int] = Form(None),
):
    """
    Create a new dynamic choice option (managers only).
    
    choice_type must be one of:
    - vehicle_type
    - body_type
    - make
    - vehicle_model (requires make_id)
    - color
    - fuel_type
    - damage_type
    - doors
    - payment_method
    - tax_percentage (requires percentage)
    """
    if not request.user.is_manager:
        return 403, {"detail": "Only managers can create choices."}
    
    business = get_user_business(request)
    
    # Map choice_type to model class
    choice_models = {
        'vehicle_type': VehicleType,
        'body_type': BodyType,
        'make': Make,
        'color': Color,
        'fuel_type': FuelType,
        'damage_type': DamageType,
        'doors': DoorsChoice,
        'payment_method': PaymentMethod,
        'category': Category,
        'country': Country,
    }
    
    name = name.strip()
    if not name:
        return 400, {"detail": "Name is required"}
    
    # Handle special cases
    if choice_type == 'tax_percentage':
        if percentage is None:
            return 400, {"detail": "Percentage is required for tax_percentage"}
        
        # Check for duplicate
        if TaxPercentage.objects.filter(business=business, name=name).exists():
            return 400, {"detail": f"Tax percentage '{name}' already exists"}
        
        obj = TaxPercentage.objects.create(
            business=business,
            name=name,
            percentage=percentage,
            is_active=True
        )
        return 201, {
            "success": True,
            "id": obj.id,
            "name": str(obj),  # Includes percentage in display
            "message": f"Tax percentage '{name}' created successfully"
        }
    
    elif choice_type == 'vehicle_model':
        if not make_id:
            return 400, {"detail": "make_id is required for vehicle_model"}
        
        make = get_object_or_404(Make, id=make_id, business=business)
        
        # Check for duplicate
        if VehicleModel.objects.filter(
            business=business, make=make, name=name
        ).exists():
            return 400, {"detail": f"Model '{name}' already exists for this make"}
        
        obj = VehicleModel.objects.create(
            business=business,
            make=make,
            name=name,
            is_active=True
        )
        return 201, {
            "success": True,
            "id": obj.id,
            "name": obj.name,
            "message": f"Model '{name}' created successfully"
        }

    elif choice_type == 'subcategory':
        if not category_id:
            return 400, {"detail": "category_id is required for subcategory"}

        category = get_object_or_404(Category, id=category_id, business=business)

        if Subcategory.objects.filter(
            business=business, category=category, name=name
        ).exists():
            return 400, {"detail": f"Subcategory '{name}' already exists for this category"}

        obj = Subcategory.objects.create(
            business=business,
            category=category,
            name=name,
            is_active=True
        )
        return 201, {
            "success": True,
            "id": obj.id,
            "name": obj.name,
            "message": f"Subcategory '{name}' created successfully"
        }
    
    elif choice_type == 'city':
        if not country_id:
            return 400, {"detail": "country_id is required for city"}

        country = get_object_or_404(Country, id=country_id, business=business)

        if City.objects.filter(
            business=business, country=country, name=name
        ).exists():
            return 400, {"detail": f"City '{name}' already exists for this country"}

        obj = City.objects.create(
            business=business,
            country=country,
            name=name,
            is_active=True
        )
        return 201, {
            "success": True,
            "id": obj.id,
            "name": obj.name,
            "message": f"City '{name}' created successfully"
        }
    
    elif choice_type in choice_models:
        model_class = choice_models[choice_type]
        
        # Check for duplicate
        if model_class.objects.filter(business=business, name=name).exists():
            return 400, {"detail": f"'{name}' already exists"}
        
        obj = model_class.objects.create(
            business=business,
            name=name,
            is_active=True
        )
        return 201, {
            "success": True,
            "id": obj.id,
            "name": obj.name,
            "message": f"'{name}' created successfully"
        }
    
    elif choice_type == 'key_number':
        # Key numbers use `name` as the numeric value
        try:
            key_num = int(name)
            if key_num <= 0:
                return 400, {"detail": "Key number must be a positive integer without zero."}
        except ValueError:
            return 400, {"detail": "Key number must be a valid integer."}
        
        if KeyNumber.objects.filter(business=business, number=key_num).exists():
            return 400, {"detail": f"Key number {key_num} already exists"}
        
        obj = KeyNumber.objects.create(
            business=business,
            number=key_num,
            is_active=True
        )
        return 201, {
            "success": True,
            "id": obj.id,
            "name": str(obj.number),
            "message": f"Key number {key_num} created successfully"
        }
    
    else:
        return 400, {"detail": f"Unknown choice type: {choice_type}"}


@router.post("/choices/{choice_type}/{choice_id}/deactivate", response={200: SuccessResponse, 400: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse})
def deactivate_choice(request, choice_type: str, choice_id: int):
    """Deactivate (soft-delete) a choice option (managers only)."""
    if not request.user.is_manager:
        return 403, {"detail": "Only managers can deactivate choices."}
    
    business = get_user_business(request)
    
    # Map choice_type to model class
    model_map = {
        'payment_method': PaymentMethod,
        'vehicle_type': VehicleType,
        'body_type': BodyType,
        'make': Make,
        'vehicle_model': VehicleModel,
        'color': Color,
        'fuel_type': FuelType,
        'damage_type': DamageType,
        'doors': DoorsChoice,
        'tax_percentage': TaxPercentage,
        'category': Category,
        'subcategory': Subcategory,
        'currency': Currency,
        'key_number': KeyNumber,
    }
    
    model_class = model_map.get(choice_type)
    if not model_class:
        return 400, {"detail": f"Invalid choice type: {choice_type}"}
    
    try:
        choice = model_class.objects.get(id=choice_id, business=business)
        
        # Prevent deactivation of protected No Tax option
        if choice_type == 'tax_percentage' and hasattr(choice, 'is_no_tax') and choice.is_no_tax:
            return 400, {"detail": "Cannot deactivate the No Tax option"}
        
        # Unassign vehicle when deactivating a key number
        if choice_type == 'key_number' and hasattr(choice, 'vehicle') and choice.vehicle:
            choice.vehicle = None
        
        choice.is_active = False
        choice.save()
        
        return {"success": True, "message": f"Choice deactivated successfully"}
    except model_class.DoesNotExist:
        return 404, {"detail": "Choice not found"}


@router.post("/choices/{choice_type}/{choice_id}/reactivate", response={200: SuccessResponse, 400: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse})
def reactivate_choice(request, choice_type: str, choice_id: int):
    """Reactivate a deactivated choice option (managers only)."""
    if not request.user.is_manager:
        return 403, {"detail": "Only managers can reactivate choices."}
    
    business = get_user_business(request)
    
    # Map choice_type to model class
    model_map = {
        'payment_method': PaymentMethod,
        'vehicle_type': VehicleType,
        'body_type': BodyType,
        'make': Make,
        'vehicle_model': VehicleModel,
        'color': Color,
        'fuel_type': FuelType,
        'damage_type': DamageType,
        'doors': DoorsChoice,
        'tax_percentage': TaxPercentage,
        'category': Category,
        'subcategory': Subcategory,
        'currency': Currency,
        'key_number': KeyNumber,
    }
    
    model_class = model_map.get(choice_type)
    if not model_class:
        return 400, {"detail": f"Invalid choice type: {choice_type}"}
    
    try:
        choice = model_class.objects.get(id=choice_id, business=business)
        choice.is_active = True
        choice.save()
        
        return {"success": True, "message": f"Choice reactivated successfully"}
    except model_class.DoesNotExist:
        return 404, {"detail": "Choice not found"}


@router.patch("/choices/{choice_type}/{choice_id}", response={200: SuccessResponse, 400: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse})
def update_choice(request, choice_type: str, choice_id: int, payload: ChoiceUpdatePayload):
    """Update a choice name or percentage (managers only)."""
    if not request.user.is_manager:
        return 403, {"detail": "Only managers can update choices."}
    
    business = get_user_business(request)
    
    # Map choice_type to model class
    model_map = {
        'payment_method': PaymentMethod,
        'vehicle_type': VehicleType,
        'body_type': BodyType,
        'make': Make,
        'vehicle_model': VehicleModel,
        'color': Color,
        'fuel_type': FuelType,
        'damage_type': DamageType,
        'doors': DoorsChoice,
        'tax_percentage': TaxPercentage,
        'category': Category,
        'subcategory': Subcategory,
        'currency': Currency,
        'key_number': KeyNumber,
    }
    
    model_class = model_map.get(choice_type)
    if not model_class:
        return 400, {"detail": f"Invalid choice type: {choice_type}"}
    
    new_name = payload.name.strip()
    if not new_name:
        return 400, {"detail": "Name is required."}

    # Special handling for key_number — name IS the number
    if choice_type == 'key_number':
        try:
            new_number = int(new_name)
            if new_number <= 0:
                return 400, {"detail": "Key number must be a positive integer without zero."}
        except ValueError:
            return 400, {"detail": "Key number must be a valid integer."}
        
        # Check uniqueness
        if KeyNumber.objects.filter(business=business, number=new_number).exclude(id=choice_id).exists():
            return 400, {"detail": f"Key number {new_number} already exists."}
        
        try:
            key = KeyNumber.objects.get(id=choice_id, business=business)
        except KeyNumber.DoesNotExist:
            return 404, {"detail": "Choice not found"}
        
        key.number = new_number
        
        # Handle optional vehicle re-assignment
        if payload.vehicle_id is not None:
            vehicle = get_object_or_404(Vehicle, id=payload.vehicle_id, business=business)
            # Only assign to active-status vehicles
            if vehicle.status not in ('purchased', 'ready_for_sale', 'reserved'):
                return 400, {"detail": "Can only assign key to a vehicle that is Purchased, Ready for Sale, or Reserved."}
            # Clear any other key that was assigned to this vehicle
            KeyNumber.objects.filter(vehicle=vehicle).exclude(id=choice_id).update(vehicle=None)
            key.vehicle = vehicle
        elif payload.vehicle_id is None and hasattr(payload, 'vehicle_id'):
            # Explicitly check if vehicle_id was sent as null (to unassign)
            import json
            raw_body = request.body.decode('utf-8', errors='ignore')
            try:
                body_data = json.loads(raw_body)
                if 'vehicle_id' in body_data and body_data['vehicle_id'] is None:
                    key.vehicle = None
            except (json.JSONDecodeError, KeyError):
                pass
        
        key.save()
        log_activity(request, action='update', entity_type='key_number', entity_id=choice_id, entity_name=str(new_number))
        return {"success": True, "message": "Key number updated successfully"}

    try:
        choice = model_class.objects.get(id=choice_id, business=business)
        
        # Check for duplicate name (excluding self)
        if choice_type == 'vehicle_model':
            if VehicleModel.objects.filter(make=choice.make, name=new_name).exclude(id=choice_id).exists():
                return 400, {"detail": f"Model '{new_name}' already exists for this manufacturer."}
        elif choice_type == 'subcategory':
            if Subcategory.objects.filter(category=choice.category, name=new_name).exclude(id=choice_id).exists():
                return 400, {"detail": f"Subcategory '{new_name}' already exists for this category."}
        else:
            if model_class.objects.filter(business=business, name=new_name).exclude(id=choice_id).exists():
                return 400, {"detail": f"'{new_name}' already exists."}

        choice.name = new_name
        
        # Handle tax percentage
        if choice_type == 'tax_percentage' and payload.percentage is not None:
            choice.percentage = payload.percentage
        
        choice.save()
        
        # Log the update action
        log_activity(
            request,
            action='update',
            entity_type=choice_type,
            entity_id=choice_id,
            entity_name=new_name
        )
        
        return {"success": True, "message": f"Choice updated successfully"}
    except model_class.DoesNotExist:
        return 404, {"detail": "Choice not found"}


# =============================================================================
# Legal Entity Endpoints
# =============================================================================

@router.post("/legal-entities", response={201: LegalEntityOut, 400: ErrorResponse})
def create_legal_entity(request, payload: LegalEntityCreate):
    """Create a new legal entity"""
    business = get_user_business(request)
    
    # Check for duplicate name
    if LegalEntity.objects.filter(business=business, name=payload.name).exists():
        return 400, {"detail": f"Legal entity '{payload.name}' already exists"}
    
    entity = LegalEntity(
        business=business,
        name=payload.name,
        type=payload.type,
        address_street=payload.address_street,
        address_street_number=payload.address_street_number,
        address_postal_code=payload.address_postal_code,
        address_city_id=payload.address_city_id,
        address_country_id=payload.address_country_id,
        email=payload.email,
        phone_number=payload.phone_number,
        tax_identification_number=payload.tax_identification_number,
    )
    entity.save()
    
    # Log the create action
    log_activity(
        request,
        action='create',
        entity_type='legal_entity',
        entity_id=entity.internal_id,
        entity_name=entity.name
    )
    
    return 201, {
        "id": entity.id,
        "internal_id": entity.internal_id,
        "name": entity.name,
        "type": entity.type,
        "address_street": entity.address_street,
        "address_street_number": entity.address_street_number,
        "address_postal_code": entity.address_postal_code,
        "address_city_id": entity.address_city_id,
        "address_city_name": entity.address_city.name if entity.address_city else None,
        "address_country_id": entity.address_country_id,
        "address_country_name": entity.address_country.name if entity.address_country else None,
        "email": entity.email,
        "phone_number": entity.phone_number,
        "tax_identification_number": entity.tax_identification_number,
    }


@router.get("/legal-entities", response=LegalEntitiesListResponse)
def list_legal_entities(request, filters: LegalEntityFilters = Query(...)):
    """
    List legal entities with filtering, sorting, and pagination.
    Supports filtering by type (individual/company), status (active/inactive), and search.
    """
    business = get_user_business(request)
    
    # Base queryset
    qs = LegalEntity.objects.filter(business=business).select_related('address_city', 'address_country').order_by('name')
    
    # Apply filters
    if filters.type:
        qs = qs.filter(type=filters.type)
    
    if filters.status:
        qs = qs.filter(status=filters.status)
    else:
        # By default, exclude inactive unless specifically requested
        qs = qs.exclude(status='inactive')
        
    if filters.city_id:
        qs = qs.filter(address_city_id=filters.city_id)
        
    if filters.country_id:
        qs = qs.filter(address_country_id=filters.country_id)
    
    if filters.search:
        search_term = filters.search
        query = (
            Q(name__icontains=search_term) |
            Q(type__icontains=search_term) |
            Q(status__icontains=search_term) |
            Q(address_street__icontains=search_term) |
            Q(address_street_number__icontains=search_term) |
            Q(address_postal_code__icontains=search_term) |
            Q(address_city__name__icontains=search_term) |
            Q(address_country__name__icontains=search_term) |
            Q(email__icontains=search_term) |
            Q(phone_number__icontains=search_term) |
            Q(tax_identification_number__icontains=search_term)
        )

        try:
            query |= Q(internal_id=int(search_term))
        except ValueError:
            pass

        qs = qs.filter(query)
    
    # Apply sorting
    sort_field = filters.sort or 'name'
    # Map FK sort fields to their related name for alphabetical ordering
    sort_field_mapping = {
        'address_city': 'address_city__name',
    }
    sort_field = sort_field_mapping.get(sort_field, sort_field)
    if filters.order == 'desc':
        sort_field = f'-{sort_field}'
    qs = qs.order_by(sort_field)
    
    # Pagination
    total = qs.count()
    pages = (total + filters.per_page - 1) // filters.per_page if filters.per_page > 0 else 1
    offset = (filters.page - 1) * filters.per_page
    entities = qs[offset:offset + filters.per_page]
    
    # Serialize
    items = [
        {
            "id": e.id,
            "internal_id": e.internal_id,
            "name": e.name,
            "type": e.type,
            "status": e.status,
            "address_street": e.address_street,
            "address_street_number": e.address_street_number,
            "address_postal_code": e.address_postal_code,
            "address_city_id": e.address_city_id,
            "address_city_name": e.address_city.name if e.address_city else None,
            "address_country_id": e.address_country_id,
            "address_country_name": e.address_country.name if e.address_country else None,
            "email": e.email,
            "phone_number": e.phone_number,
            "tax_identification_number": e.tax_identification_number,
        }
        for e in entities
    ]
    
    return {
        "items": items,
        "total": total,
        "page": filters.page,
        "per_page": filters.per_page,
        "pages": pages,
    }


@router.get("/legal-entities/{internal_id}", response={200: LegalEntityListOut, 404: ErrorResponse})
def get_legal_entity(request, internal_id: int):
    """Get single legal entity details by internal ID"""
    business = get_user_business(request)
    
    entity = get_object_or_404(LegalEntity.objects.select_related('address_city', 'address_country'), business=business, internal_id=internal_id)
    
    return {
        "id": entity.id,
        "internal_id": entity.internal_id,
        "name": entity.name,
        "type": entity.type,
        "status": entity.status,
        "address_street": entity.address_street,
        "address_street_number": entity.address_street_number,
        "address_postal_code": entity.address_postal_code,
        "address_city_id": entity.address_city_id,
        "address_city_name": entity.address_city.name if entity.address_city else None,
        "address_country_id": entity.address_country_id,
        "address_country_name": entity.address_country.name if entity.address_country else None,
        "email": entity.email,
        "phone_number": entity.phone_number,
        "tax_identification_number": entity.tax_identification_number,
    }


@router.patch("/legal-entities/{internal_id}", response={200: LegalEntityListOut, 400: ErrorResponse, 404: ErrorResponse})
def update_legal_entity(request, internal_id: int, payload: LegalEntityUpdate):
    """Update legal entity details. Only provided fields will be updated."""
    business = get_user_business(request)
    
    entity = get_object_or_404(LegalEntity.objects.select_related('address_city', 'address_country'), business=business, internal_id=internal_id)
    
    # Get the payload as a dict, excluding None values
    update_data = payload.dict(exclude_unset=True, exclude_none=True)
    
    # Validate: if changing to company type, tax ID is required
    new_type = update_data.get('type', entity.type)
    new_tax_id = update_data.get('tax_identification_number', entity.tax_identification_number)
    if new_type == 'company' and not new_tax_id:
        return 400, {"detail": "Tax identification number is required for companies"}
    
    # Check for duplicate name if name is being updated
    if 'name' in update_data and update_data['name'] != entity.name:
        if LegalEntity.objects.filter(business=business, name=update_data['name']).exclude(id=entity.id).exists():
            return 400, {"detail": f"Legal entity '{update_data['name']}' already exists"}
    
    # Update fields
    for field, value in update_data.items():
        setattr(entity, field, value)
    
    entity.save()
    
    # Log the update action
    log_activity(
        request,
        action='update',
        entity_type='legal_entity',
        entity_id=entity.internal_id,
        entity_name=entity.name
    )
    
    return {
        "id": entity.id,
        "internal_id": entity.internal_id,
        "name": entity.name,
        "type": entity.type,
        "status": entity.status,
        "address_street": entity.address_street,
        "address_street_number": entity.address_street_number,
        "address_postal_code": entity.address_postal_code,
        "address_city_id": entity.address_city_id,
        "address_city_name": entity.address_city.name if entity.address_city else None,
        "address_country_id": entity.address_country_id,
        "address_country_name": entity.address_country.name if entity.address_country else None,
        "email": entity.email,
        "phone_number": entity.phone_number,
        "tax_identification_number": entity.tax_identification_number,
    }


@router.post("/legal-entities/{internal_id}/deactivate", response={200: SuccessResponse, 404: ErrorResponse})
def deactivate_legal_entity(request, internal_id: int):
    """Deactivate a legal entity (set status to inactive)"""
    business = get_user_business(request)
    
    entity = get_object_or_404(LegalEntity, business=business, internal_id=internal_id)
    entity.status = 'inactive'
    entity.save()
    
    # Log the delete action
    log_activity(
        request,
        action='delete',
        entity_type='legal_entity',
        entity_id=entity.internal_id,
        entity_name=entity.name
    )
    
    return {"success": True, "message": "Legal entity deactivated successfully"}


@router.post("/legal-entities/{internal_id}/activate", response={200: SuccessResponse, 400: ErrorResponse, 404: ErrorResponse})
def activate_legal_entity(request, internal_id: int):
    """Reactivate an inactive legal entity"""
    business = get_user_business(request)
    
    entity = get_object_or_404(LegalEntity, business=business, internal_id=internal_id)
    
    if entity.status != 'inactive':
        return 400, {"detail": "Legal entity is not inactive"}
    
    entity.status = 'active'
    entity.save()
    
    # Log the status change
    log_activity(
        request,
        action='status_change',
        entity_type='legal_entity',
        entity_id=entity.internal_id,
        entity_name=entity.name,
        details={
            "en": "Reactivated (inactive → active)",
            "de": "Reaktiviert (Inaktiv → Aktiv)"
        }
    )
    
    return {"success": True, "message": "Legal entity activated successfully"}


# =============================================================================
# PDF Generation Endpoints
# =============================================================================

@router.get("/vehicles/{internal_id}/pdf/buy-contract")
def download_buy_contract(request, internal_id: int):
    """
    Generate and download buy contract PDF.
    Vehicle model has built-in get_*_display() compatibility for legacy PDF code.
    """
    business = get_user_business(request)
    get_object_or_404(Vehicle, business=business, internal_id=internal_id)
    
    from . import views as legacy_views
    return legacy_views.generate_vehicle_buy_contract_pdf(request, business.name, internal_id)


@router.get("/vehicles/{internal_id}/pdf/sale-contract")
def download_sale_contract(request, internal_id: int):
    """Generate and download sale contract PDF"""
    business = get_user_business(request)
    get_object_or_404(Vehicle, business=business, internal_id=internal_id)
    
    from . import views as legacy_views
    return legacy_views.generate_vehicle_sale_contract_pdf(request, business.name, internal_id)


@router.get("/vehicles/{internal_id}/pdf/identity-check")
def download_identity_check(request, internal_id: int):
    """Generate and download identity check PDF"""
    business = get_user_business(request)
    get_object_or_404(Vehicle, business=business, internal_id=internal_id)
    
    from . import views as legacy_views
    return legacy_views.generate_identity_check_pdf(request, business.name, internal_id)


@router.get("/vehicles/{internal_id}/pdf/binding-order")
def download_binding_order(request, internal_id: int):
    """Generate and download binding order PDF"""
    business = get_user_business(request)
    get_object_or_404(Vehicle, business=business, internal_id=internal_id)
    
    from . import views as legacy_views
    return legacy_views.generate_binding_order_pdf(request, business.name, internal_id)


@router.get("/vehicles/{internal_id}/pdf/sale-agreement")
def download_sale_agreement(request, internal_id: int):
    """Generate and download sale agreement PDF"""
    business = get_user_business(request)
    get_object_or_404(Vehicle, business=business, internal_id=internal_id)
    
    from . import views as legacy_views
    return legacy_views.generate_sale_agreement_pdf(request, business.name, internal_id)


@router.get("/vehicles/{internal_id}/pdf/receipt")
def download_receipt(request, internal_id: int, region: Optional[str] = Query(None)):
    """Generate and download receipt PDF"""
    business = get_user_business(request)
    get_object_or_404(Vehicle, business=business, internal_id=internal_id)
    
    from . import views as legacy_views
    return legacy_views.generate_receipt_verkaufvertrag_pdf(request, business.name, internal_id, region=region)



# =============================================================================
# Activity Log Endpoints
# =============================================================================

@router.get("/activity-logs/recent")
def get_recent_activity_logs(request):
    """
    Get the 5 most recent activity logs for the header notification dropdown.
    Returns minimal data for quick display.
    """
    business = get_user_business(request)
    
    print(f"[ActivityLog-API] Fetching recent logs for business: {business}")
    
    logs = ActivityLog.objects.filter(business=business).select_related('user')[:5]
    
    print(f"[ActivityLog-API] Found {logs.count() if hasattr(logs, 'count') else len(list(logs))} logs")
    
    # Check total count in database
    total_count = ActivityLog.objects.filter(business=business).count()
    print(f"[ActivityLog-API] Total logs in database for this business: {total_count}")
    
    # Also check all logs regardless of business
    all_logs_count = ActivityLog.objects.count()
    print(f"[ActivityLog-API] Total logs in database (all businesses): {all_logs_count}")
    
    result_logs = list(logs)
    print(f"[ActivityLog-API] Returning {len(result_logs)} logs")
    
    return {
        "logs": [
            {
                "id": log.id,
                "user_name": log.user.username if log.user else "System",
                "action": log.action,
                "action_display": dict(ActivityLog.ACTION_CHOICES).get(log.action, log.action),
                "entity_type": log.entity_type,
                "entity_type_display": dict(ActivityLog.ENTITY_CHOICES).get(log.entity_type, log.entity_type),
                "entity_id": log.entity_id,
                "entity_name": log.entity_name,
                "timestamp": log.timestamp.isoformat(),
            }
            for log in result_logs
        ]
    }



@router.get("/activity-logs")
def list_activity_logs(
    request,
    page: int = 1,
    per_page: int = 20,
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    sort: str = "timestamp",
    order: str = "desc",
):
    """
    List activity logs with pagination and filtering.
    For the Activity Logs page.
    """
    business = get_user_business(request)
    
    qs = ActivityLog.objects.filter(business=business).select_related('user')
    
    # Apply filters
    if action:
        qs = qs.filter(action=action)
    
    if entity_type:
        qs = qs.filter(entity_type=entity_type)
    
    # Apply sorting
    sort_field = sort if sort in ["timestamp", "action", "entity_type", "user__username"] else "timestamp"
    if order == "desc":
        sort_field = f"-{sort_field}"
    qs = qs.order_by(sort_field)
    
    # Pagination
    total = qs.count()
    pages = (total + per_page - 1) // per_page if total > 0 else 1
    offset = (page - 1) * per_page
    logs = qs[offset:offset + per_page]
    
    return {
        "items": [
            {
                "id": log.id,
                "user_name": log.user.username if log.user else "System",
                "user_id": log.user.id if log.user else None,
                "action": log.action,
                "action_display": str(dict(ActivityLog.ACTION_CHOICES).get(log.action, log.action)),
                "entity_type": log.entity_type,
                "entity_type_display": str(dict(ActivityLog.ENTITY_CHOICES).get(log.entity_type, log.entity_type)),
                "entity_id": log.entity_id,
                "entity_name": log.entity_name,
                "details": log.details,
                "timestamp": log.timestamp.isoformat(),
            }
            for log in logs
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": pages,
    }

@router.get("/activity-logs")
def list_activity_logs(
    request,
    page: int = 1,
    per_page: int = 20,
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    sort: str = "timestamp",
    order: str = "desc",
):
    """
    List activity logs with pagination and filtering.
    For the Activity Logs page.
    """
    business = get_user_business(request)
    
    qs = ActivityLog.objects.filter(business=business).select_related('user')
    
    # Apply filters
    if action:
        qs = qs.filter(action=action)
    
    if entity_type:
        qs = qs.filter(entity_type=entity_type)
    
    # Apply sorting
    sort_field = sort if sort in ["timestamp", "action", "entity_type", "user__username"] else "timestamp"
    if order == "desc":
        sort_field = f"-{sort_field}"
    qs = qs.order_by(sort_field)
    
    # Pagination
    total = qs.count()
    pages = (total + per_page - 1) // per_page if total > 0 else 1
    offset = (page - 1) * per_page
    logs = qs[offset:offset + per_page]
    
    return {
        "items": [
            {
                "id": log.id,
                "user_name": log.user.username if log.user else "System",
                "user_id": log.user.id if log.user else None,
                "action": log.action,
                "action_display": str(dict(ActivityLog.ACTION_CHOICES).get(log.action, log.action)),
                "entity_type": log.entity_type,
                "entity_type_display": str(dict(ActivityLog.ENTITY_CHOICES).get(log.entity_type, log.entity_type)),
                "entity_id": log.entity_id,
                "entity_name": log.entity_name,
                "details": log.details,
                "timestamp": log.timestamp.isoformat(),
            }
            for log in logs
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": pages,
    }
