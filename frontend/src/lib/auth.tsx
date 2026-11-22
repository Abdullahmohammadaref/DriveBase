import { createContext, useContext, useEffect, ReactNode } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useParams, useNavigate, useLocation } from "react-router-dom"
import api, { ensureCsrfToken } from "./api"

// =============================================================================
// Types
// =============================================================================

export interface User {
    id: number
    email: string
    username: string
    is_manager: boolean
    is_superuser: boolean
    business_name: string
    business_slug: string
    business_logo?: string
    backup_email?: string
    transactions_access: boolean
}

export interface AuthState {
    isAuthenticated: boolean
    isLoading: boolean
    user: User | null
}

interface LoginData {
    email?: string
    username?: string
    password: string
    login_type: "manager" | "employee"
}

interface EmailChangeData {
    username: string
    password: string
    backup_email: string
    new_email: string
}

interface RegisterData {
    username: string
    email: string
    backup_email: string
    password: string
    confirm_password: string
    business_name: string
}

interface AuthContextValue extends AuthState {
    login: (data: LoginData) => Promise<{ success: boolean; message: string; request_id?: string }>
    logout: () => Promise<void>
    businessSlug: string | null
    requestPasswordReset: (data: { email?: string; username?: string }) => Promise<{ success: boolean; message: string; request_id?: string }>
    requestEmailChange: (data: EmailChangeData) => Promise<{ success: boolean; message: string; request_id?: string }>
    setNewPassword: (resetToken: string, newPassword: string) => Promise<{ success: boolean; message: string }>
    register: (data: RegisterData) => Promise<{ success: boolean; message: string; request_id?: string }>
    checkUsername: (username: string) => Promise<{ available: boolean; message: string }>
}

// =============================================================================
// Auth Context
// =============================================================================

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
    const queryClient = useQueryClient()
    const navigate = useNavigate()

    // Ensure CSRF token is seeded on app load
    useEffect(() => {
        ensureCsrfToken()
    }, [])

    // Fetch current user
    const { data, isLoading } = useQuery({
        queryKey: ["auth", "me"],
        queryFn: async () => {
            const response = await api.get("/auth/me")
            return response.data
        },
        retry: false,
        staleTime: (query) => (query.state.data?.authenticated ? 2 * 60 * 1000 : 0),
        gcTime: 5 * 60 * 1000,
    })

    // Logout mutation
    const logoutMutation = useMutation({
        mutationFn: async () => {
            await api.post("/auth/logout")
        },
        onSuccess: () => {
            queryClient.setQueryData(["auth", "me"], { authenticated: false, user: null })
            navigate("/login")
        },
    })

    /**
     * Login function - handles both manager and employee login
     * Returns success: true if the API returns 200, regardless of response content
     */
    const login = async (data: LoginData): Promise<{ success: boolean; message: string; request_id?: string }> => {
        try {
            const response = await api.post("/auth/request-login", data)

            // If we got a 200 response, it's a success!
            // The backend sends a magic link email and returns a message
            return {
                success: true,
                message: response.data.message || "Login link sent! Check your email.",
                request_id: response.data.request_id,
            }
        } catch (error: any) {
            // Only 4xx/5xx responses are errors
            const message = error.response?.data?.detail || "Login failed. Please try again."
            return { success: false, message }
        }
    }

    const logout = async () => {
        await logoutMutation.mutateAsync()
    }

    /**
     * Request password reset - returns request_id for polling
     */
    const requestPasswordReset = async (data: { email?: string; username?: string }): Promise<{ success: boolean; message: string; request_id?: string }> => {
        try {
            const response = await api.post("/auth/request-password-reset", data)
            return {
                success: true,
                message: response.data.message || "If an account exists, a reset link has been sent.",
                request_id: response.data.request_id,
            }
        } catch (error: any) {
            const message = error.response?.data?.detail || "Request failed. Please try again."
            return { success: false, message }
        }
    }

    /**
     * Request email change - returns request_id for polling
     */
    const requestEmailChange = async (data: EmailChangeData): Promise<{ success: boolean; message: string; request_id?: string }> => {
        try {
            const response = await api.post("/auth/request-email-change", data)
            return {
                success: true,
                message: response.data.message || "Verification email sent.",
                request_id: response.data.request_id,
            }
        } catch (error: any) {
            const message = error.response?.data?.detail || "Request failed. Please try again."
            return { success: false, message }
        }
    }

    /**
     * Set new password after reset verification
     */
    const setNewPassword = async (resetToken: string, newPassword: string): Promise<{ success: boolean; message: string }> => {
        try {
            const response = await api.post("/auth/set-new-password", {
                reset_token: resetToken,
                new_password: newPassword,
            })
            return {
                success: true,
                message: response.data.message || "Password updated successfully!",
            }
        } catch (error: any) {
            const message = error.response?.data?.detail || "Failed to update password."
            return { success: false, message }
        }
    }

    /**
     * Register a new manager account
     */
    const register = async (data: RegisterData): Promise<{ success: boolean; message: string; request_id?: string }> => {
        try {
            const response = await api.post("/auth/register", data)
            return {
                success: true,
                message: response.data.message || "Registration started!",
                request_id: response.data.request_id,
            }
        } catch (error: any) {
            const message = error.response?.data?.detail || "Registration failed. Please try again."
            return { success: false, message }
        }
    }

    /**
     * Check if username is available
     */
    const checkUsername = async (username: string): Promise<{ available: boolean; message: string }> => {
        try {
            const response = await api.get(`/auth/check-username?username=${encodeURIComponent(username)}`)
            return response.data
        } catch {
            return { available: false, message: "Could not check username." }
        }
    }

    // Derived state
    const isAuthenticated = data?.authenticated === true
    const user = data?.user ?? null
    const businessSlug = user?.business_slug ?? null

    const value: AuthContextValue = {
        isAuthenticated,
        isLoading,
        user,
        login,
        logout,
        businessSlug,
        requestPasswordReset,
        requestEmailChange,
        setNewPassword,
        register,
        checkUsername,
    }

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// =============================================================================
// Hooks
// =============================================================================

export function useAuth() {
    const context = useContext(AuthContext)
    if (!context) {
        throw new Error("useAuth must be used within an AuthProvider")
    }
    return context
}

/**
 * Get business slug from URL params
 */
export function useBusinessSlug(): string | null {
    const params = useParams<{ business_slug: string }>()
    const auth = useAuth()
    return params.business_slug ?? auth.businessSlug
}

/**
 * Require authentication - redirects to login if not authenticated
 */
export function useRequireAuth(): AuthState & { businessSlug: string | null } {
    const auth = useAuth()
    const navigate = useNavigate()
    const location = useLocation()

    useEffect(() => {
        if (!auth.isLoading && !auth.isAuthenticated) {
            navigate("/login", { state: { from: location.pathname } })
        }
    }, [auth.isAuthenticated, auth.isLoading, navigate, location])

    return {
        isAuthenticated: auth.isAuthenticated,
        isLoading: auth.isLoading,
        user: auth.user,
        businessSlug: auth.businessSlug,
    }
}
