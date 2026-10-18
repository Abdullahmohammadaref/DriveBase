import { Loader2, Check, AlertCircle, Cloud, AlertTriangle } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import type { AutoSaveStatus } from "@/hooks/useAutoSave"

export interface AutoSaveIndicatorProps {
    status: AutoSaveStatus
    errorMessage?: string | null
    className?: string
}

/**
 * Floating Toast Notification for auto-save status.
 * Renders prominently at the top-right (fixed top-14 right-6 z-50) so it is
 * immediately visible in the user's primary field of view, while NEVER shifting
 * page layout, pushing headers, or causing flexbox wrapping.
 */
export function AutoSaveToast({ status, errorMessage, className }: AutoSaveIndicatorProps) {
    const { t } = useTranslation()

    if (status === "idle") {
        return null
    }

    return (
        <div
            className={cn(
                "fixed top-2 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full border bg-white/95 dark:bg-card/95 px-3 py-1 text-xs shadow-md backdrop-blur-md transition-all duration-300 ease-out",
                status === "saving" && "border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-100 shadow-blue-500/10",
                status === "saved" && "border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100 shadow-emerald-500/10",
                status === "error" && "border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-100 shadow-rose-500/10",
                status === "failed_mandatory" && "border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-100 shadow-amber-500/10",
                className
            )}
            role="status"
            aria-live="polite"
        >
            <div
                className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full",
                    status === "saving" && "bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
                    status === "saved" && "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400",
                    status === "error" && "bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400",
                    status === "failed_mandatory" && "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
                )}
            >
                {status === "saving" && <Loader2 className="size-3 animate-spin" />}
                {status === "saved" && <Check className="size-3" />}
                {status === "error" && <AlertCircle className="size-3" />}
                {status === "failed_mandatory" && <AlertTriangle className="size-3" />}
            </div>

            <div className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="font-semibold text-heading text-[11px]">
                    {status === "saving" && t("autosave.savingTitle", "Auto-Save:")}
                    {status === "saved" && t("autosave.savedTitle", "Saved:")}
                    {status === "error" && t("autosave.errorTitle", "Save Error:")}
                    {status === "failed_mandatory" && t("autosave.mandatoryTitle", "Required Field:")}
                </span>
                <span className="text-muted-foreground text-[11px]">
                    {status === "saving" && t("autosave.saving", "Saving changes...")}
                    {status === "saved" && t("autosave.saved", "All changes saved")}
                    {status === "error" && (errorMessage || t("autosave.error", "Error saving changes"))}
                    {status === "failed_mandatory" && t("autosave.failed_mandatory", "Not saved — required field is empty")}
                </span>
            </div>
        </div>
    )
}

/**
 * Standard AutoSaveIndicator now renders the floating AutoSaveToast.
 * This guarantees backward compatibility while ensuring it never shifts the page layout.
 */
export function AutoSaveIndicator(props: AutoSaveIndicatorProps) {
    return <AutoSaveToast {...props} />
}

/**
 * Compact version of the indicator - shows only an icon.
 * Good for tight spaces like headers.
 */
export function AutoSaveIndicatorCompact({ status, className }: Omit<AutoSaveIndicatorProps, "errorMessage">) {
    const { t } = useTranslation()

    return (
        <div
            className={cn(
                "flex items-center transition-opacity duration-300",
                status === "idle" && "opacity-30",
                status === "saving" && "text-muted-foreground",
                status === "saved" && "text-green-600 dark:text-green-400",
                status === "error" && "text-red-600 dark:text-red-400",
                className
            )}
            title={
                status === "idle"
                    ? t("autosave.enabled", "Auto-save enabled")
                    : status === "saving"
                    ? t("autosave.saving", "Saving changes...")
                    : status === "saved"
                    ? t("autosave.saved", "All changes saved")
                    : status === "failed_mandatory"
                    ? t("autosave.failed_mandatory", "Not saved — required field is empty")
                    : t("autosave.error", "Error saving changes")
            }
        >
            {status === "idle" && <Cloud className="h-4 w-4" />}
            {status === "saving" && <Loader2 className="h-4 w-4 animate-spin" />}
            {status === "saved" && <Check className="h-4 w-4" />}
            {status === "error" && <AlertCircle className="h-4 w-4" />}
            {status === "failed_mandatory" && <AlertTriangle className="h-4 w-4 text-orange-500" />}
        </div>
    )
}
