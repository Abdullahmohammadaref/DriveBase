import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/lib/auth"
import api from "@/lib/api"
import { vehicleKeys } from "@/hooks/useVehicles"
import { transactionKeys } from "@/hooks/useTransactions"

/**
 * Background warmup hook to eagerly prefetch core reference data,
 * list pages, and detail records into client memory.
 * Runs non-blocking after a short delay so the initial screen renders first.
 */
export function useAppWarmup() {
    const queryClient = useQueryClient()
    const { user } = useAuth()

    useEffect(() => {
        if (!user) return

        const timers: ReturnType<typeof setTimeout>[] = []

        const mainTimer = setTimeout(() => {
            // 1. Eagerly prefetch global dropdown choices
            void queryClient.prefetchQuery({
                queryKey: vehicleKeys.choices(),
                queryFn: async () => {
                    const res = await api.get("/choices")
                    return res.data
                },
                staleTime: 1000 * 60 * 60, // 1 hour
            })

            // 2. Eagerly prefetch full Choices Management dataset
            void queryClient.prefetchQuery({
                queryKey: ["choices-management"],
                queryFn: async () => {
                    const res = await api.get("/choices/management")
                    return res.data
                },
                staleTime: 1000 * 60 * 30, // 30 minutes
            })

            // 3. Eagerly prefetch default legal entities
            void queryClient.prefetchQuery({
                queryKey: ["legal-entities", {}],
                queryFn: async () => {
                    const res = await api.get("/legal-entities")
                    return res.data
                },
                staleTime: 1000 * 60 * 15, // 15 minutes
            })

            // 4. Eagerly prefetch default vehicles list + deep detail records
            void queryClient
                .prefetchQuery({
                    queryKey: vehicleKeys.list({}),
                    queryFn: async () => {
                        const res = await api.get("/vehicles")
                        return res.data
                    },
                    staleTime: 1000 * 60 * 5,
                })
                .then(() => {
                    // Extract cached vehicle items and prefetch top 15 details
                    const listData = queryClient.getQueryData<{ items?: Array<{ internal_id: number }> }>(
                        vehicleKeys.list({})
                    )
                    const items = listData?.items || []
                    items.slice(0, 15).forEach((v, idx) => {
                        const t = setTimeout(() => {
                            void queryClient.prefetchQuery({
                                queryKey: vehicleKeys.detail(v.internal_id),
                                queryFn: async () => {
                                    const res = await api.get(`/vehicles/${v.internal_id}`)
                                    return res.data
                                },
                                staleTime: 1000 * 60 * 5,
                            })
                        }, 120 * (idx + 1))
                        timers.push(t)
                    })
                })
                .catch(() => {})

            // 5. Eagerly prefetch transaction choices and default list + deep details
            void queryClient.prefetchQuery({
                queryKey: transactionKeys.choices(),
                queryFn: async () => {
                    const res = await api.get("/transactions/choices")
                    return res.data
                },
                staleTime: 1000 * 60 * 15,
            })

            void queryClient
                .prefetchQuery({
                    queryKey: transactionKeys.list({}),
                    queryFn: async () => {
                        const res = await api.get("/transactions")
                        return res.data
                    },
                    staleTime: 1000 * 60 * 5,
                })
                .then(() => {
                    const listData = queryClient.getQueryData<{ items?: Array<{ internal_id: number }> }>(
                        transactionKeys.list({})
                    )
                    const items = listData?.items || []
                    items.slice(0, 15).forEach((item, idx) => {
                        const t = setTimeout(() => {
                            void queryClient.prefetchQuery({
                                queryKey: transactionKeys.detail(item.internal_id),
                                queryFn: async () => {
                                    const res = await api.get(`/transactions/${item.internal_id}`)
                                    return res.data
                                },
                                staleTime: 1000 * 60 * 5,
                            })
                        }, 120 * (idx + 1))
                        timers.push(t)
                    })
                })
                .catch(() => {})
        }, 300)

        timers.push(mainTimer)

        return () => {
            timers.forEach(clearTimeout)
        }
    }, [user, queryClient])
}
