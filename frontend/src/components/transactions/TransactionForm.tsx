import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Loader2, CalendarDays, FileText, CheckCircle, AlertCircle, XCircle, Download, RotateCcw, Trash2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"

import { StickyFooter } from "@/components/StickyFooter"
import { AutoSaveIndicator } from "@/components/AutoSaveIndicator"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { DynamicSelect } from "@/components/ui/dynamic-select"
import { RelatedTransactionsTable } from "@/components/transactions/RelatedTransactionsTable"
import { RecordNavigation, ReviewQueueNavigation } from "@/components/RecordNavigation"
import { useTransactionChoices, useSubcategories, useDeleteTransaction, useActivateTransaction, useUpdateTransactionStatus } from "@/hooks/useTransactions"
import { useChoices } from "@/hooks/useVehicles"  // For tax_percentages
import { SplitViewDivider } from "@/components/SplitViewDivider"
import { SPLIT_MIN, SPLIT_MAX } from "@/lib/paginationPrefs"
import type { AutoSaveStatus } from "@/hooks/useAutoSave"
import type { TransactionFormData, TransactionDetail } from "@/types/transaction"

interface TransactionFormProps {
    mode: "create" | "edit"
    initialData?: TransactionDetail | null
    initialVehicleId?: number
    onSubmit: (data: TransactionFormData) => Promise<void>
    isLoading?: boolean
    highlightedTransactionId?: number  // For edit mode, to highlight the current row in related transactions
    // Auto-save callbacks (only used in edit mode)
    onAutoSave?: (data: Partial<TransactionFormData>) => void
    onAutoSaveDebounced?: (data: Partial<TransactionFormData>) => void
    // Auto-save status (for footer indicator)
    autoSaveStatus?: AutoSaveStatus
    autoSaveErrorMessage?: string | null
    // Layout toggles
    isSplitView?: boolean
    splitViewToggle?: React.ReactNode
    splitViewWidth?: number
    onSplitViewWidthChange?: (width: number) => void
    onSplitViewWidthStart?: () => void
    onSplitViewWidthSave?: () => void
    header?: React.ReactNode
}

/**
 * SubcategorySelect - Dependent dropdown for selecting subcategories based on Category ID
 * Uses DynamicSelect for "Add New" functionality
 */
interface SubcategorySelectProps {
    categoryId: number | undefined
    value: number | null
    onChange: (value: number | null, name?: string) => void
}

function SubcategorySelect({ categoryId, value, onChange }: SubcategorySelectProps) {
    const { t } = useTranslation()
    const { data: subcategoriesData, isLoading } = useSubcategories(categoryId)

    // Convert subcategories to options format for DynamicSelect
    const options = subcategoriesData?.subcategories?.map((s) => ({
        id: s.id,
        name: s.name,
    })) ?? []

    // Handle change with name lookup
    const handleChange = (id: number | null) => {
        const subcategory = options.find(s => s.id === id)
        onChange(id, subcategory?.name)
    }

    return (
        <div className="space-y-2">
            <Label htmlFor="subcategory">{t("transactions.form.subcategory", "Subcategory")} <span className="text-red-500">*</span></Label>
            <DynamicSelect
                choiceType="subcategory"
                options={options}
                value={value}
                onChange={handleChange}
                onCreated={(item) => {
                    onChange(item.id, item.name)
                }}
                placeholder={
                    !categoryId
                        ? t("transactions.form.selectCategoryFirst", "Select a category first")
                        : isLoading
                            ? t("common.loading", "Loading...")
                            : t("transactions.form.selectSubcategory", "Select subcategory")
                }
                disabled={!categoryId || isLoading}
                allowCreate={!!categoryId}
                createLabel={t("transactions.form.subcategory", "Subcategory")}
                parentId={categoryId}
            />
        </div>
    )
}

/**
 * Shared form component for creating and editing transactions
 * Mirrors the legacy add_new_transaction.html structure
 * 
 * In edit mode:
 * - Auto-saves on field changes (debounced for text, immediate for dropdowns)
 * - Shows navigation arrows instead of Save button
 */
export function TransactionForm({
    mode,
    initialData,
    initialVehicleId,
    onSubmit,
    isLoading = false,
    highlightedTransactionId,
    onAutoSave,
    onAutoSaveDebounced,
    autoSaveStatus = "idle",
    autoSaveErrorMessage,
    isSplitView: _isSplitView,
    splitViewToggle: _splitViewToggle,
    splitViewWidth,
    onSplitViewWidthChange,
    onSplitViewWidthStart,
    onSplitViewWidthSave,
    header,
}: TransactionFormProps) {
    const { t } = useTranslation()

    const navigate = useNavigate()
    const { business_slug } = useParams()

    // Hooks for status toggle actions
    const deleteTransaction = useDeleteTransaction()
    const activateTransaction = useActivateTransaction()
    const updateTransactionStatus = useUpdateTransactionStatus()
    const [statusToggleLoading, setStatusToggleLoading] = useState(false)

    // Form state
    const [isDragging, setIsDragging] = useState(false)
    const [formData, setFormData] = useState<TransactionFormData>({
        category: "",
        subcategory: "",
        vehicle_id: initialVehicleId ?? undefined,
        amount: undefined,  // Start empty, not 0
        currency: "EUR",
        tax: undefined,
        date: "",  // Start empty - user must manually select
        method: "",
        from_or_to: "",
        description: "",
        internal_comments: "",
        // NOTE: status is auto-computed by backend — not set from frontend
    })

    // Track category and subcategory IDs separately (for DynamicSelect)
    const [categoryId, setCategoryId] = useState<number | null>(null)
    const [subcategoryId, setSubcategoryId] = useState<number | null>(null)
    const [methodId, setMethodId] = useState<number | null>(null)
    const [currencyId, setCurrencyId] = useState<number | null>(null)
    const [taxId, setTaxId] = useState<number | null>(null)  // For tax percentage dropdown



    // Validation error state
    const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

    // Fetch choices from API
    const { data: choices, isLoading: choicesLoading } = useTransactionChoices()

    // Convert category choices to DynamicSelect format (id, name)
    const categoryOptions = useMemo(() => choices?.category_choices?.map((c) => ({
        id: parseInt(c.value),
        name: c.label,
    })) ?? [], [choices?.category_choices])

    // Convert method choices to DynamicSelect format (id, name)
    const methodOptions = useMemo(() => choices?.method_choices?.map((m) => ({
        id: parseInt(m.value),
        name: m.label,
    })) ?? [], [choices?.method_choices])

    // Convert currency choices to DynamicSelect format (id, name)
    const currencyOptions = useMemo(() => choices?.currency_choices?.map((c) => ({
        id: parseInt(c.value),
        name: c.label,
    })) ?? [], [choices?.currency_choices])

    // Fetch vehicle choices for tax_percentages (shared with Vehicle forms)
    const { data: vehicleChoices } = useChoices()

    // Convert tax percentage choices to DynamicSelect format with "Name (Percentage%)" display
    const taxOptions = useMemo(() => vehicleChoices?.tax_percentages?.map((t) => ({
        id: t.id,
        name: `${t.name} (${t.percentage}%)`,  // Format: "VAT (19%)"
        percentage: t.percentage,  // Keep for calculations
    })) ?? [], [vehicleChoices?.tax_percentages])
    const { data: subcategoriesData } = useSubcategories(categoryId ?? undefined)

    // Layout logic
    // DEACTIVATED: Split view in TransactionForm.
    // To reactivate, change showSplitView to: mode === "edit" && isSplitView
    // See docs/DEACTIVATED_FEATURES.md
    const showSplitView = false // mode === "edit" && isSplitView;

    // Track last loaded transaction ID to prevent re-initializing on auto-save response
    const lastLoadedIdRef = useRef<number | null>(null)
    const lastDropdownsInitIdRef = useRef<number | null>(null)
    const lastTaxInitIdRef = useRef<number | null>(null)
    const lastSubcategoryInitIdRef = useRef<number | null>(null)

    // Populate form with initial data for edit mode
    useEffect(() => {
        if (mode === "edit" && initialData) {
            if (initialData.internal_id !== lastLoadedIdRef.current) {
                lastLoadedIdRef.current = initialData.internal_id ?? null

                setFormData({
                    category: initialData.category || "",
                    subcategory: initialData.subcategory || "",
                    vehicle_id: initialData.vehicle_internal_id || undefined,  // Use internal_id for vehicle reference
                    amount: initialData.amount !== undefined && initialData.amount !== null ? parseFloat(String(initialData.amount)) : undefined,
                    currency: initialData.currency || "EUR",
                    tax: initialData.tax !== undefined && initialData.tax !== null ? parseFloat(String(initialData.tax)) : undefined,
                    date: initialData.date || new Date().toISOString().split("T")[0],
                    method: initialData.method || "",
                    from_or_to: initialData.from_or_to || "",
                    description: initialData.description || "",
                    internal_comments: initialData.internal_comments || "",
                    // NOTE: status is auto-computed by backend
                })
            }
        }
    }, [mode, initialData?.internal_id])

    // Pre-populate vehicle in create mode if initialVehicleId is provided (e.g. from vehicle details page)
    useEffect(() => {
        if (mode === "create" && initialVehicleId !== undefined) {
            setFormData(prev => ({
                ...prev,
                vehicle_id: initialVehicleId,
            }))
        }
    }, [mode, initialVehicleId])

    // Initialize dropdown IDs for edit mode (based on string values matching options)
    useEffect(() => {
        if (mode === "edit" && initialData && choices) {
            if (initialData.internal_id !== lastDropdownsInitIdRef.current) {
                lastDropdownsInitIdRef.current = initialData.internal_id ?? null

                // Match category by name
                const matchedCategory = categoryOptions.find(c => c.name === initialData.category)
                setCategoryId(matchedCategory ? matchedCategory.id : null)

                // Match method by name  
                const matchedMethod = methodOptions.find(m => m.name === initialData.method)
                setMethodId(matchedMethod ? matchedMethod.id : null)

                // Match currency by name
                const matchedCurrency = currencyOptions.find(c => c.name === initialData.currency)
                setCurrencyId(matchedCurrency ? matchedCurrency.id : null)
            }
        }
    }, [mode, initialData?.internal_id, choices, categoryOptions, methodOptions, currencyOptions])

    // Initialize tax - runs after vehicleChoices loads
    useEffect(() => {
        if (vehicleChoices?.tax_percentages && vehicleChoices.tax_percentages.length > 0) {
            const noTax = vehicleChoices.tax_percentages.find(t => t.is_no_tax)
            if (mode === "edit" && initialData) {
                if (initialData.internal_id !== lastTaxInitIdRef.current) {
                    lastTaxInitIdRef.current = initialData.internal_id ?? null

                    if (initialData.tax !== undefined && initialData.tax !== null) {
                        const taxPercent = parseFloat(String(initialData.tax))
                        const matchedTax = vehicleChoices.tax_percentages.find(t => parseFloat(String(t.percentage)) === taxPercent)
                        if (matchedTax) {
                            setTaxId(matchedTax.id)
                        } else {
                            setTaxId(null)
                        }
                    } else {
                        setTaxId(null)
                    }
                }
            } else if (mode === "create") {
                if (taxId === null && noTax) {
                    setTaxId(noTax.id)
                    setFormData(prev => ({
                        ...prev,
                        tax: parseFloat(String(noTax.percentage)),
                    }))
                }
            }
        }
    }, [mode, initialData?.internal_id, vehicleChoices, taxId])

    // Initialize subcategoryId for edit mode (after subcategories are loaded for the selected category)
    useEffect(() => {
        if (mode === "edit" && initialData && subcategoriesData?.subcategories && categoryId) {
            if (initialData.internal_id !== lastSubcategoryInitIdRef.current) {
                // Match subcategory by name
                const matchedSubcategory = subcategoriesData.subcategories.find(s => s.name === initialData.subcategory)
                if (matchedSubcategory) {
                    setSubcategoryId(matchedSubcategory.id)
                    lastSubcategoryInitIdRef.current = initialData.internal_id ?? null
                }
            }
        }
    }, [mode, initialData?.internal_id, subcategoriesData, categoryId])


    // Auto-save handler: ALWAYS save whatever fields are passed (no blocking!)
    const handleAutoSave = useCallback((dataToSave: Partial<TransactionFormData>, isDebounced = false) => {
        if (mode !== "edit") return

        if (isDebounced && onAutoSaveDebounced) {
            onAutoSaveDebounced(dataToSave)
        } else if (!isDebounced && onAutoSave) {
            onAutoSave(dataToSave)
        }
    }, [mode, onAutoSave, onAutoSaveDebounced])

    // Handle field changes - with auto-save support for edit mode
    const handleChange = useCallback((field: keyof TransactionFormData, value: string | number | undefined) => {
        setFormData((prev) => {
            const newData = {
                ...prev,
                [field]: value,
                // Reset subcategory when category changes
                ...(field === "category" ? { subcategory: "" } : {}),
            }
            return newData
        })

        // Trigger debounced auto-save for text inputs
        handleAutoSave({ [field]: value }, true)
    }, [handleAutoSave])

    // Calculate price breakdown
    const netAmount = formData.amount || 0
    const taxRate = formData.tax || 0
    // Compute tax such that Net - Tax = Gross
    const taxAmount = -(netAmount * (taxRate / 100))
    const grossAmount = netAmount - taxAmount

    // Extract currency code/symbol from currency name format: "Name (CODE)" or "Name (Symbol)"
    // Examples: "Euro (EUR)" → EUR, "US Dollar (USD)" → USD, "Saudi Riyal (﷼)" → ﷼
    // Uses a permissive regex to capture ANY content inside the last parentheses (Unicode-safe)
    const getCurrencyCode = (currencyName: string | undefined): string => {
        if (!currencyName) return "EUR" // Default fallback

        // Try to extract content from the last set of parentheses: "Name (CODE)" or "Name (Symbol)"
        // This regex captures anything that is NOT a closing parenthesis, inside parentheses at the end
        const match = currencyName.match(/\(([^)]+)\)$/)
        if (match) {
            const extracted = match[1].trim()
            // Return the extracted value (could be ISO code like USD or symbol like ﷼)
            if (extracted) return extracted
        }

        // If no parentheses found, check if it's already a standalone code (e.g., "EUR", "USD")
        // Accept 2-4 character codes (like "EUR", "USD", "USDN", etc.)
        if (/^[A-Za-z]{2,4}$/.test(currencyName.trim())) {
            return currencyName.trim().toUpperCase()
        }

        // Fallback to EUR if we can't determine the code
        return "EUR"
    }

    const currencyCode = getCurrencyCode(formData.currency)

    // Helper for formatting currency - uses selected currency
    const formatMoney = (amount: number) => {
        try {
            return new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: currencyCode,
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            }).format(amount)
        } catch {
            // Fallback if invalid currency code (e.g., when symbol is used instead of ISO code)
            // Format manually with the symbol/code prepended
            const formatted = new Intl.NumberFormat("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            }).format(amount)
            return `${currencyCode} ${formatted}`
        }
    }

    const getAmountColor = (amount: number) => {
        if (amount === 0) return "text-muted-foreground"
        return amount > 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"
    }


    // Validate required fields
    const validateForm = useCallback((): boolean => {
        const errors: Record<string, string> = {}

        // Required dropdown fields
        if (!categoryId) {
            errors.category = "This field is required"
        }
        if (!subcategoryId) {
            errors.subcategory = "This field is required"
        }
        if (!currencyId) {
            errors.currency = "This field is required"
        }
        if (!methodId) {
            errors.method = "This field is required"
        }
        if (!taxId) {
            errors.tax = "This field is required"
        }

        // Required text fields
        if (!formData.from_or_to.trim()) {
            errors.from_or_to = "This field is required"
        }
        if (!formData.date) {
            errors.date = "This field is required"
        }
        // Amount: allow any number (positive, negative, or zero) - only reject empty
        if (formData.amount === undefined || formData.amount === null || String(formData.amount).trim() === "") {
            errors.amount = "The amount field cannot be empty"
        }

        setValidationErrors(errors)
        return Object.keys(errors).length === 0
    }, [categoryId, subcategoryId, currencyId, methodId, taxId, formData.from_or_to, formData.date, formData.amount])

    // Clear specific validation error when field is filled
    const clearError = useCallback((field: string) => {
        setValidationErrors(prev => {
            if (prev[field]) {
                const next = { ...prev }
                delete next[field]
                return next
            }
            return prev
        })
    }, [])

    // Handle form submission
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        // Custom validation - blocks submission if invalid
        if (!validateForm()) {
            return
        }

        await onSubmit(formData)
    }

    // Handle cancel with smart back
    const handleCancel = () => {
        if (window.history.state && window.history.state.idx > 0) {
            navigate(-1)
        } else {
            navigate(`/${business_slug}/transactions`)
        }
    }

    // Convert vehicle choices to SearchableSelect format
    const vehicleOptions = choices?.vehicle_choices?.map((v) => ({
        value: String(v.value),
        label: `#${v.value} - ${v.label}`,
    })) ?? []

    if (choicesLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <form onSubmit={handleSubmit} noValidate className="space-y-6">
            <div className={cn(
                "gap-4 2xl:gap-0",
                showSplitView ? "flex flex-col 2xl:flex-row 2xl:items-start relative" : "space-y-6"
            )}>
                {/* LEFT COLUMN */}
                <div className={cn("space-y-5", showSplitView ? "min-w-0 flex-1" : "w-full", isDragging && "pointer-events-none")}>
                    {header}
                    <div className={cn("gap-5", showSplitView ? "space-y-5" : "grid lg:grid-cols-2")}>
                        {/* Inner Column 1: Transaction Details */}
                        <div className="space-y-6">
                            {/* Transaction Details Section */}
                            <div className="rounded-xl border border-border bg-card">
                                <div className="border-b border-border px-5 py-4 flex items-center justify-between">
                                    <h3 className="text-base font-medium">{t("transactions.form.transactionDetails", "Transaction Details")}</h3>
                                    {/* Auto-computed Status Badge */}
                                    {mode === "edit" && initialData?.status && (
                                        <span
                                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${initialData.status === "confirmed"
                                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-1 ring-inset ring-emerald-500/25"
                                                : initialData.status === "inactive"
                                                    ? "bg-muted text-muted-foreground ring-1 ring-inset ring-border"
                                                    : "bg-red-500/15 text-red-600 dark:text-red-400 ring-1 ring-inset ring-red-500/25"
                                                }`}
                                        >
                                            {initialData.status === "confirmed" ? (
                                                <CheckCircle className="h-3.5 w-3.5" />
                                            ) : initialData.status === "inactive" ? (
                                                <XCircle className="h-3.5 w-3.5" />
                                            ) : (
                                                <AlertCircle className="h-3.5 w-3.5" />
                                            )}
                                            {t(`status.${initialData.status}`) || initialData.status_display || initialData.status}
                                        </span>
                                    )}
                                </div>
                                <div className={cn("grid gap-4 p-5", showSplitView ? "grid-cols-3" : "grid-cols-1 md:grid-cols-3")}>
                                    {/* Category - DynamicSelect with Add New */}
                                    <div className="space-y-2">
                                        <Label htmlFor="category">{t("transactions.form.category", "Category")} <span className="text-red-500">*</span></Label>
                                        <DynamicSelect
                                            choiceType="category"
                                            options={categoryOptions}
                                            value={categoryId}
                                            onChange={(id) => {
                                                setCategoryId(id)
                                                clearError("category")
                                                // Reset subcategory when category changes
                                                setSubcategoryId(null)
                                                // Also update formData with category name for backend
                                                const category = categoryOptions.find(c => c.id === id)
                                                const categoryName = category?.name || ""
                                                setFormData(prev => ({
                                                    ...prev,
                                                    category: categoryName,
                                                    subcategory: "",
                                                }))
                                                // Trigger immediate auto-save for dropdown
                                                handleAutoSave({ category: categoryName, subcategory: "" })
                                            }}
                                            placeholder={t("transactions.form.selectCategory", "Select category")}
                                            allowCreate={true}
                                            createLabel={t("transactions.form.category", "Category")}
                                            onCreated={(item) => {
                                                setCategoryId(item.id)
                                                clearError("category")
                                                setSubcategoryId(null)
                                                setFormData(prev => ({
                                                    ...prev,
                                                    category: item.name,
                                                    subcategory: "",
                                                }))
                                                handleAutoSave({ category: item.name, subcategory: "" })
                                            }}
                                        />
                                        {validationErrors.category && (
                                            <p className="text-sm text-red-500">{validationErrors.category}</p>
                                        )}
                                    </div>

                                    {/* Subcategory - DynamicSelect with Add New, dependent on Category */}
                                    <div className="space-y-2">
                                        <SubcategorySelect
                                            categoryId={categoryId ?? undefined}
                                            value={subcategoryId}
                                            onChange={(id, name) => {
                                                setSubcategoryId(id)
                                                clearError("subcategory")
                                                // Update formData with subcategory name for backend
                                                const subcategoryName = name || ""
                                                setFormData(prev => ({
                                                    ...prev,
                                                    subcategory: subcategoryName,
                                                }))
                                                // Trigger immediate auto-save for dropdown
                                                handleAutoSave({ subcategory: subcategoryName })
                                            }}
                                        />
                                        {validationErrors.subcategory && (
                                            <p className="text-sm text-red-500">{validationErrors.subcategory}</p>
                                        )}
                                    </div>

                                    {/* Vehicle - Rendered inline only when not in split view */}
                                    <div className="space-y-2">
                                        <Label htmlFor="vehicle">{t("transactions.vehicle") || "Vehicle"}</Label>
                                        <SearchableSelect
                                            options={vehicleOptions}
                                            value={formData.vehicle_id?.toString() || ""}
                                            onChange={(v) => {
                                                const vehicleId = v ? parseInt(v) : undefined
                                                handleChange("vehicle_id", vehicleId)
                                                // Trigger immediate auto-save for dropdown
                                                handleAutoSave({ vehicle_id: vehicleId })
                                            }}
                                            placeholder={t("transactions.form.searchVehicles", "Search vehicles...")}
                                            searchPlaceholder={t("transactions.form.typeToSearch", "Type to search...")}
                                        />
                                    </div>

                                    {/* Date */}
                                    <div className="space-y-2">
                                        <Label htmlFor="date">{t("transactions.form.date", "Date")} <span className="text-red-500">*</span></Label>
                                        <div className="relative">
                                            <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                id="date"
                                                type="date"
                                                value={formData.date}
                                                onChange={(e) => {
                                                    const dateValue = e.target.value
                                                    handleChange("date", dateValue)
                                                    clearError("date")
                                                    // Trigger immediate auto-save for date (not debounced)
                                                    handleAutoSave({ date: dateValue })
                                                }}
                                                onClick={(e) => { try { e.currentTarget.showPicker(); } catch (err) { } }}
                                                className="pl-10"
                                            />
                                        </div>
                                        {validationErrors.date && (
                                            <p className="text-sm text-red-500">{validationErrors.date}</p>
                                        )}
                                    </div>

                                    {/* Method - DynamicSelect with Add New */}
                                    <div className="space-y-2">
                                        <Label htmlFor="method">{t("transactions.form.method", "Method")} <span className="text-red-500">*</span></Label>
                                        <DynamicSelect
                                            choiceType="method"
                                            options={methodOptions}
                                            value={methodId}
                                            onChange={(id) => {
                                                setMethodId(id)
                                                clearError("method")
                                                // Update formData with method name for backend
                                                const method = methodOptions.find(m => m.id === id)
                                                const methodName = method?.name || ""
                                                setFormData(prev => ({
                                                    ...prev,
                                                    method: methodName,
                                                }))
                                                // Trigger immediate auto-save for dropdown
                                                handleAutoSave({ method: methodName })
                                            }}
                                            placeholder={t("transactions.form.selectMethod", "Select method")}
                                            allowCreate={true}
                                            createLabel={t("transactions.form.method", "Method")}
                                            onCreated={(item) => {
                                                setMethodId(item.id)
                                                clearError("method")
                                                setFormData(prev => ({
                                                    ...prev,
                                                    method: item.name,
                                                }))
                                                handleAutoSave({ method: item.name })
                                            }}
                                        />
                                        {validationErrors.method && (
                                            <p className="text-sm text-red-500">{validationErrors.method}</p>
                                        )}
                                    </div>

                                    {/* From/To */}
                                    <div className="space-y-2">
                                        <Label htmlFor="from_or_to">{t("transactions.form.fromTo", "From/To")} <span className="text-red-500">*</span></Label>
                                        <Input
                                            id="from_or_to"
                                            type="text"
                                            value={formData.from_or_to}
                                            onChange={(e) => {
                                                handleChange("from_or_to", e.target.value)
                                                if (e.target.value.trim()) {
                                                    clearError("from_or_to")
                                                }
                                            }}
                                            placeholder={t("transactions.form.senderRecipientPlaceholder", "Sender or recipient name")}
                                        />
                                        {validationErrors.from_or_to && (
                                            <p className="text-sm text-red-500">{validationErrors.from_or_to}</p>
                                        )}
                                    </div>

                                    {/* Description */}
                                    <div className="space-y-2">
                                        <Label htmlFor="description">{t("transactions.form.description", "Description")}</Label>
                                        <Textarea
                                            id="description"
                                            value={formData.description}
                                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleChange("description", e.target.value)}
                                            placeholder={t("transactions.form.descriptionPlaceholder", "Transaction description...")}
                                            rows={4}
                                        />
                                    </div>

                                    {/* Internal Comments */}
                                    <div className="space-y-2">
                                        <Label htmlFor="internal_comments">{t("transactions.form.internalComments", "Internal Comments")}</Label>
                                        <Textarea
                                            id="internal_comments"
                                            value={formData.internal_comments}
                                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleChange("internal_comments", e.target.value)}
                                            placeholder={t("transactions.form.internalCommentsPlaceholder", "Internal notes...")}
                                            rows={4}
                                        />
                                    </div>
                                </div>
                            </div>


                        </div>

                        {/* Column 2: Price Breakdown & Purchase Details */}
                        <div className="space-y-6">


                            {/* Purchase Details Section */}
                            <div className="rounded-xl border border-border bg-card">
                                <div className="border-b border-border px-5 py-4">
                                    <h3 className="text-base font-medium">{t("transactions.form.priceBreakdown", "Purchase Details")}</h3>
                                </div>
                                <div className="px-5 pt-5 pb-0">
                                    <div className="flex flex-row flex-wrap items-center gap-x-4 gap-y-1 min-w-0 rounded-md border p-2 shadow-sm transition-colors bg-background border-border/40 hover:border-border/80 w-full mb-2">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold whitespace-nowrap">{t("vehicles.buyGross", "Gross")}:</span>
                                            <span className={`text-sm font-bold ${getAmountColor(grossAmount)} whitespace-nowrap`}>
                                                {formatMoney(grossAmount)}
                                            </span>
                                        </div>
                                        <div className="text-[10px] text-muted-foreground/50 font-medium whitespace-nowrap">
                                            {t("vehicleForm.net", "Net")} ({formatMoney(netAmount)}) + {t("vehicleForm.tax", "Tax")} {taxRate}% ({formatMoney(taxAmount)})
                                        </div>
                                    </div>
                                </div>
                                <div className={cn("grid gap-4 p-5 pt-2", showSplitView ? "grid-cols-3" : "grid-cols-1 md:grid-cols-3")}>
                                    {/* Amount */}
                                    <div className="space-y-2">
                                        <Label htmlFor="amount">{t("transactions.form.amount", "Amount")} <span className="text-red-500">*</span></Label>
                                        <div className="relative">
                                            <Input
                                                id="amount"
                                                type="number"
                                                step="0.01"
                                                value={formData.amount ?? ""}
                                                placeholder={t("transactions.form.enterAmount", "Enter amount")}
                                                onChange={(e) => {
                                                    const inputVal = e.target.value
                                                    // Allow empty string (undefined) or any valid number
                                                    if (inputVal === "") {
                                                        handleChange("amount", undefined)
                                                    } else {
                                                        const val = parseFloat(inputVal)
                                                        if (!isNaN(val)) {
                                                            handleChange("amount", val)
                                                            clearError("amount")
                                                        }
                                                    }
                                                }}
                                            />
                                        </div>
                                        {validationErrors.amount && (
                                            <p className="text-sm text-red-500">{validationErrors.amount}</p>
                                        )}
                                    </div>

                                    {/* Tax - DynamicSelect with Add New */}
                                    <div className="space-y-2">
                                        <Label htmlFor="tax">{t("transactions.form.tax", "Tax")} <span className="text-red-500">*</span></Label>
                                        <DynamicSelect
                                            choiceType="tax_percentage"
                                            options={taxOptions}
                                            value={taxId}
                                            onChange={(id) => {
                                                setTaxId(id)
                                                clearError("tax")

                                                // Note: For newly created items, taxOptions won't contain the new tax yet
                                                // In that case, onCreated callback will handle setting the percentage
                                                const taxOption = taxOptions.find(t => t.id === id)
                                                const taxValue = taxOption !== undefined ? taxOption.percentage : undefined

                                                // Only update form data if we actually found the option or it was cleared
                                                // When handling "Create New", id is null initially until onCreated fires
                                                if (taxOption !== undefined || id === null) {
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        tax: taxValue,
                                                    }))
                                                    // Trigger immediate auto-save for dropdown
                                                    handleAutoSave({ tax: taxValue })
                                                }
                                            }}
                                            onCreated={(item) => {
                                                // Immediately update formData with the new tax percentage
                                                // This fixes the Price Breakdown not updating when creating a new tax
                                                if (item.percentage !== undefined) {
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        tax: item.percentage,
                                                    }))
                                                    // Also trigger auto-save if in edit mode
                                                    handleAutoSave({ tax: item.percentage })
                                                }
                                            }}
                                            placeholder={t("transactions.form.selectTax", "Select tax")}
                                            allowCreate={true}
                                            createLabel={t("transactions.form.taxRate", "Tax Rate")}
                                            showPercentage
                                        />
                                        {validationErrors.tax && (
                                            <p className="text-sm text-red-500">{validationErrors.tax}</p>
                                        )}
                                    </div>

                                    {/* Currency - DynamicSelect with Add New */}
                                    <div className="space-y-2">
                                        <Label htmlFor="currency">{t("transactions.form.currency", "Currency")} <span className="text-red-500">*</span></Label>
                                        <DynamicSelect
                                            choiceType="currency"
                                            options={currencyOptions}
                                            value={currencyId}
                                            onChange={(id) => {
                                                setCurrencyId(id)
                                                clearError("currency")
                                                // Update formData with currency code/name for backend
                                                const currency = currencyOptions.find(c => c.id === id)
                                                const currencyName = currency?.name || ""
                                                setFormData(prev => ({
                                                    ...prev,
                                                    currency: currencyName,
                                                }))
                                                // Trigger immediate auto-save for dropdown
                                                handleAutoSave({ currency: currencyName })
                                            }}
                                            placeholder={t("transactions.form.selectCurrency", "Select currency")}
                                            allowCreate={true}
                                            createLabel={t("transactions.form.currency", "Currency")}
                                            onCreated={(item) => {
                                                setCurrencyId(item.id)
                                                clearError("currency")
                                                setFormData(prev => ({
                                                    ...prev,
                                                    currency: item.name,
                                                }))
                                                handleAutoSave({ currency: item.name })
                                            }}
                                        />
                                        {validationErrors.currency && (
                                            <p className="text-sm text-red-500">{validationErrors.currency}</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Draggable Divider */}
                {showSplitView && onSplitViewWidthChange && (
                    <SplitViewDivider
                        onDrag={(deltaX) => {
                            const next = (splitViewWidth || 450) - deltaX
                            const clamped = Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, next))
                            onSplitViewWidthChange(clamped)
                        }}
                        onDragStart={() => {
                            setIsDragging(true)
                            onSplitViewWidthStart?.()
                        }}
                        onDragEnd={() => {
                            setIsDragging(false)
                            onSplitViewWidthSave?.()
                        }}
                    />
                )}

                {/* RIGHT COLUMN (Split View Only) */}
                {showSplitView && (
                    <div
                        style={{ width: splitViewWidth ? `${splitViewWidth}px` : '450px' }}
                        className={cn(
                            "hidden 2xl:flex 2xl:flex-shrink-0 flex flex-col gap-4 2xl:sticky 2xl:top-5 2xl:self-start",
                            isDragging && "pointer-events-none"
                        )}
                    >
                        {formData.vehicle_id && (
                            <div className="overflow-y-auto max-h-[calc(100vh-220px)]">
                                <RelatedTransactionsTable
                                    vehicleId={formData.vehicle_id}
                                    vehicleName={vehicleOptions.find(v => v.value === String(formData.vehicle_id))?.label}
                                    highlightedTransactionId={highlightedTransactionId}
                                />
                            </div>
                        )}
                    </div>
                )}
                {showSplitView && formData.vehicle_id && (
                    <div className="2xl:hidden w-full">
                        <RelatedTransactionsTable
                            vehicleId={formData.vehicle_id}
                            vehicleName={vehicleOptions.find(v => v.value === String(formData.vehicle_id))?.label}
                            highlightedTransactionId={highlightedTransactionId}
                        />
                    </div>
                )}
            </div>

            {/* Related Transactions Table - Original location (only when NOT in split view) */}
            {!showSplitView && formData.vehicle_id && (
                <div className="mt-6">
                    <RelatedTransactionsTable
                        vehicleId={formData.vehicle_id}
                        vehicleName={vehicleOptions.find(v => v.value === String(formData.vehicle_id))?.label}
                        highlightedTransactionId={highlightedTransactionId}
                    />
                </div>
            )}

            {/* Form Actions - Sticky Footer */}
            <div className="pb-24" />
            <StickyFooter>
                <div className="flex w-full items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" onClick={handleCancel}>
                            {mode === "edit" ? t("transactions.form.backToList", "Back to List") : t("common.cancel", "Cancel")}
                        </Button>

                        {/* Status action buttons (edit mode only) */}
                        {mode === "edit" && initialData && (() => {
                            const hasMandatoryFields = Boolean(
                                formData.category?.trim() &&
                                formData.subcategory?.trim() &&
                                formData.tax !== undefined && formData.tax !== null &&
                                formData.date?.trim() &&
                                formData.method?.trim() &&
                                formData.from_or_to?.trim() &&
                                formData.amount !== undefined && formData.amount !== null &&
                                formData.currency?.trim()
                            )

                            const isConfirmedDisabled = !hasMandatoryFields || initialData.status === "confirmed" || statusToggleLoading
                            const isReviewRequiredDisabled = !hasMandatoryFields || initialData.status === "review_required" || statusToggleLoading

                            return (
                                <div className="flex items-center gap-2">
                                    {/* Confirmed Button */}
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={isConfirmedDisabled}
                                        title={
                                            !hasMandatoryFields
                                                ? t("transactions.form.cannotConfirmTooltip", "All mandatory fields (*) must be filled to confirm")
                                                : initialData.status === "confirmed"
                                                    ? t("transactions.form.alreadyConfirmedTooltip", "Transaction is already confirmed")
                                                    : t("transactions.form.markConfirmedTooltip", "Mark status as Confirmed")
                                        }
                                        className={cn(
                                            "gap-1.5 font-medium transition-colors",
                                            initialData.status === "confirmed"
                                                ? "text-emerald-700 dark:text-emerald-400 border-emerald-400/60 dark:border-emerald-700/60 bg-emerald-500/10 dark:bg-emerald-500/15 cursor-not-allowed opacity-80"
                                                : hasMandatoryFields
                                                    ? "text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-700"
                                                    : "text-muted-foreground border-border/40 opacity-50 cursor-not-allowed"
                                        )}
                                        onClick={async () => {
                                            if (!initialData.internal_id || isConfirmedDisabled) return
                                            setStatusToggleLoading(true)
                                            try {
                                                await updateTransactionStatus.mutateAsync({
                                                    internalId: initialData.internal_id,
                                                    status: "confirmed",
                                                })
                                            } catch (err) {
                                                console.error("Failed to set status to confirmed:", err)
                                            } finally {
                                                setStatusToggleLoading(false)
                                            }
                                        }}
                                    >
                                        {statusToggleLoading ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <CheckCircle className="h-3.5 w-3.5" />
                                        )}
                                        {t("transactions.form.confirmed", "Confirmed")}
                                    </Button>

                                    {/* Review Required Button */}
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={isReviewRequiredDisabled}
                                        title={
                                            !hasMandatoryFields
                                                ? t("transactions.form.cannotReviewTooltip", "All mandatory fields (*) must be filled")
                                                : initialData.status === "review_required"
                                                    ? t("transactions.form.alreadyReviewTooltip", "Transaction is already in Review Required status")
                                                    : t("transactions.form.markReviewTooltip", "Mark status as Review Required")
                                        }
                                        className={cn(
                                            "gap-1.5 font-medium transition-colors",
                                            initialData.status === "review_required"
                                                ? "text-amber-700 dark:text-amber-400 border-amber-400/60 dark:border-amber-700/60 bg-amber-500/10 dark:bg-amber-500/15 cursor-not-allowed opacity-80"
                                                : hasMandatoryFields
                                                    ? "text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:text-amber-700"
                                                    : "text-muted-foreground border-border/40 opacity-50 cursor-not-allowed"
                                        )}
                                        onClick={async () => {
                                            if (!initialData.internal_id || isReviewRequiredDisabled) return
                                            setStatusToggleLoading(true)
                                            try {
                                                await updateTransactionStatus.mutateAsync({
                                                    internalId: initialData.internal_id,
                                                    status: "review_required",
                                                })
                                            } catch (err) {
                                                console.error("Failed to set status to review required:", err)
                                            } finally {
                                                setStatusToggleLoading(false)
                                            }
                                        }}
                                    >
                                        {statusToggleLoading ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <AlertCircle className="h-3.5 w-3.5" />
                                        )}
                                        {t("transactions.form.reviewRequired", "Review Required")}
                                    </Button>

                                    {/* Activate/Deactivate Button */}
                                    {initialData.status === "inactive" ? (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="gap-1.5 text-green-600 border-green-300 hover:bg-green-50 hover:text-green-700 dark:text-green-400 dark:border-green-700 dark:hover:bg-green-900/30"
                                            disabled={statusToggleLoading}
                                            onClick={async () => {
                                                if (!initialData.internal_id) return
                                                setStatusToggleLoading(true)
                                                try {
                                                    await activateTransaction.mutateAsync(initialData.internal_id)
                                                } catch (err) {
                                                    console.error("Failed to activate transaction:", err)
                                                } finally {
                                                    setStatusToggleLoading(false)
                                                }
                                            }}
                                        >
                                            {statusToggleLoading ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : (
                                                <RotateCcw className="h-3.5 w-3.5" />
                                            )}
                                            {t("transactions.form.activate", "Activate")}
                                        </Button>
                                    ) : (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="gap-1.5 text-red-500 border-red-300 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:border-red-700 dark:hover:bg-red-900/30"
                                            disabled={statusToggleLoading}
                                            onClick={async () => {
                                                if (!initialData.internal_id) return
                                                setStatusToggleLoading(true)
                                                try {
                                                    await deleteTransaction.mutateAsync(initialData.internal_id)
                                                } catch (err) {
                                                    console.error("Failed to deactivate transaction:", err)
                                                } finally {
                                                    setStatusToggleLoading(false)
                                                }
                                            }}
                                        >
                                            {statusToggleLoading ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : (
                                                <Trash2 className="h-3.5 w-3.5" />
                                            )}
                                            {t("transactions.form.deactivate", "Deactivate")}
                                        </Button>
                                    )}
                                </div>
                            )
                        })()}
                    </div>

                    {mode === "create" ? (
                        // Create mode: Show submit button
                        <Button
                            type="submit"
                            disabled={isLoading}
                            className="gap-2"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    {t("transactions.form.creating", "Creating...")}
                                </>
                            ) : (
                                <>
                                    <FileText className="h-4 w-4" />
                                    {t("transactions.form.addTransaction", "Add Transaction")}
                                </>
                            )}
                        </Button>
                    ) : (
                        // Edit mode: Show autosave indicator, PDF button, and navigation
                        <div className="flex items-center gap-3">
                            {/* Layout Toggle - DEACTIVATED (see docs/DEACTIVATED_FEATURES.md) */}
                            {/* {_splitViewToggle}
                            {_splitViewToggle && <div className="h-6 w-px bg-border" />} */}

                            {/* Auto-save status indicator */}
                            <AutoSaveIndicator status={autoSaveStatus} errorMessage={autoSaveErrorMessage} />

                            {/* Separator */}
                            <div className="h-6 w-px bg-border" />

                            {/* Generate PDF button */}
                            {mode === "edit" && initialData && (() => {
                                // PDF generation requires: amount, date, category, subcategory, tax (all present)
                                // and logically evaluates properly without needing a database refresh
                                const canGenerate = (
                                    formData.amount !== undefined && formData.amount !== null &&
                                    formData.date !== "" && formData.date !== null && formData.date !== undefined &&
                                    (formData.category !== "" || categoryId !== null) &&
                                    (formData.subcategory !== "" || subcategoryId !== null) &&
                                    formData.tax !== undefined && formData.tax !== null && formData.tax >= 0
                                );

                                return canGenerate ? (
                                    <a
                                        href={`/api/transactions/${initialData.internal_id}/pdf`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                                    >
                                        <Download className="h-4 w-4" />
                                        PDF
                                    </a>
                                ) : (
                                    <span
                                        className="inline-flex items-center gap-2 rounded-md border border-input bg-muted px-4 py-2 text-sm font-medium text-muted-foreground cursor-not-allowed opacity-50"
                                        title={t("transactions.form.pdfRequiredFieldsTooltip", "Complete all required fields (amount, date, category, subcategory, tax) to generate PDF")}
                                    >
                                        <Download className="h-4 w-4" />
                                        PDF
                                    </span>
                                );
                            })()}

                            {/* Separator */}
                            <div className="h-6 w-px bg-border" />



                            {/* Standard Navigation */}
                            <RecordNavigation
                                basePath={`/${business_slug}/transactions`}
                                prevId={initialData?.prev_transaction_internal_id}
                                nextId={initialData?.next_transaction_internal_id}
                                pathSuffix="/edit"
                                label={t("transactions.form.transactionLabel", "Transaction")}
                            />

                            <ReviewQueueNavigation
                                basePath={`/${business_slug}/transactions`}
                                prevReviewId={initialData?.prev_review_required_internal_id}
                                nextReviewId={initialData?.next_review_required_internal_id}
                                pathSuffix="/edit"
                            />
                        </div>
                    )}
                </div>
            </StickyFooter>
        </form>
    )
}
