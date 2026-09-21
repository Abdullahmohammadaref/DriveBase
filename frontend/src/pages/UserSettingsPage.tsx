import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { useQueryClient } from "@tanstack/react-query"
import {
    User, Lock, Mail, ShieldCheck, Eye, EyeOff, Loader2, CheckCircle,
    AlertTriangle, KeyRound, ArrowRight
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/lib/auth"
import { useAuthPolling, PollStatus } from "@/hooks/useAuthPolling"
import api from "@/lib/api"

// =============================================================================
// Polling Status Display Component
// =============================================================================

function PollingStatus({
    status,
    message,
    onCancel,
}: {
    status: PollStatus
    message: string
    onCancel?: () => void
}) {
    const { t } = useTranslation()
    if (status === "idle") return null

    return (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            {status === "approved" ? (
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/20 shrink-0">
                        <CheckCircle className="h-5 w-5 text-green-500" />
                    </div>
                    <div>
                        <p className="font-medium text-green-600">{t("userSettings.verified", "Verified!")}</p>
                        <p className="text-sm text-muted-foreground">{message}</p>
                    </div>
                </div>
            ) : status === "expired" || status === "error" ? (
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/20 shrink-0">
                        <AlertTriangle className="h-5 w-5 text-amber-500" />
                    </div>
                    <div className="flex-1">
                        <p className="font-medium text-amber-600">
                            {status === "expired" ? t("userSettings.expired", "Expired") : t("common.error", "Error")}
                        </p>
                        <p className="text-sm text-muted-foreground">{message}</p>
                    </div>
                    {onCancel && (
                        <Button variant="outline" size="sm" onClick={onCancel}>
                            {t("common.tryAgain", "Try Again")}
                        </Button>
                    )}
                </div>
            ) : (
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 shrink-0 relative">
                        <Mail className="h-5 w-5 text-primary" />
                        <div className="absolute inset-0 rounded-full border-2 border-primary/30 animate-ping" />
                    </div>
                    <div className="flex-1">
                        <p className="font-medium text-foreground">
                            {status === "waiting_for_new_email"
                                ? t("userSettings.checkNewEmail", "Check Your New Email")
                                : t("userSettings.checkEmail", "Check Your Email")}
                        </p>
                        <p className="text-sm text-muted-foreground">{message}</p>
                    </div>
                    <div className="flex gap-1">
                        <div className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
                        <div className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                </div>
            )}
        </div>
    )
}

// =============================================================================
// Username Section
// =============================================================================

function UsernameSection({ currentUsername }: { currentUsername: string }) {
    const { t } = useTranslation()
    const [username, setUsername] = useState(currentUsername)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const queryClient = useQueryClient()

    const handleSave = async () => {
        setError(null)
        setSuccess(false)

        if (!username.trim() || username.trim().length < 3) {
            setError("Username must be at least 3 characters.")
            return
        }

        if (username === currentUsername) {
            setError("Username is the same as current.")
            return
        }

        setIsLoading(true)
        try {
            const response = await api.put("/settings/me/username", { username: username.trim() })
            if (response.data.success) {
                setSuccess(true)
                queryClient.invalidateQueries({ queryKey: ["auth", "me"] })
                setTimeout(() => setSuccess(false), 3000)
            }
        } catch (err: any) {
            setError(err.response?.data?.detail || "Failed to update username.")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card p-3.5 space-y-3 shadow-xs">
            <div className="flex items-center gap-2.5 mb-1">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
                    <User className="h-4 w-4 text-primary" />
                </div>
                <div>
                    <h3 className="text-sm font-semibold text-foreground">{t("userSettings.username", "Username")}</h3>
                    <p className="text-[11px] text-muted-foreground">{t("userSettings.changeUsernameDesc", "Change your display username")}</p>
                </div>
            </div>

            <div className="space-y-1.5">
                <Label htmlFor="settings-username" className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">{t("userSettings.username", "Username")}</Label>
                <div className="flex gap-2">
                    <Input
                        id="settings-username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder={t("userSettings.enterNewUsername", "Enter new username")}
                        disabled={isLoading}
                        className="h-8 text-xs"
                    />
                    <Button
                        onClick={handleSave}
                        disabled={isLoading || username === currentUsername}
                        size="sm"
                        className="h-8 px-3 text-xs shrink-0"
                    >
                        {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("common.save", "Save")}
                    </Button>
                </div>
            </div>

            {error && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/50 p-3">
                    <p className="text-sm text-destructive">{error}</p>
                </div>
            )}
            {success && (
                <div className="rounded-lg bg-green-500/10 border border-green-500/50 p-3">
                    <p className="text-sm text-green-600">{t("userSettings.usernameUpdated", "Username updated successfully!")}</p>
                </div>
            )}
        </div>
    )
}

// =============================================================================
// Password Section
// =============================================================================

function PasswordSection() {
    const { t } = useTranslation()
    const { setNewPassword } = useAuth()
    const [newPassword, setNewPasswordState] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [showPassword, setShowPassword] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [step, setStep] = useState<"form" | "polling" | "new-password" | "success">("form")
    const [resetToken, setResetToken] = useState<string | null>(null)

    const { status, message, startPolling, stopPolling } = useAuthPolling({
        onApproved: (result) => {
            if (result.reset_token) {
                setResetToken(result.reset_token)
            }
            setStep("new-password")
        },
        onExpired: () => {},
    })

    const handleInitiate = async () => {
        setError(null)

        if (newPassword.length < 8) {
            setError("Password must be at least 8 characters.")
            return
        }

        if (newPassword !== confirmPassword) {
            setError("Passwords do not match.")
            return
        }

        setIsLoading(true)
        try {
            const response = await api.post("/settings/me/password", {
                new_password: newPassword,
                confirm_password: confirmPassword,
            })
            if (response.data.success && response.data.request_id) {
                setStep("polling")
                startPolling(response.data.request_id)
            }
        } catch (err: any) {
            setError(err.response?.data?.detail || "Failed to initiate password change.")
        } finally {
            setIsLoading(false)
        }
    }

    // After email verification approved, auto-set the new password
    useEffect(() => {
        if (step === "new-password" && resetToken && newPassword) {
            const doSet = async () => {
                try {
                    const result = await setNewPassword(resetToken, newPassword)
                    if (result.success) {
                        setStep("success")
                        setNewPasswordState("")
                        setConfirmPassword("")
                    } else {
                        setError(result.message)
                        setStep("form")
                    }
                } catch {
                    setError("Failed to update password.")
                    setStep("form")
                }
            }
            doSet()
        }
    }, [step, resetToken, newPassword, setNewPassword])

    const handleReset = () => {
        stopPolling()
        setStep("form")
        setError(null)
    }

    // Password strength indicator
    const getStrength = (pw: string) => {
        if (!pw) return { label: "", color: "", width: "0%" }
        let score = 0
        if (pw.length >= 8) score++
        if (pw.length >= 12) score++
        if (/[A-Z]/.test(pw)) score++
        if (/[0-9]/.test(pw)) score++
        if (/[^A-Za-z0-9]/.test(pw)) score++
        if (score <= 1) return { label: "Weak", color: "bg-red-500", width: "20%" }
        if (score <= 2) return { label: "Fair", color: "bg-amber-500", width: "40%" }
        if (score <= 3) return { label: "Good", color: "bg-yellow-500", width: "60%" }
        if (score <= 4) return { label: "Strong", color: "bg-green-500", width: "80%" }
        return { label: "Very Strong", color: "bg-green-600", width: "100%" }
    }

    const strength = getStrength(newPassword)

    return (
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center gap-3 mb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
                    <Lock className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold text-foreground">{t("userSettings.password", "Password")}</h3>
                    <p className="text-sm text-muted-foreground">
                        {t("userSettings.changePasswordDesc", "Change your password (requires email verification)")}
                    </p>
                </div>
            </div>

            {step === "success" ? (
                <div className="rounded-lg bg-green-500/10 border border-green-500/50 p-4 text-center space-y-2">
                    <CheckCircle className="h-8 w-8 text-green-500 mx-auto" />
                    <p className="font-medium text-green-600">{t("userSettings.passwordUpdated", "Password Updated!")}</p>
                    <p className="text-sm text-muted-foreground">{t("userSettings.passwordChangedSuccess", "Your password has been changed successfully.")}</p>
                    <Button variant="outline" size="sm" onClick={() => setStep("form")}>
                        {t("common.done", "Done")}
                    </Button>
                </div>
            ) : step === "polling" ? (
                <PollingStatus status={status} message={message} onCancel={handleReset} />
            ) : (
                <>
                    <div className="space-y-2">
                        <Label htmlFor="settings-new-password" className="text-foreground">{t("userSettings.newPassword", "New Password")}</Label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                id="settings-new-password"
                                type={showPassword ? "text" : "password"}
                                placeholder={t("userSettings.enterNewPassword", "Enter new password")}
                                value={newPassword}
                                onChange={(e) => setNewPasswordState(e.target.value)}
                                className="pl-10 pr-10 text-foreground"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                        {newPassword && (
                            <div className="space-y-1">
                                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all ${strength.color}`}
                                        style={{ width: strength.width }}
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground">{strength.label}</p>
                            </div>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="settings-confirm-password" className="text-foreground">{t("userSettings.confirmPassword", "Confirm Password")}</Label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                id="settings-confirm-password"
                                type={showPassword ? "text" : "password"}
                                placeholder={t("userSettings.confirmNewPassword", "Confirm new password")}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="pl-10 text-foreground"
                            />
                        </div>
                    </div>

                    <Button
                        onClick={handleInitiate}
                        disabled={isLoading || !newPassword || !confirmPassword}
                        className="w-full"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                {t("userSettings.sendingVerification", "Sending Verification...")}
                            </>
                        ) : (
                            <>
                                <KeyRound className="mr-2 h-4 w-4" />
                                {t("userSettings.changePassword", "Change Password")}
                            </>
                        )}
                    </Button>
                </>
            )}

            {error && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/50 p-3">
                    <p className="text-sm text-destructive">{error}</p>
                </div>
            )}
        </div>
    )
}

// =============================================================================
// Email Section
// =============================================================================

function EmailSection({ currentEmail }: { currentEmail: string }) {
    const { t } = useTranslation()
    const [newEmail, setNewEmail] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [step, setStep] = useState<"form" | "polling" | "polling_new" | "success">("form")
    const queryClient = useQueryClient()

    const { status, message, startPolling, stopPolling } = useAuthPolling({
        onWaitingForNewEmail: () => {
            setStep("polling_new")
        },
        onApproved: () => {
            setStep("success")
            queryClient.invalidateQueries({ queryKey: ["auth", "me"] })
        },
        onExpired: () => {},
    })

    const handleInitiate = async () => {
        setError(null)

        if (!newEmail.trim()) {
            setError("Please enter a new email address.")
            return
        }

        if (newEmail.toLowerCase() === currentEmail.toLowerCase()) {
            setError("New email must be different from your current email.")
            return
        }

        setIsLoading(true)
        try {
            const response = await api.post("/settings/me/email", {
                new_email: newEmail,
            })
            if (response.data.success && response.data.request_id) {
                setStep("polling")
                startPolling(response.data.request_id)
            }
        } catch (err: any) {
            setError(err.response?.data?.detail || "Failed to initiate email change.")
        } finally {
            setIsLoading(false)
        }
    }

    const handleReset = () => {
        stopPolling()
        setStep("form")
        setError(null)
    }

    return (
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center gap-3 mb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                    <Mail className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold text-foreground">{t("userSettings.emailAddress", "Email Address")}</h3>
                    <p className="text-sm text-muted-foreground">
                        {t("userSettings.changeEmailDesc", "Change your email (requires dual verification)")}
                    </p>
                </div>
            </div>

            <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-sm text-muted-foreground">
                    {t("userSettings.currentEmail", "Current email:")} <span className="font-medium text-foreground">{currentEmail}</span>
                </p>
            </div>

            {step === "success" ? (
                <div className="rounded-lg bg-green-500/10 border border-green-500/50 p-4 text-center space-y-2">
                    <CheckCircle className="h-8 w-8 text-green-500 mx-auto" />
                    <p className="font-medium text-green-600">{t("userSettings.emailUpdated", "Email Updated!")}</p>
                    <p className="text-sm text-muted-foreground">
                        Your email has been changed to <strong>{newEmail}</strong>.
                    </p>
                    <Button variant="outline" size="sm" onClick={() => { setStep("form"); setNewEmail("") }}>
                        {t("common.done", "Done")}
                    </Button>
                </div>
            ) : step === "polling" || step === "polling_new" ? (
                <PollingStatus
                    status={status}
                    message={step === "polling_new"
                        ? `Current email verified! Now check ${newEmail} for the confirmation link.`
                        : message
                    }
                    onCancel={handleReset}
                />
            ) : (
                <>
                    <div className="space-y-2">
                        <Label htmlFor="settings-new-email" className="text-foreground">{t("userSettings.newEmail", "New Email Address")}</Label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                id="settings-new-email"
                                type="email"
                                placeholder={t("userSettings.enterNewEmail", "Enter new email address")}
                                value={newEmail}
                                onChange={(e) => setNewEmail(e.target.value)}
                                className="pl-10 text-foreground"
                            />
                        </div>
                    </div>

                    <Button
                        onClick={handleInitiate}
                        disabled={isLoading || !newEmail}
                        className="w-full"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                {t("common.sending", "Sending...")}
                            </>
                        ) : (
                            <>
                                <Mail className="mr-2 h-4 w-4" />
                                {t("userSettings.changeEmail", "Change Email")}
                            </>
                        )}
                    </Button>

                    <p className="text-xs text-muted-foreground">
                        {t("userSettings.dualVerificationEmailHint", "A verification link will be sent to your current email first, then to the new email.")}
                    </p>
                </>
            )}

            {error && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/50 p-3">
                    <p className="text-sm text-destructive">{error}</p>
                </div>
            )}
        </div>
    )
}

// =============================================================================
// Backup Email Section
// =============================================================================

function BackupEmailSection({ currentBackupEmail }: { currentBackupEmail: string }) {
    const { t } = useTranslation()
    const [newBackupEmail, setNewBackupEmail] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [step, setStep] = useState<"form" | "polling" | "polling_new" | "success">("form")
    const queryClient = useQueryClient()

    const { status, message, startPolling, stopPolling } = useAuthPolling({
        onWaitingForNewEmail: () => {
            setStep("polling_new")
        },
        onApproved: () => {
            setStep("success")
            queryClient.invalidateQueries({ queryKey: ["auth", "me"] })
        },
        onExpired: () => {},
    })

    const handleInitiate = async () => {
        setError(null)

        if (!newBackupEmail.trim()) {
            setError("Please enter a new backup email address.")
            return
        }

        setIsLoading(true)
        try {
            const response = await api.post("/settings/me/backup-email", {
                new_backup_email: newBackupEmail,
            })
            if (response.data.success && response.data.request_id) {
                setStep("polling")
                startPolling(response.data.request_id)
            }
        } catch (err: any) {
            setError(err.response?.data?.detail || "Failed to initiate backup email change.")
        } finally {
            setIsLoading(false)
        }
    }

    const handleReset = () => {
        stopPolling()
        setStep("form")
        setError(null)
    }

    return (
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center gap-3 mb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
                    <ShieldCheck className="h-5 w-5 text-purple-500" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold text-foreground">{t("userSettings.backupEmail", "Backup Email")}</h3>
                    <p className="text-sm text-muted-foreground">
                        {t("userSettings.backupEmailDesc", "Used for account recovery if you lose access to your primary email")}
                    </p>
                </div>
            </div>

            <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-sm text-muted-foreground">
                    {t("userSettings.currentBackupEmail", "Current backup email:")}{" "}
                    <span className="font-medium text-foreground">
                        {currentBackupEmail || t("common.notSet", "Not set")}
                    </span>
                </p>
            </div>

            {step === "success" ? (
                <div className="rounded-lg bg-green-500/10 border border-green-500/50 p-4 text-center space-y-2">
                    <CheckCircle className="h-8 w-8 text-green-500 mx-auto" />
                    <p className="font-medium text-green-600">{t("userSettings.backupEmailUpdated", "Backup Email Updated!")}</p>
                    <p className="text-sm text-muted-foreground">
                        Your backup email has been changed to <strong>{newBackupEmail}</strong>.
                    </p>
                    <Button variant="outline" size="sm" onClick={() => { setStep("form"); setNewBackupEmail("") }}>
                        {t("common.done", "Done")}
                    </Button>
                </div>
            ) : step === "polling" || step === "polling_new" ? (
                <PollingStatus
                    status={status}
                    message={step === "polling_new"
                        ? `Official email verified! Now check ${newBackupEmail} for confirmation.`
                        : message
                    }
                    onCancel={handleReset}
                />
            ) : (
                <>
                    <div className="space-y-2">
                        <Label htmlFor="settings-new-backup-email" className="text-foreground">
                            {t("userSettings.backupEmailAddress", "New Backup Email Address")}
                        </Label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                id="settings-new-backup-email"
                                type="email"
                                placeholder={t("userSettings.enterBackupEmail", "Enter new backup email")}
                                value={newBackupEmail}
                                onChange={(e) => setNewBackupEmail(e.target.value)}
                                className="pl-10 text-foreground"
                            />
                        </div>
                    </div>

                    <Button
                        onClick={handleInitiate}
                        disabled={isLoading || !newBackupEmail}
                        className="w-full"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                {t("common.sending", "Sending...")}
                            </>
                        ) : (
                            <>
                                <ShieldCheck className="mr-2 h-4 w-4" />
                                {t("userSettings.changeBackupEmail", "Change Backup Email")}
                            </>
                        )}
                    </Button>

                    <p className="text-xs text-muted-foreground">
                        {t("userSettings.dualVerificationBackupHint", "A verification link will be sent to your official email first, then to the new backup email.")}
                    </p>
                </>
            )}

            {error && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/50 p-3">
                    <p className="text-sm text-destructive">{error}</p>
                </div>
            )}
        </div>
    )
}

// =============================================================================
// Quick Links
// =============================================================================

function QuickLinks() {
    const { t } = useTranslation()
    return (
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center gap-3 mb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    <KeyRound className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold text-foreground">{t("userSettings.securityRecovery", "Account Recovery")}</h3>
                    <p className="text-sm text-muted-foreground">
                        {t("userSettings.quickAccessDesc", "Lost access to your email or forgot your password?")}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <a
                    href="/login/forgot-password"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-all group"
                >
                    <div className="flex items-center gap-2">
                        <Lock className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                        <span className="text-sm font-medium text-foreground">{t("userSettings.lostPassword", "Forgot Password")}</span>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                </a>

                <a
                    href="/login/forgot-email"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-all group"
                >
                    <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                        <span className="text-sm font-medium text-foreground">{t("userSettings.lostEmail", "Lost Access to Email")}</span>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                </a>
            </div>
        </div>
    )
}

// =============================================================================
// Main Page
// =============================================================================

export default function UserSettingsPage() {
    const { t } = useTranslation()
    const { user } = useAuth()

    if (!user || !user.is_manager) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <h1 className="text-2xl font-bold text-foreground mb-2">{t("common.accessDenied", "Access Denied")}</h1>
                    <p className="text-muted-foreground">{t("userSettings.onlyManagers", "Only managers can access user settings.")}</p>
                </div>
            </div>
        )
    }

    return (
        <div className="p-3 md:p-4 max-w-5xl mx-auto space-y-3 pb-8">
            {/* Page Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 dark:border-border pb-2">
                <div>
                    <h1 className="text-base font-semibold tracking-tight text-gray-900 dark:text-foreground">{t("userSettings.title", "User Settings")}</h1>
                    <p className="text-xs text-muted-foreground">
                        {t("userSettings.subtitle", "Manage your account credentials and security settings")}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {/* Username */}
                <UsernameSection currentUsername={user.username} />

                {/* Password */}
                <PasswordSection />

                {/* Email */}
                <EmailSection currentEmail={user.email} />

                {/* Backup Email */}
                <BackupEmailSection currentBackupEmail={user.backup_email || ""} />

                {/* Quick Links - Spanning full width on large screens */}
                <div className="lg:col-span-2">
                    <QuickLinks />
                </div>
            </div>
        </div>
    )
}
