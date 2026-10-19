import api, { API_BASE } from "@/lib/api"
import { isTauri } from "./platform"

export interface PdfEntry {
  label: string
  url: string
}

/**
 * Normalizes an API path for axios calls where baseURL already includes /api (or cloud URL).
 * Ensures endpoints like "/api/vehicles/1/pdf" become "/vehicles/1/pdf" to prevent "/api/api/..." duplication.
 */
export function getApiRelativePath(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url
  }
  if (url.startsWith("/api/")) {
    return url.slice(4)
  }
  return url.startsWith("/") ? url : `/${url}`
}

/**
 * Resolves relative PDF URLs to absolute endpoints when running on desktop or remote cloud backend.
 * Used for direct anchor downloads or external browser viewing.
 */
export function resolvePdfUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url
  }
  const cleanBase = API_BASE.replace(/\/+$/, "")
  let cleanPath = url
  if (cleanPath.startsWith("/api/")) {
    cleanPath = cleanPath.slice(4)
  } else if (!cleanPath.startsWith("/")) {
    cleanPath = `/${cleanPath}`
  }
  return `${cleanBase}${cleanPath}`
}

/**
 * Handles multi-PDF generation fallback across Web and Desktop environments.
 * - On Web: Attempts to open tabs (best effort).
 * - On Desktop: Fetches blobs with auth credentials and triggers direct downloads in parallel.
 */
export async function handleMultiPdfOpen(pdfs: PdfEntry[]): Promise<void> {
  const resolvedPdfs = pdfs.map((pdf) => ({
    ...pdf,
    url: resolvePdfUrl(pdf.url),
  }))

  if (isTauri()) {
    for (const pdf of resolvedPdfs) {
      try {
        const apiPath = getApiRelativePath(pdf.url)
        const response = await api.get(apiPath, { responseType: "blob" })
        const blob = new Blob([response.data], { type: "application/pdf" })
        const blobUrl = URL.createObjectURL(blob)

        const link = document.createElement("a")
        link.href = blobUrl
        link.download = `${pdf.label.replace(/[^a-zA-Z0-9_\-]/g, "_")}.pdf`
        link.style.display = "none"
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000)
      } catch (err) {
        console.error(`[Desktop PDF] Failed to fetch PDF ${pdf.label}:`, err)
      }
    }
    return
  }

  resolvedPdfs.forEach((pdf, index) => {
    const link = document.createElement("a")
    link.href = pdf.url
    link.target = `pdf-tab-${Date.now()}-${index}`
    link.rel = "noopener noreferrer"
    link.style.display = "none"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  })
}
