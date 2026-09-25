/** Read a per_page or current_page preference from cookies */
export function getPagePref(cookieKey: string, defaultValue: number): number {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${cookieKey}=([^;]+)`))
    const parsed = match ? parseInt(match[1], 10) : NaN
    if (!isNaN(parsed) && parsed > 0 && parsed <= 10000) return parsed
    return defaultValue
}

/** Save a preference to a cookie (1-year expiry) */
export function savePagePref(cookieKey: string, value: number): void {
    if (value > 0 && value <= 10000) {
        document.cookie = `${cookieKey}=${value}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`
    }
}

const SPLIT_MIN = 280
const SPLIT_MAX = 700

export function getSplitWidth(cookieKey: string, defaultWidth = 420, min = SPLIT_MIN, max = SPLIT_MAX): number {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${cookieKey}=([^;]+)`))
    const parsed = match ? parseInt(match[1], 10) : NaN
    if (!isNaN(parsed) && parsed >= min && parsed <= max) return parsed
    return defaultWidth
}

export function saveSplitWidth(cookieKey: string, width: number, min = SPLIT_MIN, max = SPLIT_MAX): void {
    const clamped = Math.min(max, Math.max(min, width))
    document.cookie = `${cookieKey}=${clamped}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`
}

/** Get a string-based preference from cookies (used for tailwind width classes) */
export function getPagePrefString(cookieKey: string, defaultValue: string): string {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${cookieKey}=([^;]+)`))
    return match ? match[1] : defaultValue
}

/** Save a string-based preference to cookies */
export function savePagePrefString(cookieKey: string, value: string): void {
    document.cookie = `${cookieKey}=${value}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`
}

/** Get a boolean preference from cookies or localStorage (default false) */
export function getBoolPref(key: string, defaultValue = false): boolean {
    try {
        const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${key}=([^;]+)`))
        if (match) return match[1] === "true"
        const val = localStorage.getItem(key)
        if (val !== null) return val === "true"
    } catch { }
    return defaultValue
}

/** Save a boolean preference to both cookies and localStorage (1-year expiry) */
export function saveBoolPref(key: string, value: boolean): void {
    try {
        document.cookie = `${key}=${value}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`
        localStorage.setItem(key, String(value))
    } catch { }
}

export { SPLIT_MIN, SPLIT_MAX }
