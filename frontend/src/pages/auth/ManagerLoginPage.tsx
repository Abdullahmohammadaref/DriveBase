import { useState } from "react"
import { Link } from "react-router-dom"
import { ArrowLeft, Loader2, Mail, User, Lock, CheckCircle, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import api from "@/lib/api"
import { useAuthPolling } from "@/hooks/useAuthPolling"

/**
 * Manager Login Page with Universal Polling
 * Route: /login/manager
 * 
 * Flow:
 * 1. Manager enters email/username + password
 * 2. API sends verification email to manager
 * 3. Manager clicks email link on ANY device
 * 4. This page polls until approved, then auto-logs in
 */
export function ManagerLoginPage() {
    const [loginMode, setLoginMode] = useState<"email" | "username">("email")
    const [email, setEmail] = useState("")
    const [username, setUsername] = useState("")
    const [password, setPassword] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const { status: pollStatus, message: pollMessage, startPolling } = useAuthPolling({
        onExpired: () => {
            setError("Login link expired. Please try again.")
        },
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setIsLoading(true)

        try {
            const response = await api.post("/auth/request-login", {
                email: loginMode === "email" ? email : undefined,
                username: loginMode === "username" ? username : undefined,
                password,
                login_type: "manager",
            })

            if (response.data.success && response.data.request_id) {
                // Start polling for approval
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
                    <Mail className="h-8 w-8 text-blue-600 dark:text-blue-400 animate-pulse" />
                </div>

                <div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-foreground">Check Your Email</h1>
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
                    <h3 className="text-xs font-semibold text-gray-900 dark:text-foreground mb-1.5">What's happening?</h3>
                    <ul className="text-xs text-gray-500 dark:text-muted-foreground space-y-1">
                        <li>✉️ A verification email was sent to your inbox</li>
                        <li>📱 Click the link on ANY device (phone, tablet, etc.)</li>
                        <li>🔄 This page will automatically log you in</li>
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
                    <h1 className="text-xl font-bold text-gray-900 dark:text-foreground">Login Successful!</h1>
                    <p className="mt-1 text-xs text-gray-500 dark:text-muted-foreground">{pollMessage}</p>
                </div>
                <Loader2 className="h-5 w-5 animate-spin mx-auto text-blue-600 dark:text-blue-400" />
            </div>
        )
    }

    // Show expired UI
    if (pollStatus === "expired") {
        return (
            <div className="bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl shadow-sm max-w-md w-full p-8 mx-auto space-y-5 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50 dark:bg-red-900/30 mx-auto">
                    <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-foreground">Link Expired</h1>
                    <p className="mt-1 text-xs text-gray-500 dark:text-muted-foreground">{pollMessage}</p>
                </div>
                <Button onClick={() => window.location.reload()} className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8">Try Again</Button>
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
                Back to login options
            </Link>

            <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-foreground">Manager Login</h1>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-muted-foreground">
                    Sign in to manage your business
                </p>
            </div>

            {/* Login mode toggle */}
            <div className="bg-gray-100 dark:bg-muted p-1 rounded-lg flex gap-1 mb-4">
                <button
                    type="button"
                    onClick={() => setLoginMode("email")}
                    className={`py-1 px-3 text-xs rounded-md flex-1 flex items-center justify-center gap-1.5 transition-all ${
                        loginMode === "email"
                            ? "bg-white dark:bg-card text-gray-900 dark:text-foreground shadow-xs font-semibold"
                            : "text-gray-500 hover:text-gray-900 dark:text-muted-foreground dark:hover:text-foreground font-medium"
                    }`}
                >
                    <Mail className="h-3.5 w-3.5" />
                    Email
                </button>
                <button
                    type="button"
                    onClick={() => setLoginMode("username")}
                    className={`py-1 px-3 text-xs rounded-md flex-1 flex items-center justify-center gap-1.5 transition-all ${
                        loginMode === "username"
                            ? "bg-white dark:bg-card text-gray-900 dark:text-foreground shadow-xs font-semibold"
                            : "text-gray-500 hover:text-gray-900 dark:text-muted-foreground dark:hover:text-foreground font-medium"
                    }`}
                >
                    <User className="h-3.5 w-3.5" />
                    Username
                </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                {loginMode === "email" ? (
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
                                autoComplete="email"
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
                                autoComplete="username"
                            />
                        </div>
                    </div>
                )}

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
                            Sending Login Link...
                        </>
                    ) : (
                        "Send Login Link"
                    )}
                </Button>
            </form>

            <div className="flex justify-between text-xs pt-1 border-t border-gray-100 dark:border-border">
                <Link to="/login/forgot-password" className="text-blue-600 dark:text-blue-400 hover:underline">
                    Forgot Password?
                </Link>
                <Link to="/login/forgot-email" className="text-blue-600 dark:text-blue-400 hover:underline">
                    Forgot Email?
                </Link>
            </div>
        </div>
    )
}
