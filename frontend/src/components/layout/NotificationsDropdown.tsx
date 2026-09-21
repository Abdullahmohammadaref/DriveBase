import { useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Bell, Clock, ArrowRight, User, FileText, Car, Building2, Settings, List } from "lucide-react"
import { useRecentActivityLogs, type ActivityLogItem } from "@/hooks/useActivityLogs"
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, type SupportedLocale } from "@/lib/i18n"

/**
 * Entity icon component
 */
function EntityIcon({ type }: { type: string }) {
    const className = "h-3 w-3"
    switch (type) {
        case "vehicle":
            return <Car className={className} />
        case "transaction":
            return <FileText className={className} />
        case "legal_entity":
            return <Building2 className={className} />
        case "user":
            return <User className={className} />
        case "business_settings":
            return <Settings className={className} />
        default:
            return <List className={className} />
    }
}

/**
 * Format timestamp to relative time
 */
function formatRelativeTime(timestamp: string): string {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`

    return date.toLocaleDateString()
}

/**
 * Action badge styling mapping
 */
function ActionBadge({ action, label }: { action: string; label: string }) {
    const { t } = useTranslation()
    let colorClass = "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
    if (action === "create") {
        colorClass = "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
    } else if (action === "delete") {
        colorClass = "bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300"
    } else if (action === "update" || action === "status_change") {
        colorClass = "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
    }
    return (
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${colorClass}`}>
            {t(`activityLogs.actions.${action}`, label || action)}
        </span>
    )
}

/**
 * Single notification item component
 */
function NotificationItem({ log }: { log: ActivityLogItem }) {
    const { t } = useTranslation()
    return (
        <div className="px-3.5 py-2 border-b border-gray-50 dark:border-border/50 hover:bg-gray-50/60 dark:hover:bg-muted/40 transition-colors flex items-start gap-2.5 text-xs cursor-pointer">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                    <ActionBadge action={log.action} label={log.action_display} />
                    <span className="inline-flex items-center gap-1 text-gray-500 dark:text-muted-foreground text-[11px]">
                        <EntityIcon type={log.entity_type} />
                        <span className="truncate max-w-[140px] font-medium text-gray-700 dark:text-foreground">
                            {log.entity_name || t(`activityLogs.entities.${log.entity_type}`, log.entity_type_display || log.entity_type)}
                        </span>
                    </span>
                </div>
                <p className="text-xs text-gray-600 dark:text-muted-foreground truncate">
                    <span className="font-medium text-gray-900 dark:text-foreground">{log.user_name}</span>
                </p>
                <p className="text-[10px] text-gray-400 dark:text-muted-foreground font-mono mt-0.5 flex items-center gap-1">
                    <Clock className="h-2.5 w-2.5" />
                    {formatRelativeTime(log.timestamp)}
                </p>
            </div>
        </div>
    )
}

export function NotificationsDropdown() {
    const [isOpen, setIsOpen] = useState(false)
    const navigate = useNavigate()
    const { t } = useTranslation()
    const { business_slug, locale } = useParams<{ business_slug: string; locale?: string }>()

    const { data, isLoading } = useRecentActivityLogs()

    // Determine current locale
    const currentLocale = (locale && (SUPPORTED_LOCALES as readonly string[]).includes(locale))
        ? locale as SupportedLocale
        : DEFAULT_LOCALE

    // Build href with locale
    const buildHref = (path: string) => {
        if (currentLocale === DEFAULT_LOCALE) {
            return `/${business_slug}/${path}`
        }
        return `/${business_slug}/${currentLocale}/${path}`
    }

    const handleViewAll = () => {
        setIsOpen(false)
        navigate(buildHref("activity-logs"))
    }

    const hasLogs = data?.logs && data.logs.length > 0

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:text-gray-700 dark:text-muted-foreground dark:hover:text-foreground hover:bg-gray-50 dark:hover:bg-muted transition-colors p-1.5"
                title={t('common.notifications', 'Notifications')}
            >
                <Bell className="h-4 w-4" />
                {hasLogs && (
                    <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-blue-500 ring-2 ring-white dark:ring-card" />
                )}
            </button>

            {/* Dropdown */}
            {isOpen && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    />
                    <div className="absolute right-0 top-full z-50 mt-1 w-80 bg-white dark:bg-card border border-gray-200 dark:border-border rounded-lg shadow-lg p-0 overflow-hidden">
                        {/* Header */}
                        <div className="px-3.5 py-2.5 border-b border-gray-100 dark:border-border">
                            <h3 className="font-semibold text-xs text-gray-800 dark:text-foreground">
                                {t('notifications.title', 'Recent Activity')}
                            </h3>
                        </div>

                        {/* Content */}
                        <div className="max-h-80 overflow-y-auto">
                            {isLoading ? (
                                <div className="p-4 text-center text-gray-400 text-xs">
                                    {t('common.loading', 'Loading...')}
                                </div>
                            ) : hasLogs ? (
                                <div>
                                    {data.logs.map((log) => (
                                        <NotificationItem key={log.id} log={log} />
                                    ))}
                                </div>
                            ) : (
                                <div className="p-8 text-center text-gray-400 text-xs">
                                    <Bell className="h-6 w-6 mx-auto mb-2 opacity-40 text-gray-400" />
                                    <p>{t('notifications.empty', 'No recent activity')}</p>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-3.5 py-2 bg-gray-50/50 dark:bg-muted/30 border-t border-gray-100 dark:border-border">
                            <button
                                onClick={handleViewAll}
                                className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 transition-colors"
                            >
                                {t('notifications.viewAll', 'View All Logs')}
                                <ArrowRight className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
