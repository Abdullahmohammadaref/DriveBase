import { Link, useLocation } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Mail, ArrowLeft, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Check Email Page - Generic success/feedback page
 * Route: /login/check-email
 * 
 * Displays appropriate message based on the type of action:
 * - employee: "Login link sent to your manager"
 * - manager: "Login link sent to your email"
 * - password-reset: "Password reset link sent"
 * - email-change: "Verification email sent"
 */
export function CheckEmailPage() {
    const { t } = useTranslation()
    const location = useLocation()
    const state = location.state as {
        message?: string
        type?: "employee" | "manager" | "password-reset" | "email-change"
        email?: string
    } | null

    const message = state?.message || t("auth.checkEmailDefaultMessage", "Please check your email for the next step.")
    const type = state?.type || "manager"

    // Determine back link based on type
    const getBackLink = () => {
        switch (type) {
            case "employee":
                return { href: "/login/employee", label: t("auth.backToEmployeeLogin", "Back to employee login") }
            case "password-reset":
                return { href: "/login/forgot-password", label: t("auth.tryAgain", "Try again") }
            case "email-change":
                return { href: "/login/forgot-email", label: t("auth.tryAgain", "Try again") }
            default:
                return { href: "/login/manager", label: t("auth.backToManagerLogin", "Back to manager login") }
        }
    }

    const backLink = getBackLink()

    // Get title based on type
    const getTitle = () => {
        switch (type) {
            case "password-reset":
                return t("auth.passwordResetSentTitle", "Password Reset Sent")
            case "email-change":
                return t("auth.verificationStartedTitle", "Verification Started")
            default:
                return t("auth.checkEmailGenericTitle", "Check Your Email")
        }
    }

    return (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl shadow-sm max-w-md w-full p-8 mx-auto space-y-5 text-center">
            {/* Success Icon */}
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-900/30 mx-auto">
                <CheckCircle className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            </div>

            {/* Title */}
            <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-foreground">{getTitle()}</h1>
                <p className="mt-1 text-xs text-gray-500 dark:text-muted-foreground">{message}</p>
            </div>

            {/* Email indicator */}
            {state?.email && (
                <div className="inline-flex items-center gap-2 rounded-full bg-gray-100 dark:bg-muted px-3.5 py-1.5 text-xs text-gray-700 dark:text-foreground">
                    <Mail className="h-3.5 w-3.5 text-gray-400" />
                    <span>{state.email}</span>
                </div>
            )}

            {/* Info Box */}
            <div className="rounded-lg bg-[#F8F9FA] dark:bg-muted/40 border border-gray-200 dark:border-border p-3.5 text-left">
                <h3 className="text-xs font-semibold text-gray-900 dark:text-foreground mb-1.5">{t("auth.whatHappensNext", "What happens next?")}</h3>
                {type === "employee" ? (
                    <p className="text-xs text-gray-500 dark:text-muted-foreground">
                        {t("auth.employeeExplanation", "Your manager will receive a login link. Once they click it, you'll be logged in automatically. This usually takes a few minutes.")}
                    </p>
                ) : type === "email-change" ? (
                    <ol className="text-xs text-gray-500 dark:text-muted-foreground list-decimal list-inside space-y-1">
                        <li>{t("auth.emailChangeStep1", "Check your backup email for a verification link")}</li>
                        <li>{t("auth.emailChangeStep2", "Click the link to verify your identity")}</li>
                        <li>{t("auth.emailChangeStep3", "A second link will be sent to your new email")}</li>
                        <li>{t("auth.emailChangeStep4", "Click that link to complete the change")}</li>
                    </ol>
                ) : (
                    <ul className="text-xs text-gray-500 dark:text-muted-foreground space-y-1">
                        <li>• {t("auth.generalEmailStep1", "Check your inbox (and spam folder)")}</li>
                        <li>• {t("auth.generalEmailStep2", "The link expires in 1 minute")}</li>
                        <li>• {t("auth.generalEmailStep3", "Click the link to continue")}</li>
                    </ul>
                )}
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2.5 pt-1 border-t border-gray-100 dark:border-border">
                <Link to={backLink.href}>
                    <Button variant="outline" className="w-full h-8 text-xs font-medium">
                        <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                        {backLink.label}
                    </Button>
                </Link>

                <Link to="/login" className="text-xs text-blue-600 dark:text-blue-400 hover:underline transition-colors">
                    {t("auth.returnToLoginOptions", "Return to login options")}
                </Link>
            </div>
        </div>
    )
}
