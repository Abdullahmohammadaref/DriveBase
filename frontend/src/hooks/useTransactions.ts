import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import api from "@/lib/api"
import type {
    TransactionsResponse,
    TransactionDetail,
    TransactionFilters,
    TransactionChoices,
    TransactionFormData,
    TransactionUpdateData,
    SubcategoriesResponse,
} from "@/types/transaction"

/**
 * Query keys for TanStack Query
 */
export const transactionKeys = {
    all: ["transactions"] as const,
    lists: () => [...transactionKeys.all, "list"] as const,
    list: (filters: TransactionFilters) => [...transactionKeys.lists(), filters] as const,
    details: () => [...transactionKeys.all, "detail"] as const,
    detail: (id: number) => [...transactionKeys.details(), id] as const,
    choices: () => ["transactionChoices"] as const,
    subcategories: (category: string) => ["subcategories", category] as const,
    nextId: () => [...transactionKeys.all, "next-id"] as const,
}

/**
 * Response type for next transaction ID
 */
interface NextTransactionIdResponse {
    next_id: number
}

/**
 * Fetch the projected next internal ID for a new transaction
 */
export function useNextTransactionId(enabled: boolean = true) {
    return useQuery({
        queryKey: transactionKeys.nextId(),
        queryFn: async (): Promise<number> => {
            const response = await api.get<NextTransactionIdResponse>("/transactions/next-id")
            return response.data.next_id
        },
        enabled,
        staleTime: 1000 * 30, // 30 seconds - may change if another user adds a transaction
    })
}

/**
 * Fetch paginated transactions with filters
 */

export function useTransactions(filters: TransactionFilters = {}, enabled: boolean = true) {
    return useQuery({
        queryKey: transactionKeys.list(filters),
        queryFn: async (): Promise<TransactionsResponse> => {
            // Build query params, excluding undefined values
            const params = new URLSearchParams()

            Object.entries(filters).forEach(([key, value]) => {
                if (value !== undefined && value !== null && value !== "") {
                    params.append(key, String(value))
                }
            })

            // NOTE: Trailing slash is REQUIRED for Vite proxy to work correctly
            const url = `/transactions/?${params}`
            console.log("[DEBUG] Fetching transactions from:", url)

            const response = await api.get<TransactionsResponse>(url)

            console.log("[DEBUG] API Response:", response.data)
            console.log("[DEBUG] Transactions count:", response.data?.transactions?.items?.length)
            console.log("[DEBUG] Total:", response.data?.transactions?.total)

            return response.data
        },
        enabled,
    })
}


/**
 * Fetch single transaction details
 */
export function useTransaction(internalId: number | undefined) {
    return useQuery({
        queryKey: transactionKeys.detail(internalId!),
        queryFn: async (): Promise<TransactionDetail> => {
            const response = await api.get<TransactionDetail>(`/transactions/${internalId}`)
            return response.data
        },
        enabled: !!internalId,
    })
}

/**
 * Fetch all choices for transaction form dropdowns
 */
export function useTransactionChoices() {
    return useQuery({
        queryKey: transactionKeys.choices(),
        queryFn: async (): Promise<TransactionChoices> => {
            const response = await api.get<TransactionChoices>("/transactions/choices")
            return response.data
        },
        staleTime: 1000 * 60 * 5, // 5 minutes
    })
}

/**
 * Fetch subcategories for a specific category by ID
 */
export function useSubcategories(categoryId: number | undefined) {
    return useQuery({
        queryKey: transactionKeys.subcategories(categoryId?.toString() || ""),
        queryFn: async (): Promise<SubcategoriesResponse> => {
            const response = await api.get<SubcategoriesResponse>(
                `/transactions/subcategories/${categoryId}`
            )
            return response.data
        },
        enabled: !!categoryId,
        staleTime: 1000 * 60 * 10, // 10 minutes
    })
}

/**
 * Create a new transaction
 */
export function useCreateTransaction() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (data: TransactionFormData): Promise<TransactionDetail> => {
            const response = await api.post<TransactionDetail>("/transactions/", data)
            return response.data
        },
        onSuccess: () => {
            // Invalidate transaction list to refetch
            queryClient.invalidateQueries({ queryKey: transactionKeys.lists() })
        },
    })
}

/**
 * Update an existing transaction
 */
export function useUpdateTransaction() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({
            internalId,
            data,
        }: {
            internalId: number
            data: TransactionUpdateData
        }): Promise<TransactionDetail> => {
            const response = await api.put<TransactionDetail>(
                `/transactions/${internalId}`,
                data
            )
            return response.data
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: transactionKeys.lists() })
            queryClient.invalidateQueries({
                queryKey: transactionKeys.detail(variables.internalId),
            })
            queryClient.invalidateQueries({ queryKey: ['vehicles'] })
            queryClient.invalidateQueries({ queryKey: ['vehicle'] })
        },
    })
}

/**
 * Delete (soft) a transaction
 */
export function useDeleteTransaction() {
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

            const response = await api.delete(`/transactions/${internalId}`, {
                params: Object.keys(params).length > 0 ? params : undefined,
            })
            return response.data
        },
        onSuccess: (_, args) => {
            const internalId = typeof args === "number" ? args : args.internalId
            queryClient.setQueryData(
                transactionKeys.detail(internalId),
                (old: TransactionDetail | undefined) => old ? { ...old, status: 'inactive', status_display: 'Inactive' } : old
            )
            queryClient.invalidateQueries({ queryKey: transactionKeys.lists() })
        },
    })
}

/**
 * Activate a transaction
 */
export function useActivateTransaction() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (internalId: number) => {
            const response = await api.post(`/transactions/${internalId}/activate`)
            return response.data
        },
        onSuccess: (_, internalId) => {
            queryClient.invalidateQueries({ queryKey: transactionKeys.detail(internalId) })
            queryClient.invalidateQueries({ queryKey: transactionKeys.lists() })
        },
    })
}

/**
 * Update transaction status explicitly (confirmed | review_required | inactive)
 */
export function useUpdateTransactionStatus() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({
            internalId,
            status,
        }: {
            internalId: number
            status: "confirmed" | "review_required" | "inactive"
        }): Promise<TransactionDetail> => {
            const response = await api.post<TransactionDetail>(
                `/transactions/${internalId}/status`,
                { status }
            )
            return response.data
        },
        onSuccess: (data, variables) => {
            queryClient.setQueryData(transactionKeys.detail(variables.internalId), data)
            queryClient.invalidateQueries({ queryKey: transactionKeys.lists() })
        },
    })
}

/**
 * Import transactions from CSV file
 */
export interface ImportTransactionsParams {
    file: File
    method: string
}

export interface ImportTransactionsResponse {
    success: boolean
    message: string
    created_count: number
    updated_count: number
    error_count: number
}

export function useImportTransactions() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ file, method }: ImportTransactionsParams): Promise<ImportTransactionsResponse> => {
            const formData = new FormData()
            formData.append('transactions_file', file)
            formData.append('method', method)

            const response = await api.post<ImportTransactionsResponse>(
                '/transactions/import/csv/',
                formData,
                {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                    },
                }
            )
            return response.data
        },
        onSuccess: () => {
            // Invalidate transaction list to refetch with new imports
            queryClient.invalidateQueries({ queryKey: transactionKeys.lists() })
        },
    })
}
