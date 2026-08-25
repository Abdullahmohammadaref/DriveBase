import { useState } from "react"
import { Link } from "react-router-dom"
import { ArrowLeft, Loader2, Mail, User, Lock, KeyRound, CheckCircle, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/lib/auth"
import { useAuthPolling, PollStatus } from "@/hooks/useAuthPolling"

/**
 * Polling UI Component - Shared between recovery pages
 */
function PollingUI({
    title,
    description,
    status,
    message,
    onTryAgain,
}: {
    title: string
    description: string
    status: PollStatus
    message: string
    onTryAgain?: () => void
}) {
    return (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl shadow-sm max-w-md w-full p-8 mx-auto space-y-5 text-center">
            {status === "approved" ? (
                <>
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-900/30 mx-auto">
                        <CheckCircle className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900 dark:text-foreground">Verified!</h1>
                        <p className="mt-1 text-xs text-gray-500 dark:text-muted-foreground">{message}</p>
                    </div>
                </>
            ) : status === "expired" ? (
                <>
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-900/30 mx-auto">
                        <KeyRound className="h-8 w-8 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900 dark:text-foreground">Request Expired</h1>
                        <p className="mt-1 text-xs text-gray-500 dark:text-muted-foreground">{message}</p>
                    </div>
                    {onTryAgain && (
                        <Button onClick={onTryAgain} className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8">Try Again</Button>
                    )}
                </>
            ) : (
                <>
                    {/* Animated waiting icon */}
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-900/30 mx-auto relative">
                        <Mail className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                        <div className="absolute inset-0 rounded-full border-2 border-blue-600/30 animate-ping" />
                    </div>

                    <div>
                        <h1 className="text-xl font-bold text-gray-900 dark:text-foreground">{title}</h1>
                        <p className="mt-1 text-xs text-gray-500 dark:text-muted-foreground">{description}</p>
                    </div>

                    {/* Animated dots */}
                    <div className="flex justify-center gap-1">
                        <div className="h-1.5 w-1.5 rounded-full bg-blue-600 dark:bg-blue-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <div className="h-1.5 w-1.5 rounded-full bg-blue-600 dark:bg-blue-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="h-1.5 w-1.5 rounded-full bg-blue-600 dark:bg-blue-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>

                    <div className="rounded-lg bg-[#F8F9FA] dark:bg-muted/40 border border-gray-200 dark:border-border p-3 text-xs text-gray-600 dark:text-muted-foreground">
                        <p>
                            {message || "Waiting for you to click the link..."}
                        </p>
                    </div>
                </>
            )}
        </div>
    )
}


/**
 * New Password Form - Shown after password reset is verified
 */
function NewPasswordForm({
    resetToken,
    onSuccess,
}: {
    resetToken: string
    onSuccess: () => void
}) {
    const { setNewPassword } = useAuth()
    const [password, setPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [showPassword, setShowPassword] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        if (password !== confirmPassword) {
            setError("Passwords do not match")
            return
        }

        if (password.length < 4) {
            setError("Password must be at least 4 characters")
            return
        }

        setIsLoading(true)

        try {
            const result = await setNewPassword(resetToken, password)
            if (result.success) {
                onSuccess()
            } else {
                setError(result.message)
            }
        } catch (err) {
            setError("An unexpected error occurred")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl shadow-sm max-w-md w-full p-8 mx-auto space-y-5">
            {/* Header */}
            <div className="text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-900/30 mx-auto mb-2">
                    <CheckCircle className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-foreground">Email Verified!</h1>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-muted-foreground">
                    Now set your new password below
                </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                    <Label htmlFor="password" className="text-xs font-medium text-gray-700 dark:text-foreground">New Password <span className="text-destructive ml-0.5">*</span></Label>
                    <div className="relative">
                        <Lock className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                        <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            placeholder="Enter new password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="pl-8 pr-8 bg-[#F3F3F3] dark:bg-muted/40 border-gray-200 dark:border-border h-8 text-xs rounded-md text-foreground"
                            required
                            autoFocus
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                            {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                    </div>
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="confirm-password" className="text-xs font-medium text-gray-700 dark:text-foreground">Confirm Password <span className="text-destructive ml-0.5">*</span></Label>
                    <div className="relative">
                        <Lock className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                        <Input
                            id="confirm-password"
                            type={showPassword ? "text" : "password"}
                            placeholder="Confirm new password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="pl-8 bg-[#F3F3F3] dark:bg-muted/40 border-gray-200 dark:border-border h-8 text-xs rounded-md text-foreground"
                            required
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
                            Updating...
                        </>
                    ) : (
                        "Set New Password"
                    )}
                </Button>
            </form>
        </div>
    )
}


/**
 * Success Screen - Shown after password is updated
 */
function PasswordUpdatedSuccess() {
    return (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl shadow-sm max-w-md w-full p-8 mx-auto space-y-5 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-900/30 mx-auto">
                <CheckCircle className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-foreground">Password Updated!</h1>
                <p className="mt-1 text-xs text-gray-500 dark:text-muted-foreground">
                    Your password has been changed successfully. You can now log in with your new password.
                </p>
            </div>
            <Link to="/login/manager" className="block pt-1">
                <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs h-8">Continue to Login</Button>
            </Link>
        </div>
    )
}


/**
 * Forgot Password Page (Manager Only)
 * Route: /login/forgot-password
 * 
 * Flow:
 * 1. Enter email/username → Send email
 * 2. Poll until email is clicked
 * 3. Show NewPasswordForm
 * 4. Show success
 */
export function ForgotPasswordPage() {
    const { requestPasswordReset } = useAuth()

    const [method, setMethod] = useState<"email" | "username">("email")
    const [email, setEmail] = useState("")
    const [username, setUsername] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Flow states
    const [step, setStep] = useState<"form" | "polling" | "new-password" | "success">("form")
    const [resetToken, setResetToken] = useState<string | null>(null)

    const { status, message, startPolling, stopPolling } = useAuthPolling({
        onApproved: (result) => {
            // Password reset verified - show the new password form
            if (result.reset_token) {
                setResetToken(result.reset_token)
            }
            setStep("new-password")
        },
        onExpired: () => {
            // Request expired
        },
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setIsLoading(true)

        try {
            const result = await requestPasswordReset({
                email: method === "email" ? email : undefined,
                username: method === "username" ? username : undefined,
            })

            if (result.success && result.request_id) {
                // Store request_id as fallback reset token
                setResetToken(result.request_id)
                // Start polling
                setStep("polling")
                startPolling(result.request_id)
            } else {
                setError(result.message)
            }
        } catch (err) {
            setError("An unexpected error occurred")
        } finally {
            setIsLoading(false)
        }
    }

    const handleTryAgain = () => {
        stopPolling()
        setStep("form")
    }

    // Step 4: Success
    if (step === "success") {
        return <PasswordUpdatedSuccess />
    }

    // Step 3: New Password Form
    if (step === "new-password" && resetToken) {
        return (
            <NewPasswordForm
                resetToken={resetToken}
                onSuccess={() => setStep("success")}
            />
        )
    }

    // Step 2: Polling
    if (step === "polling") {
        return (
            <PollingUI
                title="Check Your Email"
                description="We've sent a password reset link to your email. Click it to continue."
                status={status}
                message={message}
                onTryAgain={handleTryAgain}
            />
        )
    }

    // Step 1: Form
    return (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl shadow-sm max-w-md w-full p-8 mx-auto space-y-5">
            {/* Back Link */}
            <Link
                to="/login/manager"
                className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 dark:text-muted-foreground dark:hover:text-foreground transition-colors"
            >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to manager login
            </Link>

            {/* Header */}
            <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-foreground">Reset Password</h1>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-muted-foreground">
                    Enter your email or username to receive a password reset link
                </p>
            </div>

            {/* Method Toggle */}
            <div className="bg-gray-100 dark:bg-muted p-1 rounded-lg flex gap-1 mb-4">
                <button
                    type="button"
                    onClick={() => setMethod("email")}
                    className={`py-1 px-3 text-xs rounded-md flex-1 flex items-center justify-center gap-1.5 transition-all ${
                        method === "email"
                            ? "bg-white dark:bg-card text-gray-900 dark:text-foreground shadow-xs font-semibold"
                            : "text-gray-500 hover:text-gray-900 dark:text-muted-foreground dark:hover:text-foreground font-medium"
                    }`}
                >
                    <Mail className="h-3.5 w-3.5" />
                    Email
                </button>
                <button
                    type="button"
                    onClick={() => setMethod("username")}
                    className={`py-1 px-3 text-xs rounded-md flex-1 flex items-center justify-center gap-1.5 transition-all ${
                        method === "username"
                            ? "bg-white dark:bg-card text-gray-900 dark:text-foreground shadow-xs font-semibold"
                            : "text-gray-500 hover:text-gray-900 dark:text-muted-foreground dark:hover:text-foreground font-medium"
                    }`}
                >
                    <User className="h-3.5 w-3.5" />
                    Username
                </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
                {method === "email" ? (
                    <div className="space-y-1.5">
                        <Label htmlFor="email" className="text-xs font-medium text-gray-700 dark:text-foreground">Email <span className="text-destructive ml-0.5">*</span></Label>
                        <div className="relative">
                            <Mail className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                            <Input
                                id="email"
                                type="email"
                                placeholder="Enter your email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="pl-8 bg-[#F3F3F3] dark:bg-muted/40 border-gray-200 dark:border-border h-8 text-xs rounded-md text-foreground"
                                required
                                autoFocus
                            />
                        </div>
                    </div>
                ) : (
                    <div className="space-y-1.5">
                        <Label htmlFor="username" className="text-xs font-medium text-gray-700 dark:text-foreground">Username <span className="text-destructive ml-0.5">*</span></Label>
                        <div className="relative">
                            <User className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                            <Input
                                id="username"
                                type="text"
                                placeholder="Enter your username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="pl-8 bg-[#F3F3F3] dark:bg-muted/40 border-gray-200 dark:border-border h-8 text-xs rounded-md text-foreground"
                                required
                                autoFocus
                            />
                        </div>
                    </div>
                )}

                {error && (
                    <div className="rounded-md bg-destructive/10 border border-destructive/30 p-2.5">
                        <p className="text-xs text-destructive">{error}</p>
                    </div>
                )}

                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs h-8 rounded-md shadow-xs" disabled={isLoading}>
                    {isLoading ? (
                        <>
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            Sending...
                        </>
                    ) : (
                        "Send Reset Link"
                    )}
                </Button>
            </form>
        </div>
    )
}


/**
 * Forgot Email Page (Manager Only)
 * Route: /login/forgot-email
 * 
 * Flow:
 * 1. Enter credentials + backup email + new email
 * 2. Poll for backup email verification
 * 3. Show success (email is updated on backend when backup is verified)
 */
export function ForgotEmailPage() {
    const { requestEmailChange } = useAuth()

    const [username, setUsername] = useState("")
    const [password, setPassword] = useState("")
    const [backupEmail, setBackupEmail] = useState("")
    const [newEmail, setNewEmail] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Flow states: form → polling (backup) → polling_new_email (new) → success
    const [step, setStep] = useState<"form" | "polling" | "polling_new_email" | "success">("form")

    const { status, message, startPolling, stopPolling } = useAuthPolling({
        onWaitingForNewEmail: () => {
            // Backup email verified! Now waiting for new email verification
            setStep("polling_new_email")
        },
        onApproved: () => {
            // Email fully verified and changed
            setStep("success")
        },
        onExpired: () => {
            // Request expired
        },
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setIsLoading(true)

        try {
            const result = await requestEmailChange({
                username,
                password,
                backup_email: backupEmail,
                new_email: newEmail,
            })

            if (result.success && result.request_id) {
                // Start polling
                setStep("polling")
                startPolling(result.request_id)
            } else {
                setError(result.message)
            }
        } catch (err) {
            setError("An unexpected error occurred")
        } finally {
            setIsLoading(false)
        }
    }

    const handleTryAgain = () => {
        stopPolling()
        setStep("form")
    }

    // Step 3: Success
    if (step === "success") {
        return (
            <div className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl shadow-sm max-w-md w-full p-8 mx-auto space-y-5 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-900/30 mx-auto">
                    <CheckCircle className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-foreground">Email Updated!</h1>
                    <p className="mt-1 text-xs text-gray-500 dark:text-muted-foreground">
                        Your email has been changed to <strong className="text-gray-900 dark:text-foreground font-semibold">{newEmail}</strong>.
                    </p>
                </div>
                <Link to="/login/manager" className="block pt-1">
                    <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs h-8">Continue to Login</Button>
                </Link>
            </div>
        )
    }

    // Step 2a: Polling for backup email
    if (step === "polling") {
        return (
            <PollingUI
                title="Check Your Backup Email"
                description={`We've sent a verification link to ${backupEmail}. Click it to verify your identity.`}
                status={status}
                message={message}
                onTryAgain={handleTryAgain}
            />
        )
    }

    // Step 2b: Polling for new email (backup verified!)
    if (step === "polling_new_email") {
        return (
            <PollingUI
                title="Check Your NEW Email"
                description={`Backup verified! Now check ${newEmail} for the confirmation link.`}
                status={status}
                message={message}
                onTryAgain={handleTryAgain}
            />
        )
    }

    // Step 1: Form
    return (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl shadow-sm max-w-md w-full p-8 mx-auto space-y-5">
            {/* Back Link */}
            <Link
                to="/login/manager"
                className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 dark:text-muted-foreground dark:hover:text-foreground transition-colors"
            >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to manager login
            </Link>

            {/* Header */}
            <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-foreground">Change Email</h1>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-muted-foreground">
                    Verify your identity using your backup email
                </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                    <Label htmlFor="username" className="text-xs font-medium text-gray-700 dark:text-foreground">Username <span className="text-destructive ml-0.5">*</span></Label>
                    <div className="relative">
                        <User className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                        <Input
                            id="username"
                            type="text"
                            placeholder="Enter your username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="pl-8 bg-[#F3F3F3] dark:bg-muted/40 border-gray-200 dark:border-border h-8 text-xs rounded-md text-foreground"
                            required
                            autoFocus
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="password" className="text-xs font-medium text-gray-700 dark:text-foreground">Password <span className="text-destructive ml-0.5">*</span></Label>
                    <div className="relative">
                        <Lock className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                        <Input
                            id="password"
                            type="password"
                            placeholder="Enter your password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="pl-8 bg-[#F3F3F3] dark:bg-muted/40 border-gray-200 dark:border-border h-8 text-xs rounded-md text-foreground"
                            required
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="backup-email" className="text-xs font-medium text-gray-700 dark:text-foreground">Backup Email <span className="text-destructive ml-0.5">*</span></Label>
                    <div className="relative">
                        <Mail className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                        <Input
                            id="backup-email"
                            type="email"
                            placeholder="Your registered backup email"
                            value={backupEmail}
                            onChange={(e) => setBackupEmail(e.target.value)}
                            className="pl-8 bg-[#F3F3F3] dark:bg-muted/40 border-gray-200 dark:border-border h-8 text-xs rounded-md text-foreground"
                            required
                        />
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-muted-foreground mt-1">
                        We'll send a verification link to this email
                    </p>
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="new-email" className="text-xs font-medium text-gray-700 dark:text-foreground">New Email <span className="text-destructive ml-0.5">*</span></Label>
                    <div className="relative">
                        <Mail className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                        <Input
                            id="new-email"
                            type="email"
                            placeholder="Your new email address"
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            className="pl-8 bg-[#F3F3F3] dark:bg-muted/40 border-gray-200 dark:border-border h-8 text-xs rounded-md text-foreground"
                            required
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
                            Sending...
                        </>
                    ) : (
                        "Send Verification Link"
                    )}
                </Button>
            </form>

            {/* Info */}
            <div className="rounded-lg bg-[#F8F9FA] dark:bg-muted/40 border border-gray-200 dark:border-border p-3 text-xs text-gray-600 dark:text-muted-foreground">
                <p>
                    <strong className="text-gray-900 dark:text-foreground">How it works:</strong> Click the verification link sent to your backup email. Once verified, your email will be updated automatically.
                </p>
            </div>
        </div>
    )
}
