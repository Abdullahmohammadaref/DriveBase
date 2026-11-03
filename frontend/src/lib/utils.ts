import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { resolveMediaUrl } from "@/lib/desktop/platform"

export { resolveMediaUrl }

/**
 * Utility function to merge Tailwind CSS classes
 * Combines clsx for conditional classes with tailwind-merge for deduplication
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format currency value
 */
export function formatCurrency(value: number | null | undefined, currency = "EUR"): string {
  if (value === null || value === undefined) return "-"
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
  }).format(value)
}

/**
 * Format date to locale string
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "-"
  return new Date(date).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

/**
 * Format number with thousands separator
 */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-"
  return new Intl.NumberFormat("de-DE").format(value)
}

/**
 * Add a stable cache-busting key to media URLs and resolve them properly for desktop (Tauri)
 * so newly uploaded assets do not reuse a previously cached missing/old response.
 */
export function withMediaCacheKey(url: string | null | undefined, cacheKey = "media"): string | null {
  if (!url) return null
  const resolved = resolveMediaUrl(url)
  if (!resolved) return null
  const separator = resolved.includes("?") ? "&" : "?"
  return `${resolved}${separator}v=${encodeURIComponent(cacheKey)}`
}

/**
 * Get status badge color class
 */
export function getStatusColor(status: string | null | undefined): string {
  switch (status) {
    case "purchased":
      return "bg-amber-500/10 text-amber-500 border-amber-500/20"
    case "ready_for_sale":
      return "bg-blue-500/10 text-blue-500 border-blue-500/20"
    case "reserved":
      return "bg-purple-500/10 text-purple-500 border-purple-500/20"
    case "sold":
      return "bg-green-500/10 text-green-500 border-green-500/20"
    case "inactive":
      return "bg-gray-500/10 text-gray-500 border-gray-500/20"
    default:
      return "bg-gray-500/10 text-gray-500 border-gray-500/20"
  }
}
