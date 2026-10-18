/**
 * TypeScript types matching backend schemas.py
 * These should mirror the Pydantic schemas from the Django API
 */

// =============================================================================
// Vehicle Expense/Earning Types
// =============================================================================

export interface VehicleExpenseEarning {
    id: number
    type: 'expense' | 'earning'
    amount: number
    category_id: number
    category_name: string | null
    subcategory_id: number
    subcategory_name: string | null
    created_at: string | null
}

// =============================================================================
// Vehicle Types
// =============================================================================

export interface VehicleListItem {
    id: number
    internal_id: number | null
    status: string | null
    status_display: string | null
    make_name: string | null
    model_name: string | null
    body_type_name: string | null
    color_name: string | null
    year_of_construction: number | null
    kilometer: number | null
    power_kw: number | null
    fuel_type_name: string | null
    doors_name: string | null
    vehicle_type_name: string | null
    damage_type_name: string | null
    branch_name: string | null
    buy_price: number | null
    buy_price_net: number | null
    sale_price: number | null
    sale_price_net: number | null
    buy_date: string | null
    sale_date: string | null
    active_for: number
    chassis_number: string | null
    motor_vehicle_registration_number: string | null
    official_license_plate: string | null
    sale_invoice_number: string | null
    image_url: string | null
    internal_comments: string | null
    key_number_id?: number | null
    key_number_value?: number | null

    // Contract availability flags
    can_generate_buy_contract: boolean
    can_generate_sale_contract: boolean

    // Pipeline
    can_move_to: string[]

    // mobile.de Marketplace
    mobile_de_status?: string | null
    mobile_de_ad_id?: string | null
    mobile_de_url?: string | null
    mobile_de_detail_views?: number
    mobile_de_search_hits?: number
    mobile_de_parkings?: number
    mobile_de_leads_count?: number
    mobile_de_price_rating?: string | null
}

export interface VehicleDetail extends VehicleListItem {
    description: string | null
    internal_comments: string | null
    branch_id: number | null
    branch_name: string | null
    motor_vehicle_registration_number: string | null
    damage_type_id: number | null
    damage_type_name: string | null
    first_registration_date: string | null
    vehicle_type_id: number | null
    vehicle_type_name: string | null
    body_type_id: number | null
    make_id: number | null
    make_name: string | null
    model_id: number | null
    model_name: string | null
    color_id: number | null
    doors_id: number | null
    doors_name: string | null
    fuel_type_id: number | null
    buy_tax_id: number | null
    buy_tax_name: string | null
    buy_tax_percentage: number | null
    buy_delivery_collection_date: string | null
    buy_payment_method_id: number | null
    buy_payment_method_name: string | null
    seller_id: number | null
    seller_name: string | null
    sale_tax_id: number | null
    sale_tax_name: string | null
    sale_tax_percentage: number | null
    sale_delivery_collection_date: string | null
    sale_payment_method_id: number | null
    sale_payment_method_name: string | null
    buyer_id: number | null
    buyer_name: string | null
    buy_price_after_tax: number | null
    sale_price_after_tax: number | null
    total_revenue: number
    total_expenses: number
    net_profit: number
    date_created: string | null

    // Navigation
    prev_vehicle_internal_id: number | null
    next_vehicle_internal_id: number | null

    // Expenses/Earnings
    expenses_earnings: VehicleExpenseEarning[]
}

// =============================================================================
// Pagination & Response Types
// =============================================================================

export interface PaginatedVehicles {
    items: VehicleListItem[]
    total: number
    page: number
    per_page: number
    pages: number
}

export interface FinancialSummary {
    avg_days_on_stock: number
    net_total_revenue: number
    net_total_expenses: number
    net_difference: number
    tax_total_revenue: number
    tax_total_expenses: number
    tax_difference: number
    gross_total_revenue: number
    gross_total_expenses: number
    gross_difference: number
    total_profit?: number
}

// Response from vehicle API (matches Django API format)
export interface VehiclesResponse {
    vehicles: PaginatedVehicles
    financial_summary: FinancialSummary
}

// =============================================================================
// Filter Types
// =============================================================================

export interface VehicleFilters {
    // General search
    search?: string

    // Quick search
    vehicle_id_search?: number
    chassis_number_search?: string
    motor_vehicle_registration_search?: string
    official_license_plate_search?: string
    sale_invoice_number_search?: string

    // Vehicle details
    status?: string
    make?: number
    model?: number
    branch?: number
    vehicle_type?: number
    body_type?: number
    doors?: number
    fuel_type?: number
    color?: number
    damage_type?: number
    key_number?: number

    // Price ranges
    min_buy_price?: number
    max_buy_price?: number
    specific_buy_price?: number
    min_sale_price?: number
    max_sale_price?: number
    specific_sale_price?: number

    // Date ranges
    min_buy_date?: string
    max_buy_date?: string
    min_sale_date?: string
    max_sale_date?: string

    // Technical specs
    min_year?: number
    max_year?: number
    min_kilometer?: number
    max_kilometer?: number
    min_power_kw?: number
    max_power_kw?: number

    // Sorting
    sort?: string
    order?: "asc" | "desc"

    // Pagination
    page?: number
    per_page?: number

    // Marketplace
    listed_on_mobile_de?: string
}

// =============================================================================
// Choice Types (for dropdowns)
// =============================================================================

export interface Choice {
    id: number
    name: string
    mobile_de_mapping?: string | null
    is_protected?: boolean
    vehicle_classes?: string[]
}

export interface KeyNumber extends Choice {}

export interface TaxPercentage extends Choice {
    percentage: number
    is_no_tax: boolean
}

export interface PaymentMethodChoice extends Choice {
    applies_to_buy?: boolean
    applies_to_sale?: boolean
    applies_to_transactions?: boolean
}

export interface Branch extends Choice {
    address: string
    is_active: boolean
}

export interface LegalEntity {
    id: number
    internal_id: number
    name: string
    type: string
    address_street: string | null
    address_street_number: string | null
    address_postal_code: string | null
    address_city_id: number | null
    address_country_id: number | null
    address_city_name: string | null
    address_country_name: string | null
    email: string | null
    phone_number: string | null
    tax_identification_number: string | null
}

export interface StatusChoice {
    value: string
    label: string
}

export interface AllChoices {
    branches: Branch[]
    vehicle_types: Choice[]
    body_types: Choice[]
    makes: Choice[]
    colors: Choice[]
    fuel_types: Choice[]
    damage_types: Choice[]
    doors: Choice[]
    payment_methods: PaymentMethodChoice[]
    tax_percentages: TaxPercentage[]
    legal_entities: LegalEntity[]
    categories: Choice[]
    subcategories: (Choice & { category_id: number })[]
    currencies: Choice[]
    countries: Choice[]
    cities: (Choice & { country_id: number })[]
    key_numbers: KeyNumber[]
    status_choices: StatusChoice[]
    year_choices: number[]
}

// =============================================================================
// mobile.de Marketplace Types
// =============================================================================

export interface VehicleGalleryImage {
    id: number
    image_url: string
    order: number
    uploaded_at: string
}

export interface MobileDeListingDetail {
    internal_id: number
    status: string | null
    mobile_de_status: string
    mobile_de_ad_id: string | null
    mobile_de_url: string | null
    mobile_de_last_synced_at: string | null
    mobile_de_last_error: string | null

    make_name: string | null
    model_name: string | null
    body_type_name: string | null
    vehicle_type_name?: string | null
    vehicle_class?: string | null
    kilometer: number | null
    first_registration_date: string | null
    year_of_construction: number | null
    color_name: string | null
    doors_name: string | null
    fuel_type_name: string | null
    power_kw: number | null
    sale_price: number | null
    sale_tax_percentage: number | null

    transmission: string | null
    condition: string | null
    hu_date: string | null
    features: string[]

    emission_class: string | null
    emission_badge: string | null
    fuel_consumption_combined: number | null
    co2_emission_combined: number | null
    efficiency_class: string | null

    mobile_de_description: string | null

    primary_image_url: string | null
    gallery_images: VehicleGalleryImage[]

    detail_views: number
    search_hits: number
    parkings: number
    leads_count: number
    price_rating: string | null
    stats_updated_at: string | null
    mapping_issues?: MappingIssue[]
}

export interface MappingIssue {
    field: string
    name: string | null
    message: string
}

export interface MobileDePublishPayload {
    sale_price?: number
    kilometer?: number
    transmission: string
    condition: string
    hu_date?: string | null
    features: string[]
    emission_class?: string | null
    emission_badge?: string | null
    fuel_consumption_combined?: number | null
    co2_emission_combined?: number | null
    efficiency_class?: string | null
    mobile_de_description?: string | null
}

