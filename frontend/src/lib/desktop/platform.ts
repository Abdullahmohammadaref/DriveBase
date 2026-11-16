/**
 * Platform detection and desktop distribution utilities for DriveBase.
 * Safely distinguishes between Browser Web App and Tauri Desktop App.
 */

// Fallback permanent direct download URL pointing to the server-hosted installer
const DEFAULT_DOWNLOAD_URL = "/api/desktop/download"

const DEFAULT_WEB_URL = "https://a-car.duckdns.org"

/**
 * Returns true if the application is running inside the Tauri native desktop wrapper.
 */
export function isTauri(): boolean {
  if (typeof window === "undefined") return false
  const win = window as unknown as { __TAURI_INTERNALS__?: unknown; __TAURI__?: unknown; isTauri?: boolean }
  return Boolean(
    win.isTauri ||
    win.__TAURI_INTERNALS__ ||
    win.__TAURI__ ||
    window.location.hostname === "tauri.localhost" ||
    window.location.protocol === "tauri:" ||
    import.meta.env.VITE_IS_DESKTOP === "true"
  )
}

/**
 * Returns the permanent download URL for the Windows Desktop Application installer.
 * In a browser, returns relative direct download link ("/api/desktop/download").
 * Inside Tauri, resolves against the web application domain.
 */
export function getDesktopDownloadUrl(): string {
  const url = import.meta.env.VITE_DESKTOP_DOWNLOAD_URL || DEFAULT_DOWNLOAD_URL
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url
  }
  if (isTauri()) {
    return `${getWebAppUrl()}${url.startsWith("/") ? "" : "/"}${url}`
  }
  return url
}

/**
 * Returns the primary URL for the Cloud Web Application.
 */
export function getWebAppUrl(): string {
  return import.meta.env.VITE_WEB_APP_URL || DEFAULT_WEB_URL
}

/**
 * Resolves a media or static asset URL to an absolute URL when running in Tauri.
 * In a standard browser, relative URLs like "/media/..." are automatically resolved
 * against the window origin. In Tauri desktop, the origin is "http://tauri.localhost",
 * so relative media paths must be prepended with the Cloud Web App URL.
 */
export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (/^(https?:|data:|blob:)/i.test(url)) return url
  if (isTauri()) {
    const cleanPath = url.startsWith("/") ? url : `/${url}`
    return `${getWebAppUrl()}${cleanPath}`
  }
  return url
}

/**
 * Opens an external URL in the system's default browser.
 */
export async function openExternal(url: string): Promise<void> {
  if (typeof window === "undefined") return

  if (isTauri()) {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener").catch(() => ({ openUrl: null }))
      if (openUrl) {
        await openUrl(url)
        return
      }
    } catch {
      // Fallback to window.open
    }
  }

  window.open(url, "_blank", "noopener,noreferrer")
}

export interface DownloadResult {
  success: boolean
  path?: string
  filename: string
  cancelled?: boolean
  error?: string
}

/**
 * Prompts the user with a native Windows "Save As..." dialog to choose directory and filename.
 * - On Tauri Desktop: Opens native Windows save dialog via Rust (`save_file_with_dialog`).
 * - On Web Browser: Opens native Save As dialog via File System Access API (`showSaveFilePicker`), with anchor fallback.
 */
export async function downloadBlob(filename: string, blob: Blob): Promise<DownloadResult> {
  if (typeof window === "undefined") {
    return { success: false, filename, error: "Window undefined" }
  }

  // 1. Tauri Desktop App: Native Windows "Save As..." dialog
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core")
      const arrayBuffer = await blob.arrayBuffer()
      const bytes = Array.from(new Uint8Array(arrayBuffer))
      const savedPath = await invoke<string | null>("save_file_with_dialog", { filename, bytes })
      if (!savedPath) {
        // User clicked Cancel in the Windows Save dialog
        return { success: false, filename, cancelled: true }
      }
      return { success: true, path: savedPath, filename }
    } catch (err: unknown) {
      console.warn("[Desktop] Native dialog save failed, falling back to download helper:", err)
    }
  }

  // 2. Web Browser: Native File System Access "Save As..." dialog
  if ("showSaveFilePicker" in window) {
    try {
      const win = window as unknown as {
        showSaveFilePicker: (options: {
          suggestedName: string
          types: Array<{ description: string; accept: Record<string, string[]> }>
        }) => Promise<{
          createWritable: () => Promise<{
            write: (data: Blob) => Promise<void>
            close: () => Promise<void>
          }>
        }>
      }
      const handle = await win.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: "ZIP Archive (*.zip)",
            accept: { "application/zip": [".zip"] },
          },
        ],
      })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return { success: true, filename }
    } catch (pickerErr: unknown) {
      const err = pickerErr as { name?: string }
      if (err?.name === "AbortError") {
        // User clicked Cancel in browser file picker
        return { success: false, filename, cancelled: true }
      }
      console.warn("[Web] showSaveFilePicker failed, trying anchor fallback:", pickerErr)
    }
  }

  // 3. Fallback anchor download
  try {
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 5000)
    return { success: true, filename }
  } catch (webErr) {
    return { success: false, filename, error: String(webErr) }
  }
}

/**
 * Highlights a file in Windows Explorer (Desktop only).
 */
export async function showInFolder(path: string): Promise<void> {
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core")
      await invoke("show_in_folder", { path })
    } catch (err) {
      console.warn("[Desktop] showInFolder failed:", err)
    }
  }
}

export interface LocalDbInfo {
  exists: boolean
  path?: string
  size_bytes?: number
  last_modified?: number
}

/**
 * Saves business SQLite database to %APPDATA%\DriveBase\databases\business_<id>.sqlite3
 */
export async function saveBusinessSqlite(businessId: number, bytes: number[]): Promise<string> {
  if (!isTauri()) throw new Error("saveBusinessSqlite only available in desktop")
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<string>("save_business_sqlite", { businessId, bytes })
}

/**
 * Returns metadata about the local SQLite database file on disk.
 */
export async function getLocalDatabaseInfo(businessId: number): Promise<LocalDbInfo> {
  if (!isTauri()) return { exists: false }
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<LocalDbInfo>("get_local_database_info", { businessId })
}

/**
 * Saves a media file into %APPDATA%\DriveBase\media\<relative_path>
 */
export async function saveMediaFile(relativePath: string, bytes: number[]): Promise<string> {
  if (!isTauri()) throw new Error("saveMediaFile only available in desktop")
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<string>("save_media_file", { relativePath, bytes })
}

/**
 * Returns list of relative paths for all media files cached in %APPDATA%\DriveBase\media
 */
export async function getCachedMediaFiles(): Promise<string[]> {
  if (!isTauri()) return []
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<string[]>("get_cached_media_files")
}

/**
 * Launches Windows Explorer inside the local DriveBase app data directory.
 */
export async function openLocalDataFolder(): Promise<void> {
  if (!isTauri()) return
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<void>("open_local_data_folder")
}

/**
 * Packages the local SQLite database and media folder into a standalone disaster recovery ZIP.
 */
export async function exportDisasterRecoveryZip(businessId: number): Promise<string | null> {
  if (!isTauri()) throw new Error("exportDisasterRecoveryZip only available in desktop")
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<string | null>("export_disaster_recovery_zip", { businessId })
}

export interface StarMoneyFileMeta {
  exists: boolean
  path: string
  size_bytes?: number
  last_modified?: number
  bytes?: number[]
}

/**
 * Opens native Windows file dialog to choose a StarMoney CSV export file.
 */
export async function pickStarMoneyCsvFile(): Promise<string | null> {
  if (!isTauri()) return null
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<string | null>("pick_starmoney_csv_file")
}

/**
 * Checks if a StarMoney CSV file exists on disk and returns its size & modified timestamp.
 */
export async function checkStarMoneyCsvFile(filePath: string): Promise<StarMoneyFileMeta> {
  if (!isTauri()) return { exists: false, path: filePath }
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<StarMoneyFileMeta>("check_starmoney_csv_file", { filePath })
}

/**
 * Reads the bytes and metadata of a StarMoney CSV file.
 */
export async function readStarMoneyCsvFile(filePath: string): Promise<StarMoneyFileMeta> {
  if (!isTauri()) throw new Error("readStarMoneyCsvFile only available on desktop")
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<StarMoneyFileMeta>("read_starmoney_csv_file", { filePath })
}

/**
 * Saves the local StarMoney bank synchronization config.
 */
export async function saveStarMoneySyncConfig(configJson: string): Promise<void> {
  if (!isTauri()) return
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<void>("save_starmoney_sync_config", { configJson })
}

/**
 * Loads the local StarMoney bank synchronization config.
 */
export async function loadStarMoneySyncConfig(): Promise<string> {
  if (!isTauri()) return "[]"
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke<string>("load_starmoney_sync_config")
}
