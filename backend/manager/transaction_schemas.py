"""
Django Ninja Pydantic Schemas for Transaction API.

This module defines request/response schemas for transaction endpoints,
matching the Transaction model in manager/models.py.
"""

from ninja import Schema, Field
from typing import Optional, List, Union
from datetime import date as DateType  # Alias to avoid collision with field name 'date'
from decimal import Decimal


# =============================================================================
# Transaction Schemas
# =============================================================================

class TransactionListItem(Schema):
    """
    Lightweight schema for transaction list table.
    Only includes fields needed for the table display.
    """
    id: int
    internal_id: Optional[int] = None
    status: Optional[str] = None
    status_display: Optional[str] = None
    
    # Transaction info
    category: Optional[str] = None
    category_display: Optional[str] = None
    subcategory: Optional[str] = None
    
    # Amount & currency
    amount: Optional[Decimal] = None
    currency: Optional[str] = None
    tax: Optional[Decimal] = None
    
    # Date & method
    date: Optional[DateType] = None
    method: Optional[str] = None
    method_display: Optional[str] = None
    payment_method_id: Optional[int] = None
    from_or_to: Optional[str] = None
    
    # Vehicle info
    vehicle_id: Optional[int] = None
    vehicle_internal_id: Optional[int] = None
    vehicle_display: Optional[str] = None
    
    # Contract availability
    can_generate_pdf: bool = False


class TransactionDetail(Schema):
    """
    Full transaction details for edit form.
    Includes all fields and computed properties.
    """
    id: int
    internal_id: Optional[int] = None
    status: Optional[str] = None
    status_display: Optional[str] = None
    
    # Transaction details
    category: Optional[str] = None
    category_display: Optional[str] = None
    subcategory: Optional[str] = None
    description: Optional[str] = None
    internal_comments: Optional[str] = None
    
    # Amount & currency
    amount: Optional[Decimal] = None
    currency: Optional[str] = None
    tax: Optional[Decimal] = None
    
    # Date & method
    date: Optional[DateType] = None
    datetime: Optional[str] = None
    method: Optional[str] = None
    method_display: Optional[str] = None
    payment_method_id: Optional[int] = None
    from_or_to: Optional[str] = None
    
    # Vehicle info
    vehicle_id: Optional[int] = None
    vehicle_internal_id: Optional[int] = None
    vehicle_display: Optional[str] = None
    
    # Computed price breakdown
    net_amount: Optional[Decimal] = None
    tax_amount: Optional[Decimal] = None
    
    # Navigation
    prev_transaction_internal_id: Optional[int] = None
    next_transaction_internal_id: Optional[int] = None
    prev_review_required_internal_id: Optional[int] = None
    next_review_required_internal_id: Optional[int] = None


class TransactionCreate(Schema):
    """
    Schema for creating a new transaction.
    """
    # Transaction details
    category: Optional[str] = None
    subcategory: Optional[str] = None
    vehicle_id: Optional[int] = None
    
    # Amount & currency (required)
    amount: Decimal = Field(..., description="Transaction amount (positive for revenue, negative for expenses)")
    currency: str = Field(default="EUR")
    tax: Optional[Decimal] = Field(default=None, ge=0, le=100, description="Tax percentage")
    
    # Date & method (required)
    date: DateType
    method: Optional[str] = None
    payment_method_id: Optional[int] = None
    from_or_to: str = Field(..., min_length=1, description="Sender or recipient name")
    
    # Optional fields
    description: Optional[str] = None
    internal_comments: Optional[str] = None
    # NOTE: status is auto-computed in Transaction.save() — not accepted from client


class TransactionUpdate(Schema):
    """
    Schema for updating a transaction.
    All fields are optional - only provided fields will be updated.
    NOTE: 'status' is NOT here — it is auto-computed in Transaction.save()
    based on whether category, subcategory, and tax are all set.
    """
    category: Optional[str] = None
    subcategory: Optional[str] = None
    vehicle_id: Optional[int] = None
    
    amount: Optional[Decimal] = None
    currency: Optional[str] = None
    tax: Optional[Decimal] = Field(default=None, ge=0, le=100)
    
    date: Optional[DateType] = None
    method: Optional[str] = None
    payment_method_id: Optional[int] = None
    from_or_to: Optional[str] = None
    
    description: Optional[str] = None
    internal_comments: Optional[str] = None
    status: Optional[str] = Field(default=None, pattern="^(confirmed|review_required|inactive)$")


class TransactionStatusUpdate(Schema):
    """Schema for updating only transaction status"""
    status: str = Field(pattern="^(confirmed|review_required|inactive)$")


# =============================================================================
# Filter & Query Schemas
# =============================================================================

class TransactionFilters(Schema):
    """
    Query parameters for filtering transactions.
    Matches all filter options from transactions.html
    """
    # General search
    search: Optional[str] = None

    # Quick search
    internal_id: Optional[int] = None
    
    # Transaction details filters
    status: Optional[str] = Field(default=None, pattern="^(confirmed|review_required|inactive)$")
    category: Optional[str] = None
    subcategory: Optional[str] = None
    currency: Optional[str] = None
    method: Optional[str] = None
    vehicle: Optional[int] = None
    
    # Amount range
    min_amount: Optional[Decimal] = None
    max_amount: Optional[Decimal] = None
    
    # Date range
    min_date: Optional[DateType] = None
    max_date: Optional[DateType] = None
    
    # Sorting
    sort: Optional[str] = Field(
        default="internal_id",
        pattern="^(internal_id|status|category|subcategory|amount|date|method|vehicle)$"
    )
    order: Optional[str] = Field(default="desc", pattern="^(asc|desc)$")
    
    # Pagination
    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=20, ge=1, le=10000)


# =============================================================================
# Response Schemas
# =============================================================================

class PaginatedTransactions(Schema):
    """Paginated transaction list response"""
    total: int
    page: int
    per_page: int
    pages: int
    items: List[TransactionListItem]


class TransactionFinancialSummary(Schema):
    """
    Financial summary for the transactions table header.
    Shows Net, Tax, and Gross breakdown.
    """
    # Net values (amount before tax)
    net_total_revenue: Decimal = Decimal("0")
    net_total_expenses: Decimal = Decimal("0")
    net_difference: Decimal = Decimal("0")
    
    # Tax amounts
    tax_total_revenue: Decimal = Decimal("0")
    tax_total_expenses: Decimal = Decimal("0")
    tax_difference: Decimal = Decimal("0")
    
    # Gross values (amount including tax)
    gross_total_revenue: Decimal = Decimal("0")
    gross_total_expenses: Decimal = Decimal("0")
    gross_difference: Decimal = Decimal("0")


class TransactionsResponse(Schema):
    """
    Combined response for transactions list page.
    Includes both transactions and financial summary.
    """
    transactions: PaginatedTransactions
    financial_summary: TransactionFinancialSummary


class TransactionChoices(Schema):
    """
    All choices for populating transaction form dropdowns.
    """
    status_choices: List[dict] = [
        {"value": "confirmed", "label": "Confirmed"},
        {"value": "review_required", "label": "Review Required"},
        {"value": "inactive", "label": "Inactive"},
    ]
    
    category_choices: List[dict] = []
    method_choices: List[dict] = []
    currency_choices: List[dict] = []
    vehicle_choices: List[dict] = []


class SubcategoriesResponse(Schema):
    """Response for subcategory lookup"""
    subcategories: List[dict]  # List of {id: int, name: str}


class ImportTransactionsResponse(Schema):
    """Response for transaction CSV import"""
    success: bool
    message: str
    created_count: int = 0
    updated_count: int = 0
    error_count: int = 0
