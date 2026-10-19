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
from django.db.models import Q, Sum, Case, When, F, Value, DecimalField, Count
from django.db.models.functions import Coalesce
from django.conf import settings
from django.core.paginator import Paginator
from django.utils import timezone
from typing import Optional, List, Dict
from decimal import Decimal
from datetime import datetime
import io
import json
import logging
import os

logger = logging.getLogger(__name__)

from .models import (
    Vehicle, Business, Branch, LegalEntity,
    VehicleType, BodyType, Make, VehicleModel,
    Color, FuelType, DamageType, DoorsChoice,
    PaymentMethod, TaxPercentage, Currency, Category, Subcategory,
    ActivityLog, KeyNumber, Country, City,
    VehicleExpenseEarning, VehicleListingImage
)
from .schemas import (
    VehicleListOut, VehicleDetailOut, VehicleCreate, VehicleUpdate,
    VehicleFilters, PaginatedVehicles, FinancialSummary, AllChoices,
    VehiclesResponse, ChoiceBase, ChoiceCreate, ChoiceCreatedResponse,
    TaxPercentageOut, TaxPercentageCreate, VehicleModelOut,
    VehicleModelCreate, LegalEntityOut, LegalEntityCreate,
    LegalEntityListOut, LegalEntityUpdate, LegalEntityFilters, LegalEntitiesListResponse,
    BranchOut, ErrorResponse, SuccessResponse, DeleteCheckResponse,
    ChoiceUpdatePayload, KeyNumberOut,
    VehicleExpenseEarningOut, VehicleExpenseEarningCreate, VehicleExpenseEarningUpdate,
    MobileDeListingDetailOut, MobileDePublishIn, MobileDePublishOut, MobileDeInsightsOut,
    VehicleGalleryImageOut, MarketplaceModelsOut
)
from .services.mobile_de_service import (
    get_mobile_de_service, MOBILE_DE_MAPPINGS,
    resolve_fuel, resolve_category, resolve_color, resolve_doors
)
from .delete_helpers import check_entity_dependencies, execute_cascade_delete, execute_unlink_and_delete, CHOICE_MODEL_MAP
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

    if filters.listed_on_mobile_de == 'yes':
        qs = qs.filter(mobile_de_status='active')
    elif filters.listed_on_mobile_de == 'no':
        qs = qs.exclude(mobile_de_status='active')
    
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
    vt_name = (vehicle_type.name or '').strip().lower()
    vt_map = (vehicle_type.mobile_de_mapping or '').strip()

    # Determine class capabilities
    no_doors_classes = ['motorrad', 'motorbike', 'anhänger', 'anhanger', 'anhnger', 'trailer', 'semitrailer', 'auflieger', 'ebike', 'e-bike', 'constructionmachine', 'forklifttruck', 'baumaschine', 'gabelstapler']
    is_non_doors_class = (any(c in vt_name for c in no_doors_classes)) or (vt_map in ['Motorbike', 'Trailer', 'SemiTrailer', 'EBike', 'ConstructionMachine', 'ForkliftTruck'])

    no_fuel_classes = ['anhänger', 'anhanger', 'anhnger', 'trailer', 'semitrailer', 'auflieger']
    is_non_fuel_class = (any(c in vt_name for c in no_fuel_classes)) or (vt_map in ['Trailer', 'SemiTrailer'])

    no_make_classes = ['anhänger', 'anhanger', 'anhnger', 'trailer', 'semitrailer', 'auflieger', 'ebike', 'e-bike', 'baumaschine', 'gabelstapler', 'constructionmachine', 'forklifttruck', 'agrarfahrzeug', 'agriculturalvehicle']
    is_non_make_class = (any(c in vt_name for c in no_make_classes)) or (vt_map in ['Trailer', 'SemiTrailer', 'EBike', 'ConstructionMachine', 'ForkliftTruck', 'AgriculturalVehicle'])

    no_body_classes = ['ebike', 'e-bike', 'baumaschine', 'gabelstapler', 'constructionmachine', 'forklifttruck', 'agrarfahrzeug', 'agriculturalvehicle']
    is_non_body_class = (any(c in vt_name for c in no_body_classes)) or (vt_map in ['EBike', 'ConstructionMachine', 'ForkliftTruck', 'AgriculturalVehicle'])

    make = get_object_or_404(Make, id=payload.make_id, business=business) if payload.make_id else None
    if is_non_make_class and not make:
        sonstige_make = Make.objects.filter(business=business, name__iexact='Sonstige').first()
        if not sonstige_make:
            sonstige_make = Make.objects.create(
                business=business,
                name='Sonstige',
                mobile_de_mapping='Sonstige',
                is_protected=True,
                vehicle_classes=['Car', 'Motorbike', 'Motorhome', 'VanUpTo7500', 'TruckOver7500', 'SemiTrailerTruck', 'Trailer', 'SemiTrailer', 'ConstructionMachine', 'AgriculturalVehicle', 'ForkliftTruck', 'Bus', 'EBike']
            )
        make = sonstige_make

    vehicle_model = None
    if payload.model_id:
        if make:
            vehicle_model = get_object_or_404(VehicleModel, id=payload.model_id, make=make, business=business)
        else:
            vehicle_model = get_object_or_404(VehicleModel, id=payload.model_id, business=business)
    elif make and make.name.lower() in ['sonstige', 'keine']:
        vehicle_model = VehicleModel.objects.filter(business=business, make=make, name__iexact='Sonstige').first()
        if not vehicle_model:
            vehicle_model = VehicleModel.objects.create(business=business, make=make, name='Sonstige', mobile_de_mapping='Sonstige', is_protected=True)

    body_type = get_object_or_404(BodyType, id=payload.body_type_id, business=business) if payload.body_type_id else None
    if is_non_body_class and not body_type:
        keine_body = BodyType.objects.filter(business=business, name__iexact='Keine').first()
        if not keine_body:
            keine_body = BodyType.objects.create(business=business, name='Keine', mobile_de_mapping='NONE', is_protected=True)
        body_type = keine_body

    color = get_object_or_404(Color, id=payload.color_id, business=business)
    doors = None
    if payload.doors_id:
        doors = get_object_or_404(DoorsChoice, id=payload.doors_id, business=business)

    if is_non_doors_class:
        if not doors or doors.name.lower() != 'keine':
            keine_door = DoorsChoice.objects.filter(business=business, name__iexact='Keine').first()
            if not keine_door:
                keine_door = DoorsChoice.objects.create(business=business, name='Keine', mobile_de_mapping='NONE', is_protected=True)
            doors = keine_door
    else:
        if not doors or doors.name.lower() == 'keine' or (doors.mobile_de_mapping and doors.mobile_de_mapping.upper() == 'NONE'):
            return 400, {
                "detail": "Doors selection is required for this vehicle class.",
                "message": "Doors selection is required for this vehicle class."
            }

    fuel_type = None
    if payload.fuel_type_id:
        fuel_type = get_object_or_404(FuelType, id=payload.fuel_type_id, business=business)

    if is_non_fuel_class:
        if not fuel_type or 'keine' not in fuel_type.name.lower():
            keine_fuel = FuelType.objects.filter(business=business, name__icontains='Keine').first()
            if not keine_fuel:
                keine_fuel = FuelType.objects.create(business=business, name='Keine / Nicht zutreffend', mobile_de_mapping='NONE', is_protected=True)
            fuel_type = keine_fuel
    elif not fuel_type:
        return 400, {
            "detail": "Fuel type is required for this vehicle class.",
            "message": "Fuel type is required for this vehicle class."
        }
    
    damage_type = get_object_or_404(DamageType, id=payload.damage_type_id, business=business)
    payment_method = get_object_or_404(PaymentMethod, id=payload.buy_payment_method_id, business=business)
    seller = get_object_or_404(LegalEntity, id=payload.seller_id, business=business)
    
    buy_tax = None
    if payload.buy_tax_id:
        buy_tax = get_object_or_404(TaxPercentage, id=payload.buy_tax_id, business=business)
    else:
        buy_tax = TaxPercentage.objects.filter(business=business, is_no_tax=True, is_active=True).first()
    
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
    
    # If vehicle_type is a class with specific requirements, handle Keine assignment
    if vehicle.vehicle_type:
        vt_name = (vehicle.vehicle_type.name or '').strip().lower()
        vt_map = (vehicle.vehicle_type.mobile_de_mapping or '').strip()
        no_doors_classes = ['motorrad', 'motorbike', 'anhänger', 'anhanger', 'anhnger', 'trailer', 'semitrailer', 'auflieger', 'ebike', 'e-bike', 'constructionmachine', 'forklifttruck', 'baumaschine', 'gabelstapler']
        is_non_doors_class = (any(c in vt_name for c in no_doors_classes)) or (vt_map in ['Motorbike', 'Trailer', 'SemiTrailer', 'EBike', 'ConstructionMachine', 'ForkliftTruck'])

        no_fuel_classes = ['anhänger', 'anhanger', 'anhnger', 'trailer', 'semitrailer', 'auflieger']
        is_non_fuel_class = (any(c in vt_name for c in no_fuel_classes)) or (vt_map in ['Trailer', 'SemiTrailer'])

        no_make_classes = ['anhänger', 'anhanger', 'anhnger', 'trailer', 'semitrailer', 'auflieger', 'ebike', 'e-bike', 'baumaschine', 'gabelstapler', 'constructionmachine', 'forklifttruck', 'agrarfahrzeug', 'agriculturalvehicle']
        is_non_make_class = (any(c in vt_name for c in no_make_classes)) or (vt_map in ['Trailer', 'SemiTrailer', 'EBike', 'ConstructionMachine', 'ForkliftTruck', 'AgriculturalVehicle'])

        no_body_classes = ['ebike', 'e-bike', 'baumaschine', 'gabelstapler', 'constructionmachine', 'forklifttruck', 'agrarfahrzeug', 'agriculturalvehicle']
        is_non_body_class = (any(c in vt_name for c in no_body_classes)) or (vt_map in ['EBike', 'ConstructionMachine', 'ForkliftTruck', 'AgriculturalVehicle'])

        if is_non_doors_class:
            keine_door = DoorsChoice.objects.filter(business=business, name__iexact='Keine').first()
            if not keine_door:
                keine_door = DoorsChoice.objects.create(business=business, name='Keine', mobile_de_mapping='NONE', is_protected=True)
            vehicle.doors = keine_door
        else:
            if vehicle.doors and (vehicle.doors.name.lower() == 'keine' or (vehicle.doors.mobile_de_mapping and vehicle.doors.mobile_de_mapping.upper() == 'NONE')):
                return 400, {
                    "detail": "Doors selection is required for this vehicle class.",
                    "message": "Doors selection is required for this vehicle class."
                }

        if is_non_fuel_class:
            keine_fuel = FuelType.objects.filter(business=business, name__icontains='Keine').first()
            if not keine_fuel:
                keine_fuel = FuelType.objects.create(business=business, name='Keine / Nicht zutreffend', mobile_de_mapping='NONE', is_protected=True)
            vehicle.fuel_type = keine_fuel

        if is_non_make_class and not vehicle.make:
            sonstige_make = Make.objects.filter(business=business, name__iexact='Sonstige').first()
            if not sonstige_make:
                sonstige_make = Make.objects.create(
                    business=business,
                    name='Sonstige',
                    mobile_de_mapping='Sonstige',
                    is_protected=True,
                    vehicle_classes=['Car', 'Motorbike', 'Motorhome', 'VanUpTo7500', 'TruckOver7500', 'SemiTrailerTruck', 'Trailer', 'SemiTrailer', 'ConstructionMachine', 'AgriculturalVehicle', 'ForkliftTruck', 'Bus', 'EBike']
                )
            vehicle.make = sonstige_make
            sonstige_model = VehicleModel.objects.filter(business=business, make=sonstige_make, name__iexact='Sonstige').first()
            if not sonstige_model:
                sonstige_model = VehicleModel.objects.create(business=business, make=sonstige_make, name='Sonstige', mobile_de_mapping='Sonstige', is_protected=True)
            vehicle.model = sonstige_model

        if is_non_body_class and not vehicle.body_type:
            keine_body = BodyType.objects.filter(business=business, name__iexact='Keine').first()
            if not keine_body:
                keine_body = BodyType.objects.create(business=business, name='Keine', mobile_de_mapping='NONE', is_protected=True)
            vehicle.body_type = keine_body

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


@router.get("/delete-check", response={200: DeleteCheckResponse, 400: ErrorResponse, 404: ErrorResponse})
def api_delete_check(request, entity_type: str = Query(...), entity_id: int = Query(...), choice_type: Optional[str] = Query(None)):
    """Pre-flight check to see if an entity can be permanently deleted or must be deactivated."""
    business = get_user_business(request)
    if entity_type not in ["vehicle", "transaction", "legal_entity", "choice"]:
        return 400, {"detail": f"Unsupported entity type: {entity_type}"}
    
    res = check_entity_dependencies(business, entity_type, entity_id, choice_type)
    return 200, res


@router.delete("/vehicles/{internal_id}", response={200: SuccessResponse, 403: ErrorResponse, 404: ErrorResponse})
def delete_vehicle(request, internal_id: int, force_cascade: bool = False, unlink_delete: bool = False, delete_mode: Optional[str] = None):
    """Conditionally delete a vehicle:
    - cascade: permanently deletes vehicle AND purges all connected transactions and expenses
    - unlink_delete: safely unlinks transactions (standalone ledger preservation) and permanently deletes vehicle
    - deactivate / default: soft deactivation to inactive (or hard delete if zero history)
    """
    business = get_user_business(request)
    
    vehicle = get_object_or_404(Vehicle, business=business, internal_id=internal_id)
    dep_check = check_entity_dependencies(business, "vehicle", internal_id)
    vehicle_name = f"{vehicle.make.name if vehicle.make else ''} {vehicle.model.name if vehicle.model else ''}".strip() or f"Vehicle #{vehicle.internal_id}"
    
    is_cascade = (delete_mode == 'cascade') or force_cascade
    is_unlink_delete = (delete_mode == 'unlink_delete') or unlink_delete
    
    if is_cascade:
        if not getattr(request.user, 'is_manager', False):
            return 403, {"detail": "Only managers can execute a cascade permanent deletion."}
        res = execute_cascade_delete(business, "vehicle", internal_id)
        tx_purged = res.get("purged_counts", {}).get("transactions", 0)
        log_activity(
            request,
            action='permanent_delete_cascade',
            entity_type='vehicle',
            entity_id=internal_id,
            entity_name=vehicle_name,
            details={
                "en": f"Vehicle #{internal_id} and {tx_purged} linked transactions permanently deleted (cascade purge)",
                "de": f"Fahrzeug #{internal_id} und {tx_purged} verknüpfte Transaktionen endgültig gelöscht (Kaskaden-Löschung)",
                "purged_counts": res.get("purged_counts", {})
            }
        )
        return {"success": True, "message": f"Vehicle and {tx_purged} linked records permanently deleted", "action": "deleted"}

    if is_unlink_delete:
        res = execute_unlink_and_delete(business, "vehicle", internal_id)
        unlinked_count = res.get("purged_counts", {}).get("unlinked_transactions", 0)
        log_activity(
            request,
            action='permanent_delete_vehicle',
            entity_type='vehicle',
            entity_id=internal_id,
            entity_name=vehicle_name,
            details={
                "en": f"Vehicle #{internal_id} permanently deleted ({unlinked_count} transactions preserved as standalone records)",
                "de": f"Fahrzeug #{internal_id} endgültig gelöscht ({unlinked_count} Transaktionen als eigenständige Datensätze beibehalten)",
                "purged_counts": res.get("purged_counts", {})
            }
        )
        return {"success": True, "message": f"Vehicle permanently deleted ({unlinked_count} transactions preserved)", "action": "deleted"}

    if dep_check["can_hard_delete"]:
        KeyNumber.objects.filter(vehicle=vehicle).update(vehicle=None)
        vehicle.delete()
        log_activity(
            request,
            action='delete',
            entity_type='vehicle',
            entity_id=internal_id,
            entity_name=vehicle_name,
            details={
                "en": f"Vehicle #{internal_id} permanently deleted (zero history)",
                "de": f"Fahrzeug #{internal_id} endgültig gelöscht (keine Historie)"
            }
        )
        return {"success": True, "message": "Vehicle permanently deleted", "action": "deleted"}
    else:
        old_status = vehicle.status
        vehicle.status = 'inactive'
        vehicle.save()
        
        # Log the delete action
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
        return {"success": True, "message": "Vehicle deactivated successfully", "action": "deactivated"}


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


@router.put(
    "/vehicles/{internal_id}/expenses-earnings/{ee_id}",
    response={200: VehicleExpenseEarningOut, 400: ErrorResponse, 404: ErrorResponse},
)
@router.patch(
    "/vehicles/{internal_id}/expenses-earnings/{ee_id}",
    response={200: VehicleExpenseEarningOut, 400: ErrorResponse, 404: ErrorResponse},
)
def update_vehicle_expense_earning(
    request,
    internal_id: int,
    ee_id: int,
    payload: VehicleExpenseEarningUpdate,
):
    """Update an existing expense/earning for a vehicle."""
    business = get_user_business(request)
    vehicle = get_object_or_404(Vehicle, business=business, internal_id=internal_id)

    ee = get_object_or_404(
        VehicleExpenseEarning, id=ee_id, vehicle=vehicle, is_active=True
    )

    if payload.category_id is not None:
        category = get_object_or_404(Category, id=payload.category_id, business=business, is_active=True)
        ee.category = category

    if payload.subcategory_id is not None:
        subcategory = get_object_or_404(
            Subcategory, id=payload.subcategory_id, category=ee.category, business=business, is_active=True
        )
        ee.subcategory = subcategory

    if payload.type is not None:
        ee.type = payload.type

    if payload.amount is not None:
        ee.amount = payload.amount

    ee.save()

    type_de = "Ausgabe" if ee.type == "expense" else "Einnahme"
    type_en = ee.type.title()
    log_activity(
        request,
        action='update',
        entity_type='vehicle',
        entity_id=vehicle.internal_id,
        entity_name=str(vehicle),
        details={
            "en": f"{type_en} of {ee.amount} updated ({ee.category.name if ee.category else ''} / {ee.subcategory.name if ee.subcategory else ''})",
            "de": f"{type_de} in Höhe von {ee.amount} aktualisiert ({ee.category.name if ee.category else ''} / {ee.subcategory.name if ee.subcategory else ''})"
        }
    )

    return 200, {
        "id": ee.id,
        "type": ee.type,
        "amount": ee.amount,
        "category_id": ee.category_id,
        "category_name": ee.category.name if ee.category else None,
        "subcategory_id": ee.subcategory_id,
        "subcategory_name": ee.subcategory.name if ee.subcategory else None,
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
# mobile.de Marketplace Endpoints
# =============================================================================

@router.get("/vehicles/{internal_id}/mobile-de", response={200: MobileDeListingDetailOut, 404: ErrorResponse})
def get_vehicle_mobile_de_detail(request, internal_id: int):
    """Retrieve pre-filled listing data, marketplace attributes, gallery images, and insights."""
    business = get_user_business(request)
    vehicle = get_object_or_404(
        Vehicle.objects.select_related(
            'make', 'model', 'body_type', 'color', 'doors', 'fuel_type', 'sale_tax'
        ).prefetch_related('listing_images'),
        business=business,
        internal_id=internal_id
    )

    gallery_images = [
        {
            "id": img.id,
            "image_url": img.image.url if img.image else "",
            "order": img.order,
            "uploaded_at": img.uploaded_at,
        }
        for img in vehicle.listing_images.all().order_by('order', 'id')
    ]

    v_class = 'Car'
    if vehicle.vehicle_type:
        vt_map = (vehicle.vehicle_type.mobile_de_mapping or '').strip()
        vt_name = (vehicle.vehicle_type.name or '').strip().lower()
        if vt_map:
            v_class = vt_map
        elif 'motorrad' in vt_name or 'bike' in vt_name:
            v_class = 'Motorbike'
        elif 'wohnmobil' in vt_name or 'camper' in vt_name:
            v_class = 'Motorhome'
        elif 'transporter' in vt_name or 'van' in vt_name:
            v_class = 'VanUpTo7500'
        elif 'lkw' in vt_name or 'truck' in vt_name:
            v_class = 'TruckOver7500'
        elif 'anhänger' in vt_name or 'trailer' in vt_name:
            v_class = 'Trailer'

    requires_doors = v_class in ['Car', 'VanUpTo7500']

    return 200, {
        "internal_id": vehicle.internal_id,
        "status": vehicle.status,
        "mobile_de_status": vehicle.mobile_de_status or "not_listed",
        "mobile_de_ad_id": vehicle.mobile_de_ad_id,
        "mobile_de_url": vehicle.mobile_de_url,
        "mobile_de_last_synced_at": vehicle.mobile_de_last_synced_at,
        "mobile_de_last_error": vehicle.mobile_de_last_error,
        "make_name": vehicle.make.name if vehicle.make else None,
        "model_name": vehicle.model.name if vehicle.model else (vehicle.manufacturer_model or None),
        "body_type_name": vehicle.body_type.name if vehicle.body_type else None,
        "vehicle_type_name": vehicle.vehicle_type.name if vehicle.vehicle_type else None,
        "vehicle_class": v_class,
        "kilometer": vehicle.kilometer,
        "first_registration_date": vehicle.first_registration_date,
        "year_of_construction": vehicle.year_of_construction,
        "color_name": vehicle.color.name if vehicle.color else None,
        "doors_name": str(vehicle.doors.name) if vehicle.doors else None,
        "fuel_type_name": vehicle.fuel_type.name if vehicle.fuel_type else None,
        "power_kw": vehicle.power_kw,
        "sale_price": float(vehicle.sale_price) if vehicle.sale_price else None,
        "sale_tax_percentage": float(vehicle.sale_tax.percentage) if (vehicle.sale_tax and vehicle.sale_tax.percentage) else 19.00,
        "transmission": vehicle.transmission,
        "condition": vehicle.condition or "USED",
        "hu_date": vehicle.hu_date,
        "features": vehicle.features or [],
        "emission_class": vehicle.emission_class or "EURO6",
        "emission_badge": vehicle.emission_badge or "GREEN",
        "fuel_consumption_combined": float(vehicle.fuel_consumption_combined) if vehicle.fuel_consumption_combined else None,
        "co2_emission_combined": vehicle.co2_emission_combined,
        "efficiency_class": vehicle.efficiency_class,
        "mobile_de_description": vehicle.mobile_de_description or vehicle.description,
        "primary_image_url": vehicle.image.url if vehicle.image else None,
        "gallery_images": gallery_images,
        "detail_views": vehicle.mobile_de_detail_views or 0,
        "search_hits": vehicle.mobile_de_search_hits or 0,
        "parkings": vehicle.mobile_de_parkings or 0,
        "leads_count": vehicle.mobile_de_leads_count or 0,
        "price_rating": vehicle.mobile_de_price_rating,
        "stats_updated_at": vehicle.mobile_de_stats_updated_at,
        "mapping_issues": [
            *([] if (v_class in ['Trailer', 'SemiTrailer'] or resolve_fuel(vehicle.fuel_type)) else [{
                "field": "fuel_type",
                "name": vehicle.fuel_type.name if vehicle.fuel_type else None,
                "message": f"Fuel type '{vehicle.fuel_type.name if vehicle.fuel_type else 'Not set'}' has no mobile.de mapping.",
            }]),
            *([] if (v_class != 'Car' or resolve_category(vehicle.body_type)) else [{
                "field": "body_type",
                "name": vehicle.body_type.name if vehicle.body_type else None,
                "message": f"Body type '{vehicle.body_type.name if vehicle.body_type else 'Not set'}' has no mobile.de mapping.",
            }]),
            *([] if resolve_color(vehicle.color) else [{
                "field": "color",
                "name": vehicle.color.name if vehicle.color else None,
                "message": f"Color '{vehicle.color.name if vehicle.color else 'Not set'}' has no mobile.de mapping.",
            }]),
            *([] if (not requires_doors or resolve_doors(vehicle.doors)) else [{
                "field": "doors",
                "name": str(vehicle.doors.name) if vehicle.doors else None,
                "message": f"Door count '{vehicle.doors.name if vehicle.doors else 'Not set'}' has no mobile.de mapping.",
            }]),
        ],
    }


@router.post("/vehicles/{internal_id}/mobile-de/publish", response={200: MobileDePublishOut, 400: ErrorResponse, 404: ErrorResponse})
def publish_vehicle_mobile_de(request, internal_id: int, payload: MobileDePublishIn):
    """
    Publish or update a vehicle on mobile.de.
    Executes universal two-way sync: updates Vehicle core fields and marketplace attributes,
    then dispatches the ad payload to mobile.de (or simulator).
    """
    business = get_user_business(request)
    vehicle = get_object_or_404(
        Vehicle.objects.select_related('make', 'model', 'body_type', 'color', 'doors', 'fuel_type', 'sale_tax'),
        business=business,
        internal_id=internal_id
    )

    # Status check: must be ready_for_sale or reserved
    if vehicle.status not in ['ready_for_sale', 'reserved']:
        return 400, {"detail": "Vehicle must be in 'Ready for Sale' or 'Reserved' status to list on mobile.de."}

    # Integration credentials check
    service = get_mobile_de_service(business)
    if not service:
        return 400, {"detail": "mobile.de integration is not configured in Business Settings."}

    # Universal Two-Way Synchronization: save all values to database
    if payload.sale_price is not None:
        vehicle.sale_price = payload.sale_price
    if payload.kilometer is not None:
        vehicle.kilometer = payload.kilometer

    vehicle.transmission = payload.transmission
    vehicle.condition = payload.condition or 'USED'
    vehicle.hu_date = payload.hu_date
    vehicle.features = payload.features or []
    vehicle.emission_class = payload.emission_class or 'EURO6'
    vehicle.emission_badge = payload.emission_badge or 'GREEN'
    vehicle.fuel_consumption_combined = payload.fuel_consumption_combined
    vehicle.co2_emission_combined = payload.co2_emission_combined
    vehicle.efficiency_class = payload.efficiency_class
    vehicle.mobile_de_description = payload.mobile_de_description
    vehicle.save()

    # Dispatch to mobile.de / simulator
    success, message, result_data = service.publish_or_update_ad(vehicle)
    if not success:
        return 400, {"detail": message}

    log_activity(
        request,
        action='update',
        entity_type='vehicle',
        entity_id=vehicle.internal_id,
        entity_name=str(vehicle),
        details={
            "en": f"Vehicle published to mobile.de ({vehicle.mobile_de_status})",
            "de": f"Fahrzeug auf mobile.de veröffentlicht ({vehicle.mobile_de_status})"
        }
    )

    return 200, {
        "success": True,
        "message": message,
        "ad_id": vehicle.mobile_de_ad_id,
        "url": vehicle.mobile_de_url,
        "status": vehicle.mobile_de_status,
    }


@router.post("/vehicles/{internal_id}/mobile-de/delist", response={200: SuccessResponse, 400: ErrorResponse, 404: ErrorResponse})
def delist_vehicle_mobile_de(request, internal_id: int):
    """Remove a vehicle listing from mobile.de."""
    business = get_user_business(request)
    vehicle = get_object_or_404(Vehicle, business=business, internal_id=internal_id)

    service = get_mobile_de_service(business)
    if not service:
        return 400, {"detail": "mobile.de service is not configured."}

    success, message = service.delist_vehicle(vehicle)
    if not success:
        return 400, {"detail": message}

    log_activity(
        request,
        action='update',
        entity_type='vehicle',
        entity_id=vehicle.internal_id,
        entity_name=str(vehicle),
        details={
            "en": "Vehicle delisted from mobile.de",
            "de": "Fahrzeug von mobile.de entfernt"
        }
    )

    return 200, {"success": True, "message": message}


@router.post("/vehicles/{internal_id}/mobile-de/gallery-images", response={200: VehicleGalleryImageOut, 400: ErrorResponse, 404: ErrorResponse})
def upload_vehicle_gallery_image(request, internal_id: int, image: UploadedFile = File(...)):
    """Upload an additional gallery photo for the vehicle listing."""
    business = get_user_business(request)
    vehicle = get_object_or_404(Vehicle, business=business, internal_id=internal_id)

    # Validate file size (max 10MB)
    if image.size > 10 * 1024 * 1024:
        return 400, {"detail": "File too large. Maximum size is 10MB."}

    last_img = vehicle.listing_images.order_by('-order').first()
    next_order = (last_img.order + 1) if last_img else 1

    gallery_img = VehicleListingImage.objects.create(
        vehicle=vehicle,
        image=image,
        order=next_order
    )

    return 200, {
        "id": gallery_img.id,
        "image_url": gallery_img.image.url,
        "order": gallery_img.order,
        "uploaded_at": gallery_img.uploaded_at
    }


@router.delete("/vehicles/{internal_id}/mobile-de/gallery-images/{image_id}", response={200: SuccessResponse, 404: ErrorResponse})
def delete_vehicle_gallery_image(request, internal_id: int, image_id: int):
    """Delete a gallery photo from the vehicle listing."""
    business = get_user_business(request)
    vehicle = get_object_or_404(Vehicle, business=business, internal_id=internal_id)

    gallery_img = get_object_or_404(VehicleListingImage, id=image_id, vehicle=vehicle)
    if gallery_img.image:
        gallery_img.image.delete(save=False)
    gallery_img.delete()

    return 200, {"success": True, "message": "Gallery image deleted."}


@router.get("/vehicles/{internal_id}/mobile-de/insights", response={200: MobileDeInsightsOut, 400: ErrorResponse, 404: ErrorResponse})
def get_vehicle_mobile_de_insights(request, internal_id: int):
    """Refresh live statistics and price rating from mobile.de."""
    business = get_user_business(request)
    vehicle = get_object_or_404(Vehicle, business=business, internal_id=internal_id)

    service = get_mobile_de_service(business)
    if not service:
        return 400, {"detail": "mobile.de service is not configured."}

    success, data = service.fetch_insights(vehicle)
    if not success:
        return 400, {"detail": data.get("error", "Failed to retrieve mobile.de insights.")}

    return 200, {
        "detail_views": data["detail_views"],
        "search_hits": data["search_hits"],
        "parkings": data["parkings"],
        "leads_count": data["leads_count"],
        "price_rating": data["price_rating"],
        "stats_updated_at": data["stats_updated_at"]
    }


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
        "vehicle_types": list(VehicleType.objects.filter(business=business, is_active=True).values('id', 'name', 'mobile_de_mapping', 'is_protected')),
        "body_types": list(BodyType.objects.filter(business=business, is_active=True).values('id', 'name', 'mobile_de_mapping', 'vehicle_classes', 'is_protected')),
        "makes": list(Make.objects.filter(business=business, is_active=True).values('id', 'name', 'mobile_de_mapping', 'vehicle_classes', 'is_protected')),
        "colors": list(Color.objects.filter(business=business, is_active=True).values('id', 'name', 'mobile_de_mapping', 'is_protected')),
        "fuel_types": list(FuelType.objects.filter(business=business, is_active=True).values('id', 'name', 'mobile_de_mapping', 'vehicle_classes', 'is_protected')),
        "damage_types": list(DamageType.objects.filter(business=business, is_active=True).values('id', 'name')),
        "doors": list(DoorsChoice.objects.filter(business=business, is_active=True).values('id', 'name', 'mobile_de_mapping', 'vehicle_classes', 'is_protected')),
        "payment_methods": list(PaymentMethod.objects.filter(business=business, is_active=True).values('id', 'name', 'applies_to_buy', 'applies_to_sale', 'applies_to_transactions')),
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
            "vehicle_classes": m.vehicle_classes or [],
            "mobile_de_mapping": m.mobile_de_mapping,
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
    
    v_filter = Q(vehicles__business=business)
    t_filter = Q(transactions__business=business)
    le_filter = Q(legal_entities__business=business)

    # Gather all choice types with active/inactive items
    choice_types = {
        'make': {
            'name': 'Manufacturers',
            'displayName': 'Hersteller',
            'active': list(Make.objects.filter(business=business, is_active=True).annotate(usage_count=Count('vehicles', filter=v_filter)).values('id', 'name', 'mobile_de_mapping', 'is_protected', 'vehicle_classes', 'usage_count')),
            'inactive': list(Make.objects.filter(business=business, is_active=False).annotate(usage_count=Count('vehicles', filter=v_filter)).values('id', 'name', 'mobile_de_mapping', 'is_protected', 'vehicle_classes', 'usage_count')),
        },
        'vehicle_type': {
            'name': 'Vehicle Types',
            'displayName': 'Fahrzeugtypen',
            'active': list(VehicleType.objects.filter(business=business, is_active=True).annotate(usage_count=Count('vehicles', filter=v_filter)).values('id', 'name', 'mobile_de_mapping', 'is_protected', 'usage_count')),
            'inactive': list(VehicleType.objects.filter(business=business, is_active=False).annotate(usage_count=Count('vehicles', filter=v_filter)).values('id', 'name', 'mobile_de_mapping', 'is_protected', 'usage_count')),
        },
        'body_type': {
            'name': 'Body Types',
            'displayName': 'Karosserietypen',
            'active': list(BodyType.objects.filter(business=business, is_active=True).annotate(usage_count=Count('vehicles', filter=v_filter)).values('id', 'name', 'mobile_de_mapping', 'is_protected', 'vehicle_classes', 'usage_count')),
            'inactive': list(BodyType.objects.filter(business=business, is_active=False).annotate(usage_count=Count('vehicles', filter=v_filter)).values('id', 'name', 'mobile_de_mapping', 'is_protected', 'vehicle_classes', 'usage_count')),
        },
        'color': {
            'name': 'Colors',
            'displayName': 'Farben',
            'active': list(Color.objects.filter(business=business, is_active=True).annotate(usage_count=Count('vehicles', filter=v_filter)).values('id', 'name', 'mobile_de_mapping', 'is_protected', 'usage_count')),
            'inactive': list(Color.objects.filter(business=business, is_active=False).annotate(usage_count=Count('vehicles', filter=v_filter)).values('id', 'name', 'mobile_de_mapping', 'is_protected', 'usage_count')),
        },
        'fuel_type': {
            'name': 'Fuel Types',
            'displayName': 'Kraftstoffarten',
            'active': list(FuelType.objects.filter(business=business, is_active=True).annotate(usage_count=Count('vehicles', filter=v_filter)).values('id', 'name', 'mobile_de_mapping', 'is_protected', 'vehicle_classes', 'usage_count')),
            'inactive': list(FuelType.objects.filter(business=business, is_active=False).annotate(usage_count=Count('vehicles', filter=v_filter)).values('id', 'name', 'mobile_de_mapping', 'is_protected', 'vehicle_classes', 'usage_count')),
        },
        'damage_type': {
            'name': 'Damage Types',
            'displayName': 'Schadensarten',
            'active': list(DamageType.objects.filter(business=business, is_active=True).annotate(usage_count=Count('vehicles', filter=v_filter)).values('id', 'name', 'usage_count')),
            'inactive': list(DamageType.objects.filter(business=business, is_active=False).annotate(usage_count=Count('vehicles', filter=v_filter)).values('id', 'name', 'usage_count')),
        },
        'doors': {
            'name': 'Door Options',
            'displayName': 'Türoptionen',
            'active': list(DoorsChoice.objects.filter(business=business, is_active=True).annotate(usage_count=Count('vehicles', filter=v_filter)).values('id', 'name', 'mobile_de_mapping', 'is_protected', 'vehicle_classes', 'usage_count')),
            'inactive': list(DoorsChoice.objects.filter(business=business, is_active=False).annotate(usage_count=Count('vehicles', filter=v_filter)).values('id', 'name', 'mobile_de_mapping', 'is_protected', 'vehicle_classes', 'usage_count')),
        },
        'payment_method': {
            'name': 'Payment Methods',
            'displayName': 'Zahlungsmethoden',
            'active': list(PaymentMethod.objects.filter(business=business, is_active=True).annotate(usage_count=Count('transactions', filter=t_filter)).values('id', 'name', 'applies_to_buy', 'applies_to_sale', 'applies_to_transactions', 'usage_count')),
            'inactive': list(PaymentMethod.objects.filter(business=business, is_active=False).annotate(usage_count=Count('transactions', filter=t_filter)).values('id', 'name', 'applies_to_buy', 'applies_to_sale', 'applies_to_transactions', 'usage_count')),
        },
        'tax_percentage': {
            'name': 'Tax Percentages',
            'displayName': 'Steuersätze',
            'active': [{'id': t.id, 'name': str(t), 'percentage': float(t.percentage) if t.percentage else 0, 'is_protected': t.name in ['0% Steuerfrei', 'Differenzbesteuerung gem. § 25a UStG', 'No Tax'], 'usage_count': t.usage_count} for t in TaxPercentage.objects.filter(business=business, is_active=True).annotate(usage_count=Count('buy_vehicles', filter=Q(buy_vehicles__business=business)) + Count('sale_vehicles', filter=Q(sale_vehicles__business=business)))],
            'inactive': [{'id': t.id, 'name': str(t), 'percentage': float(t.percentage) if t.percentage else 0, 'is_protected': t.name in ['0% Steuerfrei', 'Differenzbesteuerung gem. § 25a UStG', 'No Tax'], 'usage_count': t.usage_count} for t in TaxPercentage.objects.filter(business=business, is_active=False).annotate(usage_count=Count('buy_vehicles', filter=Q(buy_vehicles__business=business)) + Count('sale_vehicles', filter=Q(sale_vehicles__business=business)))],
        },
        'currency': {
            'name': 'Currencies',
            'displayName': 'Währungen',
            'active': [{'id': c.id, 'name': str(c), 'usage_count': 0} for c in Currency.objects.filter(business=business, is_active=True)],
            'inactive': [{'id': c.id, 'name': str(c), 'usage_count': 0} for c in Currency.objects.filter(business=business, is_active=False)],
        },
        'category': {
            'name': 'Categories',
            'displayName': 'Kategorien',
            'active': list(Category.objects.filter(business=business, is_active=True).annotate(usage_count=Count('transactions', filter=t_filter)).values('id', 'name', 'usage_count')),
            'inactive': list(Category.objects.filter(business=business, is_active=False).annotate(usage_count=Count('transactions', filter=t_filter)).values('id', 'name', 'usage_count')),
        },
        'country': {
            'name': 'Countries',
            'displayName': 'Länder',
            'active': list(Country.objects.filter(business=business, is_active=True).annotate(usage_count=Count('legal_entities', filter=le_filter)).values('id', 'name', 'usage_count')),
            'inactive': list(Country.objects.filter(business=business, is_active=False).annotate(usage_count=Count('legal_entities', filter=le_filter)).values('id', 'name', 'usage_count')),
        },
        'key_number': {
            'name': 'Key Numbers',
            'displayName': 'Schlüsselnummern',
            'active': [{'id': k.id, 'name': str(k.number), 'usage_count': 1 if k.vehicle_id else 0, 'vehicle_id': k.vehicle.internal_id if k.vehicle else None, 'vehicle_internal_id': k.vehicle.internal_id if k.vehicle else None, 'vehicle_name': f"{k.vehicle.make.name if k.vehicle and k.vehicle.make else ''} {k.vehicle.model.name if k.vehicle and k.vehicle.model else ''} (#{k.vehicle.internal_id})" if k.vehicle else None} for k in KeyNumber.objects.filter(business=business, is_active=True).select_related('vehicle', 'vehicle__make', 'vehicle__model')],
            'inactive': [{'id': k.id, 'name': str(k.number), 'usage_count': 0} for k in KeyNumber.objects.filter(business=business, is_active=False)],
        },
    }
    
    # Get makes with their models for parent-child management
    makes_with_models = []
    for mk in Make.objects.filter(business=business, is_active=True).annotate(usage_count=Count('vehicles', filter=v_filter)).order_by('-usage_count', 'name'):
        models_active = list(VehicleModel.objects.filter(make=mk, is_active=True).annotate(usage_count=Count('vehicles', filter=v_filter)).values('id', 'name', 'mobile_de_mapping', 'is_protected', 'vehicle_classes', 'usage_count'))
        models_inactive = list(VehicleModel.objects.filter(make=mk, is_active=False).annotate(usage_count=Count('vehicles', filter=v_filter)).values('id', 'name', 'mobile_de_mapping', 'is_protected', 'vehicle_classes', 'usage_count'))
        makes_with_models.append({
            'id': mk.id,
            'name': mk.name,
            'mobile_de_mapping': mk.mobile_de_mapping,
            'is_protected': mk.is_protected,
            'vehicle_classes': mk.vehicle_classes or [],
            'usage_count': mk.usage_count,
            'models_active': models_active,
            'models_inactive': models_inactive,
        })
    
    # Get categories with their subcategories for parent-child management
    categories_with_subcategories = []
    for cat in Category.objects.filter(business=business, is_active=True).annotate(usage_count=Count('transactions', filter=t_filter)).order_by('-usage_count', 'name'):
        subs_active = list(Subcategory.objects.filter(category=cat, is_active=True).annotate(usage_count=Count('transactions', filter=t_filter)).values('id', 'name', 'usage_count'))
        subs_inactive = list(Subcategory.objects.filter(category=cat, is_active=False).annotate(usage_count=Count('transactions', filter=t_filter)).values('id', 'name', 'usage_count'))
        categories_with_subcategories.append({
            'id': cat.id,
            'name': cat.name,
            'usage_count': cat.usage_count,
            'subs_active': subs_active,
            'subs_inactive': subs_inactive,
        })
    
    # Get countries with their cities for parent-child management
    countries_with_cities = []
    for country in Country.objects.filter(business=business, is_active=True).annotate(usage_count=Count('legal_entities', filter=le_filter)).order_by('-usage_count', 'name'):
        cities_active = list(City.objects.filter(country=country, is_active=True).annotate(usage_count=Count('legal_entities', filter=le_filter)).values('id', 'name', 'usage_count'))
        cities_inactive = list(City.objects.filter(country=country, is_active=False).annotate(usage_count=Count('legal_entities', filter=le_filter)).values('id', 'name', 'usage_count'))
        countries_with_cities.append({
            'id': country.id,
            'name': country.name,
            'usage_count': country.usage_count,
            'cities_active': cities_active,
            'cities_inactive': cities_inactive,
        })
    
    # Annotate mapped_to_name for unprotected choices across all choice types
    for ct_key in ['make', 'vehicle_type', 'body_type', 'color', 'fuel_type', 'doors']:
        if ct_key in choice_types:
            ct_active = choice_types[ct_key]['active']
            ct_inactive = choice_types[ct_key]['inactive']
            prot_lookup = {}
            for item in ct_active:
                if item.get('is_protected'):
                    if item.get('mobile_de_mapping'):
                        m_code = item['mobile_de_mapping'].strip()
                        prot_lookup[m_code] = item['name']
                        prot_lookup[m_code.lower()] = item['name']
                    prot_lookup[item['name'].strip().lower()] = item['name']
            
            for item in ct_active + ct_inactive:
                if not item.get('is_protected') and item.get('mobile_de_mapping'):
                    raw_m = str(item['mobile_de_mapping']).strip()
                    item['mapped_to_name'] = prot_lookup.get(raw_m) or prot_lookup.get(raw_m.lower()) or raw_m
                else:
                    item['mapped_to_name'] = None

    # Annotate mapped_to_name for makes and their models
    make_prot_lookup = {}
    for mk_dict in makes_with_models:
        if mk_dict.get('is_protected'):
            if mk_dict.get('mobile_de_mapping'):
                m_code = mk_dict['mobile_de_mapping'].strip()
                make_prot_lookup[m_code] = mk_dict['name']
                make_prot_lookup[m_code.lower()] = mk_dict['name']
            make_prot_lookup[mk_dict['name'].strip().lower()] = mk_dict['name']

    for mk_dict in makes_with_models:
        if not mk_dict.get('is_protected') and mk_dict.get('mobile_de_mapping'):
            raw_m = str(mk_dict['mobile_de_mapping']).strip()
            mk_dict['mapped_to_name'] = make_prot_lookup.get(raw_m) or make_prot_lookup.get(raw_m.lower()) or raw_m
        else:
            mk_dict['mapped_to_name'] = None

        # Build protected lookup for models under this make
        model_prot_lookup = {}
        for m in mk_dict.get('models_active', []):
            if m.get('is_protected'):
                if m.get('mobile_de_mapping'):
                    m_code = m['mobile_de_mapping'].strip()
                    model_prot_lookup[m_code] = m['name']
                    model_prot_lookup[m_code.lower()] = m['name']
                model_prot_lookup[m['name'].strip().lower()] = m['name']

        for m in mk_dict.get('models_active', []) + mk_dict.get('models_inactive', []):
            if not m.get('is_protected') and m.get('mobile_de_mapping'):
                raw_m = str(m['mobile_de_mapping']).strip()
                m['mapped_to_name'] = model_prot_lookup.get(raw_m) or model_prot_lookup.get(raw_m.lower()) or raw_m
            else:
                m['mapped_to_name'] = None

    return {
        'choice_types': choice_types,
        'makes_with_models': makes_with_models,
        'manufacturers_with_models': makes_with_models,
        'categories_with_subcategories': categories_with_subcategories,
        'countries_with_cities': countries_with_cities,
        'marketplace_options': MOBILE_DE_MAPPINGS,
    }


@router.get("/choices/marketplace-options")
def get_marketplace_choice_options(request):
    """Return available mobile.de mapping choices for fuel_type, body_type, color, and doors."""
    return 200, MOBILE_DE_MAPPINGS


_MARKETPLACE_CAR_CATALOG: Optional[Dict[str, List[str]]] = None

def _get_marketplace_catalog() -> Dict[str, List[str]]:
    global _MARKETPLACE_CAR_CATALOG
    if _MARKETPLACE_CAR_CATALOG is None:
        catalog_path = os.path.join(settings.BASE_DIR, 'scripts', 'data', 'mobile_de_car_catalog.json')
        catalog: Dict[str, List[str]] = {}
        if os.path.exists(catalog_path):
            try:
                with open(catalog_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                for entry in data:
                    make = entry.get('make')
                    code = entry.get('code')
                    models = entry.get('models', [])
                    if make:
                        catalog[make.strip().lower()] = models
                    if code and code.strip().lower() not in catalog:
                        catalog[code.strip().lower()] = models
            except Exception as e:
                logger.error(f"Failed to load mobile.de car catalog: {e}")
        _MARKETPLACE_CAR_CATALOG = catalog
    return _MARKETPLACE_CAR_CATALOG


@router.get("/choices/marketplace-models/{make_name}", response=MarketplaceModelsOut)
def get_marketplace_models_for_make(request, make_name: str):
    """
    Returns official mobile.de model choices scoped for a specific make.
    Always includes 'Sonstige' for unlisted or custom models.
    """
    clean_make = make_name.strip().lower()
    catalog = _get_marketplace_catalog()
    raw_models = catalog.get(clean_make, [])

    seen = set()
    cleaned_models = []
    for m in raw_models:
        if m and m.lower() not in seen:
            seen.add(m.lower())
            cleaned_models.append(m)

    if 'sonstige' not in seen and 'other' not in seen:
        cleaned_models.append('Sonstige')

    cleaned_models.sort(key=lambda x: (x.lower() == 'sonstige', x.lower()))
    return 200, {"make": make_name, "models": cleaned_models}


def get_protected_choice_match(model_class, business, mapping_val: Optional[str], parent_make=None):
    """
    Find the matching protected choice instance if mapping_val corresponds to one.
    """
    if not mapping_val or not str(mapping_val).strip():
        return None
    val = str(mapping_val).strip()

    # 1. Try resolving by numeric ID of protected choice
    if val.isdigit():
        q = Q(business=business, id=int(val), is_protected=True)
        if parent_make and hasattr(model_class, 'make'):
            q &= Q(make=parent_make)
        prot = model_class.objects.filter(q).first()
        if prot:
            return prot

    # 2. Try resolving by name of protected choice (case-insensitive)
    q = Q(business=business, is_protected=True, name__iexact=val)
    if parent_make and hasattr(model_class, 'make'):
        q &= Q(make=parent_make)
    prot = model_class.objects.filter(q).first()
    if prot:
        return prot

    # 3. Try resolving by mobile_de_mapping of protected choice
    q = Q(business=business, is_protected=True, mobile_de_mapping__iexact=val)
    if parent_make and hasattr(model_class, 'make'):
        q &= Q(make=parent_make)
    prot = model_class.objects.filter(q).first()
    if prot:
        return prot

    return None


def resolve_protected_choice_mapping(model_class, business, mapping_val: Optional[str], parent_make=None) -> Optional[str]:
    """
    Resolve a user-provided mapping (which can be a protected choice's name, ID, or raw code)
    to the official mobile_de_mapping value of that protected choice.
    """
    prot = get_protected_choice_match(model_class, business, mapping_val, parent_make=parent_make)
    if prot and prot.mobile_de_mapping:
        return prot.mobile_de_mapping.strip()
    return str(mapping_val).strip() if mapping_val else None


@router.post("/choices/{choice_type}", response={201: ChoiceCreatedResponse, 400: ErrorResponse, 403: ErrorResponse})
def create_choice(
    request,
    choice_type: str,
    name: str = Form(...),
    percentage: Optional[Decimal] = Form(None),
    make_id: Optional[int] = Form(None),
    category_id: Optional[int] = Form(None),
    country_id: Optional[int] = Form(None),
    applies_to_buy: Optional[bool] = Form(None),
    applies_to_sale: Optional[bool] = Form(None),
    applies_to_transactions: Optional[bool] = Form(None),
    context: Optional[str] = Form(None),
    mobile_de_mapping: Optional[str] = Form(None),
    vehicle_classes: Optional[str] = Form(None),
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
        
        model_kwargs = {
            'business': business,
            'make': make,
            'name': name,
            'is_active': True,
        }
        prot = get_protected_choice_match(VehicleModel, business, mobile_de_mapping, parent_make=make) if mobile_de_mapping else None
        if prot:
            model_kwargs['mobile_de_mapping'] = (prot.mobile_de_mapping or mobile_de_mapping).strip()
            if hasattr(prot, 'vehicle_classes') and prot.vehicle_classes:
                model_kwargs['vehicle_classes'] = list(prot.vehicle_classes)
        elif mobile_de_mapping:
            model_kwargs['mobile_de_mapping'] = mobile_de_mapping.strip()

        if 'vehicle_classes' not in model_kwargs and vehicle_classes:
            try:
                classes_list = json.loads(vehicle_classes) if isinstance(vehicle_classes, str) else vehicle_classes
                if isinstance(classes_list, list):
                    make_classes = set(make.vehicle_classes or [])
                    invalid_classes = set(classes_list) - make_classes
                    if invalid_classes:
                        return 400, {
                            "detail": f"Cannot assign class(es) '{', '.join(sorted(invalid_classes))}' to model '{name}' because make '{make.name}' does not support them."
                        }
                    model_kwargs['vehicle_classes'] = classes_list
            except (json.JSONDecodeError, TypeError):
                pass
        elif 'vehicle_classes' not in model_kwargs:
            model_kwargs['vehicle_classes'] = list(make.vehicle_classes or ['Car'])
        obj = VehicleModel.objects.create(**model_kwargs)
        return 201, {
            "success": True,
            "id": obj.id,
            "name": obj.name,
            "mobile_de_mapping": getattr(obj, 'mobile_de_mapping', None),
            "vehicle_classes": getattr(obj, 'vehicle_classes', []) or [],
            "is_protected": getattr(obj, 'is_protected', False),
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
        
        create_kwargs = {
            'business': business,
            'name': name,
            'is_active': True,
        }
        if choice_type == 'payment_method':
            if context == 'buy':
                create_kwargs['applies_to_buy'] = True
                create_kwargs['applies_to_sale'] = False
                create_kwargs['applies_to_transactions'] = False
            elif context == 'sale':
                create_kwargs['applies_to_buy'] = False
                create_kwargs['applies_to_sale'] = True
                create_kwargs['applies_to_transactions'] = False
            elif context == 'transaction':
                create_kwargs['applies_to_buy'] = False
                create_kwargs['applies_to_sale'] = False
                create_kwargs['applies_to_transactions'] = True
            else:
                if applies_to_buy is not None:
                    create_kwargs['applies_to_buy'] = applies_to_buy
                if applies_to_sale is not None:
                    create_kwargs['applies_to_sale'] = applies_to_sale
                if applies_to_transactions is not None:
                    create_kwargs['applies_to_transactions'] = applies_to_transactions

        prot = None
        if choice_type in ['vehicle_type', 'fuel_type', 'body_type', 'color', 'doors']:
            prot = get_protected_choice_match(model_class, business, mobile_de_mapping) if mobile_de_mapping else None
            resolved_map = prot.mobile_de_mapping if (prot and prot.mobile_de_mapping) else resolve_protected_choice_mapping(model_class, business, mobile_de_mapping)
            default_map = 'Car' if choice_type == 'vehicle_type' else ('OtherCar' if choice_type == 'body_type' else ('TWO_OR_THREE' if choice_type == 'doors' else 'OTHER'))
            create_kwargs['mobile_de_mapping'] = (resolved_map or mobile_de_mapping or '').strip() or default_map
        elif choice_type == 'make':
            if mobile_de_mapping:
                prot = get_protected_choice_match(Make, business, mobile_de_mapping)
                resolved_map = prot.mobile_de_mapping if (prot and prot.mobile_de_mapping) else resolve_protected_choice_mapping(Make, business, mobile_de_mapping)
                create_kwargs['mobile_de_mapping'] = (resolved_map or mobile_de_mapping).strip()

        if choice_type in ['body_type', 'make', 'fuel_type', 'doors']:
            if prot and hasattr(prot, 'vehicle_classes') and prot.vehicle_classes:
                create_kwargs['vehicle_classes'] = list(prot.vehicle_classes)
            else:
                parsed_classes = []
                if vehicle_classes:
                    try:
                        parsed_classes = json.loads(vehicle_classes)
                    except Exception:
                        parsed_classes = [c.strip() for c in vehicle_classes.split(',') if c.strip()]
                if not parsed_classes or len(parsed_classes) == 0:
                    parsed_classes = ['Car']
                create_kwargs['vehicle_classes'] = parsed_classes

        obj = model_class.objects.create(**create_kwargs)
        return 201, {
            "success": True,
            "id": obj.id,
            "name": obj.name,
            "mobile_de_mapping": getattr(obj, 'mobile_de_mapping', None),
            "is_protected": getattr(obj, 'is_protected', False),
            "vehicle_classes": getattr(obj, 'vehicle_classes', []),
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
def deactivate_choice(request, choice_type: str, choice_id: int, force_cascade: bool = False):
    """Deactivate (soft-delete) or cascade delete a choice option (managers only)."""
    if not request.user.is_manager:
        return 403, {"detail": "Only managers can deactivate choices."}
    
    business = get_user_business(request)
    
    model_class = CHOICE_MODEL_MAP.get(choice_type)
    if not model_class:
        return 400, {"detail": f"Invalid choice type: {choice_type}"}
    
    try:
        choice = model_class.objects.get(id=choice_id, business=business)
        
        # Prevent deletion / deactivation of protected choices
        if getattr(choice, 'is_protected', False):
            return 400, {"detail": "System-protected choices cannot be deleted or deactivated."}

        # Prevent deactivation of protected tax options or the only remaining No Tax option
        if choice_type == 'tax_percentage':
            if choice.name in ['0% Steuerfrei', 'Differenzbesteuerung gem. § 25a UStG', 'No Tax']:
                return 400, {"detail": "System-protected choices cannot be deleted or deactivated."}
            if getattr(choice, 'is_no_tax', False):
                active_no_tax = TaxPercentage.objects.filter(business=business, is_no_tax=True, is_active=True).exclude(id=choice.id).count()
                if active_no_tax == 0:
                    return 400, {"detail": "Cannot deactivate the only active No Tax option"}
        
        # Unassign vehicle when deactivating a key number
        if choice_type == 'key_number' and hasattr(choice, 'vehicle') and choice.vehicle:
            choice.vehicle = None
            
        if force_cascade:
            execute_cascade_delete(business, "choice", choice_id, choice_type)
            return {"success": True, "message": "Choice permanently deleted (cascade purge)", "action": "deleted"}
        
        # Check if choice can be permanently deleted
        dep_check = check_entity_dependencies(business, "choice", choice_id, choice_type)
        if dep_check["can_hard_delete"]:
            choice.delete()
            return {"success": True, "message": "Choice permanently deleted", "action": "deleted"}
        else:
            choice.is_active = False
            choice.save()
            return {"success": True, "message": "Choice deactivated successfully", "action": "deactivated"}
    except model_class.DoesNotExist:
        return 404, {"detail": "Choice not found"}


@router.delete("/choices/{choice_type}/{choice_id}", response={200: SuccessResponse, 400: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse})
def delete_choice_endpoint(request, choice_type: str, choice_id: int, force_cascade: bool = False):
    """Delete or deactivate a choice option (managers only)."""
    return deactivate_choice(request, choice_type, choice_id, force_cascade=force_cascade)


@router.post("/choices/{choice_type}/{choice_id}/reactivate", response={200: SuccessResponse, 400: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse})
def reactivate_choice(request, choice_type: str, choice_id: int):
    """Reactivate a deactivated choice option (managers only)."""
    if not request.user.is_manager:
        return 403, {"detail": "Only managers can reactivate choices."}
    
    business = get_user_business(request)
    
    model_class = CHOICE_MODEL_MAP.get(choice_type)
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
    
    model_class = CHOICE_MODEL_MAP.get(choice_type)
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
        
        # Check if system-protected choice is being modified
        if getattr(choice, 'is_protected', False):
            return 400, {"detail": "System-protected choices cannot be modified."}

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
        
        # Handle payment method scoping flags
        if choice_type == 'payment_method':
            if payload.applies_to_buy is not None:
                choice.applies_to_buy = payload.applies_to_buy
            if payload.applies_to_sale is not None:
                choice.applies_to_sale = payload.applies_to_sale
            if payload.applies_to_transactions is not None:
                choice.applies_to_transactions = payload.applies_to_transactions

        # Handle mobile.de mapping update
        prot_match = None
        if hasattr(choice, 'mobile_de_mapping'):
            if payload.mobile_de_mapping is not None:
                parent_make = getattr(choice, 'make', None)
                prot_match = get_protected_choice_match(model_class, business, payload.mobile_de_mapping, parent_make=parent_make)
                resolved_map = prot_match.mobile_de_mapping if (prot_match and prot_match.mobile_de_mapping) else resolve_protected_choice_mapping(model_class, business, payload.mobile_de_mapping, parent_make=parent_make)
                if choice_type in ['vehicle_type', 'fuel_type', 'body_type', 'color', 'doors']:
                    default_map = 'Car' if choice_type == 'vehicle_type' else ('OtherCar' if choice_type == 'body_type' else ('TWO_OR_THREE' if choice_type == 'doors' else 'OTHER'))
                    choice.mobile_de_mapping = (resolved_map or payload.mobile_de_mapping).strip() or default_map
                else:
                    choice.mobile_de_mapping = (resolved_map or payload.mobile_de_mapping).strip() or None

        # Handle vehicle_classes update
        if prot_match and hasattr(prot_match, 'vehicle_classes') and prot_match.vehicle_classes:
            inherited_classes = list(prot_match.vehicle_classes)
            if choice_type == 'vehicle_model':
                make_classes = set(choice.make.vehicle_classes or [])
                invalid_classes = set(inherited_classes) - make_classes
                if invalid_classes:
                    return 400, {
                        "detail": f"Cannot assign class(es) '{', '.join(sorted(invalid_classes))}' to model '{choice.name}' because make '{choice.make.name}' does not support them."
                    }
            if choice_type == 'make':
                current_classes = set(choice.vehicle_classes or [])
                new_classes = set(inherited_classes)
                removed_classes = current_classes - new_classes
                if removed_classes:
                    conflicting_models = []
                    for model in choice.models.filter(business=business):
                        model_classes = set(model.vehicle_classes or [])
                        overlap = model_classes.intersection(removed_classes)
                        if overlap:
                            conflicting_models.append((model.name, list(overlap)))

                    if conflicting_models:
                        bullet_items = []
                        for i, m in enumerate(conflicting_models):
                            suffix = "." if i == len(conflicting_models) - 1 else ","
                            bullet_items.append(f"- {m[0]} ({', '.join(sorted(m[1]))}){suffix}")
                        bullet_text = "\n".join(bullet_items)
                        return 400, {
                            "detail": f"Cannot remove vehicle class(es) '{', '.join(sorted(removed_classes))}' from make '{choice.name}' because {len(conflicting_models)} model(s) depend on them:\n{bullet_text}\nPlease update these models first."
                        }
            choice.vehicle_classes = inherited_classes
        elif hasattr(choice, 'vehicle_classes') and payload.vehicle_classes is not None:
            if choice_type in ['make', 'body_type', 'vehicle_model', 'fuel_type', 'doors'] and len(payload.vehicle_classes) == 0:
                return 400, {"detail": "At least one vehicle class must be selected for this choice."}

            if choice_type == 'vehicle_model':
                make_classes = set(choice.make.vehicle_classes or [])
                invalid_classes = set(payload.vehicle_classes) - make_classes
                if invalid_classes:
                    return 400, {
                        "detail": f"Cannot assign class(es) '{', '.join(sorted(invalid_classes))}' to model '{choice.name}' because make '{choice.make.name}' does not support them."
                    }

            if choice_type == 'make':
                current_classes = set(choice.vehicle_classes or [])
                new_classes = set(payload.vehicle_classes)
                removed_classes = current_classes - new_classes
                if removed_classes:
                    conflicting_models = []
                    for model in choice.models.filter(business=business):
                        model_classes = set(model.vehicle_classes or [])
                        overlap = model_classes.intersection(removed_classes)
                        if overlap:
                            conflicting_models.append((model.name, list(overlap)))

                    if conflicting_models:
                        bullet_items = []
                        for i, m in enumerate(conflicting_models):
                            suffix = "." if i == len(conflicting_models) - 1 else ","
                            bullet_items.append(f"- {m[0]} ({', '.join(sorted(m[1]))}){suffix}")
                        bullet_text = "\n".join(bullet_items)
                        return 400, {
                            "detail": f"Cannot remove vehicle class(es) '{', '.join(sorted(removed_classes))}' from make '{choice.name}' because {len(conflicting_models)} model(s) depend on them:\n{bullet_text}\nPlease update these models first."
                        }

            choice.vehicle_classes = payload.vehicle_classes

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


@router.post("/legal-entities/{internal_id}/deactivate", response={200: SuccessResponse, 403: ErrorResponse, 404: ErrorResponse})
@router.delete("/legal-entities/{internal_id}", response={200: SuccessResponse, 403: ErrorResponse, 404: ErrorResponse})
def deactivate_legal_entity(request, internal_id: int, force_cascade: bool = False):
    """Conditionally delete a legal entity (hard delete if zero history, else soft-delete to inactive or cascade purge)"""
    business = get_user_business(request)
    
    entity = get_object_or_404(LegalEntity, business=business, internal_id=internal_id)
    dep_check = check_entity_dependencies(business, "legal_entity", internal_id)
    
    if force_cascade:
        if not getattr(request.user, 'is_manager', False):
            return 403, {"detail": "Only managers can execute a cascade permanent deletion."}
        res = execute_cascade_delete(business, "legal_entity", internal_id)
        log_activity(
            request,
            action='permanent_delete_cascade',
            entity_type='legal_entity',
            entity_id=internal_id,
            entity_name=entity.name,
            details={
                "en": f"Legal entity #{internal_id} permanently deleted (cascade purge)",
                "de": f"Rechtsträger #{internal_id} endgültig gelöscht (Kaskaden-Löschung)",
                "purged_counts": res.get("purged_counts", {})
            }
        )
        return {"success": True, "message": "Legal entity and linked records permanently deleted", "action": "deleted"}

    if dep_check["can_hard_delete"]:
        entity_name = entity.name
        entity.delete()
        log_activity(
            request,
            action='delete',
            entity_type='legal_entity',
            entity_id=internal_id,
            entity_name=entity_name,
            details={
                "en": f"Legal entity #{internal_id} permanently deleted (zero history)",
                "de": f"Rechtsträger #{internal_id} endgültig gelöscht (keine Historie)"
            }
        )
        return {"success": True, "message": "Legal entity permanently deleted", "action": "deleted"}
    else:
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
        return {"success": True, "message": "Legal entity deactivated successfully", "action": "deactivated"}


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


@router.get("/vehicles/{internal_id}/pdf/download-zip")
def download_vehicle_documents_zip(
    request,
    internal_id: int,
    docs: str = Query(...),
    region: Optional[str] = Query(None)
):
    """
    Package requested vehicle PDFs into a single ZIP archive for instant download.
    Provides guaranteed native download compatibility across Web and Desktop (Tauri/WebView2).
    """
    business = get_user_business(request)
    vehicle = get_object_or_404(Vehicle, business=business, internal_id=internal_id)
    
    from . import views as legacy_views
    import zipfile
    
    doc_types = [d.strip() for d in docs.split(",") if d.strip()]
    zip_buffer = io.BytesIO()
    
    safe_make = (vehicle.make_name or "Fahrzeug").replace(" ", "_")
    safe_model = (vehicle.model_name or "").replace(" ", "_")
    safe_name = f"{safe_make}_{safe_model}".strip("_")
    
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for idx, doc_type in enumerate(doc_types, start=1):
            pdf_response = None
            filename = f"{idx:02d}_{doc_type}.pdf"
            
            if doc_type == "buy-contract":
                pdf_response = legacy_views.generate_vehicle_buy_contract_pdf(request, business.name, internal_id)
                filename = f"{idx:02d}_Kaufvertrag_Einkauf.pdf"
            elif doc_type == "sale-contract":
                pdf_response = legacy_views.generate_vehicle_sale_contract_pdf(request, business.name, internal_id)
                filename = f"{idx:02d}_Kaufvertrag_Verkauf.pdf"
            elif doc_type == "identity-check":
                pdf_response = legacy_views.generate_identity_check_pdf(request, business.name, internal_id)
                filename = f"{idx:02d}_Identitaetspruefung.pdf"
            elif doc_type == "binding-order":
                pdf_response = legacy_views.generate_binding_order_pdf(request, business.name, internal_id)
                filename = f"{idx:02d}_Verbindliche_Bestellung.pdf"
            elif doc_type == "sale-agreement":
                pdf_response = legacy_views.generate_sale_agreement_pdf(request, business.name, internal_id)
                filename = f"{idx:02d}_Verkaufvertrag.pdf"
            elif doc_type == "receipt":
                pdf_response = legacy_views.generate_receipt_verkaufvertrag_pdf(request, business.name, internal_id, region=region)
                filename = f"{idx:02d}_Quittung.pdf"
                
            if pdf_response and hasattr(pdf_response, "content"):
                zf.writestr(filename, pdf_response.content)
                
    zip_buffer.seek(0)
    response = HttpResponse(zip_buffer.getvalue(), content_type="application/zip")
    response["Content-Disposition"] = f'attachment; filename="{safe_name}_Dokumente.zip"'
    return response



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
