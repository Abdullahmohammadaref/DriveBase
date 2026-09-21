import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import {
    ArrowLeft, Loader2, Mail, User, Lock, Building2,
    CheckCircle, Eye, EyeOff, ShieldCheck, Clock
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/lib/auth"
import { useAuthPolling } from "@/hooks/useAuthPolling"

/**
 * Registration Page for new Managers
 * Route: /register
 *
 * Multi-step flow:
 * 1. Fill form → Submit
 * 2. Polling: Verify primary email
 * 3. Polling: Verify backup email (if provided)
 * 4. Show verification complete screen
 * 5. User clicks "Continue" → form with green banner (waiting for admin)
 * 6. Admin activates → "success" polling triggers login
 */

type RegistrationStep = "form" | "polling_email" | "polling_backup" | "verification_complete" | "waiting_admin" | "success"

export function RegisterPage() {
    const { t } = useTranslation()
    const { register, checkUsername } = useAuth()

    const [username, setUsername] = useState("")
    const [email, setEmail] = useState("")
    const [backupEmail, setBackupEmail] = useState("")
    const [businessName, setBusinessName] = useState("")
    const [password, setPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [showPassword, setShowPassword] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Username availability check
    const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null)
    const [usernameChecking, setUsernameChecking] = useState(false)

    // Flow states
    const [step, setStep] = useState<RegistrationStep>("form")

    const { status, message, startPolling, stopPolling } = useAuthPolling({
        onWaitingForBackupEmail: () => {
            setStep("polling_backup")
        },
        onWaitingForAdmin: () => {
            // Emails verified → show verification complete screen
            setStep("verification_complete")
        },
        onApproved: () => {
            setStep("success")
        },
        onExpired: () => {},
    })

    // Debounced username check
    useEffect(() => {
        if (!username || username.length < 3) {
            setUsernameAvailable(null)
            return
        }

        setUsernameChecking(true)
        const timer = setTimeout(async () => {
            const result = await checkUsername(username)
            setUsernameAvailable(result.available)
            setUsernameChecking(false)
        }, 500)

        return () => clearTimeout(timer)
    }, [username, checkUsername])

    // Password strength
    const getStrength = (pw: string) => {
        if (!pw) return { label: "", color: "", width: "0%" }
        let score = 0
        if (pw.length >= 8) score++
        if (pw.length >= 12) score++
        if (/[A-Z]/.test(pw)) score++
        if (/[0-9]/.test(pw)) score++
        if (/[^A-Za-z0-9]/.test(pw)) score++
        if (score <= 1) return { label: t("auth.strengthWeak", "Weak"), color: "bg-red-500", width: "20%" }
        if (score <= 2) return { label: t("auth.strengthFair", "Fair"), color: "bg-amber-500", width: "40%" }
        if (score <= 3) return { label: t("auth.strengthGood", "Good"), color: "bg-yellow-500", width: "60%" }
        if (score <= 4) return { label: t("auth.strengthStrong", "Strong"), color: "bg-green-500", width: "80%" }
        return { label: t("auth.strengthVeryStrong", "Very Strong"), color: "bg-green-600", width: "100%" }
    }

    const strength = getStrength(password)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        // Validations
        if (!username || username.length < 3) {
            setError(t("auth.usernameMin3Chars", "Username must be at least 3 characters."))
            return
        }

        if (usernameAvailable === false) {
            setError(t("auth.usernameAlreadyTaken", "Username is already taken. Please choose another."))
            return
        }

        if (!email) {
            setError(t("auth.emailRequired", "Email is required."))
            return
        }

        if (backupEmail && email.toLowerCase() === backupEmail.toLowerCase()) {
            setError(t("auth.primaryAndBackupMustDiffer", "Primary and backup email must be different."))
            return
        }

        if (!businessName.trim()) {
            setError(t("auth.businessNameRequired", "Business name is required."))
            return
        }

        if (password.length < 8) {
            setError(t("auth.passwordMin8Chars", "Password must be at least 8 characters."))
            return
        }

        if (password !== confirmPassword) {
            setError(t("auth.passwordsDoNotMatch", "Passwords do not match."))
            return
        }

        setIsLoading(true)

        try {
            const result = await register({
                username,
                email,
                backup_email: backupEmail,
                password,
                confirm_password: confirmPassword,
                business_name: businessName,
            })

            if (result.success && result.request_id) {
                setStep("polling_email")
                startPolling(result.request_id)
            } else {
                setError(result.message)
            }
        } catch (err) {
            setError(t("auth.unexpectedError", "An unexpected error occurred."))
        } finally {
            setIsLoading(false)
        }
    }

    const handleTryAgain = () => {
        stopPolling()
        setStep("form")
    }

    const handleContinueToForm = () => {
        // After seeing "verification complete", go back to form with waiting_admin banner
        setStep("waiting_admin")
    }


    // POLLING FOR EMAIL VERIFICATION
    if (step === "polling_email" || step === "polling_backup") {
        const isBackup = step === "polling_backup"
        return (
            <div className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl shadow-sm max-w-md w-full p-8 mx-auto space-y-5 text-center">
                {status === "expired" ? (
                    <>
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-900/30 mx-auto">
                            <Mail className="h-8 w-8 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900 dark:text-foreground">{t("auth.requestExpired", "Request Expired")}</h1>
                            <p className="mt-1 text-xs text-gray-500 dark:text-muted-foreground">{message}</p>
                        </div>
                        <Button onClick={handleTryAgain} className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8">{t("auth.tryAgain", "Try Again")}</Button>
                    </>
                ) : (
                    <>
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-900/30 mx-auto relative">
                            {isBackup ? (
                                <ShieldCheck className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                            ) : (
                                <Mail className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                            )}
                            <div className="absolute inset-0 rounded-full border-2 border-blue-600/30 animate-ping" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900 dark:text-foreground">
                                {isBackup ? t("auth.checkYourBackupEmail", "Check Your Backup Email") : t("auth.checkYourEmail", "Check Your Email")}
                            </h1>
                            <p className="mt-1 text-xs text-gray-500 dark:text-muted-foreground">
                                {isBackup
                                    ? t("auth.backupVerificationSentTo", "Primary email verified! Now check {{email}} for the backup verification link.", { email: backupEmail })
                                    : t("auth.verificationLinkSentTo", "We've sent a verification link to {{email}}. Click it to continue.", { email })
                                }
                            </p>
                        </div>

                        <div className="flex justify-center gap-1">
                            <div className="h-1.5 w-1.5 rounded-full bg-blue-600 dark:bg-blue-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                            <div className="h-1.5 w-1.5 rounded-full bg-blue-600 dark:bg-blue-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                            <div className="h-1.5 w-1.5 rounded-full bg-blue-600 dark:bg-blue-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                    </>
                )}
            </div>
        )
    }

    // VERIFICATION COMPLETE - shown after all emails verified, before going back to form
    if (step === "verification_complete") {
        return (
            <div className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl shadow-sm max-w-md w-full p-8 mx-auto space-y-5 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-900/30 mx-auto">
                    <CheckCircle className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                </div>

                <div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-foreground">{t("auth.verificationComplete", "Verification Complete!")}</h1>
                    <p className="mt-1 text-xs text-gray-500 dark:text-muted-foreground">
                        {t("auth.verificationCompleteDesc", "All email verifications are complete. You can now go back to the registration page.")}
                    </p>
                </div>

                <div className="rounded-lg bg-[#F8F9FA] dark:bg-muted/40 border border-gray-200 dark:border-border p-3.5 text-left">
                    <div className="flex items-start gap-2.5">
                        <Clock className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                        <div>
                            <p className="text-xs font-semibold text-gray-900 dark:text-foreground">{t("auth.whatHappensNext", "What happens next?")}</p>
                            <p className="text-xs text-gray-500 dark:text-muted-foreground mt-0.5">
                                {t("auth.adminApprovalNotice", "An email has been sent to the administrator for approval. Once your account is activated, you'll be able to log in.")}
                            </p>
                        </div>
                    </div>
                </div>

                <Button onClick={handleContinueToForm} className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs h-8">
                    {t("auth.continue", "Continue")}
                </Button>
            </div>
        )
    }

    // FORM (includes waiting_admin and success banners)
    return (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl shadow-sm max-w-md w-full p-8 mx-auto space-y-5">
            {/* Back Link */}
            <Link
                to="/login"
                className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 dark:text-muted-foreground dark:hover:text-foreground transition-colors"
            >
                <ArrowLeft className="h-3.5 w-3.5" />
                {t("auth.backToLogin", "Back to login")}
            </Link>

            {/* Header */}
            <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-foreground">{t("auth.registerTitle", "Register as Manager")}</h1>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-muted-foreground">
                    {t("auth.registerSubtitle", "Create your business account. Email verification and admin approval required.")}
                </p>
            </div>

            {/* Waiting Admin Banner */}
            {step === "waiting_admin" && (
                <div className="rounded-lg bg-green-500/10 border border-green-500/50 p-4">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-green-600">
                            <CheckCircle className="h-5 w-5" />
                            <span className="font-medium text-lg">{t("auth.registrationSuccessful", "Registration successful!")}</span>
                        </div>
                        <p className="text-sm text-green-600/80">
                            {t("auth.registrationWaitingAdminDesc", "Your registration is complete. Please wait for the administrator to approve your account before you can log in.")}
                        </p>
                    </div>
                </div>
            )}

            {/* Success Banner */}
            {step === "success" && (
                <div className="rounded-lg bg-green-500/10 border border-green-500/50 p-4">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-green-600">
                            <CheckCircle className="h-5 w-5" />
                            <span className="font-medium text-lg">{t("auth.accountActivated", "Account activated!")}</span>
                        </div>
                        <p className="text-sm text-green-600/80">
                            {t("auth.accountActivatedDesc", "Your account has been activated by the administrator. You can now log in.")}
                        </p>
                    </div>
                </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Business Name */}
                <div className="space-y-1.5">
                    <Label htmlFor="reg-business" className="text-xs font-medium text-gray-700 dark:text-foreground">{t("auth.businessName", "Business Name")} <span className="text-destructive ml-0.5">*</span></Label>
                    <div className="relative">
                        <Building2 className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                        <Input
                            id="reg-business"
                            type="text"
                            placeholder={t("auth.businessNamePlaceholder", "Your business name")}
                            value={businessName}
                            onChange={(e) => setBusinessName(e.target.value)}
                            className="pl-8 bg-[#F3F3F3] dark:bg-muted/40 border-gray-200 dark:border-border h-8 text-xs rounded-md text-foreground"
                            disabled={step === "waiting_admin" || step === "success"}
                            required
                        />
                    </div>
                </div>

                {/* Username */}
                <div className="space-y-1.5">
                    <Label htmlFor="reg-username" className="text-xs font-medium text-gray-700 dark:text-foreground">{t("auth.username", "Username")} <span className="text-destructive ml-0.5">*</span></Label>
                    <div className="relative">
                        <User className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                        <Input
                            id="reg-username"
                            type="text"
                            placeholder={t("auth.chooseUsernamePlaceholder", "Choose a username")}
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="pl-8 bg-[#F3F3F3] dark:bg-muted/40 border-gray-200 dark:border-border h-8 text-xs rounded-md text-foreground"
                            disabled={step === "waiting_admin" || step === "success"}
                            required
                        />
                        {usernameChecking && (
                            <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-gray-400" />
                        )}
                        {!usernameChecking && usernameAvailable === true && username.length >= 3 && (
                            <CheckCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-emerald-600" />
                        )}
                        {!usernameChecking && usernameAvailable === false && username.length >= 3 && (
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-destructive">{t("auth.usernameTaken", "Taken")}</span>
                        )}
                    </div>
                </div>

                {/* Email */}
                <div className="space-y-1.5">
                    <Label htmlFor="reg-email" className="text-xs font-medium text-gray-700 dark:text-foreground">{t("auth.email", "Email")} <span className="text-destructive ml-0.5">*</span></Label>
                    <div className="relative">
                        <Mail className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                        <Input
                            id="reg-email"
                            type="email"
                            placeholder={t("auth.emailPlaceholder", "your@email.com")}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="pl-8 bg-[#F3F3F3] dark:bg-muted/40 border-gray-200 dark:border-border h-8 text-xs rounded-md text-foreground"
                            disabled={step === "waiting_admin" || step === "success"}
                            required
                        />
                    </div>
                </div>

                {/* Backup Email */}
                <div className="space-y-1.5">
                    <Label htmlFor="reg-backup-email" className="text-xs font-medium text-gray-700 dark:text-foreground">{t("auth.backupEmail", "Backup Email")}</Label>
                    <div className="relative">
                        <ShieldCheck className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                        <Input
                            id="reg-backup-email"
                            type="email"
                            placeholder={t("auth.backupEmailPlaceholder", "backup@email.com")}
                            value={backupEmail}
                            onChange={(e) => setBackupEmail(e.target.value)}
                            className="pl-8 bg-[#F3F3F3] dark:bg-muted/40 border-gray-200 dark:border-border h-8 text-xs rounded-md text-foreground"
                            disabled={step === "waiting_admin" || step === "success"}
                        />
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-muted-foreground mt-1">
                        {t("auth.backupEmailOptionalHint", "Optional: Used for account recovery if you lose access to your primary email")}
                    </p>
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                    <Label htmlFor="reg-password" className="text-xs font-medium text-gray-700 dark:text-foreground">{t("auth.password", "Password")} <span className="text-destructive ml-0.5">*</span></Label>
                    <div className="relative">
                        <Lock className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                        <Input
                            id="reg-password"
                            type={showPassword ? "text" : "password"}
                            placeholder={t("auth.passwordMinChars", "Minimum 8 characters")}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="pl-8 pr-8 bg-[#F3F3F3] dark:bg-muted/40 border-gray-200 dark:border-border h-8 text-xs rounded-md text-foreground"
                            disabled={step === "waiting_admin" || step === "success"}
                            required
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                            {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                    </div>
                    {password && (
                        <div className="space-y-1 mt-1">
                            <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-muted overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all ${strength.color}`}
                                    style={{ width: strength.width }}
                                />
                            </div>
                            <p className="text-[10px] text-gray-500 dark:text-muted-foreground">{strength.label}</p>
                        </div>
                    )}
                </div>

                {/* Confirm Password */}
                <div className="space-y-1.5">
                    <Label htmlFor="reg-confirm-password" className="text-xs font-medium text-gray-700 dark:text-foreground">{t("auth.confirmPassword", "Confirm Password")} <span className="text-destructive ml-0.5">*</span></Label>
                    <div className="relative">
                        <Lock className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                        <Input
                            id="reg-confirm-password"
                            type={showPassword ? "text" : "password"}
                            placeholder={t("auth.reenterPasswordPlaceholder", "Re-enter password")}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="pl-8 bg-[#F3F3F3] dark:bg-muted/40 border-gray-200 dark:border-border h-8 text-xs rounded-md text-foreground"
                            disabled={step === "waiting_admin" || step === "success"}
                            required
                        />
                    </div>
                    {confirmPassword && password !== confirmPassword && (
                        <p className="text-[11px] text-destructive">{t("auth.passwordsDoNotMatch", "Passwords do not match")}</p>
                    )}
                </div>

                {/* Error */}
                {error && (
                    <div className="rounded-md bg-destructive/10 border border-destructive/30 p-2.5">
                        <p className="text-xs text-destructive">{error}</p>
                    </div>
                )}

                {/* Submit */}
                {step === "waiting_admin" || step === "success" ? (
                    <Link to="/login/manager" className="block">
                        <Button type="button" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs h-8 rounded-md shadow-xs">
                            {t("auth.continueToLogin", "Continue to Login")}
                        </Button>
                    </Link>
                ) : (
                    <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs h-8 rounded-md shadow-xs" disabled={isLoading}>
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                {t("auth.creatingAccount", "Creating Account...")}
                            </>
                        ) : (
                            t("auth.createAccount", "Create Account")
                        )}
                    </Button>
                )}
            </form>

            {/* Login Link */}
            <p className="text-center text-xs text-gray-500 dark:text-muted-foreground pt-1 border-t border-gray-100 dark:border-border">
                {t("auth.alreadyHaveAccount", "Already have an account?")}{" "}
                <Link to="/login/manager" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                    {t("auth.signIn", "Sign in")}
                </Link>
            </p>
        </div>
    )
}
