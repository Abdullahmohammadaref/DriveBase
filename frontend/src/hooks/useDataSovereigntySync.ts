import { useState, useEffect, useCallback, useRef } from "react"
import { useAuth } from "@/lib/auth"
import api from "@/lib/api"
import {
  isTauri,
  saveBusinessSqlite,
  getLocalDatabaseInfo,
  saveMediaFile,
  getCachedMediaFiles,
  openLocalDataFolder,
  exportDisasterRecoveryZip,
  type LocalDbInfo,
} from "@/lib/desktop/platform"

export interface MediaManifestItem {
  entity_type: string
  entity_id: number
  relative_path: string
  url: string
}

export interface MediaManifestResponse {
  business_id: number
  total_files: number
  files: MediaManifestItem[]
}

export interface DataSovereigntyState {
  isSyncing: boolean
  lastSyncTime: Date | null
  dbInfo: LocalDbInfo | null
  cachedMediaCount: number
  totalMediaCount: number
  syncProgress: string | null
  error: string | null
}

const LOCAL_STORAGE_LAST_SYNC = "drivebase_last_sovereignty_sync"

export function useDataSovereigntySync() {
  const { user } = useAuth()
  const [state, setState] = useState<DataSovereigntyState>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_LAST_SYNC)
    return {
      isSyncing: false,
      lastSyncTime: saved ? new Date(saved) : null,
      dbInfo: null,
      cachedMediaCount: 0,
      totalMediaCount: 0,
      syncProgress: null,
      error: null,
    }
  })

  const isSyncingRef = useRef(false)

  // Load existing database info on mount
  const refreshDbInfo = useCallback(async () => {
    if (!isTauri() || !user) return
    try {
      const bizId = (user as any).business_id || (user as any).business?.id || 1
      const info = await getLocalDatabaseInfo(bizId)
      const cachedFiles = await getCachedMediaFiles()
      setState((prev) => ({
        ...prev,
        dbInfo: info,
        cachedMediaCount: cachedFiles.length,
      }))
    } catch (err) {
      console.warn("[DataSovereignty] Error loading initial db info:", err)
    }
  }, [user])

  useEffect(() => {
    void refreshDbInfo()
  }, [refreshDbInfo])

  const triggerSync = useCallback(async () => {
    if (!isTauri() || !user || isSyncingRef.current) return
    isSyncingRef.current = true

    setState((prev) => ({
      ...prev,
      isSyncing: true,
      syncProgress: "Syncing database snapshot...",
      error: null,
    }))

    try {
      const bizId = (user as any).business_id || (user as any).business?.id || 1

      // 1. Download SQLite database snapshot
      const dbResponse = await api.get("/sync/business-sqlite", {
        responseType: "arraybuffer",
      })
      const dbBytes = Array.from(new Uint8Array(dbResponse.data))
      await saveBusinessSqlite(bizId, dbBytes)

      const updatedDbInfo = await getLocalDatabaseInfo(bizId)

      // 2. Download media manifest
      setState((prev) => ({
        ...prev,
        dbInfo: updatedDbInfo,
        syncProgress: "Checking media manifest...",
      }))

      const manifestRes = await api.get<MediaManifestResponse>("/sync/media-manifest")
      const manifest = manifestRes.data
      const totalMedia = manifest.files.length

      // 3. Compare with locally cached files
      const localFiles = await getCachedMediaFiles()
      const localFilesSet = new Set(localFiles.map((f) => f.toLowerCase().trim()))

      const missingFiles = manifest.files.filter((item) => {
        const clean = item.relative_path.replace(/\\/g, "/").toLowerCase().trim()
        return !localFilesSet.has(clean)
      })

      // 4. Download missing photos with low concurrency (2 parallel)
      if (missingFiles.length > 0) {
        setState((prev) => ({
          ...prev,
          totalMediaCount: totalMedia,
          syncProgress: `Syncing photos (0/${missingFiles.length})...`,
        }))

        const concurrency = 2
        let downloadedCount = 0

        for (let i = 0; i < missingFiles.length; i += concurrency) {
          const chunk = missingFiles.slice(i, i + concurrency)
          await Promise.all(
            chunk.map(async (fileItem) => {
              try {
                const imgRes = await api.get(fileItem.url, {
                  responseType: "arraybuffer",
                })
                const bytes = Array.from(new Uint8Array(imgRes.data))
                await saveMediaFile(fileItem.relative_path, bytes)
                downloadedCount += 1
                setState((prev) => ({
                  ...prev,
                  syncProgress: `Syncing photos (${downloadedCount}/${missingFiles.length})...`,
                }))
              } catch (fileErr) {
                console.warn(`[DataSovereignty] Failed to cache image ${fileItem.relative_path}:`, fileErr)
              }
            })
          )
        }
      }

      const finalCached = await getCachedMediaFiles()
      const now = new Date()
      localStorage.setItem(LOCAL_STORAGE_LAST_SYNC, now.toISOString())

      setState((prev) => ({
        ...prev,
        isSyncing: false,
        lastSyncTime: now,
        dbInfo: updatedDbInfo,
        cachedMediaCount: finalCached.length,
        totalMediaCount: totalMedia,
        syncProgress: null,
      }))
    } catch (err: any) {
      console.error("[DataSovereignty] Sync failed:", err)
      setState((prev) => ({
        ...prev,
        isSyncing: false,
        syncProgress: null,
        error: err?.message || "Sync failed",
      }))
    } finally {
      isSyncingRef.current = false
    }
  }, [user])

  // Automatic startup sync & recurring 30-minute interval
  useEffect(() => {
    if (!isTauri() || !user) return

    // Gentle delay after login before starting sync
    const startTimer = setTimeout(() => {
      void triggerSync()
    }, 2500)

    // Recurring sync every 30 minutes
    const intervalTimer = setInterval(() => {
      void triggerSync()
    }, 1000 * 60 * 30)

    return () => {
      clearTimeout(startTimer)
      clearInterval(intervalTimer)
    }
  }, [user, triggerSync])

  const openFolder = useCallback(async () => {
    try {
      await openLocalDataFolder()
    } catch (err) {
      console.error("[DataSovereignty] Failed to open local folder:", err)
    }
  }, [])

  const exportZip = useCallback(async () => {
    if (!user) return null
    const bizId = (user as any).business_id || (user as any).business?.id || 1
    return exportDisasterRecoveryZip(bizId)
  }, [user])

  return {
    ...state,
    isDesktop: isTauri(),
    triggerSync,
    openFolder,
    exportZip,
    refreshDbInfo,
  }
}
