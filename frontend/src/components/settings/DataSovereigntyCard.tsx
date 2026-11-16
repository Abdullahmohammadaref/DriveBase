import { useState } from "react"
import { useTranslation } from "react-i18next"
import {
  Database,
  HardDrive,
  RefreshCw,
  FolderOpen,
  Download,
  CheckCircle2,
  AlertCircle,
  FileCheck2,
  Image as ImageIcon,
  MonitorDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useDataSovereigntySync } from "@/hooks/useDataSovereigntySync"
import { getDesktopDownloadUrl } from "@/lib/desktop/platform"

export default function DataSovereigntyCard() {
  const { t } = useTranslation()
  const {
    isDesktop,
    isSyncing,
    lastSyncTime,
    dbInfo,
    cachedMediaCount,
    totalMediaCount,
    syncProgress,
    error,
    triggerSync,
    openFolder,
    exportZip,
  } = useDataSovereigntySync()

  const [exporting, setExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState<string | null>(null)

  const handleExport = async () => {
    setExporting(true)
    setExportMessage(null)
    try {
      const savedPath = await exportZip()
      if (savedPath) {
        setExportMessage(t("businessSettings.exportSuccess", `Backup exported successfully to: ${savedPath}`))
      }
    } catch (err: any) {
      setExportMessage(t("businessSettings.exportError", `Failed to export backup: ${err?.message || err}`))
    } finally {
      setExporting(false)
      setTimeout(() => setExportMessage(null), 6000)
    }
  }

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes === 0) return "0 KB"
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-foreground">
              {t("businessSettings.sovereigntyTitle", "Local Data Sovereignty & Offline Backup")}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t(
                "businessSettings.sovereigntySubtitle",
                "Full offline copy of your dealership data stored as a standard SQLite database directly on your PC."
              )}
            </p>
          </div>
        </div>

        {isDesktop && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void triggerSync()}
              disabled={isSyncing}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin text-primary" : ""}`} />
              {isSyncing
                ? t("businessSettings.syncing", "Syncing...")
                : t("businessSettings.syncNow", "Sync Now")}
            </Button>
          </div>
        )}
      </div>

      <div className="p-6 space-y-6">
        {!isDesktop ? (
          // Web Mode Notice
          <div className="rounded-lg border border-border bg-muted/40 p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <HardDrive className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <h3 className="text-sm font-medium text-foreground">
                  {t("businessSettings.webModeTitle", "Desktop Local Mirroring Available")}
                </h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-xl">
                  {t(
                    "businessSettings.webModeDesc",
                    "You are currently using DriveBase via web browser. To enable automatic local SQLite database backups and offline photo mirroring on your hard drive, run the native Windows Desktop App."
                  )}
                </p>
              </div>
            </div>
            <a
              href={getDesktopDownloadUrl()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shrink-0"
            >
              <MonitorDown className="h-4 w-4" />
              {t("businessSettings.downloadDesktopApp", "Download Desktop App")}
            </a>
          </div>
        ) : (
          // Desktop Status & Metrics
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* SQLite DB Status */}
              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <FileCheck2 className="h-4 w-4 text-primary" />
                    <span>{t("businessSettings.sqliteDatabase", "SQLite Database")}</span>
                  </div>
                  {dbInfo?.exists ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" />
                      {t("businessSettings.active", "Active")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-muted text-muted-foreground">
                      {t("businessSettings.pending", "Pending Sync")}
                    </span>
                  )}
                </div>
                <div className="text-lg font-semibold text-foreground">
                  {formatBytes(dbInfo?.size_bytes)}
                </div>
                <div className="text-xs text-muted-foreground font-mono truncate" title={dbInfo?.path || ""}>
                  {dbInfo?.path || "%APPDATA%\\DriveBase\\databases"}
                </div>
              </div>

              {/* Media Cache Status */}
              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <ImageIcon className="h-4 w-4 text-primary" />
                    <span>{t("businessSettings.offlineMedia", "Offline Photos")}</span>
                  </div>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" />
                    0ms Disk Cache
                  </span>
                </div>
                <div className="text-lg font-semibold text-foreground">
                  {cachedMediaCount} {t("businessSettings.photosCached", "photos stored")}
                </div>
                <div className="text-xs text-muted-foreground">
                  {totalMediaCount > 0
                    ? `${cachedMediaCount} / ${totalMediaCount} ${t("businessSettings.totalAvailable", "synced")}`
                    : t("businessSettings.mirrorFolder", "%APPDATA%\\DriveBase\\media")}
                </div>
              </div>

              {/* Sync Freshness */}
              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <RefreshCw className="h-4 w-4 text-primary" />
                    <span>{t("businessSettings.lastSync", "Last Sync")}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">Every 30m</span>
                </div>
                <div className="text-base font-semibold text-foreground truncate">
                  {lastSyncTime ? lastSyncTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : t("businessSettings.never", "Never")}
                </div>
                <div className="text-xs text-muted-foreground">
                  {lastSyncTime ? lastSyncTime.toLocaleDateString() : t("businessSettings.clickSyncNow", "Click Sync Now to create initial copy")}
                </div>
              </div>
            </div>

            {/* Sync Progress / Error Notifications */}
            {syncProgress && (
              <div className="flex items-center gap-2 text-xs text-primary bg-primary/10 px-4 py-2.5 rounded-lg border border-primary/20 animate-pulse">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>{syncProgress}</span>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 px-4 py-2.5 rounded-lg border border-destructive/20">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>{error}</span>
              </div>
            )}

            {exportMessage && (
              <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-4 py-2.5 rounded-lg border border-emerald-500/20">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>{exportMessage}</span>
              </div>
            )}

            {/* Action Bar */}
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void openFolder()}
                className="gap-2"
              >
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
                {t("businessSettings.openDataFolder", "Open Local Data Folder")}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleExport()}
                disabled={exporting || isSyncing}
                className="gap-2"
              >
                <Download className="h-4 w-4 text-muted-foreground" />
                {exporting
                  ? t("businessSettings.exporting", "Exporting...")
                  : t("businessSettings.exportDisasterRecovery", "Export Disaster Recovery ZIP")}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
