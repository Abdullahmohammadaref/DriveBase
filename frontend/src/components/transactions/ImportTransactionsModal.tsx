import { useState, useRef } from "react"
import { Upload, FileText, X, Loader2 } from "lucide-react"
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
    const { } = useTranslation() // Import for future i18n support
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
            handleOpenChange(false)
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
                        Import Transactions
                    </DialogTitle>
                    <DialogDescription>
                        Upload a StarMoney CSV export to import transactions.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* File Drop Zone */}
                    <div className="space-y-2">
                        <Label>CSV File</Label>
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
                                    <p>Click or drag CSV file here</p>
                                    <p className="text-xs">StarMoney export format</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Method Selection - Searchable & Creatable */}
                    <div className="space-y-2">
                        <Label htmlFor="method">Payment Method</Label>
                        <DynamicSelect
                            choiceType="method"
                            options={methodOptions}
                            value={selectedMethod}
                            onChange={(id) => setSelectedMethod(id)}
                            placeholder="Select payment method..."
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
                        Cancel
                    </Button>
                    <Button
                        onClick={handleImport}
                        disabled={!selectedFile || !selectedMethod || importMutation.isPending}
                    >
                        {importMutation.isPending ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Importing...
                            </>
                        ) : (
                            "Import"
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

