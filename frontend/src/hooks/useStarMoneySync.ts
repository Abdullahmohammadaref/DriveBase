import { useState, useEffect, useCallback, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/lib/auth"
import api from "@/lib/api"
import { transactionKeys } from "@/hooks/useTransactions"
import {
  isTauri,
  checkStarMoneyCsvFile,
  readStarMoneyCsvFile,
  saveStarMoneySyncConfig,
  loadStarMoneySyncConfig,
  type StarMoneyFileMeta,
} from "@/lib/desktop/platform"

export interface StarMoneyBankMapping {
  id: string
  payment_method_id: number
  payment_method_name: string
  file_path: string
  last_synced_at?: string
  last_file_modified?: number
  last_file_size?: number
  file_exists?: boolean
}

export interface SyncResult {
  mappingId: string
  paymentMethodName: string
  filePath: string
  success: boolean
  skipped?: boolean
  error?: string
  total_processed?: number
  imported?: number
  updated?: number
  duplicates?: number
}

export function useStarMoneySync() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [mappings, setMappings] = useState<StarMoneyBankMapping[]>([])
  const [isLoadingConfig, setIsLoadingConfig] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncSummary, setLastSyncSummary] = useState<string | null>(null)
  const [lastSyncResults, setLastSyncResults] = useState<SyncResult[]>([])

  const isSyncingRef = useRef(false)

  // 1. Load configuration from local desktop storage
  const loadConfig = useCallback(async () => {
    if (!isTauri() || !user) {
      setIsLoadingConfig(false)
      return []
    }
    try {
      const jsonStr = await loadStarMoneySyncConfig()
      const parsed: StarMoneyBankMapping[] = JSON.parse(jsonStr || "[]")

      // Validate existence of each file
      const checked = await Promise.all(
        parsed.map(async (m) => {
          if (!m.file_path) return { ...m, file_exists: false }
          try {
            const meta = await checkStarMoneyCsvFile(m.file_path)
            return {
              ...m,
              file_exists: meta.exists,
              last_file_size: meta.size_bytes ?? m.last_file_size,
            }
          } catch {
            return { ...m, file_exists: false }
          }
        })
      )

      setMappings(checked)
      setIsLoadingConfig(false)
      return checked
    } catch (err) {
      console.warn("[StarMoneySync] Failed to load config:", err)
      setIsLoadingConfig(false)
      return []
    }
  }, [user])

  useEffect(() => {
    void loadConfig()
  }, [loadConfig])

  // 2. Save configuration to local desktop storage
  const saveMappings = useCallback(
    async (newMappings: StarMoneyBankMapping[]) => {
      if (!isTauri()) return
      setMappings(newMappings)
      try {
        await saveStarMoneySyncConfig(JSON.stringify(newMappings, null, 2))
      } catch (err) {
        console.error("[StarMoneySync] Failed to save config:", err)
      }
    },
    []
  )

  // 3. Synchronize a single bank mapping
  const syncSingleMapping = useCallback(
    async (
      mapping: StarMoneyBankMapping,
      force: boolean = false
    ): Promise<SyncResult> => {
      if (!mapping.file_path || !mapping.payment_method_id) {
        return {
          mappingId: mapping.id,
          paymentMethodName: mapping.payment_method_name,
          filePath: mapping.file_path,
          success: false,
          error: "Incomplete mapping configuration",
        }
      }

      try {
        const meta: StarMoneyFileMeta = await readStarMoneyCsvFile(mapping.file_path)

        if (!meta.exists || !meta.bytes || meta.bytes.length === 0) {
          return {
            mappingId: mapping.id,
            paymentMethodName: mapping.payment_method_name,
            filePath: mapping.file_path,
            success: false,
            error: "File not found or empty",
          }
        }

        // Check if modified timestamp changed (skip if identical and not forced)
        if (
          !force &&
          mapping.last_file_modified &&
          meta.last_modified &&
          mapping.last_file_modified === meta.last_modified
        ) {
          return {
            mappingId: mapping.id,
            paymentMethodName: mapping.payment_method_name,
            filePath: mapping.file_path,
            success: true,
            skipped: true,
          }
        }

        // Construct file upload
        const uint8Array = new Uint8Array(meta.bytes)
        const blob = new Blob([uint8Array], { type: "text/csv" })
        const fileName = mapping.file_path.split(/[\\/]/).pop() || "starmoney_export.csv"

        const formData = new FormData()
        formData.append("transactions_file", blob, fileName)
        formData.append("method", String(mapping.payment_method_id))

        const response = await api.post("/transactions/import-csv", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        })

        const resData = response.data || {}

        // Update local mapping record
        mapping.last_synced_at = new Date().toISOString()
        mapping.last_file_modified = meta.last_modified
        mapping.last_file_size = meta.size_bytes
        mapping.file_exists = true

        return {
          mappingId: mapping.id,
          paymentMethodName: mapping.payment_method_name,
          filePath: mapping.file_path,
          success: true,
          skipped: false,
          total_processed: resData.total_processed ?? 0,
          imported: resData.imported ?? 0,
          updated: resData.updated ?? 0,
          duplicates: resData.duplicates ?? 0,
        }
      } catch (err: any) {
        console.error(`[StarMoneySync] Error syncing ${mapping.payment_method_name}:`, err)
        return {
          mappingId: mapping.id,
          paymentMethodName: mapping.payment_method_name,
          filePath: mapping.file_path,
          success: false,
          error: err?.response?.data?.detail || err?.message || "Sync failed",
        }
      }
    },
    []
  )

  // 4. Synchronize all configured bank mappings
  const syncAllMappings = useCallback(
    async (force: boolean = false): Promise<SyncResult[]> => {
      if (!isTauri() || !user || isSyncingRef.current) return []
      isSyncingRef.current = true
      setIsSyncing(true)
      setLastSyncSummary(null)

      try {
        const currentMappings = mappings.length > 0 ? mappings : await loadConfig()
        if (currentMappings.length === 0) {
          setIsSyncing(false)
          isSyncingRef.current = false
          return []
        }

        const results: SyncResult[] = []
        let anyImported = false

        for (const mapping of currentMappings) {
          const res = await syncSingleMapping(mapping, force)
          results.push(res)
          if (res.success && !res.skipped && (res.imported || 0) > 0) {
            anyImported = true
          }
        }

        // Save updated timestamps
        await saveMappings([...currentMappings])
        setLastSyncResults(results)

        // Invalidate transactions query cache if transactions were imported
        if (anyImported || force) {
          void queryClient.invalidateQueries({ queryKey: transactionKeys.all })
        }

        // Formulate summary string
        const importedTotal = results.reduce((acc, r) => acc + (r.imported || 0), 0)
        const skippedCount = results.filter((r) => r.skipped).length
        const failedCount = results.filter((r) => !r.success).length

        let summary = ""
        if (importedTotal > 0) {
          summary = `Imported ${importedTotal} new transaction(s)`
        } else if (skippedCount > 0 && failedCount === 0) {
          summary = "StarMoney files up to date (no changes)"
        } else if (failedCount > 0) {
          summary = `${failedCount} bank file(s) failed or not found`
        } else {
          summary = "Sync completed"
        }

        setLastSyncSummary(summary)
        return results
      } catch (err: any) {
        console.error("[StarMoneySync] Batch sync failed:", err)
        return []
      } finally {
        setIsSyncing(false)
        isSyncingRef.current = false
      }
    },
    [mappings, loadConfig, syncSingleMapping, saveMappings, queryClient, user]
  )

  // 5. Auto-sync on startup after a calm delay
  useEffect(() => {
    if (!isTauri() || !user) return

    const timer = setTimeout(() => {
      void syncAllMappings(false)
    }, 3500)

    return () => clearTimeout(timer)
  }, [user, syncAllMappings])

  return {
    isDesktop: isTauri(),
    mappings,
    isLoadingConfig,
    isSyncing,
    lastSyncSummary,
    lastSyncResults,
    saveMappings,
    syncAllMappings,
    syncSingleMapping,
    reloadConfig: loadConfig,
  }
}
