"""
Vehicle API - Ninja router for vehicle CRUD operations
Provides listing, filtering, sorting, pagination, and financial summaries
"""
from typing import Optional, List
from datetime import date
from decimal import Decimal
from ninja import Router, Query, Schema
from ninja.security import django_auth
from ninja.pagination import paginate, PageNumberPagination
from django.db.models import Sum, Q, F
from django.shortcuts import get_object_or_404
from django.http import HttpRequest

from .models import (
    Vehicle, Branch, Make, VehicleModel, VehicleType, BodyType, 
    Color, FuelType, DoorsChoice, DamageType, PaymentMethod, TaxPercentage,
    LegalEntity, KeyNumber
)

vehicle_router = Router(auth=django_auth, tags=["Vehicles"])


# ============================================================================
# SCHEMAS
# ============================================================================

class VehicleListSchema(Schema):
    """Schema for vehicle list items (card display)"""
    id: int
    internal_id: Optional[int] = None
    status: Optional[str] = None
    
    # Main display info
    make_name: Optional[str] = None
    model_name: Optional[str] = None
    year_of_construction: Optional[int] = None
    branch_name: Optional[str] = None
    
    # Pricing
    buy_price: Optional[float] = None
    buy_price_net: Optional[float] = None
    sale_price: Optional[float] = None
    sale_price_net: Optional[float] = None
    
    # Dates
    buy_date: Optional[date] = None
    sale_date: Optional[date] = None
    active_for: int = 0
    
    # Identifiers
    chassis_number: Optional[str] = None
    motor_vehicle_registration_number: Optional[str] = None
    official_license_plate: Optional[str] = None
    
    # Details
    damage_type_name: Optional[str] = None
    kilometer: Optional[int] = None
    vehicle_type_name: Optional[str] = None
    body_type_name: Optional[str] = None
    color_name: Optional[str] = None
    doors_name: Optional[str] = None
    fuel_type_name: Optional[str] = None
    power_kw: Optional[int] = None
    
    # Image
    image_url: Optional[str] = None
    
    # Comments
    internal_comments: Optional[str] = None
    
    # For contract button visibility
    can_generate_buy_contract: bool = False
    can_generate_sale_contract: bool = False
    
    # Pipeline availability
    can_move_to: List[str] = []
    
    # mobile.de status and insights
    mobile_de_status: Optional[str] = 'not_listed'
    mobile_de_ad_id: Optional[str] = None
    mobile_de_url: Optional[str] = None
    mobile_de_detail_views: int = 0
    mobile_de_search_hits: int = 0
    mobile_de_parkings: int = 0
    mobile_de_leads_count: int = 0
    mobile_de_price_rating: Optional[str] = None
    
    @staticmethod
    def resolve_make_name(obj):
        return obj.make.name if obj.make else None
    
    @staticmethod
    def resolve_model_name(obj):
        return obj.model.name if obj.model else (obj.manufacturer_model or None)
    
    @staticmethod
    def resolve_branch_name(obj):
        return obj.branch.name if obj.branch else None
    
    @staticmethod
    def resolve_damage_type_name(obj):
        return obj.damage_type.name if obj.damage_type else None
    
    @staticmethod
    def resolve_vehicle_type_name(obj):
        return obj.vehicle_type.name if obj.vehicle_type else None
    
    @staticmethod
    def resolve_body_type_name(obj):
        return obj.body_type.name if obj.body_type else None
    
    @staticmethod
    def resolve_color_name(obj):
        return obj.color.name if obj.color else None
    
    @staticmethod
    def resolve_doors_name(obj):
        return str(obj.doors.name) if obj.doors else None
    
    @staticmethod
    def resolve_fuel_type_name(obj):
        return obj.fuel_type.name if obj.fuel_type else None
    
    @staticmethod
    def resolve_image_url(obj):
        return obj.image.url if obj.image else None
    
    @staticmethod
    def resolve_buy_price(obj):
        return float(obj.buy_price) if obj.buy_price else None
    
    @staticmethod
    def resolve_buy_price_net(obj):
        # Net = before tax, Gross = after tax in German context
        return float(obj.buy_price) if obj.buy_price else None
    
    @staticmethod
    def resolve_sale_price(obj):
        return float(obj.sale_price) if obj.sale_price else None
    
    @staticmethod
    def resolve_sale_price_net(obj):
        return float(obj.sale_price) if obj.sale_price else None
    
    @staticmethod
    def resolve_can_generate_buy_contract(obj):
        return all([
            obj.buy_price,
            obj.buy_date,
            obj.buy_payment_method,
            obj.seller
        ])
    
    @staticmethod
    def resolve_can_generate_sale_contract(obj):
        return all([
            obj.sale_price,
            obj.sale_date,
            obj.sale_payment_method,
            obj.buyer
        ])


class VehicleFiltersSchema(Schema):
    """Filter options for dropdowns"""
    statuses: List[dict]
    makes: List[dict]
    vehicle_types: List[dict]
    body_types: List[dict]
    colors: List[dict]
    fuel_types: List[dict]
    doors: List[dict]
    damage_types: List[dict]
    branches: List[dict]
    key_numbers: List[dict]


class VehicleSummarySchema(Schema):
    """Financial summary for vehicles page"""
    total_count: int
    avg_days_on_stock: int
    
    # Net totals
    net_total_revenue: float
    net_total_expenses: float
    net_difference: float
    
    # Tax totals  
    tax_total_revenue: float
    tax_total_expenses: float
    tax_difference: float
    
    # Gross totals
    gross_total_revenue: float
    gross_total_expenses: float
    gross_difference: float
    total_profit: Optional[float] = None


class PaginatedVehiclesSchema(Schema):
    items: List[VehicleListSchema]
    total: int
    page: int
    page_size: int

class VehicleListResponse(Schema):
    """Paginated vehicle list response"""
    vehicles: PaginatedVehiclesSchema
    financial_summary: VehicleSummarySchema


class FilterParams(Schema):
    """Query parameters for vehicle filtering"""
    # Status
    status: Optional[str] = None
    
    # mobile.de filter
    listed_on_mobile_de: Optional[str] = None  # 'all', 'yes', 'no'
    
    # Vehicle identifiers search
    vehicle_id_search: Optional[int] = None
    chassis_number_search: Optional[str] = None
    motor_vehicle_registration_search: Optional[str] = None
    official_license_plate_search: Optional[str] = None
    sale_invoice_number_search: Optional[str] = None
    
    # Dropdown filters
    make: Optional[int] = None
    model: Optional[int] = None
    vehicle_type: Optional[int] = None
    body_type: Optional[int] = None
    fuel_type: Optional[int] = None
    color: Optional[int] = None
    doors: Optional[int] = None
    damage_type: Optional[int] = None
    branch: Optional[int] = None
    key_number: Optional[int] = None
    
    # Price filters
    min_buy_price: Optional[float] = None
    max_buy_price: Optional[float] = None
    min_sale_price: Optional[float] = None
    max_sale_price: Optional[float] = None
    
    # Date filters
    min_buy_date: Optional[date] = None
    max_buy_date: Optional[date] = None
    min_sale_date: Optional[date] = None
    max_sale_date: Optional[date] = None
    
    # Technical specs
    min_year: Optional[int] = None
    max_year: Optional[int] = None
    min_kilometer: Optional[int] = None
    max_kilometer: Optional[int] = None
    min_power_kw: Optional[int] = None
    max_power_kw: Optional[int] = None
    
    # Sorting
    sort: Optional[str] = None
    order: Optional[str] = "desc"
    
    # Pagination
    page: int = 1
    page_size: int = 20


# ============================================================================
# ENDPOINTS
# ============================================================================

@vehicle_router.get("/vehicles", response=VehicleListResponse)
def list_vehicles(request: HttpRequest, filters: FilterParams = Query(...)):
    """List vehicles with filtering, sorting, and pagination"""
    business = request.user.business
    queryset = Vehicle.objects.filter(business=business)
    
    # Apply status filter (default: exclude inactive)
    if filters.status:
        queryset = queryset.filter(status=filters.status)
    else:
        queryset = queryset.exclude(status='inactive')
    
    # Apply mobile.de marketplace filter
    if filters.listed_on_mobile_de == 'yes':
        queryset = queryset.filter(mobile_de_status='active')
    elif filters.listed_on_mobile_de == 'no':
        queryset = queryset.exclude(mobile_de_status='active')
    
    # Apply search filters
    if filters.vehicle_id_search:
        queryset = queryset.filter(internal_id=filters.vehicle_id_search)
    if filters.chassis_number_search:
        queryset = queryset.filter(chassis_number__icontains=filters.chassis_number_search)
    if filters.motor_vehicle_registration_search:
        queryset = queryset.filter(motor_vehicle_registration_number__icontains=filters.motor_vehicle_registration_search)
    if filters.official_license_plate_search:
        queryset = queryset.filter(official_license_plate__icontains=filters.official_license_plate_search)
    if filters.sale_invoice_number_search:
        queryset = queryset.filter(sale_invoice_number__icontains=filters.sale_invoice_number_search)
    
    # Apply dropdown filters
    if filters.make:
        queryset = queryset.filter(make_id=filters.make)
    if filters.model:
        queryset = queryset.filter(model_id=filters.model)
    if filters.vehicle_type:
        queryset = queryset.filter(vehicle_type_id=filters.vehicle_type)
    if filters.body_type:
        queryset = queryset.filter(body_type_id=filters.body_type)
    if filters.fuel_type:
        queryset = queryset.filter(fuel_type_id=filters.fuel_type)
    if filters.color:
        queryset = queryset.filter(color_id=filters.color)
    if filters.doors:
        queryset = queryset.filter(doors_id=filters.doors)
    if filters.damage_type:
        queryset = queryset.filter(damage_type_id=filters.damage_type)
    if filters.branch:
        queryset = queryset.filter(branch_id=filters.branch)
    if filters.key_number:
        queryset = queryset.filter(key_number__id=filters.key_number)
    
    # Apply price filters
    if filters.min_buy_price:
        queryset = queryset.filter(buy_price__gte=filters.min_buy_price)
    if filters.max_buy_price:
        queryset = queryset.filter(buy_price__lte=filters.max_buy_price)
    if filters.min_sale_price:
        queryset = queryset.filter(sale_price__gte=filters.min_sale_price)
    if filters.max_sale_price:
        queryset = queryset.filter(sale_price__lte=filters.max_sale_price)
    
    # Apply date filters
    if filters.min_buy_date:
        queryset = queryset.filter(buy_date__gte=filters.min_buy_date)
    if filters.max_buy_date:
        queryset = queryset.filter(buy_date__lte=filters.max_buy_date)
    if filters.min_sale_date:
        queryset = queryset.filter(sale_date__gte=filters.min_sale_date)
    if filters.max_sale_date:
        queryset = queryset.filter(sale_date__lte=filters.max_sale_date)
    
    # Apply technical filters
    if filters.min_year:
        queryset = queryset.filter(year_of_construction__gte=filters.min_year)
    if filters.max_year:
        queryset = queryset.filter(year_of_construction__lte=filters.max_year)
    if filters.min_kilometer:
        queryset = queryset.filter(kilometer__gte=filters.min_kilometer)
    if filters.max_kilometer:
        queryset = queryset.filter(kilometer__lte=filters.max_kilometer)
    if filters.min_power_kw:
        queryset = queryset.filter(power_kw__gte=filters.min_power_kw)
    if filters.max_power_kw:
        queryset = queryset.filter(power_kw__lte=filters.max_power_kw)
    
    # Apply sorting
    sort_field = filters.sort or 'internal_id'
    sort_order = '' if filters.order == 'asc' else '-'
    
    # Map frontend sort fields to model fields
    sort_map = {
        'make': 'make__name',
        'model': 'model__name',
        'buy_price': 'buy_price',
        'sale_price': 'sale_price',
        'kilometer': 'kilometer',
        'buy_date': 'buy_date',
        'sale_date': 'sale_date',
        'power_kw': 'power_kw',
        'doors': 'doors__name',
        'vehicle_type': 'vehicle_type__name',
        'body_type': 'body_type__name',
        'fuel_type': 'fuel_type__name',
        'color': 'color__name',
        'damage_type': 'damage_type__name',
        'branch': 'branch__name',
        'id': 'internal_id',
        'internal_id': 'internal_id',
        'status': 'status',
        'year': 'year_of_construction',
    }
    
    actual_sort_field = sort_map.get(sort_field, 'internal_id')
    queryset = queryset.order_by(f'{sort_order}{actual_sort_field}')
    
    # Get total count
    total_count = queryset.count()
    
    # Calculate financial summary
    summary = calculate_summary(queryset)
    summary['total_count'] = total_count
    
    # Prefetch related for performance
    queryset = queryset.select_related(
        'make', 'model', 'branch', 'vehicle_type', 'body_type',
        'color', 'fuel_type', 'doors', 'damage_type',
        'buy_tax', 'sale_tax', 'buy_payment_method', 'sale_payment_method',
        'seller', 'buyer'
    )
    
    # Apply pagination
    start = (filters.page - 1) * filters.page_size
    end = start + filters.page_size
    paginated_vehicles = queryset[start:end]
    
    return {
        "vehicles": {
            "items": list(paginated_vehicles),
            "total": total_count,
            "page": filters.page,
            "page_size": filters.page_size,
        },
        "financial_summary": summary
    }


@vehicle_router.get("/vehicles/filters", response=VehicleFiltersSchema)
def get_filter_options(request: HttpRequest):
    """Get filter dropdown options for the current business"""
    business = request.user.business
    
    return {
        "statuses": [
            {"value": value, "label": str(label)}
            for value, label in Vehicle.STATUS_CHOICES
        ],
        "makes": [
            {"value": m.id, "label": m.name}
            for m in Make.objects.filter(business=business, is_active=True)
        ],
        "vehicle_types": [
            {"value": v.id, "label": v.name}
            for v in VehicleType.objects.filter(business=business, is_active=True)
        ],
        "body_types": [
            {"value": b.id, "label": b.name}
            for b in BodyType.objects.filter(business=business, is_active=True)
        ],
        "colors": [
            {"value": c.id, "label": c.name}
            for c in Color.objects.filter(business=business, is_active=True)
        ],
        "fuel_types": [
            {"value": f.id, "label": f.name}
            for f in FuelType.objects.filter(business=business, is_active=True)
        ],
        "doors": [
            {"value": d.id, "label": d.name}
            for d in DoorsChoice.objects.filter(business=business, is_active=True)
        ],
        "damage_types": [
            {"value": d.id, "label": d.name}
            for d in DamageType.objects.filter(business=business, is_active=True)
        ],
        "branches": [
            {"value": b.id, "label": b.name}
            for b in Branch.objects.filter(business=business, is_active=True)
        ],
        "key_numbers": [
            {"value": k.id, "label": str(k.number)}
            for k in KeyNumber.objects.filter(business=business, is_active=True)
        ],
    }


@vehicle_router.get("/vehicles/{vehicle_id}", response=VehicleListSchema)
def get_vehicle(request: HttpRequest, vehicle_id: int):
    """Get a single vehicle by internal_id"""
    vehicle = get_object_or_404(
        Vehicle, 
        internal_id=vehicle_id, 
        business=request.user.business
    )
    return vehicle


@vehicle_router.get("/makes/{make_id}/models")
def get_models_for_make(request: HttpRequest, make_id: int):
    """Get models for a specific make"""
    business = request.user.business
    
    # Validate the make belongs to this business
    make = get_object_or_404(Make, id=make_id, business=business)
    
    models = VehicleModel.objects.filter(
        make=make,
        business=business,
        is_active=True
    ).values_list('name', flat=True)
    
    return {"models": list(models)}


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def calculate_summary(queryset) -> dict:
    """Calculate financial summary for a vehicle queryset based on vehicle financial rules"""
    gross_revenue = Decimal("0")
    net_revenue = Decimal("0")
    gross_expenses = Decimal("0")
    net_expenses = Decimal("0")
    gross_profit = Decimal("0")
    net_profit = Decimal("0")
    total_vat_liability = Decimal("0")
    total_profit = Decimal("0")

    total_days = 0
    vehicles_with_days = 0

    vehicles = queryset.prefetch_related('expenses_earnings', 'buy_tax', 'sale_tax')

    for vehicle in vehicles:
        if vehicle.status == 'inactive':
            continue

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
        cogs = buy_net + net_exp_earn
        gross_cogs = buy_gross + net_exp_earn

        net_expenses += cogs
        gross_expenses += gross_cogs

        # Days on stock
        if vehicle.buy_date:
            end_date = vehicle.sale_date if vehicle.sale_date else date.today()
            days = (end_date - vehicle.buy_date).days
            if days >= 0:
                total_days += days
                vehicles_with_days += 1

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

    avg_days_on_stock = int(round(total_days / vehicles_with_days)) if vehicles_with_days > 0 else 0

    return {
        "total_count": 0,  # Set by caller
        "avg_days_on_stock": avg_days_on_stock,
        "net_total_revenue": float(net_revenue),
        "net_total_expenses": float(net_expenses),
        "net_difference": float(net_profit),
        "tax_total_revenue": 0.0,
        "tax_total_expenses": 0.0,
        "tax_difference": float(total_vat_liability),
        "gross_total_revenue": float(gross_revenue),
        "gross_total_expenses": float(gross_expenses),
        "gross_difference": float(gross_profit),
        "total_profit": float(total_profit),
    }


def get_empty_summary() -> dict:
    """Return empty summary for unauthenticated requests"""
    return {
        "total_count": 0,
        "avg_days_on_stock": 0,
        "net_total_revenue": 0.0,
        "net_total_expenses": 0.0,
        "net_difference": 0.0,
        "tax_total_revenue": 0.0,
        "tax_total_expenses": 0.0,
        "tax_difference": 0.0,
        "gross_total_revenue": 0.0,
        "gross_total_expenses": 0.0,
        "gross_difference": 0.0,
    }


def get_empty_filters() -> dict:
    """Return empty filters for unauthenticated requests"""
    return {
        "statuses": [],
        "makes": [],
        "vehicle_types": [],
        "body_types": [],
        "colors": [],
        "fuel_types": [],
        "doors": [],
        "damage_types": [],
        "branches": [],
        "key_numbers": [],
    }
