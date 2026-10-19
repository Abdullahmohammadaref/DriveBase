import { useState, useCallback, useEffect } from "react"
import { Link, useSearchParams, useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Plus, Search, X, Upload, CheckCircle2, Download, Loader2, RefreshCw, BarChart3, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useTransactions, useDeleteTransaction, useActivateTransaction, useUpdateTransaction } from "@/hooks/useTransactions"
import { FinancialSummaryTable, TransactionFiltersSidebar, TransactionTable, ImportTransactionsModal } from "@/components/transactions"
import { SmartDeleteModal } from "@/components/common/SmartDeleteModal"
import { StickyFooter } from "@/components/StickyFooter"
import { PerPageInput } from "@/components/PerPageInput"
import { PageInput } from "@/components/PageInput"
import { getPagePref, savePagePref, getBoolPref, saveBoolPref } from "@/lib/paginationPrefs"
// import { getSplitWidth, saveSplitWidth } from "@/lib/paginationPrefs" // DEACTIVATED: SplitViewDivider
import api from "@/lib/api"
// import { SplitViewDivider } from "@/components/SplitViewDivider" // DEACTIVATED: SplitViewDivider

const PREF_SHOW_TX_SUMMARY = "drivebase_pref_show_tx_summary"
import type { TransactionFilters, TransactionListItem } from "@/types/transaction"



/**
 * Transactions list page with financial summary, filters, and data table.
 * Standardized for professional, high-quality management.
 */
export function TransactionsPage() {
    const { t } = useTranslation()
    const { business_slug, locale } = useParams<{ business_slug: string; locale?: string }>()
    const basePath = locale ? `/${business_slug}/${locale}` : `/${business_slug}`
    const [searchParams] = useSearchParams()

    // Filter state - initialize from URL
    const [filters, setFilters] = useState<TransactionFilters>(() => {
        const statusFromUrl = searchParams.get("status")
        return {
            page: 1,
            per_page: getPagePref("drivebase_transactions_per_page", 20),
            order: "desc",
            sort: "internal_id",
            status: statusFromUrl || undefined,
        }
    })

    // General search input
    const [searchValue, setSearchValue] = useState("")

    // Persistent toggle for financial summary / totals (default: collapsed/hidden, remembered via cookie & localStorage)
    const [showFinancialSummary, setShowFinancialSummary] = useState<boolean>(() =>
        getBoolPref(PREF_SHOW_TX_SUMMARY, false)
    )

    // Update filters when URL changes (sidebar navigation)
    useEffect(() => {
        const statusFromUrl = searchParams.get("status")
        setFilters(prev => ({
            ...prev,
            status: statusFromUrl || undefined,
            page: 1, // Reset to first page when filter changes
        }))
    }, [searchParams])



    // Import modal state
    const [importModalOpen, setImportModalOpen] = useState(false)

    // Delete confirmation dialog
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
    const [transactionToDelete, setTransactionToDelete] =
        useState<TransactionListItem | null>(null)

    // Success message state (e.g., after adding a new transaction)
    const [successMessage, setSuccessMessage] = useState<string | null>(null)

    // PDF export loading state
    const [pdfLoading, setPdfLoading] = useState(false)

    // Check for success message in URL on mount
    useEffect(() => {
        const success = searchParams.get("success")
        if (success) {
            setSuccessMessage(success)
            // Remove the success param from URL without reload
            const newParams = new URLSearchParams(searchParams)
            newParams.delete("success")
            window.history.replaceState({}, "", `${window.location.pathname}${newParams.toString() ? `?${newParams.toString()}` : ""}`)
            // Auto-hide after 5 seconds
            setTimeout(() => setSuccessMessage(null), 5000)
        }
    }, [searchParams])

    // Fetch transactions
    const { data, isLoading, isFetching } = useTransactions(filters)

    /*
     * =========================================================================
     * DEACTIVATED FEATURE: Draggable SplitViewDivider on Transactions Page
     * To reactivate:
     * 1. Uncomment the panelWidth/handleDrag code below.
     * 2. Re-enable <SplitViewDivider /> in the JSX.
     * See docs/DEACTIVATED_FEATURES.md for full details.
     * =========================================================================
     */
    /*
    const [panelWidth, setPanelWidth] = useState(() => 
        getSplitWidth("drivebase_transactions_filter_width", 260, 200, 500)
    )
    const [isDragging, setIsDragging] = useState(false)

    const handleDrag = (deltaX: number) => {
        setPanelWidth(prev => {
            const next = prev + deltaX
            return Math.min(500, Math.max(200, next))
        })
    }

    const handleDragEnd = () => {
        setIsDragging(false)
        saveSplitWidth("drivebase_transactions_filter_width", panelWidth, 200, 500)
    }
    */

    // Mutations
    const deleteMutation = useDeleteTransaction()
    const activateMutation = useActivateTransaction()
    const updateMutation = useUpdateTransaction()

    const handleUnlink = useCallback(async (tx: TransactionListItem) => {
        if (!confirm(t("transactions.confirmUnlink", "Unlink Transaction #{{id}} from its vehicle? It will remain in your ledger as a standalone transaction.", { id: tx.internal_id }))) {
            return
        }
        try {
            await updateMutation.mutateAsync({
                internalId: tx.internal_id!,
                data: { vehicle_id: null },
            })
        } catch (error) {
            console.error("Failed to unlink transaction:", error)
        }
    }, [updateMutation, t])



    // Handle page change
    const handlePageChange = useCallback((page: number) => {
        setFilters((prev) => ({ ...prev, page }))
    }, [])

    // Handle filter apply
    const handleApplyFilters = useCallback((newFilters: TransactionFilters) => {
        setFilters((prev) => ({
            ...newFilters,
            page: 1, // Reset to first page on filter change
            per_page: prev.per_page,
        }))
    }, [])



    // Handle search debounce
    useEffect(() => {
        const timer = setTimeout(() => {
            setFilters((prev) => ({
                ...prev,
                search: searchValue.trim() || undefined,
                page: 1,
            }))
        }, 400)
        return () => clearTimeout(timer)
    }, [searchValue])

    // Handle per page
    const handlePerPageChange = useCallback((newPerPage: number) => {
        savePagePref("drivebase_transactions_per_page", newPerPage)
        setFilters(prev => ({ ...prev, per_page: newPerPage, page: 1 }))
    }, [])

    // Clear search
    const handleClearSearch = useCallback(() => {
        setSearchValue("")
        setFilters((prev) => ({
            ...prev,
            search: undefined,
            page: 1,
        }))
    }, [])

    // Handle delete click
    const handleDeleteClick = useCallback((transaction: TransactionListItem) => {
        setTransactionToDelete(transaction)
        setDeleteDialogOpen(true)
    }, [])

    // Confirm delete
    const handleConfirmDelete = useCallback(async (optsOrCascade?: boolean | { forceCascade?: boolean; unlinkDelete?: boolean; mode?: string }) => {
        if (transactionToDelete?.internal_id) {
            const isObj = typeof optsOrCascade === "object" && optsOrCascade !== null
            const forceCascade = isObj ? (optsOrCascade.forceCascade || optsOrCascade.mode === "cascade") : Boolean(optsOrCascade)
            const unlinkDelete = isObj ? (optsOrCascade.unlinkDelete || optsOrCascade.mode === "unlink_delete") : false
            const deleteMode = isObj ? optsOrCascade.mode : (forceCascade ? "cascade" : "deactivate")

            await deleteMutation.mutateAsync({
                internalId: transactionToDelete.internal_id,
                forceCascade,
                unlinkDelete,
                deleteMode,
            })
            setDeleteDialogOpen(false)
            setTransactionToDelete(null)
        }
    }, [transactionToDelete, deleteMutation])

    // Handle activate
    const handleActivate = useCallback(async (transaction: TransactionListItem) => {
        if (transaction.internal_id) {
            await activateMutation.mutateAsync(transaction.internal_id)
        }
    }, [activateMutation])

    // Handle PDF Download
    const handleDownloadPDF = async () => {
        setPdfLoading(true)
        try {
            const params = new URLSearchParams()
            Object.entries(filters).forEach(([key, value]) => {
                if (value !== undefined && value !== null && value !== "") {
                    params.append(key, String(value))
                }
            })

            const response = await api.get(`/transactions/export-pdf?${params}`, {
                responseType: 'blob'
            })

            const blob = new Blob([response.data], { type: 'application/pdf' })
            const url = window.URL.createObjectURL(blob)
            window.open(url, '_blank')
            // Don't revoke URL immediately as it needs to load in new tab
            setTimeout(() => window.URL.revokeObjectURL(url), 1000)
        } catch (error) {
            console.error("Failed to download PDF:", error)
        } finally {
            setPdfLoading(false)
        }
    }

    // Handle sort column click
    const handleSort = useCallback((field: string) => {
        setFilters((prev) => {
            // If same field, toggle order; otherwise set new field with desc
            if (prev.sort === field) {
                return {
                    ...prev,
                    order: prev.order === "asc" ? "desc" : "asc",
                    page: 1,
                }
            }
            return {
                ...prev,
                sort: field,
                order: "desc",
                page: 1,
            }
        })
    }, [])

    return (
        <div className="space-y-3">
            {/* Page Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 dark:border-border pb-2">
                <div>
                    <h1 className="text-base font-semibold tracking-tight text-gray-900 dark:text-foreground">{t("transactions.title", "Transactions")}</h1>
                </div>
                <div className="flex items-center gap-1.5">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7.5 px-2.5 text-xs gap-1.5"
                        onClick={() => setImportModalOpen(true)}
                    >
                        <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                        {t("transactions.importCsv", "Import CSV")}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7.5 px-2.5 text-xs gap-1.5"
                        onClick={handleDownloadPDF}
                        disabled={pdfLoading}
                    >
                        {pdfLoading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <Download className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        {pdfLoading ? t("transactions.generating", "Generating...") : t("transactions.exportPdf", "Export PDF")}
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            const next = !showFinancialSummary
                            setShowFinancialSummary(next)
                            saveBoolPref(PREF_SHOW_TX_SUMMARY, next)
                        }}
                        className="h-7.5 px-2.5 text-xs gap-1.5 text-muted-foreground hover:text-foreground border-border/80"
                        title={showFinancialSummary ? t("transactions.hideTotalsTooltip", "Hide financial totals") : t("transactions.showTotalsTooltip", "Show financial totals")}
                    >
                        <BarChart3 className="h-3.5 w-3.5 text-primary" />
                        <span>{showFinancialSummary ? t("transactions.hideTotals", "Hide Totals") : t("transactions.totals", "Totals")}</span>
                        {showFinancialSummary ? <ChevronUp className="h-3 w-3 opacity-60" /> : <ChevronDown className="h-3 w-3 opacity-60" />}
                    </Button>
                    <Link
                        to={`${basePath}/transactions/new`}
                        className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-xs hover:bg-primary/90"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        {t("transactions.addNew", "Add Transaction")}
                    </Link>
                </div>
            </div>

            {/* Success Message Banner */}
            {successMessage && (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/30 px-3 py-2 text-emerald-800 dark:text-emerald-400 animate-in slide-in-from-top-2">
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                    <span className="text-xs font-medium">{successMessage}</span>
                    <button
                        onClick={() => setSuccessMessage(null)}
                        className="ml-auto text-emerald-600 hover:text-emerald-800 dark:hover:text-emerald-300"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
            )}

            {/* Financial Summary (Collapsible) */}
            {showFinancialSummary && (
                <div className="animate-in fade-in-0 duration-200">
                    <FinancialSummaryTable
                        summary={data?.financial_summary}
                        isLoading={isLoading}
                    />
                </div>
            )}

            {/* Main Layout */}
            <div className="flex flex-col lg:flex-row relative lg:items-start gap-3.5">
                {/* Left Sidebar (Mobile) */}
                <div className="w-full lg:hidden shrink-0 order-2 mb-4">
                    <TransactionFiltersSidebar
                        filters={filters}
                        onApplyFilters={handleApplyFilters}
                    />
                </div>

                {/* Left Sidebar (Desktop) - Fixed comfortable width */}
                <div className="hidden lg:block shrink-0 order-1 w-[295px]">
                    <TransactionFiltersSidebar
                        filters={filters}
                        onApplyFilters={handleApplyFilters}
                    />
                </div>

                {/* Draggable Divider - Deactivated for now (see docs/DEACTIVATED_FEATURES.md) */}
                {/* <SplitViewDivider 
                    onDrag={handleDrag}
                    onDragStart={() => setIsDragging(true)}
                    onDragEnd={handleDragEnd}
                    className="hidden lg:flex order-2"
                    handlePosition="top"
                /> */}

                {/* Right Content */}
                <div className="flex-1 min-w-0 order-1 lg:order-2 flex flex-col gap-3 mb-4 lg:mb-0">
                    {/* Toolbar */}
                    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                        {/* Search */}
                        <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                type="text"
                                placeholder={t("transactions.searchPlaceholder", "Search across ID, vehicle, category, amount, partner...")}
                                className="pl-8 pr-8 h-8 text-xs"
                                value={searchValue}
                                onChange={(e) => setSearchValue(e.target.value)}
                            />
                            {searchValue && (
                                <button
                                    onClick={handleClearSearch}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            {searchValue && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 text-xs text-muted-foreground hover:text-foreground"
                                    onClick={() => {
                                        setSearchValue("")
                                        setFilters(prev => ({
                                            ...prev,
                                            search: undefined,
                                            page: 1,
                                            status: undefined,
                                            type: undefined,
                                            category: undefined,
                                            vehicle: undefined,
                                            start_date: undefined,
                                            end_date: undefined,
                                        }))
                                    }}
                                >
                                    <RefreshCw className="mr-1.5 h-3 w-3" />
                                    {t("transactions.reset", "Reset")}
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Transaction Table */}
                    <TransactionTable
                        transactions={data?.transactions?.items || []}
                        isLoading={isLoading}
                        onDelete={handleDeleteClick}
                        onActivate={handleActivate}
                        onUnlink={handleUnlink}
                        sortField={filters.sort}
                        sortOrder={filters.order}
                        onSort={handleSort}
                    />
                </div>
            </div>

            {/* Padding to prevent sticky footer overlap */}
            <div className="pb-24" />

            {/* Pagination Sticky Footer */}
            <StickyFooter>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground font-medium">
                    {t("common.showing", "Showing")}
                    <PerPageInput
                        value={filters.per_page || 20}
                        onChange={handlePerPageChange}
                        total={data?.transactions?.total}
                        label=""
                    />
                    {t("common.of", "of")}{" "}
                    <span className="text-foreground">{data?.transactions?.total || 0}</span>{" "}
                    {t("transactions.transactionsLabel", "transactions")}
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={!data?.transactions || data.transactions.page <= 1}
                        onClick={() => handlePageChange((data?.transactions?.page || 1) - 1)}
                    >
                        {t("common.previous", "Previous")}
                    </Button>
                    <span className="text-sm text-muted-foreground px-2 font-medium flex items-center gap-1.5">
                        {t("common.page", "Page")}{" "}
                        <PageInput
                            currentPage={data?.transactions?.page || 1}
                            totalPages={data?.transactions?.total ? Math.ceil(data.transactions.total / (filters.per_page || 20)) : 1}
                            onPageChange={handlePageChange}
                            disabled={isFetching}
                        />
                        {" "}{t("common.of", "of")}{" "}
                        <span className="text-foreground">{data?.transactions?.total ? Math.ceil(data.transactions.total / (filters.per_page || 20)) : 1}</span>
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={!data?.transactions || data.transactions.page >= Math.ceil(data.transactions.total / (filters.per_page || 20))}
                        onClick={() => handlePageChange((data?.transactions?.page || 1) + 1)}
                    >
                        {t("common.next", "Next")}
                    </Button>
                </div>
            </StickyFooter>

            {/* Loading overlay for background updates */}
            {isFetching && !isLoading && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/30 backdrop-blur-[1px]">
                    <div className="bg-card border border-border shadow-xl rounded-full px-6 py-2.5 flex items-center gap-3 animate-in fade-in zoom-in duration-300">
                        <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                        <span className="text-sm font-medium text-muted-foreground">Refreshing...</span>
                    </div>
                </div>
            )}



            {/* Smart Delete Confirmation Dialog */}
            <SmartDeleteModal
                open={deleteDialogOpen}
                onOpenChange={setDeleteDialogOpen}
                entityType="transaction"
                entityId={transactionToDelete?.internal_id ?? null}
                entityName={transactionToDelete ? `Transaction #${transactionToDelete.internal_id}` : ""}
                onConfirm={handleConfirmDelete}
                isPending={deleteMutation.isPending}
            />

            {/* Import Transactions Modal */}
            <ImportTransactionsModal
                open={importModalOpen}
                onOpenChange={setImportModalOpen}
            />
        </div>
    )
}

export default TransactionsPage
