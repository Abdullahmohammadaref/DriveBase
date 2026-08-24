import { useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Loader2 } from "lucide-react"
// import { Columns2, Rows2 } from "lucide-react" // DEACTIVATED: Split view toggle icons
import { Button } from "@/components/ui/button"
import { TransactionForm } from "@/components/transactions/TransactionForm"
import { useTransaction, transactionKeys } from "@/hooks/useTransactions"
import { useAutoSave } from "@/hooks/useAutoSave"
// import { getSplitWidth, saveSplitWidth } from "@/lib/paginationPrefs" // DEACTIVATED: Split view width
import type { TransactionFormData, TransactionUpdateData } from "@/types/transaction"
import { RecordNavigation, ReviewQueueNavigation } from "@/components/RecordNavigation"

/**
 * Edit Transaction Page
 * Route: /:business_slug/transactions/:id
 * 
 * Features:
 * - Auto-save on field changes (debounced for text inputs)
 * - Navigation arrows to browse through transactions
 * - Review Queue navigation for cycling through review-required items
 * - Cache invalidation ensures fresh data on navigation
 */
export function EditTransactionPage() {
    const navigate = useNavigate()
    const { business_slug, id } = useParams()
    const transactionId = id ? parseInt(id) : 0

    // Fetch existing transaction data
    // Use isFetching to distinguish between initial load and navigation refetch
    const { data: transaction, isLoading, isFetching, error } = useTransaction(transactionId)

    /* 
     * =========================================================================
     * DEACTIVATED FEATURE: Split View in Edit Transaction Page
     * To reactivate:
     * 1. Uncomment the splitViewToggle block below.
     * 2. Pass isSplitView, splitViewToggle, splitViewWidth, etc. to <TransactionForm />.
     * See docs/DEACTIVATED_FEATURES.md for full details.
     * =========================================================================
     */
    /*
    const [isSplitView, setIsSplitView] = useState<boolean>(() => {
        const stored = localStorage.getItem("acar_transaction_split_view")
        return stored === null ? true : stored === "true"
    })

    useEffect(() => {
        localStorage.setItem("acar_transaction_split_view", String(isSplitView))
    }, [isSplitView])

    const [panelWidth, setPanelWidth] = useState(() => getSplitWidth("acar_transaction_split_width", 450))
    const [isDragging, setIsDragging] = useState(false)

    const handleWidthSave = () => {
        setIsDragging(false)
        saveSplitWidth("acar_transaction_split_width", panelWidth)
    }

    const splitViewToggle = (
        <div className="flex items-center gap-2">
            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsSplitView(!isSplitView)}
                className="hidden lg:flex gap-2 text-muted-foreground hover:text-foreground"
            >
                {isSplitView ? (
                    <>
                        <Rows2 className="h-4 w-4" />
                        Stack View
                    </>
                ) : (
                    <>
                        <Columns2 className="h-4 w-4" />
                        Split View
                    </>
                )}
            </Button>
        </div>
    )
    */
    // Auto-save hook with cache invalidation
    // - updateQueryKey: Instantly updates the detail cache with response data
    // - invalidateQueryKeys: Marks list queries as stale so navigation shows fresh data
    const { status: autoSaveStatus, errorMessage, saveNow, saveDebounced } = useAutoSave<TransactionUpdateData>({
        endpoint: `/transactions/${transactionId}`,
        method: 'PUT',  // Transaction API uses PUT, not PATCH
        // Direct cache update for instant feedback (no visual flicker)
        updateQueryKey: transactionKeys.detail(transactionId),
        // Invalidate related queries so list view shows updated data
        invalidateQueryKeys: [
            transactionKeys.lists(),  // Invalidate all list queries (with any filters)
        ],
    })

    // Legacy submit handler (for backwards compatibility with Add mode in TransactionForm)
    // In edit mode, this is essentially a no-op since auto-save handles everything
    const handleSubmit = async (data: TransactionFormData) => {
        // In edit mode, we use auto-save, so we don't need manual submission
        // If this somehow gets called, just log and don't navigate
        console.log("[EditTransactionPage] handleSubmit called (should be handled by auto-save)", data)
    }

    const handleBack = () => {
        // Smart back: use browser history if available, otherwise fallback to transactions list
        if (window.history.state && window.history.state.idx > 0) {
            navigate(-1)
        } else {
            navigate(`/${business_slug}/transactions`)
        }
    }

    // Show loading state for initial load OR when navigating to a new transaction
    // This prevents the "Not Found" state from flashing during navigation
    if (isLoading || isFetching) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (error || !transaction) {
        return (
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={handleBack}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <h1 className="text-2xl font-bold text-foreground">Transaction Not Found</h1>
                </div>
                <p className="text-muted-foreground">
                    The transaction with ID {id} could not be found.
                </p>
            </div>
        )
    }



    const headerNode = (
        <div className="flex items-center justify-between gap-2 border-b border-gray-200 dark:border-border pb-1.5 mb-2.5">
            <div className="flex min-w-0 items-center gap-2">
                <Button variant="outline" size="icon" className="size-7 shrink-0" onClick={handleBack} type="button">
                    <ArrowLeft className="size-3.5" />
                </Button>
                <div className="flex items-baseline gap-2 min-w-0">
                    <h1 className="text-sm font-semibold tracking-tight text-heading">
                        Edit Transaction <span className="text-muted-foreground font-normal">#{transaction.internal_id}</span>
                    </h1>
                    <span className="hidden sm:inline text-[11px] text-muted-foreground truncate">
                        Transactions / #{transaction.internal_id}
                    </span>
                </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
                <RecordNavigation
                    basePath={`/${business_slug}/transactions`}
                    prevId={transaction.prev_transaction_internal_id}
                    nextId={transaction.next_transaction_internal_id}
                    pathSuffix="/edit"
                    label="Transaction"
                />
                <ReviewQueueNavigation
                    basePath={`/${business_slug}/transactions`}
                    prevReviewId={transaction.prev_review_required_internal_id}
                    nextReviewId={transaction.next_review_required_internal_id}
                    pathSuffix="/edit"
                />
            </div>
        </div>
    )

    return (
        <div>
            {/* Transaction Form (includes Related Transactions Table) */}
            <TransactionForm
                mode="edit"
                initialData={transaction}
                onSubmit={handleSubmit}
                isLoading={false}
                highlightedTransactionId={transaction.internal_id ?? undefined}
                onAutoSave={saveNow}
                onAutoSaveDebounced={saveDebounced}
                autoSaveStatus={autoSaveStatus}
                autoSaveErrorMessage={errorMessage}
                isSplitView={false}
                header={headerNode}
            />
        </div>
    )
}

