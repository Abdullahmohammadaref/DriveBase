import { get, set, del } from "idb-keyval"
import type { Persister, PersistedClient } from "@tanstack/react-query-persist-client"

/**
 * Creates an IndexedDB-backed persister for TanStack Query.
 * Stores business and catalog queries on the local machine's disk so that
 * when DriveBase starts, queries resolve in <10ms directly from SSD
 * before silently revalidating in the background.
 *
 * CRITICAL: Auth queries (queryKey starting with 'auth') are NEVER persisted
 * to prevent stale unauthenticated state loops across app reloads.
 */
export function createIDBPersister(idbKey = "drivebase-cache-v2"): Persister {
    // Clean up legacy v1 cache if present in user storage
    if (typeof window !== "undefined") {
        del("drivebase-cache-v1").catch(() => {})
    }

    return {
        persistClient: async (persistClient: PersistedClient) => {
            try {
                // Ensure auth queries are strictly stripped from disk storage
                if (persistClient?.clientState?.queries) {
                    persistClient.clientState.queries = persistClient.clientState.queries.filter(
                        (q: any) => q.queryKey?.[0] !== "auth"
                    )
                }
                await set(idbKey, persistClient)
            } catch (error) {
                console.warn("[DriveBase Cache] Failed to write cache to IndexedDB:", error)
            }
        },
        restoreClient: async (): Promise<PersistedClient | undefined> => {
            try {
                const client = await get<PersistedClient>(idbKey)
                if (client?.clientState?.queries) {
                    // Strip out any auth queries that may have been previously cached
                    client.clientState.queries = client.clientState.queries.filter(
                        (q: any) => q.queryKey?.[0] !== "auth"
                    )
                }
                return client
            } catch (error) {
                console.warn("[DriveBase Cache] Failed to restore cache from IndexedDB:", error)
                return undefined
            }
        },
        removeClient: async () => {
            try {
                await del(idbKey)
            } catch (error) {
                console.warn("[DriveBase Cache] Failed to remove cache from IndexedDB:", error)
            }
        },
    }
}
