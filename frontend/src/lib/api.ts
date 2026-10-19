import axios from "axios"

/**
 * Axios instance configured for the Django API
 * Uses dynamic API_BASE (defaults to relative /api for web proxying, or cloud URL for desktop)
 */
export const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api"

const api = axios.create({
    baseURL: API_BASE,
    headers: {
        "Content-Type": "application/json",
    },
    withCredentials: true, // Include cookies for session authentication
})

let inMemoryCsrfToken: string | null = null

/**
 * Get CSRF token from document.cookie, in-memory cache, or sessionStorage
 */
export function getCsrfToken(): string | null {
    // 1. Try document.cookie (standard browser web client)
    if (typeof document !== "undefined" && document.cookie) {
        const token = document.cookie
            .split("; ")
            .find((row) => row.startsWith("csrftoken="))
            ?.split("=")[1]
        if (token) return decodeURIComponent(token)
    }

    // 2. Try in-memory token (desktop webview fallback)
    if (inMemoryCsrfToken) return inMemoryCsrfToken

    // 3. Try sessionStorage
    try {
        const saved = sessionStorage.getItem("csrftoken")
        if (saved) return saved
    } catch {
        // Ignore sessionStorage errors in restricted environments
    }

    return null
}

/**
 * Set and persist CSRF token across headers and storage
 */
export function setCsrfToken(token: string): void {
    inMemoryCsrfToken = token
    try {
        sessionStorage.setItem("csrftoken", token)
    } catch {
        // Ignore
    }
    axios.defaults.headers.common["X-CSRFToken"] = token
    api.defaults.headers.common["X-CSRFToken"] = token
}

/**
 * Ensure CSRF token is available by making a GET request first.
 * This MUST be called before any POST/PUT/PATCH/DELETE request.
 */
export async function ensureCsrfToken(): Promise<string | null> {
    let token = getCsrfToken()

    if (!token) {
        console.log("[CSRF] No token found, fetching from /auth/csrf...")
        try {
            const response = await api.get<{ detail: string; csrfToken?: string }>("/auth/csrf")
            // Wait a tick for cookie to be set in browser
            await new Promise((resolve) => setTimeout(resolve, 50))
            
            // Check cookie first
            token = getCsrfToken()

            // If cookie missing (e.g. desktop webview cross-origin/third-party cookie isolation),
            // use csrfToken provided directly in the JSON response body
            if (!token && response.data?.csrfToken) {
                token = response.data.csrfToken
                console.log("[CSRF] Token acquired from response body for desktop/webview client")
            }

            if (token) {
                setCsrfToken(token)
            }
            console.log("[CSRF] Token after fetch:", token ? "Found" : "Still missing")
        } catch (error) {
            console.error("[CSRF] Failed to fetch CSRF token:", error)
        }
    } else {
        setCsrfToken(token)
    }

    return token
}

// Request interceptor - Add CSRF token for mutations
api.interceptors.request.use(async (config) => {
    // Only add CSRF for state-changing methods
    const method = config.method?.toLowerCase()
    if (method && ["post", "put", "patch", "delete"].includes(method)) {
        // Try to get token
        let token = getCsrfToken()

        // If no token, try to seed it
        if (!token) {
            token = await ensureCsrfToken()
        }

        if (token) {
            config.headers["X-CSRFToken"] = token
        } else {
            console.warn("[CSRF] No token available for", method.toUpperCase(), config.url)
        }
    }
    return config
})

// Response interceptor - Handle errors
api.interceptors.response.use(
    (response) => response,
    (error) => {
        // Handle unauthorized - redirect to login
        if (error.response?.status === 401) {
            if (typeof window !== "undefined" && window.location.pathname !== "/login") {
                window.location.href = "/login"
            }
        }

        // Log CSRF errors for debugging
        if (error.response?.status === 403) {
            console.error("[CSRF] 403 Forbidden - possible CSRF issue:", {
                url: error.config?.url,
                method: error.config?.method,
                hasToken: !!getCsrfToken(),
                cookies: typeof document !== "undefined" ? document.cookie : "",
            })
        }

        return Promise.reject(error)
    }
)

export default api
