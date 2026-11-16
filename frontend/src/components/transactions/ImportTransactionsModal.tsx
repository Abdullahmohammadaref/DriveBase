import { useState, useRef } from "react"
import { Upload, FileText, X, Loader2, Landmark, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react"
import { useTranslation } from "react-i18next"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { DynamicSelect } from "@/components/ui/dynamic-select"
import { useTransactionChoices, useImportTransactions } from "@/hooks/useTransactions"
import { useStarMoneySync } from "@/hooks/useStarMoneySync"
import { cn } from "@/lib/utils"

interface ImportTransactionsModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

/**
 * Modal for bulk importing transactions from CSV file
 */
export function ImportTransactionsModal({
    open,
    onOpenChange,
}: ImportTransactionsModalProps) {
    const { t } = useTranslation()
    const { isDesktop, mappings, isSyncing, syncSingleMapping } = useStarMoneySync()
    const [syncingMappingId, setSyncingMappingId] = useState<string | null>(null)
    const [starMoneyFeedback, setStarMoneyFeedback] = useState<{
        type: "success" | "error"
        message: string
    } | null>(null)
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const [selectedMethod, setSelectedMethod] = useState<number | null>(null)
    const [isDragging, setIsDragging] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const { data: choices, isLoading: choicesLoading } = useTransactionChoices()
    const importMutation = useImportTransactions()

    // Convert method choices to DynamicSelect format (id, name)
    const methodOptions = choices?.method_choices?.map((m) => ({
        id: parseInt(m.value),
        name: m.label,
    })) ?? []

    // Reset form when modal closes
    const handleOpenChange = (newOpen: boolean) => {
        if (!newOpen) {
            setSelectedFile(null)
            setSelectedMethod(null)
            importMutation.reset()
            setStarMoneyFeedback(null)
            setSyncingMappingId(null)
        }
        onOpenChange(newOpen)
    }

    // Handle file selection
    const handleFileSelect = (file: File) => {
        if (file.name.endsWith('.csv')) {
            setSelectedFile(file)
        } else {
            alert("Please select a .csv file")
        }
    }

    // Handle file input change
    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            handleFileSelect(file)
        }
    }

    // Handle drag and drop
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(true)
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
        const file = e.dataTransfer.files[0]
        if (file) {
            handleFileSelect(file)
        }
    }

    // Handle import
    const handleImport = async () => {
        if (!selectedFile || !selectedMethod) return

        try {
            await importMutation.mutateAsync({
                file: selectedFile,
                method: String(selectedMethod), // Backend expects string ID
            })
        } catch (error) {
            // Error is handled by mutation
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-md w-full overflow-hidden">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Upload className="h-5 w-5" />
                        {t("transactions.importTransactions", "Import Transactions")}
                    </DialogTitle>
                    <DialogDescription>
                        {t("transactions.importTransactionsDesc", "Upload a StarMoney CSV export to import transactions.")}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* StarMoney Configured Accounts (Desktop Only) */}
                    {isDesktop && mappings.some((m) => m.file_exists) && (
                        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3.5 space-y-2.5">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                    <Landmark className="h-4 w-4 text-primary" />
                                    {t("transactions.configuredStarMoneyAccounts", "Configured StarMoney Accounts")}
                                </span>
                                <span className="text-[11px] text-muted-foreground">
                                    {t("transactions.autoSyncReady", "Ready to sync")}
                                </span>
                            </div>
                            <div className="space-y-1.5">
                                {mappings
                                    .filter((m) => m.file_exists)
                                    .map((m) => (
                                        <div
                                            key={m.id}
                                            className="flex items-center justify-between gap-2 p-2 rounded-md bg-background border border-border/60 text-xs"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="font-medium text-foreground truncate">
                                                    {m.payment_method_name}
                                                </div>
                                                <div className="text-[11px] text-muted-foreground font-mono truncate" title={m.file_path}>
                                                    {m.file_path}
                                                </div>
                                            </div>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                className="h-7 px-2.5 text-xs gap-1 shrink-0 border-primary/30 text-primary hover:bg-primary/5"
                                                disabled={syncingMappingId === m.id || isSyncing}
                                                onClick={async () => {
                                                    setSyncingMappingId(m.id)
                                                    setStarMoneyFeedback(null)
                                                    try {
                                                        const res = await syncSingleMapping(m, true)
                                                        if (res.success) {
                                                            setStarMoneyFeedback({
                                                                type: "success",
                                                                message: t(
                                                                    "transactions.singleSyncSuccess",
                                                                    `Synced ${m.payment_method_name}: ${res.imported ?? 0} imported, ${res.duplicates ?? 0} duplicate(s).`,
                                                                    {
                                                                        bank: m.payment_method_name,
                                                                        imported: res.imported ?? 0,
                                                                        duplicates: res.duplicates ?? 0,
                                                                    }
                                                                ),
                                                            })
                                                        } else {
                                                            setStarMoneyFeedback({
                                                                type: "error",
                                                                message: res.error || t("transactions.syncFailed", "Sync failed"),
                                                            })
                                                        }
                                                    } finally {
                                                        setSyncingMappingId(null)
                                                    }
                                                }}
                                            >
                                                {syncingMappingId === m.id ? (
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                ) : (
                                                    <RefreshCw className="h-3 w-3" />
                                                )}
                                                {t("transactions.syncNow", "Sync Now")}
                                            </Button>
                                        </div>
                                    ))}
                            </div>

                            {starMoneyFeedback && (
                                <div
                                    className={cn(
                                        "flex items-center gap-1.5 text-xs p-2 rounded border",
                                        starMoneyFeedback.type === "success"
                                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                                            : "bg-destructive/10 border-destructive/20 text-destructive"
                                    )}
                                >
                                    {starMoneyFeedback.type === "success" ? (
                                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                    ) : (
                                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                    )}
                                    <span>{starMoneyFeedback.message}</span>
                                </div>
                            )}

                            <div className="relative py-1 flex items-center">
                                <div className="flex-grow border-t border-border/60" />
                                <span className="flex-shrink mx-2 text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                                    {t("transactions.orUploadManually", "or upload manually")}
                                </span>
                                <div className="flex-grow border-t border-border/60" />
                            </div>
                        </div>
                    )}

                    {/* Missing File Warning / Fallback Notice (Desktop Only) */}
                    {isDesktop && mappings.some((m) => !m.file_exists && m.file_path) && (
                        <div className="flex items-start gap-2 p-2.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400">
                            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                            <div className="space-y-0.5">
                                <p className="font-medium">{t("transactions.fileNotFoundNotice", "Configured file not found:")}</p>
                                <p className="font-mono text-[11px] truncate">
                                    {mappings.find((m) => !m.file_exists && m.file_path)?.file_path}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                    {t("transactions.fileNotFoundFallbackHint", "Please choose the CSV file manually below or update the path in Business Settings.")}
                                </p>
                            </div>
                        </div>
                    )}
                    {/* File Drop Zone */}
                    <div className="space-y-2">
                        <Label>{t("transactions.csvFile", "CSV File")}</Label>
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            className={cn(
                                "border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors w-full max-w-full overflow-hidden",
                                isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
                                selectedFile && "border-success-500 bg-success-500/5"
                            )}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".csv"
                                onChange={handleFileInputChange}
                                className="hidden"
                            />

                            {selectedFile ? (
                                <div className="flex items-center justify-between gap-3 w-full min-w-0">
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <FileText className="h-8 w-8 shrink-0 text-success-600" />
                                        <div className="text-left min-w-0 flex-1">
                                            <p className="font-medium truncate text-sm" title={selectedFile.name}>
                                                {selectedFile.name}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {(selectedFile.size / 1024).toFixed(1)} KB
                                            </p>
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="shrink-0 h-8 w-8 text-muted-foreground hover:text-foreground"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setSelectedFile(null)
                                        }}
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                    <Upload className="h-8 w-8" />
                                    <p>{t("transactions.clickOrDragCsv", "Click or drag CSV file here")}</p>
                                    <p className="text-xs">{t("transactions.starmoneyFormat", "StarMoney export format")}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Method Selection - Searchable & Creatable */}
                    <div className="space-y-2">
                        <Label htmlFor="method">{t("transactions.paymentMethod", "Payment Method")}</Label>
                        <DynamicSelect
                            choiceType="method"
                            options={methodOptions}
                            value={selectedMethod}
                            onChange={(id) => setSelectedMethod(id)}
                            placeholder={t("transactions.selectMethodPlaceholder", "Select payment method...")}
                            disabled={choicesLoading}
                            allowCreate={true}
                            createLabel="Method"
                        />
                    </div>

                    {/* Result message */}
                    {importMutation.isSuccess && (
                        <div className="rounded-lg bg-success-500/10 border border-success-500/30 p-3 text-sm text-success-700 dark:text-success-400">
                            {importMutation.data?.message}
                        </div>
                    )}

                    {importMutation.isError && (
                        <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
                            {(importMutation.error as any)?.message || "Import failed"}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => handleOpenChange(false)}
                        disabled={importMutation.isPending}
                    >
                        {importMutation.isSuccess ? t("common.close", "Close") : t("common.cancel", "Cancel")}
                    </Button>
                    {!importMutation.isSuccess && (
                        <Button
                            onClick={handleImport}
                            disabled={!selectedFile || !selectedMethod || importMutation.isPending}
                        >
                            {importMutation.isPending ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    {t("transactions.importing", "Importing...")}
                                </>
                            ) : (
                                t("transactions.import", "Import")
                            )}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

