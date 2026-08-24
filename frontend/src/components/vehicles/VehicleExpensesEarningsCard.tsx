import { useState, useMemo, useCallback } from "react"
import { Plus, Trash2, TrendingUp, TrendingDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DynamicSelect } from "@/components/ui/dynamic-select"
import { formatCurrency } from "@/lib/utils"
import { useCreateExpenseEarning, useDeleteExpenseEarning } from "@/hooks/useVehicles"
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
    // -- State --
    const [showDialog, setShowDialog] = useState(false)
    const [entryType, setEntryType] = useState<"expense" | "earning">("expense")
    const [amount, setAmount] = useState("")
    const [categoryId, setCategoryId] = useState<number | null>(null)
    const [subcategoryId, setSubcategoryId] = useState<number | null>(null)
    const [formError, setFormError] = useState<string | null>(null)

    // -- Mutations --
    const createMutation = useCreateExpenseEarning()
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
        [categoryId, choices?.subcategories]
    )

    // -- Handlers --
    const resetForm = useCallback(() => {
        setAmount("")
        setCategoryId(null)
        setSubcategoryId(null)
        setFormError(null)
        setShowDialog(false)
    }, [])

    const isFormValid = Boolean(
        categoryId &&
        subcategoryId &&
        entryType &&
        amount &&
        parseFloat(amount) > 0
    )

    const handleSubmit = useCallback(async () => {
        setFormError(null)
        const parsedAmount = parseFloat(amount)
        if (!isFormValid) return

        try {
            await createMutation.mutateAsync({
                vehicleInternalId,
                payload: {
                    type: entryType,
                    amount: parsedAmount,
                    category_id: categoryId!,
                    subcategory_id: subcategoryId!,
                },
            })
            resetForm()
        } catch (error: unknown) {
            const err = error as { response?: { data?: { detail?: string } }; message?: string }
            setFormError(
                err.response?.data?.detail || err.message || "Failed to save entry"
            )
        }
    }, [amount, categoryId, subcategoryId, entryType, vehicleInternalId, createMutation, resetForm, isFormValid])

    const handleDelete = useCallback(
        async (entryId: number) => {
            try {
                await deleteMutation.mutateAsync({ vehicleInternalId, entryId })
            } catch {
                // silently fail
            }
        },
        [vehicleInternalId, deleteMutation]
    )

    return (
        <div className="min-w-0 flex flex-col">
            {/* Section Header with Title and Add Button */}
            <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-300 truncate">
                    Expenses &amp; Earnings
                </span>
                <button
                    type="button"
                    onClick={() => setShowDialog(true)}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center gap-0.5"
                >
                    <Plus className="size-3" /> Add
                </button>
            </div>

            <div className="h-[115px] min-h-[110px] w-full rounded-md border border-gray-200 dark:border-border bg-white dark:bg-card p-2 flex flex-col justify-between">
                {/* Header: Left-aligned NET Total */}
                <div className="flex items-center pb-1 border-b border-gray-200 dark:border-border">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[10px] font-semibold uppercase tracking-tight text-gray-400 dark:text-muted-foreground">
                            NET:
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
                            No expenses or earnings recorded
                        </div>
                    ) : (
                        entries.map((entry) => {
                            const isExpense = entry.type === "expense"
                            return (
                                <div
                                    key={entry.id}
                                    className="group flex py-1.5 px-2 items-center justify-between gap-2 text-xs hover:bg-gray-50/50 dark:hover:bg-muted/40 transition-colors"
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
                                            onClick={() => handleDelete(entry.id)}
                                            disabled={deleteMutation.isPending}
                                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-destructive hover:bg-rose-50 dark:hover:bg-rose-950/40"
                                            title="Delete entry"
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

            {/* Add Entry Modal */}
            <Dialog open={showDialog} onOpenChange={setShowDialog}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-base font-semibold text-heading">
                            Add Expense / Earning
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-3 py-2">
                        {/* Type Toggle */}
                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Type</Label>
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
                                    Expense
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
                                    Earning
                                </button>
                            </div>
                        </div>

                        {/* Category */}
                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">
                                Category <span className="text-destructive">*</span>
                            </Label>
                            <DynamicSelect
                                choiceType="category"
                                options={categoryOptions}
                                value={categoryId}
                                onChange={(val) => {
                                    setCategoryId(val)
                                    setSubcategoryId(null)
                                }}
                                placeholder="Select category"
                                createLabel="Category"
                            />
                        </div>

                        {/* Subcategory */}
                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">
                                Subcategory <span className="text-destructive">*</span>
                            </Label>
                            <DynamicSelect
                                choiceType="subcategory"
                                options={subcategoryOptions}
                                value={subcategoryId}
                                onChange={(val) => setSubcategoryId(val)}
                                placeholder={categoryId ? "Select subcategory" : "Select category first"}
                                disabled={!categoryId}
                                createLabel="Subcategory"
                                parentId={categoryId ?? undefined}
                            />
                        </div>

                        {/* Amount */}
                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">
                                Amount (€) <span className="text-destructive">*</span>
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
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            onClick={handleSubmit}
                            disabled={!isFormValid || createMutation.isPending}
                        >
                            {createMutation.isPending ? "Adding..." : "Add Entry"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
