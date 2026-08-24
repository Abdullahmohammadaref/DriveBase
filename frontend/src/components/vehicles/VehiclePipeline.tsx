import { ChevronRight } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"

export type VehicleStatus = "purchased" | "ready_for_sale" | "reserved" | "sold" | "inactive"

interface VehiclePipelineProps {
    currentStatus: VehicleStatus
    canMoveTo: string[]
    onStatusChange?: (newStatus: VehicleStatus) => void
    orientation?: "horizontal" | "vertical"
    disabled?: boolean
    className?: string
}

const PIPELINE_ORDER: VehicleStatus[] = ["purchased", "ready_for_sale", "reserved", "sold"]

export function VehiclePipeline({
    currentStatus,
    canMoveTo,
    onStatusChange,
    orientation = "horizontal",
    disabled = false,
    className,
}: VehiclePipelineProps) {
    const { t } = useTranslation()
    const currentIndex = PIPELINE_ORDER.indexOf(currentStatus)

    return (
        <div
            className={cn(
                "flex items-center gap-1 overflow-x-auto",
                orientation === "vertical" ? "flex-col items-start" : "flex-row",
                className
            )}
        >
            {PIPELINE_ORDER.map((status, index) => {
                const isCurrent = currentStatus === status
                const isPast = currentIndex > -1 && index < currentIndex
                const isClickable = !disabled && canMoveTo.includes(status) && Boolean(onStatusChange)
                const isDoneOrActive = isCurrent || isPast

                let pillStyle = "border-border bg-secondary text-muted-foreground"
                if (isDoneOrActive) {
                    pillStyle = "border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800"
                }

                return (
                    <div key={status} className="flex items-center gap-1 shrink-0">
                        <button
                            type="button"
                            disabled={!isClickable || disabled}
                            onClick={() => {
                                if (isClickable && onStatusChange) {
                                    onStatusChange(status)
                                }
                            }}
                            className={cn(
                                "inline-flex h-5 shrink-0 items-center gap-1 rounded-md border px-2 text-[11px] font-medium leading-none transition-all",
                                pillStyle,
                                isClickable && "cursor-pointer hover:ring-1 hover:ring-emerald-500/30",
                                !isClickable && !isCurrent && "cursor-default"
                            )}
                            title={!isClickable && !isCurrent ? "Status change not available" : undefined}
                        >
                            <span className="size-1.5 shrink-0 rounded-full bg-current" />
                            <span>{t(`status.${status}`) || status.replace(/_/g, " ")}</span>
                        </button>

                        {index < PIPELINE_ORDER.length - 1 && (
                            <ChevronRight className="size-3 shrink-0 text-muted-foreground/60" />
                        )}
                    </div>
                )
            })}
        </div>
    )
}
