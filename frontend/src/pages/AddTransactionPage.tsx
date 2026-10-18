import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { ArrowLeft, Loader2, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TransactionForm } from "@/components/transactions/TransactionForm"
import { useCreateTransaction, useNextTransactionId } from "@/hooks/useTransactions"
import type { TransactionFormData } from "@/types/transaction"

/**
 * Add Transaction Page
 * Route: /:business_slug/transactions/new
 */
export function AddTransactionPage() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const { business_slug, locale } = useParams<{ business_slug: string; locale?: string }>()
    const [searchParams] = useSearchParams()
    const vehicleParam = searchParams.get("vehicle_id") || searchParams.get("vehicle")
    const parsedVehicleId = vehicleParam ? parseInt(vehicleParam, 10) : undefined
    const initialVehicleId = parsedVehicleId && !isNaN(parsedVehicleId) ? parsedVehicleId : undefined

    const createMutation = useCreateTransaction()

    // Fetch the projected next ID
    const { data: nextId, isLoading: nextIdLoading } = useNextTransactionId()

    const basePath = locale ? `/${business_slug}/${locale}` : `/${business_slug}`

    const handleSubmit = async (data: TransactionFormData) => {
        try {
            await createMutation.mutateAsync(data)
            // Redirect with success message
            navigate(`${basePath}/transactions?success=${encodeURIComponent("Transaction added successfully.")}`)
        } catch (error) {
            console.error("Failed to create transaction:", error)
        }
    }

    const handleBack = () => {
        // Smart back: use browser history if available, otherwise fallback to transactions list
        if (window.history.state && window.history.state.idx > 0) {
            navigate(-1)
        } else {
            navigate(`${basePath}/transactions`)
        }
    }

    return (
        <div className="space-y-3">
            {/* Page Header */}
            <div className="flex items-center justify-between gap-2 border-b border-gray-200 dark:border-border pb-1.5">
                <div className="flex min-w-0 items-center gap-2">
                    <Button variant="outline" size="icon" className="size-7 shrink-0" onClick={handleBack} aria-label={t("common.back", "Back")}>
                        <ArrowLeft className="size-3.5" />
                    </Button>
                    <div className="flex items-center gap-2 min-w-0">
                        <h1 className="text-sm font-semibold tracking-tight text-heading">
                            {t("transactions.form.addNewTitle", "Add New Transaction")}
                        </h1>
                        <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[10px] font-medium bg-[#F9FAFB] dark:bg-secondary text-muted-foreground border border-gray-200 dark:border-border">
                            {nextIdLoading ? (
                                <Loader2 className="size-2.5 animate-spin mr-1" />
                            ) : null}
                            {t("transactions.form.nextId", "Next ID")}: #{nextId ?? "..."}
                        </span>
                    </div>
                </div>

                {/* Right: Save/Create Button right on the header line */}
                <div className="flex items-center gap-2">
                    <Button
                        type="submit"
                        form="transaction-form"
                        disabled={createMutation.isPending}
                        size="sm"
                        className="h-7 text-xs bg-primary text-primary-foreground hover:opacity-90 px-3 shadow-2xs"
                    >
                        {createMutation.isPending ? (
                            <>
                                <Loader2 className="mr-1.5 size-3 animate-spin" />
                                {t("transactions.form.creating", "Creating...")}
                            </>
                        ) : (
                            <>
                                <FileText className="mr-1.5 size-3" />
                                {t("transactions.form.addTransaction", "Add Transaction")}
                            </>
                        )}
                    </Button>
                </div>
            </div>

            {/* Transaction Form */}
            <TransactionForm
                mode="create"
                initialVehicleId={initialVehicleId}
                onSubmit={handleSubmit}
                isLoading={createMutation.isPending}
            />
        </div>
    )
}
