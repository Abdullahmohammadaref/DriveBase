/**
 * Platform detection and desktop distribution utilities for DriveBase.
 * Safely distinguishes between Browser Web App and Tauri Desktop App.
 */

// Fallback permanent download URL pointing to the latest release
const DEFAULT_DOWNLOAD_URL =
  "https://github.com/drivebase-dealership/drivebase/releases/latest/download/DriveBase_Setup.exe"

const DEFAULT_WEB_URL = "https://drivebase.example.com"

/**
 * Returns true if the application is running inside the Tauri native desktop wrapper.
 */
export function isTauri(): boolean {
  if (typeof window === "undefined") return false
  const win = window as unknown as { __TAURI_INTERNALS__?: unknown; __TAURI__?: unknown }
  return Boolean(win.__TAURI_INTERNALS__ || win.__TAURI__)
}

/**
 * Returns the permanent download URL for the Windows Desktop Application installer.
 * Always resolves to the latest release binary.
 */
export function getDesktopDownloadUrl(): string {
  return import.meta.env.VITE_DESKTOP_DOWNLOAD_URL || DEFAULT_DOWNLOAD_URL
}

/**
 * Returns the primary URL for the Cloud Web Application.
 */
export function getWebAppUrl(): string {
  return import.meta.env.VITE_WEB_APP_URL || DEFAULT_WEB_URL
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
