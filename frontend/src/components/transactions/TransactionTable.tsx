import { Link, useParams, useNavigate } from "react-router-dom"
import { FileText, Trash2, RotateCcw, ArrowUpDown, ArrowUp, ArrowDown, Unlink } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import type { TransactionListItem } from "@/types/transaction"

interface TransactionTableProps {
    transactions: TransactionListItem[]
    isLoading?: boolean
    onDelete: (transaction: TransactionListItem) => void
    onActivate: (transaction: TransactionListItem) => void
    onUnlink?: (transaction: TransactionListItem) => void
    // Sorting props
    sortField?: string
    sortOrder?: "asc" | "desc"
    onSort?: (field: string) => void
    // Highlight a specific row (for Related Transactions view)
    highlightedRowId?: number
    // Show empty state with table headers instead of simple message
    showEmptyTable?: boolean
    // Max height for the table body container (enables vertical scrolling)
    maxHeight?: string | number
    // Use compact two-line badges for long statuses
    compactBadges?: boolean
}

/**
 * Transaction data table matching legacy transactions_table.html
 */
export function TransactionTable({
    transactions,
    isLoading,
    onDelete,
    onActivate,
    onUnlink,
    sortField,
    sortOrder,
    onSort,
    highlightedRowId,
    showEmptyTable,
    maxHeight,
    compactBadges: _compactBadges,
}: TransactionTableProps) {
    const { business_slug, locale } = useParams<{ business_slug: string; locale?: string }>()
    const { t, i18n } = useTranslation()
    const navigate = useNavigate()
    const rowLinkClass = "block h-full px-3 py-1 text-inherit no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    const getTransactionHref = (internalId: number | null) =>
        locale
            ? `/${business_slug}/${locale}/transactions/${internalId}/edit`
            : `/${business_slug}/transactions/${internalId}/edit`

    // Helper for sortable header rendering
    const renderSortableHeader = (field: string, children: React.ReactNode, className?: string) => {
        const isSorted = sortField === field
        const icon = !isSorted ? (
            <ArrowUpDown className="h-3.5 w-3.5 ml-1 opacity-50 shrink-0" />
        ) : sortOrder === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5 ml-1 text-primary shrink-0" />
        ) : (
            <ArrowDown className="h-3.5 w-3.5 ml-1 text-primary shrink-0" />
        )

        return (
            <TableHead
                onClick={() => onSort?.(field)}
                className={cn(
                    "sticky top-0 z-20 bg-gray-50 dark:bg-secondary font-semibold cursor-pointer select-none hover:bg-muted/70 px-3 py-0.5 transition-colors",
                    isSorted && "text-foreground",
                    className
                )}
            >
                <div
                    className={cn(
                        "flex items-center gap-1 w-full",
                        className?.includes("text-right") ? "justify-end" : ""
                    )}
                >
                    <span>{children}</span>
                    {icon}
                </div>
            </TableHead>
        )
    }


    // Format currency - handles Decimal (string) or number
    const formatCurrency = (amount: number | string | null | undefined, currency: string | null) => {
        if (amount === null || amount === undefined) return "-"
        const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount
        if (isNaN(numAmount)) return "-"

        let currencyCode = currency || "EUR"
        // If currency contains brackets like "US Dollar (USD)", extract the code "USD"
        const offset = currencyCode.indexOf("(")
        if (offset !== -1) {
            const match = currencyCode.match(/\(([^)]+)\)/)
            if (match) {
                currencyCode = match[1]
            }
        }

        try {
            const formattedNum = new Intl.NumberFormat("de-DE", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            }).format(numAmount)
            return `${formattedNum} ${currencyCode}`
        } catch {
            return `${numAmount} ${currencyCode}`
        }
    }

    // Format date - handles both string and Date object
    const formatDate = (dateValue: string | Date | null | undefined) => {
        if (!dateValue) return "-"
        const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue
        if (isNaN(date.getTime())) return "-"
        return date.toLocaleDateString(i18n.language)
    }

    const getStatusBadge = (status: string | null, statusDisplay: string | null) => {
        if (!status) return null

        if (status === "confirmed") {
            return (
                <Badge variant="success">
                    <span className="size-1.5 shrink-0 rounded-full bg-current mr-1" />
                    {t(`status.${status}`) || statusDisplay || "Bestätigt"}
                </Badge>
            )
        }

        if (status === "review_required" || status === "under_review") {
            return (
                <Badge variant="warning">
                    <span className="size-1.5 shrink-0 rounded-full bg-current mr-1" />
                    {t(`status.${status}`) || statusDisplay || "Ausstehend"}
                </Badge>
            )
        }

        if (status === "inactive") {
            return (
                <Badge variant="secondary">
                    {t(`status.${status}`) || statusDisplay || "Inaktiv"}
                </Badge>
            )
        }

        return (
            <Badge variant="outline">
                {t(`status.${status}`) || statusDisplay || status}
            </Badge>
        )
    }

    if (isLoading) {
        return (
            <div className="rounded-md border border-border bg-card">
                <div className="h-48 animate-pulse bg-muted rounded" />
            </div>
        )
    }

    if (!transactions.length) {
        if (showEmptyTable) {
            return (
                <div className="rounded-md border border-gray-200 dark:border-border bg-white dark:bg-card overflow-hidden shadow-xs">
                    <Table containerClassName={maxHeight ? "overflow-y-auto max-h-[180px]" : undefined}>
                        <TableHeader className="sticky top-0 z-20 bg-gray-50/95 dark:bg-secondary/95 backdrop-blur-xs border-b border-gray-200 dark:border-border">
                            <TableRow className="h-7 bg-gray-50/95 dark:bg-secondary/95 hover:bg-gray-50/95 border-b border-gray-200 dark:border-border">
                                <TableHead className="sticky top-0 z-20 bg-gray-50 dark:bg-secondary h-7 px-3 py-0.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">{t("transactions.table.transaction")}</TableHead>
                                <TableHead className="sticky top-0 z-20 bg-gray-50 dark:bg-secondary h-7 px-3 py-0.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider text-right">{t("transactions.table.amount")}</TableHead>
                                <TableHead className="sticky top-0 z-20 bg-gray-50 dark:bg-secondary h-7 px-3 py-0.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">{t("transactions.table.date")}</TableHead>
                                <TableHead className="sticky top-0 z-20 bg-gray-50 dark:bg-secondary h-7 px-3 py-0.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">{t("transactions.table.method")}</TableHead>
                                <TableHead className="sticky top-0 z-20 bg-gray-50 dark:bg-secondary h-7 px-3 py-0.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">{t("transactions.table.status")}</TableHead>
                                <TableHead className="sticky top-0 z-20 bg-gray-50 dark:bg-secondary h-7 px-3 py-0.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider w-20 text-right">{t("transactions.table.actions")}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-6 text-xs text-muted-foreground">
                                    {t("transactions.noTransactionsForVehicle") || "No transactions yet for this vehicle."}
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </div>
            )
        }
        return (
            <div className="rounded-md border border-dashed border-border p-8 text-center">
                <p className="text-xs text-muted-foreground">{t("transactions.noTransactions")}</p>
            </div>
        )
    }

    return (
        <div className="rounded-md border border-gray-200 dark:border-border bg-white dark:bg-card overflow-hidden shadow-xs">
            <Table containerClassName={maxHeight ? "overflow-y-auto max-h-[180px]" : undefined}>
                <TableHeader className="sticky top-0 z-20 bg-gray-50/95 dark:bg-secondary/95 backdrop-blur-xs border-b border-gray-200 dark:border-border">
                    <TableRow className="h-7 bg-gray-50/95 dark:bg-secondary/95 hover:bg-gray-50/95 border-b border-gray-200 dark:border-border">
                        {renderSortableHeader("internal_id", t("transactions.table.transaction"), "h-7 text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider px-3 py-0.5")}
                        {renderSortableHeader("amount", t("transactions.table.amount"), "h-7 text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider text-right w-28 md:w-32 px-3 py-0.5")}
                        {renderSortableHeader("date", t("transactions.table.date"), "h-7 text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider px-3 py-0.5")}
                        {renderSortableHeader("method", t("transactions.table.method"), "h-7 text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider px-3 py-0.5")}
                        {renderSortableHeader("status", t("transactions.table.status"), "h-7 text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider px-3 py-0.5")}
                        <TableHead className="sticky top-0 z-20 bg-gray-50 dark:bg-secondary h-7 px-3 py-0.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider w-20 text-right">{t("transactions.table.actions")}</TableHead>
                    </TableRow>
                </TableHeader>
                    <TableBody>
                        {transactions.map((tx) => {
                            const transactionHref = getTransactionHref(tx.internal_id)

                            return (
                                <TableRow
                                    key={tx.id}
                                    className={cn(
                                        "h-8 cursor-pointer hover:bg-gray-50/60 dark:hover:bg-muted/40 transition-colors border-b border-gray-100 dark:border-border last:border-b-0 text-xs",
                                        tx.status === "inactive" && "opacity-50",
                                        highlightedRowId === tx.internal_id && "bg-primary/10 ring-1 ring-primary ring-inset"
                                    )}
                                    onClick={(e) => {
                                        const target = e.target as HTMLElement
                                        if (target.closest("button") || target.closest("a")) {
                                            return
                                        }
                                        navigate(transactionHref)
                                    }}
                                >
                                {/* Transaction Info */}
                                <TableCell className="p-0">
                                    <Link
                                        to={transactionHref}
                                        className="block h-full px-3 py-1 text-inherit no-underline"
                                    >
                                        <div className="flex items-center gap-1.5 truncate">
                                            <span className="font-medium text-foreground text-xs truncate">
                                                #{tx.internal_id} - {tx.category_display || tx.category || t('transactions.table.uncategorized')}
                                            </span>
                                            {tx.subcategory && (
                                                <span className="text-[11px] text-muted-foreground truncate">
                                                    · {tx.subcategory}
                                                </span>
                                            )}
                                        </div>
                                    </Link>
                                </TableCell>

                                {/* Amount */}
                                <TableCell className="p-0 text-right w-28 md:w-32">
                                    <Link
                                        to={transactionHref}
                                        className="block h-full px-3 py-1 text-right text-inherit no-underline"
                                    >
                                        <span
                                            className={cn(
                                                "font-mono font-bold text-xs",
                                                parseFloat(String(tx.amount ?? 0)) >= 0
                                                    ? "text-[#318d6c]"
                                                    : "text-[#d23a69]"
                                            )}
                                        >
                                            {formatCurrency(tx.amount, tx.currency)}
                                        </span>
                                    </Link>
                                </TableCell>

                                {/* Date */}
                                <TableCell className="p-0 text-muted-foreground">
                                    <Link
                                        to={transactionHref}
                                        className={rowLinkClass}
                                    >
                                        {formatDate(tx.date)}
                                    </Link>
                                </TableCell>

                                {/* Method */}
                                <TableCell className="p-0 text-muted-foreground">
                                    <Link
                                        to={transactionHref}
                                        className={rowLinkClass}
                                    >
                                        {tx.method_display || tx.method || "-"}
                                    </Link>
                                </TableCell>

                                {/* Status */}
                                <TableCell className="p-0">
                                    <Link
                                        to={transactionHref}
                                        className={rowLinkClass}
                                    >
                                        {getStatusBadge(tx.status, tx.status_display)}
                                    </Link>
                                </TableCell>

                                {/* Actions */}
                                <TableCell className="py-0 px-2">
                                    <div className="flex items-center justify-end gap-1">
                                        {/* Create Document / PDF */}
                                        {tx.can_generate_pdf && (
                                            <a
                                                href={`/api/transactions/${tx.internal_id}/pdf`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                className="inline-flex items-center justify-center size-6 rounded-md hover:bg-muted transition-colors"
                                                title={t('common.generatePdf', 'Generate PDF')}
                                            >
                                                <FileText className="size-3 text-muted-foreground" />
                                            </a>
                                        )}

                                        {/* Unlink from vehicle */}
                                        {onUnlink && (tx.vehicle_id || tx.vehicle_internal_id) && tx.status !== "inactive" && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="size-6 text-amber-600 hover:bg-amber-100 hover:text-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/40"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    onUnlink(tx)
                                                }}
                                                title={t('transactions.unlinkVehicle', 'Unlink from vehicle')}
                                            >
                                                <Unlink className="size-3" />
                                            </Button>
                                        )}

                                        {/* Delete/Activate */}
                                        {tx.status === "inactive" ? (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="size-6"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    onActivate(tx)
                                                }}
                                                title={t('common.activate', 'Activate')}
                                            >
                                                <RotateCcw className="size-3 text-success-600" />
                                            </Button>
                                        ) : (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="size-6 text-red-500 hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-900/40 dark:hover:text-red-400"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    onDelete(tx)
                                                }}
                                                title={t('common.delete', 'Delete')}
                                            >
                                                <Trash2 className="size-3" />
                                            </Button>
                                        )}
                                    </div>
                                </TableCell>
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>
        </div>
    )
}
