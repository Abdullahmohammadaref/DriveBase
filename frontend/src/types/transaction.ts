/**
 * TypeScript types for Transaction API
 * These mirror the Pydantic schemas from transaction_schemas.py
 */

// =============================================================================
// Transaction Types
// =============================================================================

export interface TransactionListItem {
    id: number
    internal_id: number | null
    status: string | null
    status_display: string | null

    // Transaction info
    category: string | null
    category_display: string | null
    subcategory: string | null

    // Amount & currency (Decimal from API comes as string)
    amount: string | number | null
    currency: string | null
    tax: string | number | null

    // Date & method
    date: string | null
    method: string | null
    method_display: string | null
    payment_method_id?: number | null
    from_or_to: string | null

    // Vehicle info
    vehicle_id: number | null
    vehicle_internal_id: number | null
    vehicle_display: string | null

    // Contract availability
    can_generate_pdf: boolean
}

export interface TransactionDetail extends TransactionListItem {
    description: string | null
    internal_comments: string | null
    datetime: string | null

    // Computed price breakdown
    net_amount: number | null
    tax_amount: number | null

    // Navigation
    prev_transaction_internal_id: number | null
    next_transaction_internal_id: number | null
    prev_review_required_internal_id: number | null
    next_review_required_internal_id: number | null
}

// =============================================================================
// Form Data Types
// =============================================================================

export interface TransactionFormData {
    category?: string
    subcategory?: string
    vehicle_id?: number | null
    amount?: number  // Made optional to support empty state
    currency: string
    tax?: number
    date: string
    method: string
    payment_method_id?: number | null
    from_or_to: string
    description?: string
    internal_comments?: string
    // NOTE: status is auto-computed by backend — not sent from client
}

export interface TransactionUpdateData {
    // NOTE: status is auto-computed by backend — not sent from client
    category?: string
    subcategory?: string
    vehicle_id?: number | null
    amount?: number
    currency?: string
    tax?: number
    date?: string
    method?: string
    payment_method_id?: number | null
    from_or_to?: string
    description?: string
    internal_comments?: string
}

// =============================================================================
// Pagination & Response Types
// =============================================================================

export interface PaginatedTransactions {
    items: TransactionListItem[]
    total: number
    page: number
    per_page: number
    pages: number
}

export interface TransactionFinancialSummary {
    net_total_revenue: string | number
    net_total_expenses: string | number
    net_difference: string | number
    tax_total_revenue: string | number
    tax_total_expenses: string | number
    tax_difference: string | number
    gross_total_revenue: string | number
    gross_total_expenses: string | number
    gross_difference: string | number
}

export interface TransactionsResponse {
    transactions: PaginatedTransactions
    financial_summary: TransactionFinancialSummary
}

// =============================================================================
// Filter Types
// =============================================================================

export interface TransactionFilters {
    // General search
    search?: string

    // Quick search
    internal_id?: number

    // Transaction details filters
    status?: string
    category?: string
    subcategory?: string
    currency?: string
    method?: string
    payment_method_id?: number | null
    vehicle?: number

    // Amount range
    min_amount?: number
    max_amount?: number

    // Date range
    min_date?: string
    max_date?: string

    // Sorting
    sort?: string
    order?: "asc" | "desc"

    // Pagination
    page?: number
    per_page?: number
}

// =============================================================================
// Choice Types (for dropdowns)
// =============================================================================

export interface StatusChoice {
    value: string
    label: string
}

export interface VehicleChoice {
    value: number
    label: string
}

export interface TransactionChoices {
    status_choices: StatusChoice[]
    category_choices: StatusChoice[]
    method_choices: StatusChoice[]
    currency_choices: StatusChoice[]
    vehicle_choices: VehicleChoice[]
}

export interface SubcategoryChoice {
    id: number
    name: string
}

export interface SubcategoriesResponse {
    subcategories: SubcategoryChoice[]
}
