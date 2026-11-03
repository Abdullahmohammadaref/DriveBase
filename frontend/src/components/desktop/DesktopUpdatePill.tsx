import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { Rocket, RefreshCw } from "lucide-react"
import { isTauri } from "@/lib/desktop/platform"

type UpdateStatus = "idle" | "checking" | "downloading" | "ready" | "installing"

export function DesktopUpdatePill() {
    const { t } = useTranslation()
    const [status, setStatus] = useState<UpdateStatus>("idle")
    const [newVersion, setNewVersion] = useState<string>("")
    const [updateHandle, setUpdateHandle] = useState<any>(null)

    useEffect(() => {
        // Only run if running inside the Tauri native desktop wrapper
        if (!isTauri()) return

        let mounted = true

        async function checkForDesktopUpdate() {
            try {
                const { check } = await import("@tauri-apps/plugin-updater")
                const update = await check({
                    timeout: 10000,
                })

                if (!mounted) return

                if (update) {
                    console.info(`[DesktopUpdate] Update available: v${update.version} (current: v${update.currentVersion})`)
                    setNewVersion(update.version)
                    setStatus("downloading")
                    setUpdateHandle(update)

                    // Download the update silently in the background
                    await update.download((event) => {
                        if (event.event === "Progress") {
                            // progress chunk received
                        } else if (event.event === "Finished") {
                            console.info("[DesktopUpdate] Update downloaded and ready for install.")
                        }
                    })

                    if (mounted) {
                        setStatus("ready")
                    }
                } else {
                    console.info("[DesktopUpdate] Desktop application is up to date.")
                }
            } catch (err) {
                // If offline or endpoint unreachable, fail silently to never disrupt the user
                console.warn("[DesktopUpdate] Silent update check skipped or failed:", err)
                if (mounted) setStatus("idle")
            }
        }

        // Run check once on app launch (with a 2-second grace period after mount)
        const timer = setTimeout(() => {
            void checkForDesktopUpdate()
        }, 2000)

        return () => {
            mounted = false
            clearTimeout(timer)
        }
    }, [])

    const handleRestartAndInstall = async () => {
        if (!updateHandle) return

        try {
            setStatus("installing")
            console.info("[DesktopUpdate] Installing update and restarting...")
            await updateHandle.install({
                restartAfterInstall: true,
            })
        } catch (err) {
            console.error("[DesktopUpdate] Failed to install update:", err)
            setStatus("ready")
        }
    }

    if (status === "downloading") {
        return (
            <div
                className="flex items-center h-7 px-2.5 rounded-full text-[11px] font-medium bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 gap-1.5 shadow-xs select-none"
                title={t("desktop.downloadingUpdateTitle", "Downloading update in background...")}
            >
                <RefreshCw className="h-3 w-3 animate-spin text-blue-500 shrink-0" />
                <span>{t("desktop.downloading", "Downloading update...")}</span>
            </div>
        )
    }

    if (status === "ready" || status === "installing") {
        return (
            <button
                type="button"
                onClick={handleRestartAndInstall}
                disabled={status === "installing"}
                className="group relative flex items-center h-7 px-2.5 rounded-full text-[11px] font-semibold bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-700 hover:text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 gap-1.5 shadow-xs cursor-pointer transition-all active:scale-95 animate-in fade-in"
                title={t("desktop.updateReadyTooltip", "Click to restart and apply update")}
            >
                {status === "installing" ? (
                    <>
                        <RefreshCw className="h-3 w-3 animate-spin text-emerald-600 shrink-0" />
                        <span>{t("desktop.installing", "Restarting...")}</span>
                    </>
                ) : (
                    <>
                        <span className="relative flex h-2 w-2 shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        <Rocket className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                        <span>
                            {t("desktop.updateReady", "Update Ready (v{{version}}) — Restart", {
                                version: newVersion,
                            })}
                        </span>
                    </>
                )}
            </button>
        )
    }

    return null
}
