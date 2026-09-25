"""
Django Ninja Pydantic Schemas for Vehicle Management System API.

This module defines all request/response schemas for the API layer,
matching the Django models in manager/models.py.
"""

from ninja import Schema, Field
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal
from pydantic import field_validator, model_validator


# =============================================================================
# Vehicle Expense/Earning Schemas
# =============================================================================

class VehicleExpenseEarningOut(Schema):
    """Output schema for a single vehicle expense/earning entry."""
    id: int
    type: str  # 'expense' | 'earning'
    amount: Decimal
    category_id: int
    category_name: Optional[str] = None
    subcategory_id: int
    subcategory_name: Optional[str] = None
    created_at: Optional[datetime] = None


class VehicleExpenseEarningCreate(Schema):
    """Schema for creating a new vehicle expense/earning entry."""
    type: str = Field(..., pattern="^(expense|earning)$")
    amount: Decimal = Field(..., gt=0)
    category_id: int
    subcategory_id: int


# =============================================================================
# Choice Update Schema (for PATCH /choices/{type}/{id})
# =============================================================================

class ChoiceUpdatePayload(Schema):
    """Payload for updating a choice via PATCH. Accepts JSON body."""
    name: str
    percentage: Optional[float] = None
    vehicle_id: Optional[int] = None  # Only used for key_number type
    applies_to_buy: Optional[bool] = None
    applies_to_sale: Optional[bool] = None
    applies_to_transactions: Optional[bool] = None



# =============================================================================
# Base Choice Schemas (for dynamic dropdown options)
# =============================================================================

class ChoiceBase(Schema):
    """Base schema for simple choice models (name + id)"""
    id: int
    name: str


class PaymentMethodOut(Schema):
    """Payment method output schema with domain scoping flags"""
    id: int
    name: str
    applies_to_buy: bool = True
    applies_to_sale: bool = True
    applies_to_transactions: bool = True


class ChoiceCreate(Schema):
    """Schema for creating a new choice option"""
    name: str = Field(..., min_length=1, max_length=100)


class BranchOut(Schema):
    """Branch output schema"""
    id: int
    name: str
    address: str
    is_active: bool


class TaxPercentageOut(Schema):
    """Tax percentage with additional percentage field"""
    id: int
    name: str
    percentage: Decimal
    is_no_tax: bool


class TaxPercentageCreate(Schema):
    """Schema for creating a new tax percentage"""
    name: str = Field(..., min_length=1, max_length=100)
    percentage: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    is_no_tax: bool = False


class VehicleModelOut(Schema):
    """Vehicle model linked to a make"""
    id: int
    name: str
    make_id: int
    make_name: Optional[str] = None


class CityOut(Schema):
    """City linked to a country"""
    id: int
    name: str
    country_id: int
    country_name: Optional[str] = None


class VehicleModelCreate(Schema):
    """Schema for creating a vehicle model"""
    name: str = Field(..., min_length=1, max_length=100)
    make_id: int


class KeyNumberOut(Schema):
    """Key number for vehicle dropdown"""
    id: int
    name: str


class CategoryOut(Schema):
    """Transaction category"""
    id: int
    name: str


class SubcategoryOut(Schema):
    """Transaction subcategory"""
    id: int
    name: str
    category_id: int


class CurrencyOut(Schema):
    """Currency option"""
    id: int
    name: str
    code: str


# =============================================================================
# Legal Entity Schemas
# =============================================================================

class LegalEntityBase(Schema):
    """Base legal entity fields"""
    name: str
    type: str = "individual"
    address_street: Optional[str] = None
    address_street_number: Optional[str] = None
    address_postal_code: Optional[str] = None
    address_city_id: Optional[int] = None
    address_country_id: Optional[int] = None
    email: Optional[str] = None
    phone_number: Optional[str] = None
    tax_identification_number: Optional[str] = None


class LegalEntityOut(Schema):
    """Legal entity output schema"""
    id: int
    internal_id: int
    name: str
    type: str
    address_street: Optional[str] = None
    address_street_number: Optional[int] = None  # Model uses PositiveIntegerField
    address_postal_code: Optional[str] = None
    address_city_id: Optional[int] = None
    address_city_name: Optional[str] = None
    address_country_id: Optional[int] = None
    address_country_name: Optional[str] = None
    email: Optional[str] = None
    phone_number: Optional[str] = None
    tax_identification_number: Optional[str] = None
    
    @staticmethod
    def resolve_type(obj):
        return obj.type if hasattr(obj, 'type') else 'individual'


class LegalEntityCreate(Schema):
    """Schema for creating a new legal entity"""
    name: str = Field(..., min_length=1, max_length=200)
    type: str = Field(default="individual", pattern="^(individual|company)$")
    address_street: str = Field(..., min_length=1)
    address_street_number: str = Field(..., min_length=1)
    address_postal_code: str = Field(..., min_length=1)
    address_city_id: Optional[int] = None
    address_country_id: Optional[int] = None
    email: Optional[str] = None
    phone_number: Optional[str] = None
    tax_identification_number: Optional[str] = None
    
    @model_validator(mode='after')
    def validate_tax_id_for_company(self):
        """Companies must have a tax identification number"""
        if self.type == 'company' and not self.tax_identification_number:
            raise ValueError('Tax identification number is required for companies')
        return self


class LegalEntityListOut(Schema):
    """Legal entity output schema for list view with status"""
    id: int
    internal_id: int
    name: str
    type: str
    status: str
    address_street: Optional[str] = None
    address_street_number: Optional[int] = None
    address_postal_code: Optional[str] = None
    address_city_id: Optional[int] = None
    address_city_name: Optional[str] = None
    address_country_id: Optional[int] = None
    address_country_name: Optional[str] = None
    email: Optional[str] = None
    phone_number: Optional[str] = None
    tax_identification_number: Optional[str] = None


class LegalEntityUpdate(Schema):
    """Schema for updating a legal entity - all fields optional"""
    name: Optional[str] = Field(default=None, max_length=200)
    type: Optional[str] = Field(default=None, pattern="^(individual|company)$")
    address_street: Optional[str] = None
    address_street_number: Optional[str] = None
    address_postal_code: Optional[str] = None
    address_city_id: Optional[int] = None
    address_country_id: Optional[int] = None
    email: Optional[str] = None
    phone_number: Optional[str] = None
    tax_identification_number: Optional[str] = None
    
    @model_validator(mode='after')
    def validate_tax_id_for_company(self):
        """If type is company, tax ID must be provided"""
        if self.type == 'company' and self.tax_identification_number == '':
            raise ValueError('Tax identification number is required for companies')
        return self


class LegalEntityFilters(Schema):
    """Query parameters for filtering legal entities"""
    search: Optional[str] = None
    type: Optional[str] = Field(default=None, pattern="^(individual|company)$")
    status: Optional[str] = Field(default=None, pattern="^(active|inactive)$")
    country_id: Optional[int] = None
    city_id: Optional[int] = None
    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=20, ge=1, le=10000)
    sort: Optional[str] = Field(default="name", pattern="^(name|internal_id|type|address_city|status)$")
    order: Optional[str] = Field(default="asc", pattern="^(asc|desc)$")


class LegalEntitiesListResponse(Schema):
    """Paginated response for legal entities list"""
    items: List[LegalEntityListOut]
    total: int
    page: int
    per_page: int
    pages: int


# =============================================================================
# Vehicle Schemas
# =============================================================================

class VehicleListOut(Schema):
    """
    Lightweight schema for vehicle list table.
    Only includes fields needed for the table display.
    """
    id: int
    internal_id: Optional[int] = None
    status: Optional[str] = None
    status_display: Optional[str] = None
    
    # Vehicle identification
    make_name: Optional[str] = None
    model_name: Optional[str] = None
    body_type_name: Optional[str] = None
    color_name: Optional[str] = None
    
    # Technical specs
    year_of_construction: Optional[int] = None
    kilometer: Optional[int] = None
    power_kw: Optional[int] = None
    fuel_type_name: Optional[str] = None
    
    # Pricing
    buy_price: Optional[Decimal] = None
    buy_price_net: Optional[Decimal] = None
    sale_price: Optional[Decimal] = None
    sale_price_net: Optional[Decimal] = None
    
    # Dates
    buy_date: Optional[date] = None
    sale_date: Optional[date] = None
    active_for: int = 0
    
    # Official details
    chassis_number: Optional[str] = None
    official_license_plate: Optional[str] = None
    sale_invoice_number: Optional[str] = None
    
    # Image
    image_url: Optional[str] = None
    
    # Additional fields for VehicleCard
    branch_name: Optional[str] = None
    doors_name: Optional[str] = None
    vehicle_type_name: Optional[str] = None
    damage_type_name: Optional[str] = None
    motor_vehicle_registration_number: Optional[str] = None
    internal_comments: Optional[str] = None
    
    # Contract availability flags
    can_generate_buy_contract: bool = False
    can_generate_sale_contract: bool = False


class VehicleDetailOut(Schema):
    """
    Full vehicle details for edit form.
    Includes all fields and computed properties.
    """
    id: int
    internal_id: Optional[int] = None
    status: Optional[str] = None
    status_display: Optional[str] = None
    description: Optional[str] = None
    internal_comments: Optional[str] = None
    
    # Branch
    branch_id: Optional[int] = None
    branch_name: Optional[str] = None
    
    # Official details
    chassis_number: Optional[str] = None
    motor_vehicle_registration_number: Optional[str] = None
    official_license_plate: Optional[str] = None
    
    # Usage details
    damage_type_id: Optional[int] = None
    damage_type_name: Optional[str] = None
    first_registration_date: Optional[date] = None
    year_of_construction: Optional[int] = None
    kilometer: Optional[int] = None
    
    # Vehicle details (FK IDs for form binding)
    vehicle_type_id: Optional[int] = None
    vehicle_type_name: Optional[str] = None
    body_type_id: Optional[int] = None
    body_type_name: Optional[str] = None
    make_id: Optional[int] = None
    make_name: Optional[str] = None
    model_id: Optional[int] = None
    model_name: Optional[str] = None
    color_id: Optional[int] = None
    color_name: Optional[str] = None
    doors_id: Optional[int] = None
    doors_name: Optional[str] = None
    fuel_type_id: Optional[int] = None
    fuel_type_name: Optional[str] = None
    power_kw: Optional[int] = None
    
    # Buy details
    buy_price: Optional[Decimal] = None
    buy_tax_id: Optional[int] = None
    buy_tax_name: Optional[str] = None
    buy_tax_percentage: Optional[Decimal] = None
    buy_date: Optional[date] = None
    buy_delivery_collection_date: Optional[date] = None
    buy_payment_method_id: Optional[int] = None
    buy_payment_method_name: Optional[str] = None
    seller_id: Optional[int] = None
    seller_name: Optional[str] = None
    
    # Sale details
    sale_price: Optional[Decimal] = None
    sale_tax_id: Optional[int] = None
    sale_tax_name: Optional[str] = None
    sale_tax_percentage: Optional[Decimal] = None
    sale_date: Optional[date] = None
    sale_delivery_collection_date: Optional[date] = None
    sale_payment_method_id: Optional[int] = None
    sale_payment_method_name: Optional[str] = None
    buyer_id: Optional[int] = None
    buyer_name: Optional[str] = None
    sale_invoice_number: Optional[str] = None
    
    # Computed properties
    active_for: int = 0
    buy_price_net: Optional[Decimal] = None
    sale_price_net: Optional[Decimal] = None
    buy_price_after_tax: Optional[Decimal] = None
    sale_price_after_tax: Optional[Decimal] = None
    
    # Financial summary from transactions
    total_revenue: Decimal = Decimal("0")
    total_expenses: Decimal = Decimal("0")
    net_profit: Decimal = Decimal("0")
    
    # Image
    image_url: Optional[str] = None
    
    # Metadata
    date_created: Optional[datetime] = None
    
    # Navigation IDs (for prev/next navigation)
    prev_vehicle_internal_id: Optional[int] = None
    next_vehicle_internal_id: Optional[int] = None

    # Key Number
    key_number_id: Optional[int] = None
    key_number_value: Optional[int] = None

    # Contract availability flags
    can_generate_buy_contract: bool = False
    can_generate_sale_contract: bool = False
    
    # Pipeline availability
    can_move_to: List[str] = Field(default_factory=list)

    # Expenses/Earnings entries
    expenses_earnings: List[VehicleExpenseEarningOut] = Field(default_factory=list)


class VehicleCreate(Schema):
    """
    Schema for creating a new vehicle.
    Matches the required fields from the frontend VehicleForm.
    """
    # Branch (required)
    branch_id: int
    
    # Vehicle details (required)
    vehicle_type_id: int
    body_type_id: int
    make_id: int
    model_id: Optional[int] = None  # Optional during transition, will use model FK
    color_id: int
    doors_id: int
    fuel_type_id: int
    power_kw: int = Field(..., gt=0)
    
    # Usage details
    damage_type_id: int
    first_registration_date: Optional[date] = None  # Optional - no asterisk in UI
    year_of_construction: int = Field(..., ge=1900, le=2100)
    kilometer: int = Field(..., ge=0)
    
    # Official details
    chassis_number: str = Field(..., min_length=1, max_length=17)
    motor_vehicle_registration_number: Optional[str] = Field(None, max_length=15)  # Optional in UI
    official_license_plate: Optional[str] = Field(None, max_length=15)  # Optional in UI
    
    # Buy details (required)
    buy_price: Decimal = Field(..., ge=0)
    buy_date: date
    buy_payment_method_id: int
    seller_id: int
    
    # Buy details (optional)
    buy_tax_id: Optional[int] = None
    buy_delivery_collection_date: Optional[date] = None
    
    # Optional fields
    description: Optional[str] = None
    internal_comments: Optional[str] = None
    key_number_id: int


    
    @field_validator('chassis_number')
    @classmethod
    def validate_vin(cls, v: str) -> str:
        """Validate VIN format: 17 alphanumeric chars, excluding I, O, Q"""
        import re
        v = v.upper().strip()
        if not re.match(r'^[A-HJ-NPR-Z0-9]{17}$', v):
            raise ValueError(
                'Enter a valid 17-character VIN (excluding I, O, and Q)'
            )
        return v


class VehicleUpdate(Schema):
    """
    Schema for updating a vehicle.
    All fields are optional - only provided fields will be updated.
    """
    status: Optional[str] = Field(
        default=None, 
        pattern="^(purchased|ready_for_sale|reserved|sold|inactive)$"
    )
    description: Optional[str] = None
    internal_comments: Optional[str] = None
    branch_id: Optional[int] = None
    key_number_id: Optional[int] = None
    
    # Official details
    chassis_number: Optional[str] = Field(default=None, max_length=17)
    motor_vehicle_registration_number: Optional[str] = Field(default=None, max_length=15)
    official_license_plate: Optional[str] = Field(default=None, max_length=15)
    
    # Usage details
    damage_type_id: Optional[int] = None
    first_registration_date: Optional[date] = None
    year_of_construction: Optional[int] = Field(default=None, ge=1900, le=2100)
    kilometer: Optional[int] = Field(default=None, ge=0)
    
    # Vehicle details
    vehicle_type_id: Optional[int] = None
    body_type_id: Optional[int] = None
    make_id: Optional[int] = None
    model_id: Optional[int] = None
    color_id: Optional[int] = None
    doors_id: Optional[int] = None
    fuel_type_id: Optional[int] = None
    power_kw: Optional[int] = Field(default=None, gt=0)
    
    # Buy details
    buy_price: Optional[Decimal] = Field(default=None, ge=0)
    buy_tax_id: Optional[int] = None
    buy_date: Optional[date] = None
    buy_delivery_collection_date: Optional[date] = None
    buy_payment_method_id: Optional[int] = None
    seller_id: Optional[int] = None
    
    # Sale details
    sale_price: Optional[Decimal] = Field(default=None, ge=0)
    sale_tax_id: Optional[int] = None
    sale_date: Optional[date] = None
    sale_delivery_collection_date: Optional[date] = None
    sale_payment_method_id: Optional[int] = None
    buyer_id: Optional[int] = None

    # Key Number
    key_number_id: Optional[int] = None


# =============================================================================
# Filter & Query Schemas
# =============================================================================

class VehicleFilters(Schema):
    """
    Query parameters for filtering vehicles.
    Matches all filter options from vehicles.html
    """
    # General search
    search: Optional[str] = None
    
    # Quick search
    vehicle_id_search: Optional[int] = None
    chassis_number_search: Optional[str] = None
    motor_vehicle_registration_search: Optional[str] = None
    official_license_plate_search: Optional[str] = None
    sale_invoice_number_search: Optional[str] = None
    
    # Vehicle details (FK IDs)
    status: Optional[str] = Field(
        default=None,
        pattern="^(purchased|ready_for_sale|reserved|sold|inactive)$"
    )
    make: Optional[int] = None
    model: Optional[int] = None
    branch: Optional[int] = None
    vehicle_type: Optional[int] = None
    body_type: Optional[int] = None
    doors: Optional[int] = None
    fuel_type: Optional[int] = None
    color: Optional[int] = None
    damage_type: Optional[int] = None
    
    # Price ranges
    min_buy_price: Optional[Decimal] = Field(default=None, ge=0)
    max_buy_price: Optional[Decimal] = Field(default=None, ge=0)
    specific_buy_price: Optional[Decimal] = Field(default=None, ge=0)
    min_sale_price: Optional[Decimal] = Field(default=None, ge=0)
    max_sale_price: Optional[Decimal] = Field(default=None, ge=0)
    specific_sale_price: Optional[Decimal] = Field(default=None, ge=0)
    
    # Date ranges
    min_buy_date: Optional[date] = None
    max_buy_date: Optional[date] = None
    min_sale_date: Optional[date] = None
    max_sale_date: Optional[date] = None
    
    # Technical specs
    min_year: Optional[int] = Field(default=None, ge=1900)
    max_year: Optional[int] = Field(default=None, le=2100)
    min_kilometer: Optional[int] = Field(default=None, ge=0)
    max_kilometer: Optional[int] = Field(default=None, ge=0)
    min_power_kw: Optional[int] = Field(default=None, ge=0)
    max_power_kw: Optional[int] = Field(default=None, ge=0)
    
    # Sorting
    sort: Optional[str] = Field(
        default="internal_id",
        pattern="^(internal_id|status|make|buy_price|sale_price|buy_date|sale_date|kilometer|year_of_construction)$"
    )
    order: Optional[str] = Field(default="desc", pattern="^(asc|desc)$")
    
    # Pagination
    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=20, ge=1, le=10000)


# =============================================================================
# Response Wrapper Schemas
# =============================================================================

class PaginatedResponse(Schema):
    """Generic pagination wrapper"""
    total: int
    page: int
    per_page: int
    pages: int


class PaginatedVehicles(PaginatedResponse):
    """Paginated vehicle list response"""
    items: List[VehicleListOut]


class FinancialSummary(Schema):
    """
    Financial summary for the vehicles table header.
    Matches the calculations in vehicles.html
    """
    # Net values (price before tax)
    net_total_revenue: Decimal = Decimal("0")
    net_total_expenses: Decimal = Decimal("0")
    net_difference: Decimal = Decimal("0")
    
    # Tax amounts
    tax_total_revenue: Decimal = Decimal("0")
    tax_total_expenses: Decimal = Decimal("0")
    tax_difference: Decimal = Decimal("0")
    
    # Gross values (price including tax)
    gross_total_revenue: Decimal = Decimal("0")
    gross_total_expenses: Decimal = Decimal("0")
    gross_difference: Decimal = Decimal("0")

    # Additional fields
    avg_days_on_stock: Optional[Decimal] = None
    avg_roi: Optional[Decimal] = None
    avg_profit_margin: Optional[Decimal] = None
    total_profit: Optional[Decimal] = None


class AllChoices(Schema):
    """
    All dynamic choices for populating form dropdowns.
    Fetched once when the form loads.
    """
    branches: List[BranchOut]
    vehicle_types: List[ChoiceBase]
    body_types: List[ChoiceBase]
    makes: List[ChoiceBase]
    colors: List[ChoiceBase]
    fuel_types: List[ChoiceBase]
    damage_types: List[ChoiceBase]
    doors: List[ChoiceBase]
    payment_methods: List[PaymentMethodOut]
    tax_percentages: List[TaxPercentageOut]
    legal_entities: List[LegalEntityOut]
    categories: List[CategoryOut] = []
    subcategories: List[SubcategoryOut] = []
    currencies: List[CurrencyOut] = []
    countries: List[ChoiceBase] = []
    cities: List[CityOut] = []
    
    # Key numbers (unassigned only)
    key_numbers: List[KeyNumberOut] = []
    
    # Status choices (static)
    status_choices: List[dict] = [
        {"value": "purchased", "label": "Purchased"},
        {"value": "ready_for_sale", "label": "Ready for Sale"},
        {"value": "reserved", "label": "Reserved"},
        {"value": "sold", "label": "Sold"},
        {"value": "inactive", "label": "Inactive"},
    ]
    
    # Year choices for construction year dropdown
    year_choices: List[int] = []


class VehiclesResponse(Schema):
    """
    Combined response for vehicles list page.
    Includes both vehicles and financial summary.
    """
    vehicles: PaginatedVehicles
    financial_summary: FinancialSummary


# =============================================================================
# Error Response Schemas
# =============================================================================

class ErrorDetail(Schema):
    """Single validation error"""
    field: str
    message: str


class ErrorResponse(Schema):
    """API error response"""
    detail: str
    errors: Optional[List[ErrorDetail]] = None


class SuccessResponse(Schema):
    """Generic success response"""
    success: bool = True
    message: Optional[str] = None
    id: Optional[int] = None
    action: Optional[str] = None


class LinkedItemSchema(Schema):
    type: str
    id: int
    title: str
    subtitle: Optional[str] = None
    url_path: Optional[str] = None


class DeleteCheckResponse(Schema):
    """Response schema for pre-flight delete dependency check"""
    can_hard_delete: bool
    action: str
    entity_name: str
    dependencies_count: int
    dependency_details: List[str] = []
    recent_items: List[str] = []
    linked_items: List[LinkedItemSchema] = []
    message: str


# =============================================================================
# Choice Creation Response
# =============================================================================

class ChoiceCreatedResponse(Schema):
    """Response after creating a new choice"""
    success: bool = True
    id: int
    name: str
    message: Optional[str] = None
    applies_to_buy: Optional[bool] = None
    applies_to_sale: Optional[bool] = None
    applies_to_transactions: Optional[bool] = None
