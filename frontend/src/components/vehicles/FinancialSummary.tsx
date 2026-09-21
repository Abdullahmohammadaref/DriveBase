import { TrendingUp, TrendingDown, DollarSign, BarChart3, Target, Clock, Scale } from "lucide-react"
import { useTranslation } from "react-i18next"
import { formatCurrency } from "@/lib/utils"
import {
    formatPercent,
} from "@/lib/vehicleFinancials"
import type { FinancialSummary } from "@/types/vehicle"

interface FinancialSummaryCardProps {
    summary: FinancialSummary | undefined
    isLoading: boolean
}

export function FinancialSummaryCard({
    summary,
    isLoading,
}: FinancialSummaryCardProps) {
    const { t } = useTranslation()
    if (isLoading || !summary) {
        return (
            <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
                {[1, 2, 3, 4, 5].map((i) => (
                    <div
                        key={i}
                        className="animate-pulse rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card p-2.5 shadow-xs"
                    >
                        <div className="h-3 w-16 rounded bg-muted" />
                        <div className="mt-1.5 h-5 w-20 rounded bg-muted" />
                    </div>
                ))}
            </div>
        )
    }

    // Calculate derived aggregate metrics
    const profitMargin = summary.net_total_revenue !== 0
        ? Math.round((summary.gross_difference / summary.net_total_revenue) * 100 * 10) / 10
        : null

    const roi = summary.net_total_expenses !== 0
        ? Math.round((summary.gross_difference / summary.net_total_expenses) * 100 * 10) / 10
        : null

    const vatLiability = summary.tax_difference !== undefined && summary.tax_difference !== 0
        ? Math.abs(summary.tax_difference)
        : Math.abs(summary.tax_total_revenue - summary.tax_total_expenses)
    const totalProfit = summary.total_profit !== undefined && summary.total_profit !== null
        ? summary.total_profit
        : summary.net_difference - vatLiability

    const cards = [
        {
            label: t("financialSummary.grossRevenue", "Gross Revenue"),
            value: summary.gross_total_revenue,
            subLabel: t("financialSummary.net", "Net"),
            subValue: summary.net_total_revenue,
            icon: TrendingUp,
            color: "text-[#318d6c]",
            bgColor: "bg-emerald-500/10",
        },
        {
            label: t("financialSummary.grossExpenses", "Gross Expenses"),
            value: summary.gross_total_expenses,
            subLabel: t("financialSummary.net", "Net"),
            subValue: summary.net_total_expenses,
            icon: TrendingDown,
            color: "text-[#d23a69]",
            bgColor: "bg-rose-500/10",
        },
        {
            label: t("financialSummary.grossProfit", "Gross Profit"),
            value: summary.gross_difference,
            subLabel: t("financialSummary.net", "Net"),
            subValue: summary.net_difference,
            icon: DollarSign,
            color: summary.gross_difference >= 0 ? "text-[#318d6c]" : "text-[#d23a69]",
            bgColor: summary.gross_difference >= 0 ? "bg-emerald-500/10" : "bg-rose-500/10",
        },
        {
            label: t("financialSummary.totalProfit", "Total Profit"),
            value: totalProfit,
            subText: t("financialSummary.netProfitMinusVat", "Net Profit − VAT Liability"),
            icon: DollarSign,
            color: totalProfit >= 0 ? "text-[#318d6c]" : "text-[#d23a69]",
            bgColor: totalProfit >= 0 ? "bg-emerald-500/10" : "bg-rose-500/10",
        },
        {
            label: t("financialSummary.vatLiability", "VAT Liability"),
            value: vatLiability,
            subText: t("financialSummary.vatFormula", "|Sale VAT − Buy VAT|"),
            icon: Scale,
            color: "text-[#d97706]",
            bgColor: "bg-amber-500/10",
        },
    ]

    return (
        <div className="space-y-2">
            {/* Primary financial cards — 5 card grid */}
            <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
                {cards.map((card) => {
                    const Icon = card.icon
                    return (
                        <div
                            key={card.label}
                            className="rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card p-2.5 shadow-xs"
                        >
                            <div className="flex items-center gap-2.5">
                                <div
                                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${card.bgColor}`}
                                >
                                    <Icon className={`h-4 w-4 ${card.color}`} />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-muted-foreground truncate">{card.label}</p>
                                    <p className={`text-[15px] font-bold font-mono ${card.color} truncate`}>
                                        {formatCurrency(card.value)}
                                    </p>
                                    {card.subLabel !== undefined ? (
                                        <p className="text-[10px] text-gray-400 dark:text-muted-foreground truncate font-mono">
                                            {card.subLabel}: {formatCurrency(card.subValue ?? 0)}
                                        </p>
                                    ) : (
                                        <p className="text-[10px] text-gray-400 dark:text-muted-foreground truncate font-mono">
                                            {card.subText}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Secondary metrics strip — margin, ROI, Days on Stock */}
            {(profitMargin !== null || roi !== null || summary.avg_days_on_stock !== undefined) && (
                <div className="flex flex-wrap items-center gap-3 rounded-md border border-gray-200 dark:border-border bg-white dark:bg-card px-3 py-1 shadow-xs divide-x divide-gray-100 dark:divide-border text-xs">
                    {profitMargin !== null && (
                        <div className="flex items-center gap-1.5 first:pl-0 pl-3">
                            <BarChart3 className="h-3 w-3 text-muted-foreground" />
                            <span className="text-[11px] text-muted-foreground">{t("financialSummary.avgMargin", "Avg Margin:")}</span>
                            <span className={`font-mono font-bold ${profitMargin >= 0 ? "text-[#318d6c]" : "text-[#d23a69]"}`}>
                                {formatPercent(profitMargin)}
                            </span>
                        </div>
                    )}
                    {roi !== null && (
                        <div className="flex items-center gap-1.5 pl-3">
                            <Target className="h-3 w-3 text-muted-foreground" />
                            <span className="text-[11px] text-muted-foreground">{t("financialSummary.roi", "ROI:")}</span>
                            <span className={`font-mono font-bold ${roi >= 0 ? "text-[#318d6c]" : "text-[#d23a69]"}`}>
                                {formatPercent(roi)}
                            </span>
                        </div>
                    )}
                    {summary.avg_days_on_stock !== undefined && (
                        <div className="flex items-center gap-1.5 pl-3">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span className="text-[11px] text-muted-foreground">{t("financialSummary.avgDaysOnStock", "Avg Days on Stock:")}</span>
                            <span className="font-mono font-bold text-[#d97706]">
                                {summary.avg_days_on_stock}d
                            </span>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
