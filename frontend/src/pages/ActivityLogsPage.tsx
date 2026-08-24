import { useState, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { History, ArrowUpDown, ChevronUp, ChevronDown, Car, FileText, Building2, User, Settings, List, Clock, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useActivityLogs, useActivityLogUsers, type ActivityLogFilters } from "@/hooks/useActivityLogs"

/**
 * Entity icon component
 */
function EntityIcon({ type }: { type: string }) {
    const className = "h-4 w-4"
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
 * Action badge with appropriate color
 */
function ActionBadge({ action, display }: { action: string; display: string }) {
    const colorMap: Record<string, string> = {
        create: "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400",
        update: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
        delete: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
        status_change: "bg-yellow-50 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400",
    }

    return (
        <Badge variant="secondary" className={colorMap[action] || ""}>
            {display}
        </Badge>
    )
}

/**
 * Format timestamp to readable format
 */
function formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp)
    return date.toLocaleString()
}

/**
 * Activity Logs page - full history of user actions
 */
export function ActivityLogsPage() {
    const { t } = useTranslation()

    // Filter state
    const [filters, setFilters] = useState<ActivityLogFilters>({
        page: 1,
        per_page: 20,
        sort: "timestamp",
        order: "desc",
    })

    // Fetch activity logs and users for filter
    const { data, isLoading, isFetching } = useActivityLogs(filters)
    const { data: usersData } = useActivityLogUsers()

    // Handle page change
    const handlePageChange = useCallback((page: number) => {
        setFilters((prev) => ({ ...prev, page }))
    }, [])

    // Handle sort
    const handleSort = useCallback((column: string) => {
        setFilters((prev) => {
            const newOrder = prev.sort === column && prev.order === "asc" ? "desc" : "asc"
            return { ...prev, sort: column, order: newOrder, page: 1 }
        })
    }, [])

    // Handle filter changes
    const handleActionFilter = useCallback((value: string) => {
        setFilters((prev) => ({
            ...prev,
            action: value === "all" ? undefined : value,
            page: 1,
        }))
    }, [])

    const handleEntityFilter = useCallback((value: string) => {
        setFilters((prev) => ({
            ...prev,
            entity_type: value === "all" ? undefined : value,
            page: 1,
        }))
    }, [])

    const handleUserFilter = useCallback((value: string) => {
        setFilters((prev) => ({
            ...prev,
            user_id: value === "all" ? undefined : Number(value),
            page: 1,
        }))
    }, [])

    const hasActiveFilters = filters.action || filters.entity_type || filters.user_id

    // Sort indicator component
    const SortIndicator = ({ column }: { column: string }) => {
        if (filters.sort !== column) {
            return <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />
        }
        return filters.order === "asc"
            ? <ChevronUp className="ml-1 h-3 w-3" />
            : <ChevronDown className="ml-1 h-3 w-3" />
    }

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)]">
            {/* Main Content Area - Scrollable */}
            <div className="flex-1 overflow-auto p-3 pb-24 space-y-3">
                {/* Page Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 dark:border-border pb-2">
                    <div>
                        <h1 className="text-base font-semibold tracking-tight text-gray-900 dark:text-foreground flex items-center gap-1.5">
                            <History className="h-4 w-4" />
                            {t("activityLogs.title", "Activity Logs")}
                        </h1>
                        <p className="text-xs text-muted-foreground">
                            {data?.total || 0} {t("activityLogs.totalEntries", "total entries")}
                        </p>
                    </div>
                </div>

                {/* Filters */}
                <div className="rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card p-2.5 shadow-xs">
                    <div className="flex flex-wrap items-center gap-2">
                        {/* User Filter */}
                        <div className="w-[150px]">
                            <Select value={filters.user_id?.toString() || "all"} onValueChange={handleUserFilter}>
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder={t("activityLogs.allUsers", "All Users")} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all" className="text-xs">{t("activityLogs.allUsers", "All Users")}</SelectItem>
                                    {usersData?.users.map((user) => (
                                        <SelectItem key={user.id} value={user.id.toString()} className="text-xs">
                                            {user.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Action Filter */}
                        <div className="w-[150px]">
                            <Select value={filters.action || "all"} onValueChange={handleActionFilter}>
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder={t("activityLogs.allActions", "All Actions")} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all" className="text-xs">{t("activityLogs.allActions", "All Actions")}</SelectItem>
                                    <SelectItem value="create" className="text-xs">{t("activityLogs.create", "Create")}</SelectItem>
                                    <SelectItem value="update" className="text-xs">{t("activityLogs.update", "Update")}</SelectItem>
                                    <SelectItem value="delete" className="text-xs">{t("activityLogs.delete", "Delete")}</SelectItem>
                                    <SelectItem value="status_change" className="text-xs">{t("activityLogs.statusChange", "Status Change")}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Entity Filter */}
                        <div className="w-[160px]">
                            <Select value={filters.entity_type || "all"} onValueChange={handleEntityFilter}>
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder={t("activityLogs.allEntities", "All Entities")} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all" className="text-xs">{t("activityLogs.allEntities", "All Entities")}</SelectItem>
                                    <SelectItem value="vehicle" className="text-xs">{t("activityLogs.vehicle", "Vehicle")}</SelectItem>
                                    <SelectItem value="transaction" className="text-xs">{t("activityLogs.transaction", "Transaction")}</SelectItem>
                                    <SelectItem value="legal_entity" className="text-xs">{t("activityLogs.legalEntity", "Legal Entity")}</SelectItem>
                                    <SelectItem value="user" className="text-xs">{t("activityLogs.user", "User")}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Clear Filters */}
                        {hasActiveFilters && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => setFilters({ page: 1, per_page: 20, sort: "timestamp", order: "desc" })}
                            >
                                {t("common.clear", "Clear")}
                            </Button>
                        )}
                    </div>
                </div>

                {/* Table */}
                <div className="rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card overflow-hidden shadow-xs">
                    <Table>
                        <TableHeader>
                            <TableRow className="h-7 bg-gray-50/80 dark:bg-secondary hover:bg-gray-50/80 border-b border-gray-200 dark:border-border">
                                <TableHead className="w-[150px] h-7 px-3 py-0.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                                    {t("activityLogs.user", "User")}
                                </TableHead>
                                <TableHead className="w-[120px] h-7 px-3 py-0.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                                    {t("activityLogs.action", "Action")}
                                </TableHead>
                                <TableHead className="w-[140px] h-7 px-3 py-0.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                                    {t("activityLogs.entity", "Entity")}
                                </TableHead>
                                <TableHead className="h-7 px-3 py-0.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                                    {t("activityLogs.details", "Details")}
                                </TableHead>
                                <TableHead
                                    className="w-[180px] h-7 px-3 py-0.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider cursor-pointer hover:text-foreground"
                                    onClick={() => handleSort("timestamp")}
                                >
                                    <span className="flex items-center">
                                        {t("activityLogs.timestamp", "Timestamp")}
                                        <SortIndicator column="timestamp" />
                                    </span>
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                        {t("common.loading", "Loading...")}
                                    </TableCell>
                                </TableRow>
                            ) : data?.items && data.items.length > 0 ? (
                                data.items.map((log) => (
                                    <TableRow key={log.id} className="h-8 hover:bg-gray-50/60 dark:hover:bg-muted/40 transition-colors border-b border-gray-100 dark:border-border last:border-b-0 text-xs">
                                        <TableCell className="px-3 py-1">
                                            <div className="flex items-center gap-2">
                                                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
                                                    <User className="h-3 w-3 text-primary" />
                                                </div>
                                                <span className="font-medium text-foreground text-xs">
                                                    {log.user_name}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-3 py-1">
                                            <ActionBadge action={log.action} display={log.action_display} />
                                        </TableCell>
                                        <TableCell className="px-3 py-1">
                                            <div className="flex items-center gap-1.5 text-xs">
                                                <EntityIcon type={log.entity_type} />
                                                <span className="font-medium">{log.entity_name || log.entity_type_display}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-3 py-1 text-muted-foreground text-xs">
                                            {log.details || "-"}
                                        </TableCell>
                                        <TableCell className="px-3 py-1">
                                            <div className="flex items-center gap-1 text-muted-foreground text-xs font-mono">
                                                <Clock className="h-3 w-3" />
                                                {formatTimestamp(log.timestamp)}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-xs">
                                        <History className="h-6 w-6 mx-auto mb-1.5 opacity-50" />
                                        {t("activityLogs.noLogs", "No activity logs found.")}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {/* Sticky Footer Pagination */}
            {data && data.pages > 1 && (
                <div className="sticky bottom-0 z-10 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60 px-6 py-3">
                    <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                            {t("common.showing", "Showing")} {((data.page - 1) * (filters.per_page || 20)) + 1} - {Math.min(data.page * (filters.per_page || 20), data.total)} {t("common.of", "of")} {data.total}
                        </p>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={data.page <= 1 || isFetching}
                                onClick={() => handlePageChange(data.page - 1)}
                            >
                                <ChevronLeft className="h-4 w-4 mr-1" />
                                {t("common.previous", "Previous")}
                            </Button>
                            <span className="text-sm text-muted-foreground px-3">
                                {t("common.page", "Page")} {data.page} {t("common.of", "of")} {data.pages}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={data.page >= data.pages || isFetching}
                                onClick={() => handlePageChange(data.page + 1)}
                            >
                                {t("common.next", "Next")}
                                <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Loading overlay */}
            {isFetching && !isLoading && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/50">
                    <div className="text-sm text-muted-foreground">{t("common.updating", "Updating...")}</div>
                </div>
            )}
        </div>
    )
}

export default ActivityLogsPage
