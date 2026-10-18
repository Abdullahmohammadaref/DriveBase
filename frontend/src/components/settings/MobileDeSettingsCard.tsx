import React, { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Eye, EyeOff, CheckCircle2, RefreshCw, ShieldCheck, AlertCircle } from "lucide-react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface MobileDeSettingsData {
    is_configured: boolean
    seller_id: string | null
    api_username: string | null
    last_connection_test: string | null
    last_connection_status: string | null
    last_connection_error: string | null
}

export default function MobileDeSettingsCard() {
    const { t } = useTranslation()
    const queryClient = useQueryClient()

    const [sellerId, setSellerId] = useState("")
    const [apiUsername, setApiUsername] = useState("")
    const [apiPassword, setApiPassword] = useState("")
    const [showPassword, setShowPassword] = useState(false)
    const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null)

    // Fetch mobile.de settings
    const { data: settings, isLoading } = useQuery<MobileDeSettingsData>({
        queryKey: ["mobile-de-settings"],
        queryFn: async () => {
            const res = await api.get("/settings/mobile-de")
            return res.data
        },
    })

    useEffect(() => {
        if (settings) {
            setSellerId(settings.seller_id || "")
            setApiUsername(settings.api_username || "")
        }
    }, [settings])

    // Mutation: Save settings
    const saveMutation = useMutation({
        mutationFn: async (payload: { seller_id: string; api_username: string; api_password?: string }) => {
            const res = await api.put("/settings/mobile-de", payload)
            return res.data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["mobile-de-settings"] })
            setApiPassword("")
            setFeedback({
                type: "success",
                message: t("businessSettings.mobileDeSaved", "mobile.de credentials saved successfully."),
            })
            setTimeout(() => setFeedback(null), 4000)
        },
        onError: (err: any) => {
            const msg = err.response?.data?.detail || t("businessSettings.mobileDeSaveError", "Failed to save mobile.de credentials.")
            setFeedback({ type: "error", message: msg })
        },
    })

    // Mutation: Test connection
    const testMutation = useMutation({
        mutationFn: async () => {
            const res = await api.post("/settings/mobile-de/test-connection")
            return res.data
        },
        onSuccess: (data: { success: boolean; message: string }) => {
            queryClient.invalidateQueries({ queryKey: ["mobile-de-settings"] })
            if (data.success) {
                setFeedback({
                    type: "success",
                    message: data.message || t("businessSettings.mobileDeConnected", "Connection to mobile.de verified successfully."),
                })
            } else {
                setFeedback({
                    type: "error",
                    message: data.message || t("businessSettings.mobileDeConnectionFailed", "Connection test failed."),
                })
            }
        },
        onError: (err: any) => {
            const msg = err.response?.data?.detail || t("businessSettings.mobileDeConnectionFailed", "Connection test failed.")
            setFeedback({ type: "error", message: msg })
        },
    })

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault()
        setFeedback(null)
        const payload: { seller_id: string; api_username: string; api_password?: string } = {
            seller_id: sellerId.trim(),
            api_username: apiUsername.trim(),
        }
        if (apiPassword.trim()) {
            payload.api_password = apiPassword.trim()
        }
        saveMutation.mutate(payload)
    }

    const isConnected = settings?.is_configured && settings?.last_connection_status === "success"

    return (
        <div className="rounded-xl border border-border bg-card shadow-sm mb-6">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-medium text-foreground">
                        {t("businessSettings.mobileDeIntegrationSettings", "mobile.de Integration Settings")}
                    </h2>
                </div>

                {/* Status indicator: Green if connected, Red if unconfigured or failed */}
                <div>
                    {isConnected ? (
                        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                            {t("businessSettings.connected", "Connected")}
                        </div>
                    ) : (
                        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
                            <span className="size-2 rounded-full bg-rose-500" />
                            {t("businessSettings.notConfigured", "Not Configured")}
                        </div>
                    )}
                </div>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-5">
                {feedback && (
                    <div
                        className={`flex items-start gap-2.5 p-3 rounded-lg text-sm border ${
                            feedback.type === "success"
                                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                : "bg-rose-50 text-rose-800 border-rose-200"
                        }`}
                    >
                        {feedback.type === "success" ? (
                            <CheckCircle2 className="size-4 mt-0.5 shrink-0 text-emerald-600" />
                        ) : (
                            <AlertCircle className="size-4 mt-0.5 shrink-0 text-rose-600" />
                        )}
                        <span>{feedback.message}</span>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Seller ID */}
                    <div className="space-y-1.5">
                        <Label htmlFor="mobile_de_seller_id" className="text-xs font-medium text-foreground">
                            {t("businessSettings.mobileDeSellerId", "mobile.de Seller ID")}
                        </Label>
                        <Input
                            id="mobile_de_seller_id"
                            type="text"
                            placeholder="e.g. 12345678"
                            value={sellerId}
                            onChange={(e) => setSellerId(e.target.value)}
                            disabled={isLoading || saveMutation.isPending}
                            className="bg-background text-sm"
                        />
                    </div>

                    {/* API Username */}
                    <div className="space-y-1.5">
                        <Label htmlFor="mobile_de_username" className="text-xs font-medium text-foreground">
                            {t("businessSettings.apiUsername", "API Username")}
                        </Label>
                        <Input
                            id="mobile_de_username"
                            type="text"
                            placeholder="e.g. seller_api_user"
                            value={apiUsername}
                            onChange={(e) => setApiUsername(e.target.value)}
                            disabled={isLoading || saveMutation.isPending}
                            className="bg-background text-sm"
                        />
                    </div>

                    {/* API Password */}
                    <div className="space-y-1.5">
                        <Label htmlFor="mobile_de_password" className="text-xs font-medium text-foreground">
                            {t("businessSettings.apiPassword", "API Password")}
                        </Label>
                        <div className="relative">
                            <Input
                                id="mobile_de_password"
                                type={showPassword ? "text" : "password"}
                                placeholder={settings?.is_configured ? "••••••••••••" : "Enter API password"}
                                value={apiPassword}
                                onChange={(e) => setApiPassword(e.target.value)}
                                disabled={isLoading || saveMutation.isPending}
                                className="bg-background pr-10 text-sm"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                                tabIndex={-1}
                            >
                                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Diagnostic metadata */}
                {settings?.last_connection_test && (
                    <div className="text-xs text-muted-foreground flex items-center gap-2 pt-1">
                        <span>
                            {t("businessSettings.lastTested", "Last tested")}:{" "}
                            {new Date(settings.last_connection_test).toLocaleString()}
                        </span>
                        {settings.last_connection_error && (
                            <span className="text-rose-600 font-medium">({settings.last_connection_error})</span>
                        )}
                    </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-2 border-t border-border">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => testMutation.mutate()}
                        disabled={testMutation.isPending || (!settings?.is_configured && !sellerId)}
                        className="gap-2 text-xs"
                    >
                        <RefreshCw className={`size-3.5 ${testMutation.isPending ? "animate-spin" : ""}`} />
                        {t("businessSettings.testConnection", "Test Connection")}
                    </Button>

                    <Button
                        type="submit"
                        size="sm"
                        disabled={saveMutation.isPending}
                        className="gap-2 text-xs"
                    >
                        <ShieldCheck className="size-3.5" />
                        {saveMutation.isPending
                            ? t("common.saving", "Saving...")
                            : t("businessSettings.saveCredentials", "Save Credentials")}
                    </Button>
                </div>
            </form>
        </div>
    )
}
