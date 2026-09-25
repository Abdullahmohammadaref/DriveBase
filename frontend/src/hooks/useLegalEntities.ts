/**
 * React Query hooks for legal entity operations.
 * Provides data fetching and mutations for legal entities list and CRUD.
 *
 * Uses the shared `api` Axios instance which automatically handles:
 * - CSRF token injection for POST/PATCH/DELETE requests
 * - Session cookie forwarding (withCredentials)
 * - Base URL (/api) prefixing
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import api from "@/lib/api"

// Types
export interface LegalEntity {
    id: number
    internal_id: number
    name: string
    type: "individual" | "company"
    status: "active" | "inactive"
    address_street: string | null
    address_street_number: number | null
    address_postal_code: string | null
    address_city_id: number | null
    address_city_name: string | null
    address_country_id: number | null
    address_country_name: string | null
    email: string | null
    phone_number: string | null
    tax_identification_number: string | null
}

export interface LegalEntityFilters {
    search?: string
    type?: "individual" | "company"
    status?: "active" | "inactive"
    city_id?: number
    country_id?: number
    page?: number
    per_page?: number
    sort?: string
    order?: "asc" | "desc"
}

export interface LegalEntitiesResponse {
    items: LegalEntity[]
    total: number
    page: number
    per_page: number
    pages: number
}

export interface LegalEntityCreatePayload {
    name: string
    type: "individual" | "company"
    address_street: string
    address_street_number: string
    address_postal_code: string
    address_city_id?: number | null
    address_country_id?: number | null
    email?: string
    phone_number?: string
    tax_identification_number?: string
}

export interface LegalEntityUpdatePayload {
    name?: string
    type?: "individual" | "company"
    address_street?: string
    address_street_number?: string
    address_postal_code?: string
    address_city_id?: number | null
    address_country_id?: number | null
    email?: string
    phone_number?: string
    tax_identification_number?: string
}

// API functions using the shared Axios instance (handles CSRF automatically)
async function fetchLegalEntities(filters: LegalEntityFilters): Promise<LegalEntitiesResponse> {
    const params = new URLSearchParams()

    if (filters.search) params.set("search", filters.search)
    if (filters.type) params.set("type", filters.type)
    if (filters.status) params.set("status", filters.status)
    if (filters.city_id) params.set("city_id", String(filters.city_id))
    if (filters.country_id) params.set("country_id", String(filters.country_id))
    if (filters.page) params.set("page", String(filters.page))
    if (filters.per_page) params.set("per_page", String(filters.per_page))
    if (filters.sort) params.set("sort", filters.sort)
    if (filters.order) params.set("order", filters.order)

    const response = await api.get(`/legal-entities?${params.toString()}`)
    return response.data
}

async function fetchLegalEntity(internalId: number): Promise<LegalEntity> {
    const response = await api.get(`/legal-entities/${internalId}`)
    return response.data
}

async function createLegalEntity(payload: LegalEntityCreatePayload): Promise<LegalEntity> {
    const response = await api.post("/legal-entities", payload)
    return response.data
}

async function updateLegalEntity(internalId: number, payload: LegalEntityUpdatePayload): Promise<LegalEntity> {
    const response = await api.patch(`/legal-entities/${internalId}`, payload)
    return response.data
}

async function deactivateLegalEntity(args: number | { internalId: number; forceCascade?: boolean }): Promise<{ success: boolean; message: string }> {
    const internalId = typeof args === "number" ? args : args.internalId
    const forceCascade = typeof args === "number" ? false : args.forceCascade
    const response = await api.delete(`/legal-entities/${internalId}`, {
        params: forceCascade ? { force_cascade: true } : undefined,
    })
    return response.data
}

async function activateLegalEntity(internalId: number): Promise<{ success: boolean; message: string }> {
    const response = await api.post(`/legal-entities/${internalId}/activate`)
    return response.data
}

// Hooks
export function useLegalEntities(filters: LegalEntityFilters = {}) {
    return useQuery({
        queryKey: ["legal-entities", filters],
        queryFn: () => fetchLegalEntities(filters),
    })
}

export function useLegalEntity(internalId: number) {
    return useQuery({
        queryKey: ["legal-entity", internalId],
        queryFn: () => fetchLegalEntity(internalId),
        enabled: !!internalId,
    })
}

export function useCreateLegalEntity() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: createLegalEntity,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["legal-entities"] })
        },
    })
}

export function useUpdateLegalEntity() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: ({ internalId, payload }: { internalId: number; payload: LegalEntityUpdatePayload }) =>
            updateLegalEntity(internalId, payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["legal-entities"] })
            queryClient.invalidateQueries({ queryKey: ["legal-entity"] })
        },
    })
}

export function useDeactivateLegalEntity() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: deactivateLegalEntity,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["legal-entities"] })
        },
    })
}

export function useActivateLegalEntity() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: activateLegalEntity,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["legal-entities"] })
        },
    })
}
