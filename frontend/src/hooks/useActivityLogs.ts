import { useQuery } from "@tanstack/react-query"
import api from "@/lib/api"

/**
 * Types for Activity Log data
 */
export interface ActivityLogItem {
    id: number
    user_name: string
    user_id?: number | null
    is_system?: boolean
    action: string
    action_display: string
    entity_type: string
    entity_type_display: string
    entity_id: number | null
    entity_name: string
    details?: string
    timestamp: string
}

export interface ActivityLogsResponse {
    items: ActivityLogItem[]
    total: number
    page: number
    per_page: number
    pages: number
}

export interface RecentActivityLogsResponse {
    logs: ActivityLogItem[]
}

export interface ActivityLogFilters {
    page?: number
    per_page?: number
    action?: string
    entity_type?: string
    user_id?: number | string
    sort?: string
    order?: "asc" | "desc"
}

export interface ActivityLogUser {
    id: number | string
    name: string
}

export interface ActivityLogUsersResponse {
    users: ActivityLogUser[]
}

/**
 * Query keys for TanStack Query
 */
export const activityLogKeys = {
    all: ["activityLogs"] as const,
    lists: () => [...activityLogKeys.all, "list"] as const,
    list: (filters: ActivityLogFilters) => [...activityLogKeys.lists(), filters] as const,
    recent: () => [...activityLogKeys.all, "recent"] as const,
    users: () => [...activityLogKeys.all, "users"] as const,
}

/**
 * Fetch paginated activity logs with filters
 */
export function useActivityLogs(filters: ActivityLogFilters = {}) {
    return useQuery({
        queryKey: activityLogKeys.list(filters),
        queryFn: async (): Promise<ActivityLogsResponse> => {
            const params = new URLSearchParams()

            Object.entries(filters).forEach(([key, value]) => {
                if (value !== undefined && value !== null && value !== "") {
                    params.append(key, String(value))
                }
            })

            const url = `/activity-logs?${params}`
            const response = await api.get<ActivityLogsResponse>(url)
            return response.data
        },
    })
}

/**
 * Fetch 5 most recent activity logs for header dropdown
 */
export function useRecentActivityLogs() {
    return useQuery({
        queryKey: activityLogKeys.recent(),
        queryFn: async (): Promise<RecentActivityLogsResponse> => {
            const response = await api.get<RecentActivityLogsResponse>("/activity-logs/recent")
            return response.data
        },
        staleTime: 1000 * 30, // 30 seconds - refresh more frequently for notifications
        refetchInterval: 1000 * 60, // Refetch every minute
    })
}

/**
 * Fetch users for filter dropdown
 */
export function useActivityLogUsers() {
    return useQuery({
        queryKey: activityLogKeys.users(),
        queryFn: async (): Promise<ActivityLogUsersResponse> => {
            const response = await api.get<ActivityLogUsersResponse>("/activity-logs/users")
            return response.data
        },
    })
}
