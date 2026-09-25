import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import api from "@/lib/api"
import type {
    VehiclesResponse,
    VehicleDetail,
    VehicleFilters,
    AllChoices,
} from "@/types/vehicle"

/**
 * Query keys for TanStack Query
 */
export const vehicleKeys = {
    all: ["vehicles"] as const,
    lists: () => [...vehicleKeys.all, "list"] as const,
    list: (filters: VehicleFilters) => [...vehicleKeys.lists(), filters] as const,
    details: () => [...vehicleKeys.all, "detail"] as const,
    detail: (id: number) => [...vehicleKeys.details(), id] as const,
    choices: (vehicleId?: number) => ["choices", vehicleId] as const,
    models: (makeId: number) => ["models", makeId] as const,
    nextId: () => [...vehicleKeys.all, "next-id"] as const,
}

/**
 * Response type for next vehicle ID
 */
interface NextVehicleIdResponse {
    next_id: number
}

/**
 * Fetch the projected next internal ID for a new vehicle
 */
export function useNextVehicleId(enabled: boolean = true) {
    return useQuery({
        queryKey: vehicleKeys.nextId(),
        queryFn: async (): Promise<number> => {
            const response = await api.get<NextVehicleIdResponse>("/vehicles/next-id")
            return response.data.next_id
        },
        enabled,
        staleTime: 1000 * 30, // 30 seconds - may change if another user adds a vehicle
    })
}


/**
 * Fetch paginated vehicles with filters
 */
export function useVehicles(filters: VehicleFilters = {}) {
    return useQuery({
        queryKey: vehicleKeys.list(filters),
        queryFn: async (): Promise<VehiclesResponse> => {
            // Build query params, excluding undefined values
            const params = new URLSearchParams()

            Object.entries(filters).forEach(([key, value]) => {
                if (value !== undefined && value !== null && value !== "") {
                    params.append(key, String(value))
                }
            })

            const response = await api.get<VehiclesResponse>(`/vehicles?${params}`)
            return response.data
        },
    })
}

/**
 * Fetch single vehicle details
 */
export function useVehicle(internalId: number | undefined) {
    return useQuery({
        queryKey: vehicleKeys.detail(internalId!),
        queryFn: async (): Promise<VehicleDetail> => {
            const response = await api.get<VehicleDetail>(`/vehicles/${internalId}`)
            return response.data
        },
        enabled: !!internalId,
    })
}

/**
 * Fetch all choices for form dropdowns.
 * vehicleId is optional to include the current assigned key when editing.
 */
export function useChoices(vehicleId?: number) {
    return useQuery({
        queryKey: vehicleKeys.choices(vehicleId),
        queryFn: async (): Promise<AllChoices> => {
            const params = new URLSearchParams()
            if (vehicleId) params.append("vehicle_id", String(vehicleId))
            const url = `/choices${params.toString() ? `?${params.toString()}` : ""}`
            const response = await api.get<AllChoices>(url)
            return response.data
        },
        staleTime: 1000 * 60 * 10, // 10 minutes - choices don't change often
    })
}

/**
 * Fetch and/or create the next available key number.
 * Only runs when `enabled` is true (i.e., on the Add New Vehicle page).
 * staleTime: 0 — always refetch fresh when the page loads.
 * gcTime: 0 — don't keep in cache after component unmounts.
 */
export function useNextAvailableKey(enabled: boolean = false) {
    return useQuery({
        queryKey: ["choices", "key-numbers", "next-available"],
        queryFn: async () => {
            const response = await api.get<{ id: number, number: number, name: string }>("/choices/key-numbers/next-available")
            return response.data
        },
        enabled,
        staleTime: 0,
        gcTime: 0,
        retry: 1,
    })
}

/**
 * Model response type from API
 */
export interface VehicleModelChoice {
    id: number
    name: string
    make_id: number
    make_name: string
}

/**
 * Fetch models for a specific make (dependent dropdown)
 */
export function useModels(makeId: number | undefined) {
    return useQuery({
        queryKey: vehicleKeys.models(makeId!),
        queryFn: async (): Promise<VehicleModelChoice[]> => {
            const response = await api.get<VehicleModelChoice[]>(`/choices/models/${makeId}`)
            return response.data
        },
        enabled: !!makeId,
        staleTime: 1000 * 60 * 10, // 10 minutes
    })
}

/**
 * Delete (soft) a vehicle
 */
export function useDeleteVehicle() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (args: number | { internalId: number; forceCascade?: boolean; unlinkDelete?: boolean; deleteMode?: string }) => {
            const internalId = typeof args === "number" ? args : args.internalId
            const forceCascade = typeof args === "number" ? false : args.forceCascade
            const unlinkDelete = typeof args === "number" ? false : args.unlinkDelete
            const deleteMode = typeof args === "number" ? undefined : args.deleteMode

            const params: Record<string, any> = {}
            if (forceCascade) params.force_cascade = true
            if (unlinkDelete) params.unlink_delete = true
            if (deleteMode) params.delete_mode = deleteMode

            await api.delete(`/vehicles/${internalId}`, {
                params: Object.keys(params).length > 0 ? params : undefined,
            })
        },
        onSuccess: () => {
            // Invalidate vehicle list to refetch
            queryClient.invalidateQueries({ queryKey: vehicleKeys.lists() })
        },
    })
}

/**
 * Change vehicle status
 */
export function useChangeVehicleStatus() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({
            internalId,
            status,
        }: {
            internalId: number
            status: string
        }) => {
            const formData = new FormData()
            formData.append("status", status)
            const response = await api.post(
                `/vehicles/${internalId}/change-status`,
                formData,
                {
                    headers: { "Content-Type": "multipart/form-data" },
                }
            )
            return response.data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: vehicleKeys.lists() })
        },
    })
}


// =============================================================================
// Vehicle Expenses & Earnings Hooks
// =============================================================================

export const expenseEarningKeys = {
    all: (vehicleInternalId: number) =>
        [...vehicleKeys.detail(vehicleInternalId), "expenses-earnings"] as const,
}

/**
 * Fetch active expense/earning entries for a vehicle
 */
export function useVehicleExpensesEarnings(vehicleInternalId: number | undefined) {
    return useQuery({
        queryKey: expenseEarningKeys.all(vehicleInternalId!),
        queryFn: async () => {
            const response = await api.get(
                `/vehicles/${vehicleInternalId}/expenses-earnings`
            )
            return response.data as Array<{
                id: number
                type: "expense" | "earning"
                amount: number
                category_id: number
                category_name: string | null
                subcategory_id: number
                subcategory_name: string | null
                created_at: string | null
            }>
        },
        enabled: !!vehicleInternalId,
    })
}

/**
 * Create a new expense/earning for a vehicle
 */
export function useCreateExpenseEarning() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({
            vehicleInternalId,
            payload,
        }: {
            vehicleInternalId: number
            payload: {
                type: "expense" | "earning"
                amount: number
                category_id: number
                subcategory_id: number
            }
        }) => {
            const response = await api.post(
                `/vehicles/${vehicleInternalId}/expenses-earnings`,
                payload
            )
            return response.data
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({
                queryKey: vehicleKeys.detail(variables.vehicleInternalId),
            })
            queryClient.invalidateQueries({
                queryKey: ["vehicles"],
            })
        },
    })
}

/**
 * Update an existing expense/earning for a vehicle
 */
export function useUpdateExpenseEarning() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({
            vehicleInternalId,
            entryId,
            payload,
        }: {
            vehicleInternalId: number
            entryId: number
            payload: {
                type: "expense" | "earning"
                amount: number
                category_id: number
                subcategory_id: number
            }
        }) => {
            const response = await api.put(
                `/vehicles/${vehicleInternalId}/expenses-earnings/${entryId}`,
                payload
            )
            return response.data
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({
                queryKey: vehicleKeys.detail(variables.vehicleInternalId),
            })
            queryClient.invalidateQueries({
                queryKey: ["vehicles"],
            })
        },
    })
}

/**
 * Soft-delete an expense/earning entry
 */
export function useDeleteExpenseEarning() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({
            vehicleInternalId,
            entryId,
        }: {
            vehicleInternalId: number
            entryId: number
        }) => {
            await api.delete(
                `/vehicles/${vehicleInternalId}/expenses-earnings/${entryId}`
            )
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({
                queryKey: vehicleKeys.detail(variables.vehicleInternalId),
            })
            queryClient.invalidateQueries({
                queryKey: ["vehicles"],
            })
        },
    })
}
