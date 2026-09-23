import { useState } from "react"
import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { ArrowLeft, Loader2, User, Lock, CheckCircle, Clock, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import api from "@/lib/api"
import { useAuthPolling } from "@/hooks/useAuthPolling"

/**
 * Employee Login Page with Cross-Device Polling
 * Route: /login/employee
 * 
 * Flow:
 * 1. Employee enters username + password
 * 2. API sends approval request to manager
 * 3. Manager clicks approval link
 * 4. This page polls until approved, then auto-logs in
 */
export function EmployeeLoginPage() {
    const { t } = useTranslation()
    const [username, setUsername] = useState("")
    const [password, setPassword] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const { status: pollStatus, message: pollMessage, startPolling } = useAuthPolling({
        onExpired: () => {
            setError(t("auth.approvalRequestExpired", "Approval request expired. Please try again."))
        },
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setIsLoading(true)

        try {
            const response = await api.post("/auth/request-login", {
                username,
                password,
                login_type: "employee",
            })

            if (response.data.success && response.data.request_id) {
                startPolling(response.data.request_id)
            } else {
                setError(response.data.message || "Login failed")
            }
        } catch (err: any) {
            setError(err.response?.data?.detail || "An unexpected error occurred")
        } finally {
            setIsLoading(false)
        }
    }

    // Show polling/waiting UI
    if (pollStatus === "polling") {
        return (
            <div className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl shadow-sm max-w-md w-full p-8 mx-auto space-y-5 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-900/30 mx-auto">
                    <Clock className="h-8 w-8 text-blue-600 dark:text-blue-400 animate-pulse" />
                </div>

                <div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-foreground">{t("auth.waitingForApproval", "Waiting for Approval")}</h1>
                    <p className="mt-1 text-xs text-gray-500 dark:text-muted-foreground">{pollMessage}</p>
                </div>

                <div className="flex justify-center gap-1">
                    {[0, 1, 2].map((i) => (
                        <div
                            key={i}
                            className="h-1.5 w-1.5 rounded-full bg-blue-600 dark:bg-blue-400 animate-bounce"
                            style={{ animationDelay: `${i * 0.15}s` }}
                        />
                    ))}
                </div>

                <div className="rounded-lg bg-[#F8F9FA] dark:bg-muted/40 border border-gray-200 dark:border-border p-3.5 text-left">
                    <h3 className="text-xs font-semibold text-gray-900 dark:text-foreground mb-1.5">{t("auth.whatsHappening", "What's happening?")}</h3>
                    <ul className="text-xs text-gray-500 dark:text-muted-foreground space-y-1">
                        <li>{t("auth.employeeReceivedStep", "✉️ Your manager received an approval request")}</li>
                        <li>{t("auth.onceApprovedStep", "⏳ Once they click \"Approve\", you'll be logged in")}</li>
                        <li>{t("auth.checkingEvery2SecStep", "🔄 This page is checking every 2 seconds...")}</li>
                    </ul>
                </div>
            </div>
        )
    }

    // Show approved UI
    if (pollStatus === "approved") {
        return (
            <div className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl shadow-sm max-w-md w-full p-8 mx-auto space-y-5 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-900/30 mx-auto">
                    <CheckCircle className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-foreground">{t("auth.loginApproved", "Login Approved!")}</h1>
                    <p className="mt-1 text-xs text-gray-500 dark:text-muted-foreground">{pollMessage}</p>
                </div>
                <Loader2 className="h-5 w-5 animate-spin mx-auto text-blue-600 dark:text-blue-400" />
            </div>
        )
    }

    // Show expired UI
    if (pollStatus === "expired" || pollStatus === "error") {
        return (
            <div className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl shadow-sm max-w-md w-full p-8 mx-auto space-y-5 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50 dark:bg-red-900/30 mx-auto">
                    <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-foreground">{t("auth.requestFailed", "Request Failed")}</h1>
                    <p className="mt-1 text-xs text-gray-500 dark:text-muted-foreground">{pollMessage}</p>
                </div>
                <Button onClick={() => window.location.reload()} className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8">{t("auth.tryAgain", "Try Again")}</Button>
            </div>
        )
    }

    // Default: Show login form
    return (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl shadow-sm max-w-md w-full p-8 mx-auto space-y-5">
            <Link
                to="/login"
                className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 dark:text-muted-foreground dark:hover:text-foreground transition-colors"
            >
                <ArrowLeft className="h-3.5 w-3.5" />
                {t("auth.backToLoginOptions", "Back to login options")}
            </Link>

            <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-foreground">{t("auth.employeeLoginTitle", "Employee Login")}</h1>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-muted-foreground">
                    {t("auth.employeeLoginSubtitle", "Enter your credentials. Your manager will approve the login.")}
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                    <Label htmlFor="username" className="text-xs font-medium text-gray-700 dark:text-foreground">{t("auth.username", "Username")} <span className="text-destructive ml-0.5">*</span></Label>
                    <div className="relative">
                        <User className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                        <Input
                            id="username"
                            type="text"
                            placeholder={t("auth.enterUsernamePlaceholder", "Enter your username")}
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="pl-8 bg-[#F3F3F3] dark:bg-muted/40 border-gray-200 dark:border-border h-8 text-xs rounded-md text-foreground"
                            required
                            autoFocus
                            autoComplete="username"
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="password" className="text-xs font-medium text-gray-700 dark:text-foreground">{t("auth.password", "Password")} <span className="text-destructive ml-0.5">*</span></Label>
                    <div className="relative">
                        <Lock className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                        <Input
                            id="password"
                            type="password"
                            placeholder={t("auth.enterPasswordPlaceholder", "Enter your password")}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="pl-8 bg-[#F3F3F3] dark:bg-muted/40 border-gray-200 dark:border-border h-8 text-xs rounded-md text-foreground"
                            required
                            autoComplete="current-password"
                        />
                    </div>
                </div>

                {error && (
                    <div className="rounded-md bg-destructive/10 border border-destructive/30 p-2.5">
                        <p className="text-xs text-destructive">{error}</p>
                    </div>
                )}

                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs h-8 rounded-md shadow-xs" disabled={isLoading}>
                    {isLoading ? (
                        <>
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            {t("auth.submitting", "Submitting...")}
                        </>
                    ) : (
                        t("auth.requestLogin", "Request Login")
                    )}
                </Button>
            </form>
        </div>
    )
}
