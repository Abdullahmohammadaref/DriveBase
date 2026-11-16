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
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTransactionChoices } from "@/hooks/useTransactions"
import {
  useStarMoneySync,
  type StarMoneyBankMapping,
} from "@/hooks/useStarMoneySync"
import {
  isTauri,
  pickStarMoneyCsvFile,
  checkStarMoneyCsvFile,
} from "@/lib/desktop/platform"

const DEFAULT_STARMONEY_PATH =
  "C:\\ProgramData\\StarMoney Basic 15\\profil\\export\\umsaetze.csv"

export default function StarMoneySyncSettingsCard() {
  const { t } = useTranslation()
  const { data: choices } = useTransactionChoices()
  const {
    mappings,
    isSyncing,
    lastSyncSummary,
    saveMappings,
    syncAllMappings,
  } = useStarMoneySync()

  const [localList, setLocalList] = useState<StarMoneyBankMapping[]>([])
  const [feedback, setFeedback] = useState<{
    type: "success" | "error"
    message: string
  } | null>(null)

  const paymentMethods = choices?.method_choices || []

  // Sync internal state with loaded hook mappings or default pre-filled row
  useEffect(() => {
    if (mappings && mappings.length > 0) {
      setLocalList(mappings)
    } else if (localList.length === 0) {
      const firstMethod = paymentMethods[0]
      const defaultEntry: StarMoneyBankMapping = {
        id: crypto.randomUUID(),
        payment_method_id: firstMethod ? parseInt(firstMethod.value) : 1,
        payment_method_name: firstMethod ? firstMethod.label : "Bank Account",
        file_path: DEFAULT_STARMONEY_PATH,
        file_exists: false,
      }
      setLocalList([defaultEntry])
      void checkStarMoneyCsvFile(DEFAULT_STARMONEY_PATH).then((meta) => {
        setLocalList([{ ...defaultEntry, file_exists: meta.exists, last_file_size: meta.size_bytes }])
      })
    }
  }, [mappings, paymentMethods])

  // Only render inside the native Windows Desktop app
  if (!isTauri()) {
    return null
  }

  const handleAddRow = () => {
    const firstMethod = paymentMethods[0]
    const newEntry: StarMoneyBankMapping = {
      id: crypto.randomUUID(),
      payment_method_id: firstMethod ? parseInt(firstMethod.value) : 1,
      payment_method_name: firstMethod ? firstMethod.label : "Bank Account",
      file_path: DEFAULT_STARMONEY_PATH,
      file_exists: false,
    }
    setLocalList((prev) => [...prev, newEntry])

    // Check if the default path exists
    void checkStarMoneyCsvFile(DEFAULT_STARMONEY_PATH).then((meta) => {
      setLocalList((curr) =>
        curr.map((item) =>
          item.id === newEntry.id ? { ...item, file_exists: meta.exists } : item
        )
      )
    })
  }

  const handleRemoveRow = (id: string) => {
    setLocalList((prev) => prev.filter((item) => item.id !== id))
  }

  const handleMethodChange = (id: string, methodVal: string) => {
    const methodId = parseInt(methodVal)
    const found = paymentMethods.find((m) => m.value === methodVal)
    setLocalList((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              payment_method_id: methodId,
              payment_method_name: found ? found.label : item.payment_method_name,
            }
          : item
      )
    )
  }

  const handlePathChange = async (id: string, newPath: string) => {
    setLocalList((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, file_path: newPath } : item
      )
    )
    if (newPath.trim()) {
      try {
        const meta = await checkStarMoneyCsvFile(newPath.trim())
        setLocalList((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, file_exists: meta.exists } : item
          )
        )
      } catch {
        setLocalList((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, file_exists: false } : item
          )
        )
      }
    }
  }

  const handleBrowse = async (id: string) => {
    try {
      const picked = await pickStarMoneyCsvFile()
      if (picked) {
        let meta = { exists: true, size_bytes: 0 }
        try {
          const m = await checkStarMoneyCsvFile(picked)
          meta = { exists: m.exists, size_bytes: m.size_bytes ?? 0 }
        } catch {
          meta = { exists: false, size_bytes: 0 }
        }

        const updated = localList.map((item) =>
          item.id === id
            ? {
                ...item,
                file_path: picked,
                file_exists: meta.exists,
                last_file_size: meta.size_bytes,
              }
            : item
        )
        setLocalList(updated)

        // Automatically save immediately so it's tracked right away
        await saveMappings(updated)
        setFeedback({
          type: "success",
          message: t(
            "businessSettings.starMoneySaved",
            "StarMoney CSV file selected and tracked successfully!"
          ),
        })
        setTimeout(() => setFeedback(null), 4000)
      }
    } catch (err) {
      console.warn("[StarMoneySettings] Browse error:", err)
    }
  }

  const handleSave = async () => {
    try {
      await saveMappings(localList)
      setFeedback({
        type: "success",
        message: t(
          "businessSettings.starMoneySaved",
          "StarMoney export paths saved successfully."
        ),
      })
      setTimeout(() => setFeedback(null), 4000)
    } catch (err: any) {
      setFeedback({
        type: "error",
        message: t(
          "businessSettings.starMoneySaveError",
          `Failed to save: ${err?.message || err}`
        ),
      })
    }
  }

  const handleSyncNow = async () => {
    await saveMappings(localList)
    await syncAllMappings(true)
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <Landmark className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-foreground">
              {t("businessSettings.starMoneyTitle", "StarMoney Automatic Bank Sync")}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t(
                "businessSettings.starMoneySubtitle",
                "Map local StarMoney CSV export paths to your bank payment methods for instant 1-click & background synchronization."
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleSyncNow()}
            disabled={isSyncing || localList.length === 0}
            className="gap-2"
          >
            <RefreshCw
              className={`h-4 w-4 ${isSyncing ? "animate-spin text-primary" : ""}`}
            />
            {isSyncing
              ? t("businessSettings.syncing", "Syncing...")
              : t("businessSettings.syncStarMoneyNow", "Sync Files Now")}
          </Button>

          <Button
            size="sm"
            onClick={() => void handleSave()}
            className="gap-2 bg-primary text-primary-foreground"
          >
            <Save className="h-4 w-4" />
            {t("common.save", "Save")}
          </Button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {feedback && (
          <div
            className={`flex items-center gap-2 text-xs px-4 py-2.5 rounded-lg border ${
              feedback.type === "success"
                ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                : "text-destructive bg-destructive/10 border-destructive/20"
            }`}
          >
            {feedback.type === "success" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {lastSyncSummary && (
          <div className="flex items-center gap-2 text-xs px-4 py-2.5 rounded-lg border border-primary/20 bg-primary/5 text-primary">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{lastSyncSummary}</span>
          </div>
        )}

        {localList.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center space-y-3">
            <Landmark className="h-8 w-8 mx-auto text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                {t("businessSettings.noStarMoneyMappings", "No Bank CSV Paths Configured")}
              </p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                {t(
                  "businessSettings.noStarMoneyMappingsDesc",
                  "Add your bank accounts (e.g. Sparkasse, Volksbank) and specify the CSV file path exported by StarMoney. Transactions will sync automatically."
                )}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddRow}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              {t("businessSettings.addBankMapping", "Add Bank Account Mapping")}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {localList.map((mapping, idx) => (
              <div
                key={mapping.id}
                className="rounded-lg border border-border bg-muted/20 p-4 space-y-3"
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                      {idx + 1}
                    </span>
                    <span className="text-sm font-medium text-foreground">
                      {mapping.payment_method_name || t("businessSettings.bankAccount", "Bank Account")}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {mapping.file_exists ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <FileCheck2 className="h-3.5 w-3.5" />
                        {t("businessSettings.fileFound", "File Found")}
                        {mapping.last_file_size
                          ? ` (${(mapping.last_file_size / 1024).toFixed(1)} KB)`
                          : ""}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        <AlertCircle className="h-3.5 w-3.5" />
                        {t("businessSettings.fileNotFound", "File Not Found")}
                      </span>
                    )}

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveRow(mapping.id)}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      title={t("common.delete", "Delete")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Payment Method Selector */}
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      {t("businessSettings.targetPaymentMethod", "Payment Method")}
                    </label>
                    <select
                      value={mapping.payment_method_id}
                      onChange={(e) => handleMethodChange(mapping.id, e.target.value)}
                      className="w-full text-sm rounded-md border border-input bg-background px-3 py-2 shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {paymentMethods.map((pm) => (
                        <option key={pm.value} value={pm.value}>
                          {pm.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* CSV File Path with Browse Button */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      {t("businessSettings.starmoneyCsvPath", "CSV File Path on PC")}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={mapping.file_path}
                        onChange={(e) => void handlePathChange(mapping.id, e.target.value)}
                        placeholder="C:\...\umsaetze.csv"
                        className="flex-1 text-xs font-mono rounded-md border border-input bg-background px-3 py-2 shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleBrowse(mapping.id)}
                        className="gap-1.5 shrink-0"
                      >
                        <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                        {t("businessSettings.browse", "Browse...")}
                      </Button>
                    </div>
                  </div>
                </div>

                {mapping.last_synced_at && (
                  <div className="text-[11px] text-muted-foreground">
                    {t("businessSettings.lastSyncedAt", "Last synced:")}{" "}
                    {new Date(mapping.last_synced_at).toLocaleString()}
                  </div>
                )}
              </div>
            ))}

            <Button
              variant="outline"
              size="sm"
              onClick={handleAddRow}
              className="gap-2 mt-2"
            >
              <Plus className="h-4 w-4" />
              {t("businessSettings.addAnotherBank", "Add Another Bank Account")}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
