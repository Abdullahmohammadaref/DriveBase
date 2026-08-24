import { ChevronLeft, ChevronRight } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface RecordNavigationProps {
    /** Base path for navigation (e.g., "/haselhorst-automobile/vehicles") */
    basePath: string
    /** ID of the previous record (null if at the beginning) */
    prevId: number | null | undefined
    /** ID of the next record (null if at the end) */
    nextId: number | null | undefined
    /** Optional suffix for the path (e.g., "/edit") */
    pathSuffix?: string
    /** Label for accessibility */
    label?: string
    className?: string
}

/**
 * Navigation arrows for browsing through records without returning to the list.
 * Displays left/right arrows to navigate to previous/next records.
 */
export function RecordNavigation({
    basePath,
    prevId,
    nextId,
    pathSuffix = "",
    label = "Record",
    className,
}: RecordNavigationProps) {
    const navigate = useNavigate()

    const handlePrev = () => {
        if (prevId !== null && prevId !== undefined) {
            navigate(`${basePath}/${prevId}${pathSuffix}`)
        }
    }

    const handleNext = () => {
        if (nextId !== null && nextId !== undefined) {
            navigate(`${basePath}/${nextId}${pathSuffix}`)
        }
    }

    return (
        <div className={cn("flex items-center gap-1", className)}>
            <Button
                variant="outline"
                size="sm"
                onClick={handlePrev}
                disabled={prevId === null || prevId === undefined}
                title={`Previous ${label}`}
                className="size-6.5 p-0 rounded border border-gray-200 dark:border-border text-gray-500 hover:bg-gray-50 dark:hover:bg-muted"
            >
                <ChevronLeft className="size-3.5" />
                <span className="sr-only">Previous {label}</span>
            </Button>

            <Button
                variant="outline"
                size="sm"
                onClick={handleNext}
                disabled={nextId === null || nextId === undefined}
                title={`Next ${label}`}
                className="size-6.5 p-0 rounded border border-gray-200 dark:border-border text-gray-500 hover:bg-gray-50 dark:hover:bg-muted"
            >
                <ChevronRight className="size-3.5" />
                <span className="sr-only">Next {label}</span>
            </Button>
        </div>
    )
}

interface ReviewQueueNavigationProps extends Omit<RecordNavigationProps, 'prevId' | 'nextId'> {
    /** ID of the previous review-required record */
    prevReviewId: number | null | undefined
    /** ID of the next review-required record */
    nextReviewId: number | null | undefined
}

/**
 * Navigation arrows specifically for cycling through review-required transactions.
 * Allows users to power-review pending transactions one by one.
 */
export function ReviewQueueNavigation({
    basePath,
    prevReviewId,
    nextReviewId,
    pathSuffix = "",
    className,
}: ReviewQueueNavigationProps) {
    const navigate = useNavigate()

    const handlePrev = () => {
        if (prevReviewId !== null && prevReviewId !== undefined) {
            navigate(`${basePath}/${prevReviewId}${pathSuffix}`)
        }
    }

    const handleNext = () => {
        if (nextReviewId !== null && nextReviewId !== undefined) {
            navigate(`${basePath}/${nextReviewId}${pathSuffix}`)
        }
    }

    // Don't render if there are no review items to navigate to
    if ((prevReviewId === null || prevReviewId === undefined) &&
        (nextReviewId === null || nextReviewId === undefined)) {
        return null
    }

    return (
        <div className={cn("flex items-center gap-1", className)}>
            <Button
                variant="outline"
                size="sm"
                onClick={handlePrev}
                disabled={prevReviewId === null || prevReviewId === undefined}
                title="Previous review item"
                className="size-6.5 p-0 rounded border border-amber-500/50 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950"
            >
                <ChevronLeft className="size-3.5" />
                <span className="sr-only">Previous review item</span>
            </Button>

            <Button
                variant="outline"
                size="sm"
                onClick={handleNext}
                disabled={nextReviewId === null || nextReviewId === undefined}
                title="Next review item"
                className="size-6.5 p-0 rounded border border-amber-500/50 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950"
            >
                <ChevronRight className="size-3.5" />
                <span className="sr-only">Next review item</span>
            </Button>
        </div>
    )
}
