import { useState, useMemo, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { Plus, Trash2, TrendingUp, TrendingDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DynamicSelect } from "@/components/ui/dynamic-select"
import { formatCurrency } from "@/lib/utils"
import { useCreateExpenseEarning, useUpdateExpenseEarning, useDeleteExpenseEarning } from "@/hooks/useVehicles"
import type { VehicleExpenseEarning, AllChoices } from "@/types/vehicle"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface VehicleExpensesEarningsCardProps {
    vehicleInternalId: number
    entries: VehicleExpenseEarning[]
    choices: AllChoices | undefined
}

export function VehicleExpensesEarningsCard({
    vehicleInternalId,
    entries,
    choices,
}: VehicleExpensesEarningsCardProps) {
    const { t } = useTranslation()
    // -- State --
    const [showDialog, setShowDialog] = useState(false)
    const [editingEntry, setEditingEntry] = useState<VehicleExpenseEarning | null>(null)
    const [entryType, setEntryType] = useState<"expense" | "earning">("expense")
    const [amount, setAmount] = useState("")
    const [categoryId, setCategoryId] = useState<number | null>(null)
    const [subcategoryId, setSubcategoryId] = useState<number | null>(null)
    const [formError, setFormError] = useState<string | null>(null)

    // -- Mutations --
    const createMutation = useCreateExpenseEarning()
    const updateMutation = useUpdateExpenseEarning()
    const deleteMutation = useDeleteExpenseEarning()

    // -- Derived --
    const totalExpenses = useMemo(
        () => entries.filter((e) => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0),
        [entries]
    )
    const totalEarnings = useMemo(
        () => entries.filter((e) => e.type === "earning").reduce((s, e) => s + Number(e.amount), 0),
        [entries]
    )
    const netBalance = totalEarnings - totalExpenses
    const sign = netBalance < 0 ? "-" : netBalance > 0 ? "+" : ""

    // Category options
    const categoryOptions = useMemo(
        () => choices?.categories?.map((c) => ({ id: c.id, name: c.name })) ?? [],
        [choices?.categories]
    )

    // Filtered subcategories based on selected category
    const subcategoryOptions = useMemo(
        () =>
            categoryId
                ? choices?.subcategories
                    ?.filter((s) => s.category_id === categoryId)
                    .map((s) => ({ id: s.id, name: s.name })) ?? []
                : [],
        [choices?.subcategories, categoryId]
    )

    // Validation
    const isFormValid = useMemo(() => {
        const numAmount = parseFloat(amount)
        return categoryId !== null && subcategoryId !== null && !isNaN(numAmount) && numAmount > 0
    }, [categoryId, subcategoryId, amount])

    // -- Handlers --
    const handleOpenAdd = () => {
        setEditingEntry(null)
        setEntryType("expense")
        setAmount("")
        setCategoryId(null)
        setSubcategoryId(null)
        setFormError(null)
        setShowDialog(true)
    }

    const handleEdit = (entry: VehicleExpenseEarning) => {
        setEditingEntry(entry)
        setEntryType(entry.type)
        setAmount(String(entry.amount))
        setCategoryId(entry.category_id)
        setSubcategoryId(entry.subcategory_id)
        setFormError(null)
        setShowDialog(true)
    }

    const resetForm = useCallback(() => {
        setEditingEntry(null)
        setAmount("")
        setCategoryId(null)
        setSubcategoryId(null)
        setFormError(null)
        setShowDialog(false)
    }, [])

    const handleSubmit = async () => {
        setFormError(null)
        const numAmount = parseFloat(amount)

        if (!categoryId) {
            setFormError(t("expensesEarnings.categoryRequired", "Category is required"))
            return
        }
        if (!subcategoryId) {
            setFormError(t("expensesEarnings.subcategoryRequired", "Subcategory is required"))
            return
        }
        if (isNaN(numAmount) || numAmount <= 0) {
            setFormError(t("expensesEarnings.amountPositive", "Amount must be greater than 0"))
            return
        }

        try {
            if (editingEntry) {
                await updateMutation.mutateAsync({
                    vehicleInternalId,
                    entryId: editingEntry.id,
                    payload: {
                        type: entryType,
                        category_id: categoryId,
                        subcategory_id: subcategoryId,
                        amount: numAmount,
                    },
                })
            } else {
                await createMutation.mutateAsync({
                    vehicleInternalId,
                    payload: {
                        type: entryType,
                        category_id: categoryId,
                        subcategory_id: subcategoryId,
                        amount: numAmount,
                    },
                })
            }
            resetForm()
        } catch (err: any) {
            const msg =
                err?.response?.data?.error ||
                err?.response?.data?.detail ||
                (editingEntry ? "Failed to update entry" : "Failed to create entry")
            setFormError(typeof msg === "string" ? msg : JSON.stringify(msg))
        }
    }

    const handleDelete = async (entryId: number) => {
        try {
            await deleteMutation.mutateAsync({
                vehicleInternalId,
                entryId,
            })
        } catch (err: any) {
            console.error("Failed to delete entry:", err)
        }
    }

    return (
        <div className="min-w-0 flex flex-col">
            {/* Section Header with Title and Add Button */}
            <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300 truncate">
                    {t("expensesEarnings.title", "Expenses & Earnings")}
                </span>
                <button
                    type="button"
                    onClick={handleOpenAdd}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center gap-0.5 cursor-pointer"
                >
                    <Plus className="size-3" /> {t("expensesEarnings.add", "Add")}
                </button>
            </div>

            <div className="h-[115px] min-h-[110px] w-full rounded-md border border-gray-200 dark:border-border bg-white dark:bg-card p-2 flex flex-col justify-between">
                {/* Header: Left-aligned NET Total */}
                <div className="flex items-center pb-1 border-b border-gray-200 dark:border-border">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[10px] font-semibold uppercase tracking-tight text-gray-400 dark:text-muted-foreground">
                            {t("expensesEarnings.net", "NET:")}
                        </span>
                        <span
                            className={
                                "text-xs font-bold font-mono " +
                                (netBalance < 0
                                    ? "text-[#d23a69]"
                                    : netBalance > 0
                                        ? "text-[#318d6c]"
                                        : "text-gray-900 dark:text-foreground")
                            }
                        >
                            {sign}{formatCurrency(Math.abs(netBalance))}
                        </span>
                    </div>
                </div>

                {/* Scrollable Entry Rows: Table Look with divide-y divide-gray-200 */}
                <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-gray-200 dark:divide-border">
                    {entries.length === 0 ? (
                        <div className="flex h-full items-center justify-center text-xs text-gray-400 dark:text-muted-foreground">
                            {t("expensesEarnings.noEntries", "No expenses or earnings recorded")}
                        </div>
                    ) : (
                        entries.map((entry) => {
                            const isExpense = entry.type === "expense"
                            return (
                                <div
                                    key={entry.id}
                                    onClick={() => !deleteMutation.isPending && handleEdit(entry)}
                                    className="group flex py-1.5 px-2 items-center justify-between gap-2 text-xs hover:bg-blue-50/50 dark:hover:bg-muted/40 transition-colors cursor-pointer rounded"
                                    title={t("expensesEarnings.edit", "Edit entry")}
                                >
                                    <div className="min-w-0 flex-1 truncate">
                                        <span className="text-gray-700 dark:text-foreground font-medium text-xs truncate">
                                            {entry.category_name}
                                        </span>
                                        {entry.subcategory_name && (
                                            <span className="ml-1 text-gray-400 dark:text-muted-foreground font-normal text-[11px]">
                                                · {entry.subcategory_name}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <span
                                            className={
                                                "font-bold font-mono text-xs " +
                                                (isExpense ? "text-[#d23a69]" : "text-[#318d6c]")
                                            }
                                        >
                                            {isExpense ? "-" : "+"}{formatCurrency(Number(entry.amount))}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                handleDelete(entry.id)
                                            }}
                                            disabled={deleteMutation.isPending}
                                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-destructive hover:bg-rose-50 dark:hover:bg-rose-950/40"
                                            title={t("expensesEarnings.delete", "Delete entry")}
                                        >
                                            <Trash2 className="size-3" />
                                        </button>
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>
            </div>

            {/* Add or Edit Entry Modal */}
            <Dialog
                open={showDialog}
                onOpenChange={(open) => {
                    if (!open) resetForm()
                    else setShowDialog(true)
                }}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-base font-semibold text-heading">
                            {editingEntry
                                ? t("expensesEarnings.editTitle", "Edit Expense or Earning")
                                : t("expensesEarnings.addTitle", "Add Expense or Earning")}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-3 py-2">
                        {/* Type Toggle */}
                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">{t("expensesEarnings.type", "Type")}</Label>
                            <div className="grid grid-cols-2 gap-1 rounded-md border border-border bg-secondary p-0.5">
                                <button
                                    type="button"
                                    onClick={() => setEntryType("expense")}
                                    className={`flex h-7 items-center justify-center gap-1 rounded text-xs font-medium transition-all ${
                                        entryType === "expense"
                                            ? "bg-background text-danger shadow-xs"
                                             : "text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    <TrendingDown className="size-3" />
                                    {t("expensesEarnings.expense", "Expense")}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setEntryType("earning")}
                                    className={`flex h-7 items-center justify-center gap-1 rounded text-xs font-medium transition-all ${
                                        entryType === "earning"
                                            ? "bg-background text-success shadow-xs"
                                            : "text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    <TrendingUp className="size-3" />
                                    {t("expensesEarnings.earning", "Earning")}
                                </button>
                            </div>
                        </div>

                        {/* Category */}
                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">
                                {t("expensesEarnings.category", "Category")} <span className="text-destructive">*</span>
                            </Label>
                            <DynamicSelect
                                choiceType="category"
                                options={categoryOptions}
                                value={categoryId}
                                onChange={(val) => {
                                    setCategoryId(val)
                                    setSubcategoryId(null)
                                }}
                                placeholder={t("expensesEarnings.selectCategory", "Select category")}
                                createLabel="Category"
                            />
                        </div>

                        {/* Subcategory */}
                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">
                                {t("expensesEarnings.subcategory", "Subcategory")} <span className="text-destructive">*</span>
                            </Label>
                            <DynamicSelect
                                choiceType="subcategory"
                                options={subcategoryOptions}
                                value={subcategoryId}
                                onChange={(val) => setSubcategoryId(val)}
                                placeholder={categoryId ? t("expensesEarnings.selectSubcategory", "Select subcategory") : t("transactions.selectCategoryFirst", "Select category first")}
                                disabled={!categoryId}
                                createLabel="Subcategory"
                                parentId={categoryId ?? undefined}
                            />
                        </div>

                        {/* Amount */}
                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">
                                {t("expensesEarnings.amount", "Amount (€)")} <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="0.00"
                                className="h-8 text-xs"
                            />
                        </div>

                        {formError && (
                            <p className="text-xs text-destructive bg-danger-bg p-2 rounded-md border border-danger/20">
                                {formError}
                            </p>
                        )}
                    </div>

                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={resetForm}
                        >
                            {t("common.cancel", "Cancel")}
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            onClick={handleSubmit}
                            disabled={!isFormValid || createMutation.isPending || updateMutation.isPending}
                        >
                            {createMutation.isPending || updateMutation.isPending
                                ? (editingEntry ? t("common.saving", "Saving...") : t("common.adding", "Adding..."))
                                : (editingEntry ? t("expensesEarnings.saveChanges", "Save Changes") : t("expensesEarnings.save", "Save"))}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
