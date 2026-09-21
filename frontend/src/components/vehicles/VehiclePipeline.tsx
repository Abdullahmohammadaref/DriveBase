import { ChevronRight, ChevronDown } from "lucide-react"
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

const STATUS_ACTIVE_STYLES: Record<VehicleStatus, string> = {
    purchased: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800",
    ready_for_sale: "border-orange-300 bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400 dark:border-orange-800",
    reserved: "border-blue-300 bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400 dark:border-blue-800",
    sold: "border-red-300 bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800",
    inactive: "border-zinc-300 bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700",
}

const STATUS_INACTIVE_STYLE = "border-gray-200 dark:border-border bg-gray-100/70 dark:bg-secondary/40 text-muted-foreground"

function getStatusLabel(t: (key: string) => string, status: VehicleStatus): string {
    const navKeyMap: Record<VehicleStatus, string> = {
        purchased: "nav.purchased",
        ready_for_sale: "nav.readyForSale",
        reserved: "nav.reserved",
        sold: "nav.sold",
        inactive: "nav.inactive",
    }
    const key = navKeyMap[status]
    const translated = key ? t(key) : null
    if (translated && translated !== key) return translated

    switch (status) {
        case "purchased": return "Purchased"
        case "ready_for_sale": return "Ready for Sale"
        case "reserved": return "Reserved"
        case "sold": return "Sold"
        case "inactive": return "Inactive"
        default: return status
    }
}

export function VehiclePipeline({
    currentStatus,
    canMoveTo,
    onStatusChange,
    orientation = "horizontal",
    disabled = false,
    className,
}: VehiclePipelineProps) {
    const { t } = useTranslation()

    return (
        <div
            className={cn(
                "flex",
                orientation === "vertical" ? "flex-col items-stretch gap-0.5" : "flex-row items-center gap-1",
                className
            )}
        >
            {PIPELINE_ORDER.map((status, index) => {
                const isCurrent = currentStatus === status
                const isClickable = !disabled && canMoveTo.includes(status) && Boolean(onStatusChange)

                const pillStyle = isCurrent
                    ? STATUS_ACTIVE_STYLES[status] || STATUS_INACTIVE_STYLE
                    : STATUS_INACTIVE_STYLE

                return (
                    <div
                        key={status}
                        className={cn(
                            "flex shrink-0",
                            orientation === "vertical"
                                ? "flex-col items-center"
                                : "flex-row items-center gap-1"
                        )}
                    >
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
                                orientation === "vertical" ? "w-full justify-center" : "",
                                pillStyle,
                                isCurrent && "font-semibold",
                                isClickable && "cursor-pointer hover:ring-1 hover:ring-primary/30 hover:text-foreground",
                                !isClickable && !isCurrent && "cursor-default"
                            )}
                            title={!isClickable && !isCurrent ? "Status change not available" : undefined}
                        >
                            <span className="size-1.5 shrink-0 rounded-full bg-current" />
                            <span>{getStatusLabel(t, status)}</span>
                        </button>

                        {index < PIPELINE_ORDER.length - 1 && (
                            orientation === "vertical" ? (
                                <ChevronDown className="size-3 shrink-0 text-muted-foreground/60 my-0.5" />
                            ) : (
                                <ChevronRight className="size-3 shrink-0 text-muted-foreground/60" />
                            )
                        )}
                    </div>
                )
            })}
        </div>
    )
}
