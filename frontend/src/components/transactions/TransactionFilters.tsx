import { useState, useEffect } from "react"
import { RotateCcw } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FilterSelect } from "@/components/ui/filter-select"
import { Separator } from "@/components/ui/separator"
import { useTransactionChoices, useSubcategories } from "@/hooks/useTransactions"
import type { TransactionFilters } from "@/types/transaction"

interface TransactionFiltersProps {
    filters: TransactionFilters
    onApplyFilters: (filters: TransactionFilters) => void
}

export function TransactionFiltersSidebar({
    filters,
    onApplyFilters,
}: TransactionFiltersProps) {
    const { t } = useTranslation()
    const { data: choices } = useTransactionChoices()
    const [localFilters, setLocalFilters] = useState<TransactionFilters>(filters)

    // Get category ID for subcategory lookup (category name -> ID)
    const categoryId = choices?.category_choices?.find(
        (c) => c.label === localFilters.category
    )?.value

    // Fetch subcategories based on selected category ID
    const { data: subcategoriesData } = useSubcategories(
        categoryId ? parseInt(categoryId) : undefined
    )

    useEffect(() => {
        setLocalFilters(filters)
    }, [filters])

    // Apply filters
    const handleApply = () => {
        onApplyFilters(localFilters)
    }

    const handleReset = () => {
        const resetFilters: TransactionFilters = {
            page: 1,
            per_page: filters.per_page || 20,
        }
        setLocalFilters(resetFilters)
        onApplyFilters(resetFilters)
    }

    // Update a single filter value
    const updateFilter = <K extends keyof TransactionFilters>(
        key: K,
        value: TransactionFilters[K]
    ) => {
        setLocalFilters((prev) => {
            const newFilters = {
                ...prev,
                [key]: value || undefined,
            }
            // Clear subcategory when category changes
            if (key === "category") {
                newFilters.subcategory = undefined
            }
            return newFilters
        })
    }

    return (
        <div className="flex flex-col bg-white dark:bg-card rounded-lg border border-gray-200 dark:border-border shadow-xs overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-200 dark:border-border bg-gray-50/50 dark:bg-muted/30 flex items-center justify-between">
                <h2 className="text-[12px] font-semibold uppercase tracking-wider text-gray-700 dark:text-foreground">{t('transactions.filterTitle')}</h2>
                <button
                    type="button"
                    onClick={handleReset}
                    className="text-[11px] font-medium text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                    <RotateCcw className="size-3" /> {t('transactions.reset')}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-4">
                {/* Quick Search Section */}
                <div className="space-y-2.5">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-muted-foreground">
                        {t('transactions.quickSearch')}
                    </h3>

                    <div className="space-y-2.5">
                        <div className="space-y-1">
                            <Label htmlFor="internal_id" className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">{t('transactions.transactionId')}</Label>
                            <Input
                                id="internal_id"
                                type="number"
                                placeholder={t('transactions.enterId')}
                                className="h-8 text-xs text-foreground placeholder:text-muted-foreground"
                                value={localFilters.internal_id ?? ""}
                                onChange={(e) =>
                                    updateFilter(
                                        "internal_id",
                                        e.target.value ? Number(e.target.value) : undefined
                                    )
                                }
                            />
                        </div>
                    </div>
                </div>

                <Separator />

                {/* Transaction Details Section */}
                <div className="space-y-4">
                    <h3 className="text-sm font-medium text-foreground">
                        {t('transactions.details')}
                    </h3>

                    <div className="space-y-3">
                        <div className="space-y-2">
                            <Label className="text-foreground">{t('transactions.status')}</Label>
                            <FilterSelect
                                options={choices?.status_choices?.map((s) => ({
                                    value: s.value,
                                    label: s.label,
                                })) ?? []}
                                value={localFilters.status}
                                onChange={(value) => updateFilter("status", value)}
                                placeholder={t('transactions.allStatuses')}
                                allLabel={t('transactions.allStatuses')}
                                searchPlaceholder={t('transactions.searchStatuses', 'Search statuses...')}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-foreground">{t('transactions.category')}</Label>
                            <FilterSelect
                                options={choices?.category_choices?.map((cat) => ({
                                    value: cat.label,
                                    label: cat.label,
                                })) ?? []}
                                value={localFilters.category}
                                onChange={(value) => updateFilter("category", value)}
                                placeholder={t('transactions.allCategories')}
                                allLabel={t('transactions.allCategories')}
                                searchPlaceholder={t('transactions.searchCategories', 'Search categories...')}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-foreground">{t('transactions.subcategory')}</Label>
                            <FilterSelect
                                options={subcategoriesData?.subcategories?.map((sub) => ({
                                    value: sub.name,
                                    label: sub.name,
                                })) ?? []}
                                value={localFilters.subcategory}
                                onChange={(value) => updateFilter("subcategory", value)}
                                placeholder={localFilters.category ? t('transactions.selectSubcategory') : t('transactions.selectCategoryFirst')}
                                allLabel={t('transactions.allSubcategories')}
                                searchPlaceholder={t('transactions.searchSubcategories', 'Search subcategories...')}
                                disabled={!localFilters.category}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-foreground">{t('transactions.currency')}</Label>
                            <FilterSelect
                                options={choices?.currency_choices?.map((curr) => ({
                                    value: curr.label,
                                    label: curr.label,
                                })) ?? []}
                                value={localFilters.currency}
                                onChange={(value) => updateFilter("currency", value)}
                                placeholder={t('transactions.allCurrencies')}
                                allLabel={t('transactions.allCurrencies')}
                                searchPlaceholder={t('transactions.searchCurrencies', 'Search currencies...')}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-foreground">{t('transactions.paymentMethod')}</Label>
                            <FilterSelect
                                options={choices?.method_choices?.map((method) => ({
                                    value: method.label,
                                    label: method.label,
                                })) ?? []}
                                value={localFilters.method}
                                onChange={(value) => updateFilter("method", value)}
                                placeholder={t('transactions.allMethods')}
                                allLabel={t('transactions.allMethods')}
                                searchPlaceholder={t('transactions.searchMethods', 'Search methods...')}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-foreground">{t('transactions.vehicle')}</Label>
                            <FilterSelect
                                options={choices?.vehicle_choices?.map((v) => ({
                                    value: v.value.toString(),
                                    label: `#${v.value} - ${v.label}`,
                                })) ?? []}
                                value={localFilters.vehicle?.toString()}
                                onChange={(value) => updateFilter("vehicle", value ? Number(value) : undefined)}
                                placeholder={t('transactions.allVehicles')}
                                allLabel={t('transactions.allVehicles')}
                                searchPlaceholder={t('transactions.searchVehicles', 'Search vehicles...')}
                            />
                        </div>
                    </div>
                </div>

                <Separator />

                {/* Amount Range Section */}
                <div className="space-y-4">
                    <h3 className="text-sm font-medium text-foreground">
                        {t('transactions.amountRange')}
                    </h3>

                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label htmlFor="min_amount" className="text-foreground">{t('transactions.minAmount')}</Label>
                                <Input
                                    id="min_amount"
                                    type="number"
                                    placeholder="€ Min"
                                    className="text-foreground placeholder:text-muted-foreground"
                                    value={localFilters.min_amount ?? ""}
                                    onChange={(e) =>
                                        updateFilter(
                                            "min_amount",
                                            e.target.value ? Number(e.target.value) : undefined
                                        )
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="max_amount" className="text-foreground">{t('transactions.maxAmount')}</Label>
                                <Input
                                    id="max_amount"
                                    type="number"
                                    placeholder="€ Max"
                                    className="text-foreground placeholder:text-muted-foreground"
                                    value={localFilters.max_amount ?? ""}
                                    onChange={(e) =>
                                        updateFilter(
                                            "max_amount",
                                            e.target.value ? Number(e.target.value) : undefined
                                        )
                                    }
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <Separator />

                {/* Date Range Section */}
                <div className="space-y-4">
                    <h3 className="text-sm font-medium text-foreground">
                        {t('transactions.dateRange')}
                    </h3>

                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label htmlFor="min_date" className="text-foreground">{t('transactions.fromDate')}</Label>
                                <Input
                                    id="min_date"
                                    type="date"
                                    className="text-foreground"
                                    value={localFilters.min_date ?? ""}
                                    onChange={(e) =>
                                        updateFilter("min_date", e.target.value || undefined)
                                    }
                                    onClick={(e) => { try { e.currentTarget.showPicker(); } catch (err) { } }}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="max_date" className="text-foreground">{t('transactions.toDate')}</Label>
                                <Input
                                    id="max_date"
                                    type="date"
                                    className="text-foreground"
                                    value={localFilters.max_date ?? ""}
                                    onChange={(e) =>
                                        updateFilter("max_date", e.target.value || undefined)
                                    }
                                    onClick={(e) => { try { e.currentTarget.showPicker(); } catch (err) { } }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="p-2.5 border-t border-gray-200 dark:border-border bg-gray-50/50 dark:bg-muted/30 flex gap-2">
                <Button variant="outline" size="sm" onClick={handleReset} className="flex-1 h-7.5 px-2 text-[11px] font-medium text-foreground whitespace-nowrap">
                    <RotateCcw className="mr-1 h-3 w-3 shrink-0" />
                    {t('transactions.reset')}
                </Button>
                <Button size="sm" onClick={handleApply} className="flex-1 h-7.5 px-2 text-[11px] font-medium whitespace-nowrap">
                    {t('transactions.applyFilters')}
                </Button>
            </div>
        </div>
    )
}
