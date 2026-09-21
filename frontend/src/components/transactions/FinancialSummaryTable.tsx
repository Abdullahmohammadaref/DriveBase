import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import type { TransactionFinancialSummary } from "@/types/transaction"

interface FinancialSummaryTableProps {
    summary?: TransactionFinancialSummary
    isLoading?: boolean
}

/**
 * Financial summary showing 9 cards in a single continuous ribbon:
 * Net Revenue, Net Expenses, Net Profit,
 * Tax Revenue, Tax Expenses, Total Tax,
 * Gross Revenue, Gross Expenses, Gross Difference.
 */
export function FinancialSummaryTable({
    summary,
    isLoading,
}: FinancialSummaryTableProps) {
    const { t } = useTranslation()

    if (isLoading) {
        return (
            <div className="rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card p-2 shadow-xs">
                <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
                    {[...Array(9)].map((_, i) => (
                        <div key={i} className="h-10 animate-pulse bg-muted rounded" />
                    ))}
                </div>
            </div>
        )
    }

    const parseValue = (value: string | number | undefined): number => {
        if (value === undefined) return 0
        if (typeof value === 'string') return parseFloat(value) || 0
        return value
    }

    const formatCurrency = (value: string | number | undefined) => {
        const numValue = parseValue(value)
        return new Intl.NumberFormat("de-DE", {
            style: "currency",
            currency: "EUR",
            maximumFractionDigits: 0,
        }).format(numValue)
    }

    const cards = [
        { label: t("transactions.summaryTable.netRevenue", "Net Revenue"), value: summary?.net_total_revenue, color: "text-[#318d6c]" },
        { label: t("transactions.summaryTable.netExpenses", "Net Expenses"), value: summary?.net_total_expenses, color: "text-[#d23a69]" },
        { label: t("transactions.summaryTable.netProfit", "Net Profit"), value: summary?.net_difference, color: parseValue(summary?.net_difference) >= 0 ? "text-[#318d6c]" : "text-[#d23a69]" },
        
        { label: t("transactions.summaryTable.taxRevenue", "Tax Revenue"), value: summary?.tax_total_revenue, color: "text-[#318d6c]" },
        { label: t("transactions.summaryTable.taxExpenses", "Tax Expenses"), value: summary?.tax_total_expenses, color: "text-[#d23a69]" },
        { label: t("transactions.summaryTable.totalTax", "Total Tax"), value: summary?.tax_difference, color: parseValue(summary?.tax_difference) >= 0 ? "text-[#318d6c]" : "text-[#d23a69]" },
        
        { label: t("transactions.summaryTable.grossRevenue", "Gross Revenue"), value: summary?.gross_total_revenue, color: "text-[#318d6c]" },
        { label: t("transactions.summaryTable.grossExpenses", "Gross Expenses"), value: summary?.gross_total_expenses, color: "text-[#d23a69]" },
        { label: t("transactions.summaryTable.grossDifference", "Gross Difference"), value: summary?.gross_difference, color: parseValue(summary?.gross_difference) >= 0 ? "text-[#318d6c]" : "text-[#d23a69]" },
    ]

    return (
        <section className="overflow-hidden rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card shadow-xs">
            <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 lg:divide-x lg:divide-gray-100 dark:divide-border">
                {cards.map((card, i) => (
                    <div key={i} className="min-w-0 border-b border-gray-100 dark:border-border px-3 py-1.5 lg:border-b-0">
                        <div className="truncate text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-muted-foreground">
                            {card.label}
                        </div>
                        <div className={cn("truncate text-[13px] font-bold font-mono", card.color)}>
                            {formatCurrency(card.value)}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    )
}
