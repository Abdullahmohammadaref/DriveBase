import { useState, useCallback, useEffect } from "react"
import { Link, useSearchParams, useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Plus, Search, X, Upload, CheckCircle2, Download, Loader2, RefreshCw, BarChart3, ChevronDown, ChevronUp, Landmark, Zap, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useTransactions, useDeleteTransaction, useActivateTransaction, useUpdateTransaction, useTransactionChoices } from "@/hooks/useTransactions"
import { useStarMoneySync, type UnmappedExport } from "@/hooks/useStarMoneySync"
import { cn } from "@/lib/utils"
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

    // StarMoney Desktop Auto-Sync & Directory Detection
    const {
        isDesktop,
        watchDir,
        mappings: starMoneyMappings,
        scannedFiles,
        detectedExports,
        unmappedExports,
        autoImport,
        isSyncing: isSyncingStarMoney,
        lastSyncSummary,
        scanDirectory,
        syncExport,
        syncAllDetected,
        bindNewAccount,
    } = useStarMoneySync()

    const { data: choicesData } = useTransactionChoices()
    const paymentMethods = choicesData?.method_choices || []
    const [selectedUnmappedMethod, setSelectedUnmappedMethod] = useState<string>("")

    // Auto-select payment method if export filename matches known bank name
    const currentUnmapped = unmappedExports[0]
    useEffect(() => {
        if (!currentUnmapped || !paymentMethods.length) return
        const fileName = currentUnmapped.file.name.toLowerCase()
        const autoMatch = paymentMethods.find((pm) => {
            const pmLabel = pm.label.toLowerCase()
            return fileName.includes(pmLabel)
        })
        if (autoMatch) {
            setSelectedUnmappedMethod(autoMatch.value)
        } else if (!selectedUnmappedMethod) {
            setSelectedUnmappedMethod(paymentMethods[0].value)
        }
    }, [currentUnmapped?.file.name, paymentMethods])

    // Surface auto-sync summary toast when background sync completes
    useEffect(() => {
        if (!lastSyncSummary) return
        if (lastSyncSummary.includes("Imported") || lastSyncSummary.includes("transaction")) {
            setSuccessMessage(lastSyncSummary)
            const tId = setTimeout(() => setSuccessMessage(null), 6000)
            return () => clearTimeout(tId)
        }
    }, [lastSyncSummary])

    const handleSyncStarMoney = async () => {
        setWarningMessage(null)
        setSuccessMessage(null)

        // Rescan folder to ensure immediate fresh state
        await scanDirectory()

        // 1. If folder has no files at all:
        if (scannedFiles.length === 0) {
            setWarningMessage(
                t("transactions.noExportFilesFound", `No export files found in folder '{{dir}}'. Please place your StarMoney CSV file here to sync.`, {
                    dir: watchDir,
                })
            )
            setTimeout(() => setWarningMessage(null), 8000)
            return
        }

        // 2. If folder has files, but none matched any bank mapping:
        if (detectedExports.length === 0 && unmappedExports.length > 0) {
            setWarningMessage(
                t("transactions.unmappedFilesNotice", `Found file '{{name}}', but it is not linked to any bank account yet. Please select a bank from the prompt below to link and import it.`, {
                    name: unmappedExports[0].file.name,
                })
            )
            setTimeout(() => setWarningMessage(null), 8000)
            return
        }

        // 3. If no mappings configured:
        if (starMoneyMappings.length === 0) {
            setWarningMessage(
                t("transactions.noMappingsNotice", "No bank account mappings configured. Please configure your bank in Business Settings.")
            )
            setTimeout(() => setWarningMessage(null), 7000)
            return
        }

        const results = await syncAllDetected(true)
        const totalImported = results.reduce((acc, r) => acc + (r.imported || 0), 0)
        const failed = results.filter((r) => !r.success)

        if (totalImported > 0) {
            setSuccessMessage(
                t("transactions.starMoneySyncSuccess", `Successfully imported ${totalImported} transaction(s) from StarMoney.`, {
                    count: totalImported,
                })
            )
            setTimeout(() => setSuccessMessage(null), 6000)
        } else if (failed.length > 0) {
            setImportModalOpen(true)
        } else {
            setSuccessMessage(t("transactions.starMoneyUpToDate", "StarMoney files are up to date (no new transactions)."))
            setTimeout(() => setSuccessMessage(null), 5000)
        }
    }

    const handleBindAndSync = async (unmapped: UnmappedExport) => {
        const methodVal = selectedUnmappedMethod || (paymentMethods[0] ? paymentMethods[0].value : "")
        if (!methodVal) return
        const found = paymentMethods.find((m) => m.value === methodVal)
        const pmId = parseInt(methodVal)
        const pmName = found ? found.label : "Bank"

        await bindNewAccount(unmapped.suggestedAccount, pmId, pmName)
        const res = await syncExport(
            {
                id: crypto.randomUUID(),
                payment_method_id: pmId,
                payment_method_name: pmName,
                patterns: unmapped.suggestedAccount,
            },
            unmapped.file,
            true
        )

        setSelectedUnmappedMethod("")

        if (res.success) {
            setSuccessMessage(
                t("transactions.bindSuccess", `Linked ${unmapped.suggestedAccount} to ${pmName} and imported ${res.imported || 0} transaction(s).`, {
                    bank: pmName,
                    count: res.imported || 0,
                })
            )
            setTimeout(() => setSuccessMessage(null), 6000)
        }
    }

    // Delete confirmation dialog
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
    const [transactionToDelete, setTransactionToDelete] =
        useState<TransactionListItem | null>(null)

    // Success message state (e.g., after adding a new transaction)
    const [successMessage, setSuccessMessage] = useState<string | null>(null)
    const [warningMessage, setWarningMessage] = useState<string | null>(null)

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
                    {isDesktop && starMoneyMappings.length > 0 && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7.5 px-2.5 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/5"
                            onClick={handleSyncStarMoney}
                            disabled={isSyncingStarMoney}
                            title={t("transactions.syncStarMoneyTooltip", "Synchronize StarMoney CSV files")}
                        >
                            <RefreshCw className={cn("h-3.5 w-3.5", isSyncingStarMoney && "animate-spin")} />
                            {isSyncingStarMoney
                                ? t("transactions.syncingStarMoney", "Syncing...")
                                : t("transactions.syncStarMoney", "Sync StarMoney")}
                        </Button>
                    )}
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

            {/* Warning / Informational Message Banner */}
            {warningMessage && (
                <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-800/40 px-3 py-2 text-amber-800 dark:text-amber-300 animate-in slide-in-from-top-2">
                    <AlertCircle className="h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                    <span className="text-xs font-medium">{warningMessage}</span>
                    <button
                        onClick={() => setWarningMessage(null)}
                        className="ml-auto text-amber-600 hover:text-amber-800 dark:hover:text-amber-200"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
            )}

            {/* StarMoney Auto-Importing State Banner (Desktop Only) */}
            {isDesktop && isSyncingStarMoney && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-center justify-between gap-3 shadow-xs animate-in slide-in-from-top-1">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                            <Loader2 className="h-4 w-4 animate-spin" />
                        </div>
                        <div className="min-w-0">
                            <div className="text-xs font-semibold text-foreground">
                                {t("transactions.autoSyncing", "Importing StarMoney bank transactions in background...")}
                            </div>
                            <div className="text-[11px] text-muted-foreground truncate">
                                {detectedExports
                                    .filter((d) => d.isNew)
                                    .map((d) => `${d.mapping.payment_method_name} (${d.file.name})`)
                                    .join(" • ")}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* StarMoney Manual Import Prompt (Shown ONLY when Auto-Import is disabled) */}
            {isDesktop && !autoImport && !isSyncingStarMoney && detectedExports.some((d) => d.isNew) && (
                <div className="rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 p-3 flex flex-wrap items-center justify-between gap-3 shadow-xs animate-in slide-in-from-top-1">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-900/60 flex items-center justify-center text-emerald-700 dark:text-emerald-300 shrink-0">
                            <Landmark className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                            <div className="text-xs font-semibold text-emerald-900 dark:text-emerald-100 flex items-center gap-2 flex-wrap">
                                <span>{t("transactions.detectedExportTitle", "StarMoney Export Ready")}</span>
                                <span className="text-[11px] font-normal text-emerald-700 dark:text-emerald-300 truncate">
                                    {detectedExports
                                        .filter((d) => d.isNew)
                                        .map((d) => `${d.mapping.payment_method_name} (${d.file.name})`)
                                        .join(" • ")}
                                </span>
                            </div>
                            <div className="text-[11px] text-emerald-700/90 dark:text-emerald-300/90">
                                {t("transactions.detectedExportDesc", "New bank transactions detected in export folder. Click Import to add them automatically.")}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Button
                            size="sm"
                            className="h-7.5 px-3 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer font-medium"
                            onClick={handleSyncStarMoney}
                            disabled={isSyncingStarMoney}
                        >
                            {isSyncingStarMoney ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                            {t("transactions.importNow", "Import Now")}
                        </Button>
                    </div>
                </div>
            )}

            {/* Unmapped Bank Account Detected */}
            {isDesktop && unmappedExports.length > 0 && (
                <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 p-3 flex flex-wrap items-center justify-between gap-3 shadow-xs animate-in slide-in-from-top-1">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="h-8 w-8 rounded-full bg-amber-100 dark:bg-amber-900/60 flex items-center justify-center text-amber-700 dark:text-amber-300 shrink-0">
                            <AlertCircle className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                            <div className="text-xs font-semibold text-amber-900 dark:text-amber-100 flex items-center gap-1.5">
                                <span>{t("transactions.unmappedExportTitle", "New Bank Account Detected")}</span>
                                {unmappedExports.length > 1 && (
                                    <span className="text-[10px] font-normal px-1.5 py-0.2 rounded bg-amber-200/60 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200">
                                        (1 of {unmappedExports.length})
                                    </span>
                                )}
                            </div>
                            <div className="text-[11px] text-amber-700 dark:text-amber-300">
                                {t("transactions.unmappedExportDesc", "Found export file '{{name}}'. Select which bank this belongs to:", {
                                    name: unmappedExports[0].file.name,
                                })}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <select
                            value={selectedUnmappedMethod || (paymentMethods[0]?.value ?? "")}
                            onChange={(e) => setSelectedUnmappedMethod(e.target.value)}
                            className="h-7.5 px-2.5 text-xs bg-background border border-border rounded-md text-foreground font-medium shadow-xs"
                        >
                            {paymentMethods.map((pm) => (
                                <option key={pm.value} value={pm.value}>
                                    {pm.label}
                                </option>
                            ))}
                        </select>
                        <Button
                            size="sm"
                            className="h-7.5 px-3 text-xs bg-amber-600 hover:bg-amber-700 text-white font-medium cursor-pointer shadow-xs gap-1"
                            onClick={() => handleBindAndSync(unmappedExports[0])}
                            disabled={isSyncingStarMoney}
                        >
                            <Zap className="h-3.5 w-3.5" />
                            {t("transactions.linkAndImport", "Link & Import")}
                        </Button>
                    </div>
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
