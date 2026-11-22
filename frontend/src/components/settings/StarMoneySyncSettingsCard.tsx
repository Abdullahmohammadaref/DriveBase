import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import {
  Landmark,
  FolderOpen,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Save,
  FileCheck2,
  Sparkles,
  Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTransactionChoices } from "@/hooks/useTransactions"
import {
  useStarMoneySync,
  DEFAULT_STARMONEY_WATCH_DIR,
  type StarMoneyBankMapping,
  type UnmappedExport,
} from "@/hooks/useStarMoneySync"
import {
  isTauri,
  pickStarMoneyWatchDir,
  ensureStarMoneyDir,
} from "@/lib/desktop/platform"

export default function StarMoneySyncSettingsCard() {
  const { t } = useTranslation()
  const { data: choices } = useTransactionChoices()
  const {
    watchDir,
    mappings,
    unmappedExports,
    autoImport,
    setAutoImport,
    isScanning,
    isSyncing,
    lastSyncSummary,
    saveConfig,
    scanDirectory,
    bindNewAccount,
  } = useStarMoneySync()

  const [localDir, setLocalDir] = useState<string>(DEFAULT_STARMONEY_WATCH_DIR)
  const [localMappings, setLocalMappings] = useState<StarMoneyBankMapping[]>([])
  const [selectedUnmappedMethod, setSelectedUnmappedMethod] = useState<string>("")
  const [dirExists, setDirExists] = useState<boolean>(true)
  const [feedback, setFeedback] = useState<{
    type: "success" | "error"
    message: string
  } | null>(null)

  const paymentMethods = choices?.method_choices || []

  // Auto-select payment method if unmapped export filename matches known bank name
  const currentUnmapped = unmappedExports[0]
  useEffect(() => {
    if (!currentUnmapped || !paymentMethods.length) return
    const fileName = currentUnmapped.file.name.toLowerCase()
    const autoMatch = paymentMethods.find((pm) => {
      const pmLabel = pm.label.toLowerCase()
      return fileName.includes(pmLabel)
    })
    if (autoMatch) {
      setSelectedUnmappedMethod(autoMatch.value)
    } else if (!selectedUnmappedMethod) {
      setSelectedUnmappedMethod(paymentMethods[0].value)
    }
  }, [currentUnmapped?.file.name, paymentMethods])

  const handleLinkFromSettings = async (unmapped: UnmappedExport) => {
    const methodVal = selectedUnmappedMethod || (paymentMethods[0]?.value ?? "")
    if (!methodVal) return
    const found = paymentMethods.find((m) => m.value === methodVal)
    const pmId = parseInt(methodVal)
    const pmName = found ? found.label : "Bank"

    await bindNewAccount(unmapped.suggestedAccount, pmId, pmName)
    setSelectedUnmappedMethod("")
    setFeedback({
      type: "success",
      message: t("settings.linkedBankSuccess", `Linked ${unmapped.suggestedAccount} to ${pmName}.`),
    })
    setTimeout(() => setFeedback(null), 3000)
  }

  // Initialize local state when hook data loads
  useEffect(() => {
    if (watchDir) {
      setLocalDir(watchDir)
      void ensureStarMoneyDir(watchDir).then((res) => setDirExists(res))
    }
  }, [watchDir])

  useEffect(() => {
    setLocalMappings(mappings || [])
  }, [mappings])

  // Only render inside the native Windows Desktop app
  if (!isTauri()) {
    return null
  }

  const handleBrowseWatchDir = async () => {
    try {
      const picked = await pickStarMoneyWatchDir()
      if (picked) {
        setLocalDir(picked)
        await ensureStarMoneyDir(picked)
        setDirExists(true)
        await saveConfig({
          watch_dir: picked,
          mappings: localMappings,
          auto_import: autoImport,
        })
        setFeedback({
          type: "success",
          message: t(
            "settings.watchDirUpdated",
            "Export folder updated and verified."
          ),
        })
        setTimeout(() => setFeedback(null), 3000)
      }
    } catch (err: any) {
      setFeedback({
        type: "error",
        message: err?.message || "Failed to select folder",
      })
    }
  }

  const handleAddRow = () => {
    const firstMethod = paymentMethods[0]
    const newEntry: StarMoneyBankMapping = {
      id: crypto.randomUUID(),
      payment_method_id: firstMethod ? parseInt(firstMethod.value) : 1,
      payment_method_name: firstMethod ? firstMethod.label : "Bank Account",
      patterns: "",
    }
    const updated = [...localMappings, newEntry]
    setLocalMappings(updated)
    void saveConfig({ watch_dir: localDir, mappings: updated, auto_import: autoImport })
  }

  const handleClearAll = () => {
    setLocalMappings([])
    void saveConfig({ watch_dir: localDir, mappings: [], auto_import: autoImport })
  }

  const handleRemoveRow = (id: string) => {
    const updated = localMappings.filter((m) => m.id !== id)
    setLocalMappings(updated)
    void saveConfig({ watch_dir: localDir, mappings: updated, auto_import: autoImport })
  }

  const handleMethodChange = (id: string, methodVal: string) => {
    const methodId = parseInt(methodVal)
    const found = paymentMethods.find((m) => m.value === methodVal)
    const updated = localMappings.map((m) =>
      m.id === id
        ? {
            ...m,
            payment_method_id: methodId,
            payment_method_name: found ? found.label : m.payment_method_name,
            patterns: m.patterns || "",
          }
        : m
    )
    setLocalMappings(updated)
    void saveConfig({ watch_dir: localDir, mappings: updated, auto_import: autoImport })
  }

  const handlePatternsChange = (id: string, newPatterns: string) => {
    const updated = localMappings.map((m) =>
      m.id === id ? { ...m, patterns: newPatterns } : m
    )
    setLocalMappings(updated)
  }

  const handlePatternsBlur = (id: string, newPatterns: string) => {
    const updated = localMappings.map((m) =>
      m.id === id ? { ...m, patterns: newPatterns } : m
    )
    void saveConfig({ watch_dir: localDir, mappings: updated, auto_import: autoImport })
  }

  const handleManualSave = async () => {
    await saveConfig({
      watch_dir: localDir,
      mappings: localMappings,
      auto_import: autoImport,
    })
    setFeedback({
      type: "success",
      message: t("settings.savedSuccessfully", "Settings saved successfully!"),
    })
    setTimeout(() => setFeedback(null), 3000)
  }

  return (
    <div className="bg-card rounded-xl border border-border/80 shadow-xs overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border/60 bg-muted/20 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <Landmark className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              {t("settings.starmoneySyncTitle", "StarMoney Smart Bank Sync")}
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                Desktop Native
              </span>
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t(
                "settings.starmoneySyncDesc",
                "Automatically detects StarMoney exports in your designated folder, supporting both fixed names (sparkasse.csv) and timestamped account exports."
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void scanDirectory(localDir, localMappings)}
            disabled={isScanning || isSyncing}
            className="h-8 text-xs gap-1.5"
            title="Scan folder now"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isScanning ? "animate-spin" : ""}`}
            />
            {t("settings.scanNow", "Scan Folder")}
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleManualSave}
            className="h-8 text-xs gap-1.5"
          >
            <Save className="h-3.5 w-3.5" />
            {t("common.save", "Save")}
          </Button>
        </div>
      </div>

      <div className="p-5 space-y-6">
        {/* Watch Directory Configuration */}
        <div className="rounded-lg border border-border/60 bg-muted/10 p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <FolderOpen className="h-4 w-4 text-primary" />
              {t("settings.watchDir", "StarMoney Export Folder")}
            </label>
            <span
              className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                dirExists
                  ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                  : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
              }`}
            >
              {dirExists
                ? t("settings.folderReady", "Folder Ready")
                : t("settings.folderMissing", "Folder Missing")}
            </span>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={localDir}
              onChange={(e) => setLocalDir(e.target.value)}
              onBlur={() =>
                void saveConfig({
                  watch_dir: localDir,
                  mappings: localMappings,
                })
              }
              placeholder={DEFAULT_STARMONEY_WATCH_DIR}
              className="flex-1 px-3 py-1.5 text-xs font-mono bg-background border border-border rounded-md text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary shadow-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleBrowseWatchDir}
              className="h-8 text-xs gap-1.5 shrink-0"
            >
              <FolderOpen className="h-3.5 w-3.5 text-primary" />
              {t("common.browse", "Browse Folder...")}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t(
              "settings.watchDirHelp",
              "When you click Export in StarMoney, save to this folder. DriveBase automatically detects new transactions."
            )}
          </p>
        </div>

        {/* Autonomous Zero-Click Import Toggle */}
        <div className="rounded-lg border border-border/60 bg-muted/10 p-4 flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5 cursor-pointer">
              <Zap className="h-4 w-4 text-primary" />
              {t("settings.autoImportTitle", "Automatic Background Import (Zero-Click)")}
            </label>
            <p className="text-[11px] text-muted-foreground">
              {t(
                "settings.autoImportHelp",
                "Automatically imports newly detected bank export files into the ledger without asking. When disabled, DriveBase shows a one-click import button instead."
              )}
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={autoImport}
              onChange={(e) => {
                const val = e.target.checked
                setAutoImport(val)
                void saveConfig({
                  watch_dir: localDir,
                  mappings: localMappings,
                  auto_import: val,
                })
              }}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-muted peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
          </label>
        </div>

        {/* Feedback Message */}
        {feedback && (
          <div
            className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
              feedback.type === "success"
                ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800"
            }`}
          >
            {feedback.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Unmapped Bank Account Detected */}
        {unmappedExports.length > 0 && (
          <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs animate-in slide-in-from-top-1">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-full bg-amber-100 dark:bg-amber-900/60 flex items-center justify-center text-amber-700 dark:text-amber-300 shrink-0">
                <AlertCircle className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-amber-900 dark:text-amber-100 flex items-center gap-1.5">
                  <span>{t("transactions.unmappedExportTitle", "New Bank Account Detected")}</span>
                  {unmappedExports.length > 1 && (
                    <span className="text-[10px] font-normal px-1.5 py-0.2 rounded bg-amber-200/60 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200">
                      (1 of {unmappedExports.length})
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-amber-700 dark:text-amber-300">
                  {t("transactions.unmappedExportDesc", "Found export file '{{name}}'. Select which bank this belongs to:", {
                    name: unmappedExports[0].file.name,
                  })}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <select
                value={selectedUnmappedMethod || (paymentMethods[0]?.value ?? "")}
                onChange={(e) => setSelectedUnmappedMethod(e.target.value)}
                className="h-8 px-2.5 text-xs bg-background border border-border rounded-md text-foreground font-medium shadow-xs"
              >
                {paymentMethods.map((pm) => (
                  <option key={pm.value} value={pm.value}>
                    {pm.label}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                className="h-8 px-3 text-xs bg-amber-600 hover:bg-amber-700 text-white font-medium cursor-pointer shadow-xs gap-1"
                onClick={() => handleLinkFromSettings(unmappedExports[0])}
              >
                <Zap className="h-3.5 w-3.5" />
                {t("settings.linkAndAddMapping", "Link & Add Bank")}
              </Button>
            </div>
          </div>
        )}

        {/* Bank Mappings Table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold text-foreground">
                {t("settings.bankMappingsTitle", "Bank Account Mappings & Patterns")}
              </h3>
              <p className="text-[11px] text-muted-foreground">
                {t(
                  "settings.bankMappingsDesc",
                  "Link each payment method to account numbers or filename patterns (e.g. 'sparkasse, 1076843790')."
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {localMappings.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClearAll}
                  className="h-7 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                >
                  {t("settings.clearAllMappings", "Clear All")}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddRow}
                className="h-7 text-xs gap-1"
              >
                <Plus className="h-3 w-3" />
                {t("settings.addBankMapping", "+ Add Another Bank")}
              </Button>
            </div>
          </div>

          <div className="border border-border/80 rounded-lg overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/40 text-muted-foreground font-semibold border-b border-border/60">
                <tr>
                  <th className="py-2.5 px-3 w-[220px]">
                    {t("settings.paymentMethod", "Payment Method")}
                  </th>
                  <th className="py-2.5 px-3">
                    {t(
                      "settings.accountPatterns",
                      "Account ID / Filename Patterns"
                    )}
                  </th>
                  <th className="py-2.5 px-3 w-[240px]">
                    {t("settings.detectedFile", "Folder Status")}
                  </th>
                  <th className="py-2.5 px-2 w-[48px] text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {localMappings.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="py-8 px-4 text-center"
                    >
                      <div className="mx-auto w-10 h-10 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground mb-2">
                        <Landmark className="h-5 w-5" />
                      </div>
                      <p className="text-xs font-semibold text-foreground">
                        {t("settings.noMappingsTitle", "No Bank Accounts Linked Yet")}
                      </p>
                      <p className="text-[11px] text-muted-foreground max-w-sm mx-auto mt-1">
                        {t(
                          "settings.noMappingsDesc",
                          "When you export a file from StarMoney to your folder, DriveBase will automatically ask you which bank it belongs to on the Transactions page and remember it."
                        )}
                      </p>
                    </td>
                  </tr>
                ) : (
                  localMappings.map((mapping) => {
                    const matched = mapping.matched_file
                    return (
                      <tr
                        key={mapping.id}
                        className="hover:bg-muted/10 transition-colors"
                      >
                        {/* Method Selector */}
                        <td className="py-2 px-3 align-top">
                          <select
                            value={String(mapping.payment_method_id)}
                            onChange={(e) =>
                              handleMethodChange(mapping.id, e.target.value)
                            }
                            className="w-full px-2.5 py-1.5 text-xs font-medium bg-background border border-border rounded-md text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary shadow-xs"
                          >
                            {paymentMethods.map((pm) => (
                              <option key={pm.value} value={pm.value}>
                                {pm.label}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Editable Patterns Input */}
                        <td className="py-2 px-3 align-top">
                          <input
                            type="text"
                            value={mapping.patterns || ""}
                            onChange={(e) =>
                              handlePatternsChange(mapping.id, e.target.value)
                            }
                            onBlur={(e) =>
                              handlePatternsBlur(mapping.id, e.target.value)
                            }
                            placeholder="e.g. sparkasse, 1076843790"
                            className="w-full px-2.5 py-1.5 text-xs font-mono bg-background border border-border rounded-md text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary shadow-xs"
                          />
                        </td>

                        {/* Status / Latest File */}
                        <td className="py-2 px-3 align-top">
                          {matched ? (
                            <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded px-2 py-1">
                              <FileCheck2 className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate font-mono text-[11px]" title={matched.path}>
                                {matched.name}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[11px] text-muted-foreground italic">
                              {t("settings.noFileFound", "No export in folder")}
                            </span>
                          )}
                        </td>

                        {/* Delete Row */}
                        <td className="py-2 px-2 align-top text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(mapping.id)}
                            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                            title={t("common.delete", "Delete")}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary Footer */}
        {lastSyncSummary && (
          <div className="p-3 bg-muted/20 border border-border/60 rounded-lg text-xs text-muted-foreground flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              {lastSyncSummary}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
