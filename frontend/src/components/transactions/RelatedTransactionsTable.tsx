import { useState, useCallback, useMemo } from "react"
import { useParams, Link } from "react-router-dom"
import { Plus, ExternalLink, Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { TransactionTable } from "./TransactionTable"
import { useTransactions, useDeleteTransaction, useUpdateTransaction } from "@/hooks/useTransactions"
import { useVehicle } from "@/hooks/useVehicles"
import type { TransactionListItem } from "@/types/transaction"

interface RelatedTransactionsTableProps {
    vehicleId: number
    vehicleName?: string
    highlightedTransactionId?: number
    hideNavigationLink?: boolean
}

export function RelatedTransactionsTable({
    vehicleId,
    vehicleName,
    highlightedTransactionId,
    hideNavigationLink,
}: RelatedTransactionsTableProps) {
    const { t } = useTranslation()
    const { business_slug, locale } = useParams<{ business_slug: string; locale?: string }>()
    const basePath = locale ? `/${business_slug}/${locale}` : `/${business_slug}`

    // Sorting state
    const [sortConfig, setSortConfig] = useState<{ field: string; order: "asc" | "desc" }>({
        field: "date",
        order: "desc",
    })

    const handleSort = useCallback((field: string) => {
        setSortConfig((prev) => ({
            field,
            order: prev.field === field && prev.order === "asc" ? "desc" : "asc",
        }))
    }, [])

    // Fetch vehicle details
    const { data: vehicle } = useVehicle(vehicleId)

    // Fetch transactions for this vehicle
    const { data, isLoading } = useTransactions({
        vehicle: vehicleId,
        per_page: 100,
    })

    const deleteMutation = useDeleteTransaction()
    const updateMutation = useUpdateTransaction()

    // Filter out inactive transactions
    const rawTransactions = (data?.transactions?.items ?? []).filter(
        (tx) => tx.status !== "inactive"
    )

    // Sort transactions client-side
    const sortedTransactions = useMemo(() => {
        const list = [...rawTransactions]
        if (!sortConfig.field) return list

        return list.sort((a, b) => {
            let valA: any
            let valB: any

            switch (sortConfig.field) {
                case "internal_id":
                case "transaction":
                    valA = a.internal_id ?? 0
                    valB = b.internal_id ?? 0
                    break
                case "amount":
                    valA = typeof a.amount === "string" ? parseFloat(a.amount) || 0 : (a.amount ?? 0)
                    valB = typeof b.amount === "string" ? parseFloat(b.amount) || 0 : (b.amount ?? 0)
                    break
                case "date": {
                    const timeA = a.date ? new Date(a.date).getTime() : 0
                    const timeB = b.date ? new Date(b.date).getTime() : 0
                    valA = isNaN(timeA) ? 0 : timeA
                    valB = isNaN(timeB) ? 0 : timeB
                    break
                }
                case "method":
                    valA = (a.method_display || a.method || "").toLowerCase()
                    valB = (b.method_display || b.method || "").toLowerCase()
                    break
                case "status":
                    valA = (a.status_display || a.status || "").toLowerCase()
                    valB = (b.status_display || b.status || "").toLowerCase()
                    break
                default:
                    valA = (a as any)[sortConfig.field] ?? ""
                    valB = (b as any)[sortConfig.field] ?? ""
            }

            if (valA < valB) return sortConfig.order === "asc" ? -1 : 1
            if (valA > valB) return sortConfig.order === "asc" ? 1 : -1

            const idA = a.internal_id ?? 0
            const idB = b.internal_id ?? 0
            if (idA < idB) return sortConfig.order === "asc" ? -1 : 1
            if (idA > idB) return sortConfig.order === "asc" ? 1 : -1
            return 0
        })
    }, [rawTransactions, sortConfig])

    const handleDelete = async (transaction: TransactionListItem) => {
        if (!confirm(t("transactions.confirmDelete") || `Delete transaction #${transaction.internal_id}?`)) {
            return
        }
        try {
            await deleteMutation.mutateAsync(transaction.internal_id!)
        } catch (error) {
            console.error("Failed to delete transaction:", error)
        }
    }

    const handleActivate = async (transaction: TransactionListItem) => {
        console.log("Activate transaction:", transaction.internal_id)
    }

    const handleUnlink = async (transaction: TransactionListItem) => {
        if (!confirm(t("transactions.confirmUnlink", "Unlink Transaction #{{id}} from this vehicle? It will remain in your ledger as a standalone transaction.", { id: transaction.internal_id }))) {
            return
        }
        try {
            await updateMutation.mutateAsync({
                internalId: transaction.internal_id!,
                data: { vehicle_id: null },
            })
        } catch (error) {
            console.error("Failed to unlink transaction:", error)
        }
    }

    const displayId = vehicle?.internal_id || vehicleId
    const makeName = vehicle?.make_name || ""
    const modelName = vehicle?.model_name || ""

    const vehicleDisplayString = (makeName || modelName)
        ? `${makeName} ${modelName}`.trim()
        : (vehicleName || `Vehicle #${displayId}`)

    const safeVehicleName = vehicleDisplayString.replace(new RegExp(`^#?${displayId}\\s*-\\s*`), "")
    const fullVehicleLabel = `#${displayId} - ${safeVehicleName}`
    const tableTitle = t("transactions.vehicleTransactionsTitle", "{{vehicle}} Transactions", { vehicle: fullVehicleLabel })
    const linkLabel = t("transactions.goToVehicleDetails", "Go to {{vehicle}} Details", { vehicle: fullVehicleLabel })

    return (
        <div className="space-y-1.5 pt-1">
            {/* Section Title with Add Transaction Link */}
            <div className="border-b border-gray-200 dark:border-border pb-1 mb-2.5 flex items-center justify-between gap-2">
                <span className="truncate text-[11px] font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                    {tableTitle}
                </span>

                <div className="flex items-center gap-2">
                    <Link
                        to={`${basePath}/transactions/new?vehicle_id=${vehicleId}`}
                        className="inline-flex items-center gap-0.5 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline"
                    >
                        <Plus className="size-3" />
                        <span>{t("transactions.addTransaction", "Add Transaction")}</span>
                    </Link>

                    {!hideNavigationLink && (
                        <Link
                            to={`${basePath}/vehicles/${vehicleId}/edit`}
                            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-foreground ml-1"
                        >
                            <ExternalLink className="size-3" />
                            {linkLabel}
                        </Link>
                    )}
                </div>
            </div>

            {/* Loading State */}
            {isLoading ? (
                <div className="flex items-center justify-center h-28 rounded-md border border-gray-200 dark:border-border bg-card">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <div className="overflow-hidden rounded-md border border-gray-200 dark:border-border bg-white dark:bg-background shadow-xs">
                    <TransactionTable
                        transactions={sortedTransactions}
                        sortField={sortConfig.field}
                        sortOrder={sortConfig.order}
                        onSort={handleSort}
                        isLoading={false}
                        onDelete={handleDelete}
                        onActivate={handleActivate}
                        onUnlink={handleUnlink}
                        highlightedRowId={highlightedTransactionId}
                        showEmptyTable={true}
                        maxHeight="180px"
                        compactBadges={true}
                    />
                </div>
            )}
        </div>
    )
}
