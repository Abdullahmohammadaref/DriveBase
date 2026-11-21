import { useState, useEffect, useCallback, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/lib/auth"
import api from "@/lib/api"
import { transactionKeys } from "@/hooks/useTransactions"
import {
  isTauri,
  readStarMoneyCsvFile,
  saveStarMoneySyncConfig,
  loadStarMoneySyncConfig,
  scanStarMoneyDir,
  ensureStarMoneyDir,
  type ScannedExportFile,
  type StarMoneyFileMeta,
} from "@/lib/desktop/platform"

export const DEFAULT_STARMONEY_WATCH_DIR = "C:\\DriveBase\\BankExports"

export interface StarMoneyBankMapping {
  id: string
  payment_method_id: number
  payment_method_name: string
  patterns: string // e.g. "sparkasse, 1076843790"
  last_synced_at?: string
  last_synced_file?: string
  last_file_modified?: number
  matched_file?: ScannedExportFile | null
}

export interface StarMoneySyncConfig {
  watch_dir: string
  mappings: StarMoneyBankMapping[]
}

export interface DetectedExport {
  mapping: StarMoneyBankMapping
  file: ScannedExportFile
  isNew: boolean
}

export interface UnmappedExport {
  file: ScannedExportFile
  suggestedAccount: string
}

export interface SyncResult {
  mappingId: string
  paymentMethodName: string
  filePath: string
  fileName: string
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

  const [watchDir, setWatchDir] = useState<string>(DEFAULT_STARMONEY_WATCH_DIR)
  const [mappings, setMappings] = useState<StarMoneyBankMapping[]>([])
  const [scannedFiles, setScannedFiles] = useState<ScannedExportFile[]>([])
  const [detectedExports, setDetectedExports] = useState<DetectedExport[]>([])
  const [unmappedExports, setUnmappedExports] = useState<UnmappedExport[]>([])

  const [isLoadingConfig, setIsLoadingConfig] = useState(true)
  const [isScanning, setIsScanning] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncSummary, setLastSyncSummary] = useState<string | null>(null)
  const [lastSyncResults, setLastSyncResults] = useState<SyncResult[]>([])

  const isSyncingRef = useRef(false)

  // 1. Load config from desktop storage
  const loadConfig = useCallback(async (): Promise<StarMoneySyncConfig> => {
    if (!isTauri() || !user) {
      setIsLoadingConfig(false)
      return { watch_dir: DEFAULT_STARMONEY_WATCH_DIR, mappings: [] }
    }
    try {
      const jsonStr = await loadStarMoneySyncConfig()
      let parsed: any = null
      try {
        parsed = JSON.parse(jsonStr || "{}")
      } catch {
        parsed = null
      }

      let activeDir = DEFAULT_STARMONEY_WATCH_DIR
      let activeMappings: StarMoneyBankMapping[] = []

      // Handle both new { watch_dir, mappings } and legacy array format
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.watch_dir) {
        activeDir = parsed.watch_dir || DEFAULT_STARMONEY_WATCH_DIR
        activeMappings = Array.isArray(parsed.mappings) ? parsed.mappings : []
      } else if (Array.isArray(parsed) && parsed.length > 0) {
        // Migration from legacy array
        activeMappings = parsed.map((m: any) => ({
          id: m.id || crypto.randomUUID(),
          payment_method_id: m.payment_method_id || 1,
          payment_method_name: m.payment_method_name || "Bank",
          patterns: m.payment_method_name?.toLowerCase() || "sparkasse",
          last_synced_at: m.last_synced_at,
          last_file_modified: m.last_file_modified,
        }))
      }

      // Ensure the watch folder exists on disk
      void ensureStarMoneyDir(activeDir)

      setWatchDir(activeDir)
      setMappings(activeMappings)
      setIsLoadingConfig(false)
      return { watch_dir: activeDir, mappings: activeMappings }
    } catch (err) {
      console.warn("[StarMoneySync] Failed to load config:", err)
      setIsLoadingConfig(false)
      return { watch_dir: DEFAULT_STARMONEY_WATCH_DIR, mappings: [] }
    }
  }, [user])

  // 2. Save entire config
  const saveConfig = useCallback(
    async (newConfig: StarMoneySyncConfig) => {
      if (!isTauri()) return
      setWatchDir(newConfig.watch_dir)
      setMappings(newConfig.mappings)
      try {
        await saveStarMoneySyncConfig(JSON.stringify(newConfig, null, 2))
        // Re-scan with new configuration
        void scanDirectory(newConfig.watch_dir, newConfig.mappings)
      } catch (err) {
        console.error("[StarMoneySync] Failed to save config:", err)
      }
    },
    []
  )

  // 3. Scan directory and match files with mappings
  const scanDirectory = useCallback(
    async (
      dir: string = watchDir,
      currentMappings: StarMoneyBankMapping[] = mappings
    ) => {
      if (!isTauri() || !dir) return
      setIsScanning(true)
      try {
        const files: ScannedExportFile[] = await scanStarMoneyDir(dir)
        setScannedFiles(files)

        const matchedFilePaths = new Set<string>()
        const detected: DetectedExport[] = []

        // For each mapped bank, find the newest matching file in the directory
        const updatedMappings = currentMappings.map((m) => {
          const patternList = (m.patterns || "")
            .split(/[,;\s]+/)
            .map((p) => p.trim().toLowerCase())
            .filter(Boolean)

          // Also match on bank name itself
          if (m.payment_method_name) {
            patternList.push(m.payment_method_name.toLowerCase())
          }

          // Find first matching file (files are already sorted newest first by Rust)
          const matched = files.find((f) => {
            const lowerName = f.name.toLowerCase()
            return patternList.some((pat) => lowerName.includes(pat))
          })

          if (matched) {
            matchedFilePaths.add(matched.path)
            const isNew =
              !m.last_file_modified || matched.last_modified > m.last_file_modified

            detected.push({
              mapping: m,
              file: matched,
              isNew,
            })
          }

          return {
            ...m,
            matched_file: matched || null,
          }
        })

        setMappings(updatedMappings)
        setDetectedExports(detected)

        // Find unmapped files
        const unmapped: UnmappedExport[] = files
          .filter((f) => !matchedFilePaths.has(f.path))
          .map((f) => {
            // Try extracting account number prefix (e.g. 1076843790_EUR_...)
            const m = f.name.match(/^([0-9]{6,16})/i)
            return {
              file: f,
              suggestedAccount: m ? m[1] : f.name.replace(/\.(csv|txt)$/i, ""),
            }
          })

        setUnmappedExports(unmapped)
      } catch (err) {
        console.error("[StarMoneySync] Scan error:", err)
      } finally {
        setIsScanning(false)
      }
    },
    [watchDir, mappings]
  )

  // Initial load
  useEffect(() => {
    void loadConfig().then((cfg) => {
      void scanDirectory(cfg.watch_dir, cfg.mappings)
    })
  }, [loadConfig])

  // 4. Synchronize a specific export file
  const syncExport = useCallback(
    async (
      mapping: StarMoneyBankMapping,
      file: ScannedExportFile,
      force: boolean = false
    ): Promise<SyncResult> => {
      try {
        const meta: StarMoneyFileMeta = await readStarMoneyCsvFile(file.path)
        if (!meta.exists || !meta.bytes || meta.bytes.length === 0) {
          return {
            mappingId: mapping.id,
            paymentMethodName: mapping.payment_method_name,
            filePath: file.path,
            fileName: file.name,
            success: false,
            error: "File not found or empty",
          }
        }

        // Check if modified timestamp changed (skip if identical and not forced)
        if (
          !force &&
          mapping.last_file_modified &&
          file.last_modified &&
          mapping.last_file_modified === file.last_modified
        ) {
          return {
            mappingId: mapping.id,
            paymentMethodName: mapping.payment_method_name,
            filePath: file.path,
            fileName: file.name,
            success: true,
            skipped: true,
          }
        }

        // Construct file upload
        const uint8Array = new Uint8Array(meta.bytes)
        const blob = new Blob([uint8Array], { type: "text/csv" })

        const formData = new FormData()
        formData.append("transactions_file", blob, file.name)
        formData.append("method", String(mapping.payment_method_id))
        formData.append("is_auto_sync", "true")

        const response = await api.post("/transactions/import/csv/", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        })

        const resData = response.data || {}

        // Update mapping metadata
        const updatedMappings = mappings.map((m) =>
          m.id === mapping.id
            ? {
                ...m,
                last_synced_at: new Date().toISOString(),
                last_synced_file: file.name,
                last_file_modified: file.last_modified,
              }
            : m
        )

        await saveConfig({
          watch_dir: watchDir,
          mappings: updatedMappings,
        })

        // Refresh transactions list query cache
        void queryClient.invalidateQueries({ queryKey: transactionKeys.lists() })

        return {
          mappingId: mapping.id,
          paymentMethodName: mapping.payment_method_name,
          filePath: file.path,
          fileName: file.name,
          success: true,
          skipped: false,
          total_processed: resData.created_count + resData.updated_count,
          imported: resData.created_count ?? 0,
          updated: resData.updated_count ?? 0,
          duplicates: resData.error_count ?? 0,
        }
      } catch (err: any) {
        console.error(`[StarMoneySync] Sync error for ${mapping.payment_method_name}:`, err)
        return {
          mappingId: mapping.id,
          paymentMethodName: mapping.payment_method_name,
          filePath: file.path,
          fileName: file.name,
          success: false,
          error: err?.response?.data?.message || err?.message || "Sync failed",
        }
      }
    },
    [mappings, watchDir, saveConfig, queryClient]
  )

  // 5. Synchronize all detected exports that are new
  const syncAllDetected = useCallback(
    async (force: boolean = false): Promise<SyncResult[]> => {
      if (!isTauri() || !user || isSyncingRef.current) return []
      isSyncingRef.current = true
      setIsSyncing(true)
      setLastSyncSummary(null)

      try {
        const results: SyncResult[] = []

        for (const item of detectedExports) {
          if (force || item.isNew) {
            const res = await syncExport(item.mapping, item.file, force)
            results.push(res)
          }
        }

        setLastSyncResults(results)

        const importedTotal = results.reduce((acc, r) => acc + (r.imported || 0), 0)
        const skippedCount = results.filter((r) => r.skipped).length
        const failedCount = results.filter((r) => !r.success).length

        let summary = ""
        if (importedTotal > 0) {
          summary = `Imported ${importedTotal} new transaction(s)`
        } else if (skippedCount > 0 && failedCount === 0) {
          summary = "StarMoney files up to date (no changes)"
        } else if (failedCount > 0) {
          summary = `${failedCount} bank file(s) failed`
        } else {
          summary = "Sync completed"
        }

        setLastSyncSummary(summary)
        return results
      } catch (err) {
        console.error("[StarMoneySync] Batch sync error:", err)
        return []
      } finally {
        setIsSyncing(false)
        isSyncingRef.current = false
      }
    },
    [detectedExports, syncExport, user]
  )

  // 6. Bind a newly discovered account number to a payment method
  const bindNewAccount = useCallback(
    async (
      patternOrAccount: string,
      paymentMethodId: number,
      paymentMethodName: string
    ) => {
      const existing = mappings.find(
        (m) => m.payment_method_id === paymentMethodId
      )

      let updated: StarMoneyBankMapping[] = []

      if (existing) {
        // Add pattern to existing mapping
        const currentPats = existing.patterns
          .split(/[,;\s]+/)
          .filter(Boolean)
        if (!currentPats.includes(patternOrAccount.toLowerCase())) {
          currentPats.push(patternOrAccount.toLowerCase())
        }
        updated = mappings.map((m) =>
          m.id === existing.id ? { ...m, patterns: currentPats.join(", ") } : m
        )
      } else {
        // Create new mapping
        const newEntry: StarMoneyBankMapping = {
          id: crypto.randomUUID(),
          payment_method_id: paymentMethodId,
          payment_method_name: paymentMethodName,
          patterns: patternOrAccount.toLowerCase(),
        }
        updated = [...mappings, newEntry]
      }

      await saveConfig({
        watch_dir: watchDir,
        mappings: updated,
      })
    },
    [mappings, watchDir, saveConfig]
  )

  return {
    isDesktop: isTauri(),
    watchDir,
    setWatchDir,
    mappings,
    scannedFiles,
    detectedExports,
    unmappedExports,
    isLoadingConfig,
    isScanning,
    isSyncing,
    lastSyncSummary,
    lastSyncResults,
    saveConfig,
    scanDirectory,
    syncExport,
    syncAllDetected,
    bindNewAccount,
    reloadConfig: loadConfig,
  }
}
