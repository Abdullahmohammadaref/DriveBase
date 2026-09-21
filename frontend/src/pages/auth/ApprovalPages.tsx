import { useEffect, useState } from "react"
import { useParams, Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { CheckCircle, XCircle, Loader2, ArrowLeft, Key, Mail, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import axios from "axios"

type ApprovalStatus = "loading" | "success" | "error"

interface ApprovalData {
    success: boolean
    message: string
    status: string
    action_type?: string
    username?: string
    new_email?: string
}

/**
 * Universal Approval Page
 * Route: /login/approve/:token
 * 
 * Handles all approval/verification links:
 * - Manager login verification
 * - Employee login approval
 * - Password reset verification
 * - Email change verification
 */
export function ApprovalPage() {
    const { t } = useTranslation()
    const { token } = useParams<{ token: string }>()

    const [status, setStatus] = useState<ApprovalStatus>("loading")
    const [data, setData] = useState<ApprovalData | null>(null)

    useEffect(() => {
        if (!token) {
            setStatus("error")
            setData({ success: false, message: "Invalid link", status: "error" })
            return
        }

        const approveRequest = async () => {
            try {
                // CRITICAL: Use plain axios WITHOUT credentials
                // This ensures we don't send any session cookies - just like a curl request
                // The /approve endpoint only updates the DB, it doesn't need authentication
                const response = await axios.get(`/api/auth/approve/${token}`, {
                    withCredentials: false,  // No cookies = no session hijack
                })

                // The response is HTML now, but we can parse if it was a success
                // Check if HTML contains success indicator
                if (typeof response.data === 'string' && response.data.includes('✓')) {
                    setStatus("success")
                    setData({
                        success: true,
                        message: "Approved!",
                        status: "approved",
                        action_type: "manager_login" // We don't have this from HTML, but UI will handle it
                    })
                } else if (response.data.success !== undefined) {
                    // Old JSON response format (fallback)
                    setData(response.data)
                    setStatus(response.data.success ? "success" : "error")
                } else {
                    // Assume success if we got 200
                    setStatus("success")
                    setData({ success: true, message: "Approved!", status: "approved" })
                }
            } catch (err: any) {
                setStatus("error")
                setData({
                    success: false,
                    message: err.response?.data?.message || "Failed to process request",
                    status: "error"
                })
            }
        }

        approveRequest()
    }, [token])

    if (status === "loading") {
        return (
            <div className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl shadow-sm max-w-md w-full p-8 mx-auto space-y-5 text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600 dark:text-blue-400" />
                <p className="text-xs text-gray-500 dark:text-muted-foreground">{t("auth.processing", "Processing...")}</p>
            </div>
        )
    }

    if (status === "success" && data) {
        // Customize UI based on action type
        const getIcon = () => {
            switch (data.action_type) {
                case "employee_login":
                    return <User className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                case "manager_login":
                    return <User className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                case "password_reset":
                    return <Key className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                case "verify_email":
                    return <Mail className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                default:
                    return <CheckCircle className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            }
        }

        const getTitle = () => {
            switch (data.action_type) {
                case "employee_login":
                    return t("auth.loginApproved", "Login Approved!")
                case "manager_login":
                    return t("auth.loginSuccessful", "Login Verified!")
                case "password_reset":
                    return t("auth.passwordResetVerified", "Password Reset Verified!")
                case "verify_email":
                    return t("auth.emailVerified", "Email Verified!")
                default:
                    return t("auth.approved", "Approved!")
            }
        }

        const getDescription = () => {
            switch (data.action_type) {
                case "employee_login":
                    return t("auth.approval.employeeDeviceApproved", "{{username}}'s device will now log in automatically.", { username: data.username })
                case "manager_login":
                    return t("auth.approval.managerDeviceApproved", "Your other device will now log in automatically.")
                case "password_reset":
                    return t("auth.approval.passwordResetApproved", "You can now set a new password on your original device.")
                case "verify_email":
                    return data.new_email
                        ? t("auth.approval.emailChangedApproved", "Your email has been changed to {{email}}.", { email: data.new_email })
                        : t("auth.approval.emailVerifiedApproved", "Your email has been verified.")
                default:
                    return data.message
            }
        }

        return (
            <div className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl shadow-sm max-w-md w-full p-8 mx-auto space-y-5 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-900/30 mx-auto">
                    {getIcon()}
                </div>

                <div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-foreground">{getTitle()}</h1>
                    <p className="mt-1 text-xs text-gray-500 dark:text-muted-foreground">{getDescription()}</p>
                </div>

                <div className="rounded-lg bg-[#F8F9FA] dark:bg-muted/40 border border-gray-200 dark:border-border p-3.5 text-xs text-gray-600 dark:text-muted-foreground">
                    <p>
                        {t("auth.approval.closePageNotice", "You can close this page. The original browser will continue automatically.")}
                    </p>
                </div>

                <Link to="/login" className="block pt-1">
                    <Button variant="outline" className="w-full h-8 text-xs font-medium">
                        <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                        {t("auth.backToLogin", "Back to Login")}
                    </Button>
                </Link>
            </div>
        )
    }

    // Error state
    return (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl shadow-sm max-w-md w-full p-8 mx-auto space-y-5 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50 dark:bg-red-900/30 mx-auto">
                <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>

            <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-foreground">{t("auth.requestFailed", "Request Failed")}</h1>
                <p className="mt-1 text-xs text-gray-500 dark:text-muted-foreground">{data?.message || "An error occurred"}</p>
            </div>

            <Link to="/login" className="block pt-1">
                <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs h-8">
                    <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                    {t("auth.backToLogin", "Back to Login")}
                </Button>
            </Link>
        </div>
    )
}


/**
 * Magic Link Verification Page (Legacy fallback)
 * Route: /login/verify/:uid/:token
 * 
 * For direct magic link logins (if we keep them in the future)
 */
export function VerifyPage() {
    const { t } = useTranslation()
    useParams<{ uid: string; token: string }>()

    return (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl shadow-sm max-w-md w-full p-8 mx-auto space-y-5 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600 dark:text-blue-400" />
            <p className="text-xs text-gray-500 dark:text-muted-foreground">
                {t("auth.legacyLinkDetected", "Legacy link detected. Please use the new approval flow.")}
            </p>
            <Link to="/login" className="block pt-1">
                <Button variant="outline" className="w-full h-8 text-xs font-medium">{t("auth.goToLogin", "Go to Login")}</Button>
            </Link>
        </div>
    )
}
