import { useEffect, useRef, useCallback, useState } from "react"
import api from "@/lib/api"

export type AuthActionType = "employee_login" | "manager_login" | "password_reset" | "verify_email" | "confirm_email" | "password_change" | "email_change_verify_old" | "email_change_verify_new" | "backup_email_verify_official" | "backup_email_verify_new" | "register_verify_email" | "register_verify_backup" | "admin_activate"

export type PollStatus = "idle" | "polling" | "approved" | "expired" | "error" | "waiting_for_new_email" | "waiting_for_backup_email" | "waiting_for_admin"

interface PollResult {
    status: "pending" | "approved" | "rejected" | "expired" | "waiting_for_new_email" | "waiting_for_backup_email" | "waiting_for_admin"
    message: string
    action_type?: AuthActionType
    payload?: Record<string, any>
    reset_token?: string  // For password reset - use this to set new password
}

interface UseAuthPollingOptions {
    onApproved?: (result: PollResult) => void
    onWaitingForNewEmail?: (result: PollResult) => void  // For two-stage email verification
    onWaitingForBackupEmail?: (result: PollResult) => void  // For registration: backup email stage
    onWaitingForAdmin?: (result: PollResult) => void  // For registration: admin approval stage
    onExpired?: () => void
    onError?: (error: string) => void
    pollInterval?: number
    maxPolls?: number // Maximum number of polls before giving up
}

interface UseAuthPollingReturn {
    status: PollStatus
    message: string
    startPolling: (requestId: string) => void
    stopPolling: () => void
}

/**
 * Universal hook for polling auth request status.
 * 
 * Usage:
 * ```tsx
 * const { status, message, startPolling } = useAuthPolling({
 *   onApproved: (result) => {
 *     if (result.action_type === 'manager_login') {
 *       navigate(`/${businessSlug}/dashboard`)
 *     }
 *   }
 * })
 * 
 * // After form submit:
 * startPolling(response.request_id)
 * ```
 */
export function useAuthPolling(options: UseAuthPollingOptions = {}): UseAuthPollingReturn {
    const {
        onApproved,
        onWaitingForNewEmail,
        onWaitingForBackupEmail,
        onWaitingForAdmin,
        onExpired,
        onError,
        pollInterval = 2000,
        maxPolls = 150, // 5 minutes at 2s intervals
    } = options

    const [status, setStatus] = useState<PollStatus>("idle")
    const [message, setMessage] = useState("")

    const intervalRef = useRef<NodeJS.Timeout | null>(null)
    const pollCountRef = useRef(0)
    const requestIdRef = useRef<string | null>(null)
    const isRequestingRef = useRef(false)

    const stopPolling = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current)
            intervalRef.current = null
        }
        requestIdRef.current = null
    }, [])

    const poll = useCallback(async () => {
        if (!requestIdRef.current) return
        if (isRequestingRef.current) return // Prevent overlapping requests

        pollCountRef.current++

        // Check if we've exceeded max polls
        if (pollCountRef.current > maxPolls) {
            stopPolling()
            setStatus("expired")
            setMessage("Request timed out. Please try again.")
            onExpired?.()
            return
        }

        isRequestingRef.current = true
        try {
            const response = await api.get(`/auth/poll-status/${requestIdRef.current}`)

            // 200 OK = Approved!
            if (response.status === 200 && response.data.status === "approved") {
                stopPolling()
                setStatus("approved")
                setMessage(response.data.message || "Approved!")

                // Call the onApproved callback
                onApproved?.(response.data)

                // Default behavior for login actions: HARD RELOAD to pick up session cookie
                if (
                    response.data.action_type === "manager_login" || 
                    response.data.action_type === "employee_login"
                ) {
                    // Fetch user info to get the business slug
                    setTimeout(async () => {
                        try {
                            const meResponse = await api.get("/auth/me")
                            if (meResponse.data.authenticated && meResponse.data.user) {
                                const slug = meResponse.data.user.business_slug
                                // CRITICAL: Use window.location.href for HARD RELOAD
                                // This ensures the browser picks up the new session cookie
                                window.location.href = `/${slug}/dashboard`
                            }
                        } catch {
                            window.location.href = "/login"
                        }
                    }, 1000)
                }
            } else if (response.status === 202) {
                const data = response.data

                // Check for intermediate waiting_for_new_email state
                if (data.status === "waiting_for_new_email") {
                    setStatus("waiting_for_new_email")
                    setMessage(data.message || "Old email verified! Now check your NEW email.")
                    onWaitingForNewEmail?.(data)
                    return
                }

                // Check for waiting_for_backup_email (registration)
                if (data.status === "waiting_for_backup_email") {
                    setStatus("waiting_for_backup_email")
                    setMessage(data.message || "Primary email verified! Now check your backup email.")
                    onWaitingForBackupEmail?.(data)
                    return
                }

                // Check for waiting_for_admin (registration)
                if (data.status === "waiting_for_admin") {
                    setStatus("waiting_for_admin")
                    setMessage(data.message || "Emails verified! Waiting for administrator approval.")
                    onWaitingForAdmin?.(data)
                    return
                }

                setMessage(data.message || "Waiting for approval...")
            }
        } catch (err: any) {
            // 202 Accepted = Still pending or intermediate state, continue polling
            if (err.response?.status === 202) {
                const data = err.response.data

                // Check for intermediate waiting_for_new_email state
                if (data.status === "waiting_for_new_email") {
                    setStatus("waiting_for_new_email")
                    setMessage(data.message || "Old email verified! Now check your NEW email.")
                    onWaitingForNewEmail?.(data)
                    // Keep polling! Don't stop.
                    return
                }

                // Check for waiting_for_backup_email (registration)
                if (data.status === "waiting_for_backup_email") {
                    setStatus("waiting_for_backup_email")
                    setMessage(data.message || "Primary email verified! Now check your backup email.")
                    onWaitingForBackupEmail?.(data)
                    return
                }

                // Check for waiting_for_admin (registration)
                if (data.status === "waiting_for_admin") {
                    setStatus("waiting_for_admin")
                    setMessage(data.message || "Emails verified! Waiting for administrator approval.")
                    onWaitingForAdmin?.(data)
                    // KEEP POLLING! We want to automatically log the user in once the admin approves it!
                    return
                }

                setMessage(data.message || "Waiting for approval...")
                return
            }

            // 410 Gone = Expired or rejected
            if (err.response?.status === 410) {
                stopPolling()
                setStatus("expired")
                setMessage(err.response.data.detail || "Request expired or rejected")
                onExpired?.()
                return
            }

            // 404 Not Found = Invalid request ID
            if (err.response?.status === 404) {
                stopPolling()
                setStatus("error")
                setMessage("Request not found")
                onError?.("Request not found")
                return
            }

            // Other errors - log but continue polling
            console.error("[useAuthPolling] Error:", err)
        } finally {
            isRequestingRef.current = false
        }
    }, [maxPolls, onApproved, onError, onExpired, stopPolling])

    const startPolling = useCallback((requestId: string) => {
        // Stop any existing polling
        stopPolling()

        // Reset state
        requestIdRef.current = requestId
        pollCountRef.current = 0
        setStatus("polling")
        setMessage("Waiting for approval...")

        // Start polling immediately, then every pollInterval
        poll()
        intervalRef.current = setInterval(poll, pollInterval)
    }, [poll, pollInterval, stopPolling])

    // Handle browser focus events to resume polling when user switches back
    useEffect(() => {
        const handleFocus = () => {
            // Immediately poll when user returns to the tab
            if (requestIdRef.current && ["polling", "waiting_for_new_email", "waiting_for_backup_email", "waiting_for_admin"].includes(status)) {
                poll()
            }
        }
        
        window.addEventListener("focus", handleFocus)
        window.addEventListener("visibilitychange", handleFocus)
        
        return () => {
            window.removeEventListener("focus", handleFocus)
            window.removeEventListener("visibilitychange", handleFocus)
        }
    }, [poll, status])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopPolling()
        }
    }, [stopPolling])

    return {
        status,
        message,
        startPolling,
        stopPolling,
    }
}
