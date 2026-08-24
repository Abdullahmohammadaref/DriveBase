import { useState } from "react"
import { X } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import {
    type VehicleFinancials,
    formatPercent,
} from "@/lib/vehicleFinancials"

interface FinancialMetricsStripProps {
    financials: VehicleFinancials
    hideTransactions?: boolean
    compact?: boolean
    annualTargetRate?: number
}

interface KpiStep {
    label: string
    value: string
}

interface KpiItem {
    id: string
    label: string
    value: string
    tone?: "success" | "warning" | "danger" | "neutral"
    formula: string
    steps: KpiStep[]
}

function KpiModal({ kpi, onClose }: { kpi: KpiItem; onClose: () => void }) {
    return (
        <div
            className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            aria-label={`${kpi.label} calculation`}
            onClick={onClose}
        >
            <div
                className="w-full max-w-sm overflow-hidden rounded-lg border border-border bg-background shadow-lg animate-in fade-in-0 zoom-in-95"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                    <h3 className="text-[13px] font-semibold text-heading">{kpi.label}</h3>
                    <button
                        aria-label="Close"
                        onClick={onClose}
                        className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                        <X className="size-3.5" />
                    </button>
                </div>
                <div className="px-3 py-2.5">
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            Final value
                        </span>
                        <span className="text-[18px] font-semibold text-heading">{kpi.value}</span>
                    </div>
                    <div className="mb-2 rounded-md bg-secondary px-2 py-1 text-[11px] text-muted-foreground font-mono">
                        {kpi.formula}
                    </div>
                    <div className="divide-y divide-border rounded-md border border-border">
                        {kpi.steps.map((s, idx) => (
                            <div key={idx} className="flex items-center justify-between gap-2 px-2 py-1.5">
                                <span
                                    className={
                                        "truncate text-[12px] " +
                                        (s.label.startsWith("=")
                                            ? "font-semibold text-heading"
                                            : "text-muted-foreground")
                                    }
                                >
                                    {s.label}
                                </span>
                                <span
                                    className={
                                        "shrink-0 text-[12px] font-mono " +
                                        (s.label.startsWith("=") ? "font-semibold text-heading" : "text-foreground")
                                    }
                                >
                                    {s.value}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="flex justify-end border-t border-border px-3 py-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-7 rounded-md border border-border bg-background px-2.5 text-[12px] font-medium hover:bg-accent"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    )
}

export function FinancialMetricsStrip({
    financials: f,
    hideTransactions = false,
    compact = false,
    annualTargetRate = 10,
}: FinancialMetricsStripProps) {
    const [activeKpi, setActiveKpi] = useState<KpiItem | null>(null)
    const hasSale = f.saleGross !== null
    const hasBuy = f.buyGross !== null

    if (!hasBuy && !hasSale) return null

    const fc = (v: number | null | undefined) => (v !== null && v !== undefined ? formatCurrency(v) : "—")

    // Build KPI items
    const kpiList: KpiItem[] = []

    // 1. COGS
    kpiList.push({
        id: "cogs",
        label: "COGS",
        value: fc(f.cogs),
        tone: "neutral",
        formula: "Buy Net + Expenses",
        steps: [
            { label: "Buy Net", value: fc(f.buyNet) },
            { label: "+ Net Expenses", value: fc(f.netExpensesEarnings || 0) },
            { label: "= Total COGS", value: fc(f.cogs) },
        ],
    })

    // 2. VAT Liability
    if (!hideTransactions) {
        kpiList.push({
            id: "vat",
            label: "VAT Liability",
            value: fc(f.taxLiability),
            tone: f.taxLiability && f.taxLiability > 0 ? "warning" : "neutral",
            formula: "|Sale VAT − Buy VAT|",
            steps: [
                { label: "Sale VAT", value: fc(f.saleTax) },
                { label: "Buy VAT", value: fc(f.buyTax) },
                { label: "= Net VAT Liability", value: fc(f.taxLiability) },
            ],
        })
    }

    // 3. Break-Even
    kpiList.push({
        id: "break-even",
        label: "Break-Even",
        value: fc(f.breakEvenPrice),
        tone: "warning",
        formula: `COGS × (1 + Target Return ${annualTargetRate}%)`,
        steps: [
            { label: "COGS", value: fc(f.cogs) },
            { label: "Target Return Rate", value: `${annualTargetRate}%` },
            { label: "= Break-Even Price", value: fc(f.breakEvenPrice) },
        ],
    })

    // 4. Gross Profit
    kpiList.push({
        id: "gross-profit",
        label: "Gross Profit",
        value: fc(f.grossProfit),
        tone: f.grossProfit !== null && f.grossProfit >= 0 ? "success" : f.grossProfit !== null ? "danger" : "neutral",
        formula: "Sale Gross − Buy Gross + Expenses/Earnings",
        steps: [
            { label: "Sale Gross", value: fc(f.saleGross) },
            { label: "− Buy Gross", value: fc(f.buyGross) },
            { label: "+ Net Expenses/Earnings", value: fc(f.netExpensesEarnings) },
            { label: "= Gross Profit", value: fc(f.grossProfit) },
        ],
    })

    // 5. Net Profit
    kpiList.push({
        id: "net-profit",
        label: "Net Profit",
        value: fc(f.netProfit),
        tone: f.netProfit !== null && f.netProfit >= 0 ? "success" : f.netProfit !== null ? "danger" : "neutral",
        formula: "Sale Net − Buy Net + Expenses/Earnings",
        steps: [
            { label: "Sale Net", value: fc(f.saleNet) },
            { label: "− Buy Net", value: fc(f.buyNet) },
            { label: "+ Net Expenses/Earnings", value: fc(f.netExpensesEarnings) },
            { label: "= Net Profit", value: fc(f.netProfit) },
        ],
    })

    // 6. Total Profit
    kpiList.push({
        id: "total-profit",
        label: "Total Profit",
        value: fc(f.totalProfit),
        tone: f.totalProfit !== null && f.totalProfit >= 0 ? "success" : f.totalProfit !== null ? "danger" : "neutral",
        formula: "Net Profit − VAT Liability",
        steps: [
            { label: "Net Profit", value: fc(f.netProfit) },
            { label: "− VAT Liability", value: fc(f.taxLiability) },
            { label: "= Total Profit", value: fc(f.totalProfit) },
        ],
    })

    // 7. Margin
    kpiList.push({
        id: "margin",
        label: "Margin",
        value: f.profitMargin !== null ? formatPercent(f.profitMargin) : "—",
        tone: f.profitMargin !== null && f.profitMargin >= 0 ? "success" : f.profitMargin !== null ? "danger" : "neutral",
        formula: "Gross Profit ÷ Sale Net × 100",
        steps: [
            { label: "Gross Profit", value: fc(f.grossProfit) },
            { label: "Sale Net", value: fc(f.saleNet) },
            { label: "= Margin %", value: f.profitMargin !== null ? formatPercent(f.profitMargin) : "—" },
        ],
    })

    // 8. ROI
    kpiList.push({
        id: "roi",
        label: "ROI",
        value: f.roi !== null ? formatPercent(f.roi) : "—",
        tone: f.roi !== null && f.roi >= 0 ? "success" : f.roi !== null ? "danger" : "neutral",
        formula: "Gross Profit ÷ COGS × 100",
        steps: [
            { label: "Gross Profit", value: fc(f.grossProfit) },
            { label: "COGS", value: fc(f.cogs) },
            { label: "= ROI %", value: f.roi !== null ? formatPercent(f.roi) : "—" },
        ],
    })

    if (compact) {
        return (
            <div className="flex items-center gap-2 text-xs">
                {f.totalProfit !== null && (
                    <span className={f.totalProfit >= 0 ? "font-semibold text-success" : "font-semibold text-danger"}>
                        {formatCurrency(f.totalProfit)}
                    </span>
                )}
                {f.profitMargin !== null && (
                    <span className="text-muted-foreground">
                        {formatPercent(f.profitMargin)}
                    </span>
                )}
            </div>
        )
    }

    return (
        <>
            <div className="flex items-center justify-between divide-x divide-gray-200 dark:divide-border overflow-x-auto rounded-md border border-gray-200 dark:border-border bg-white dark:bg-card py-1 px-3 shadow-xs">
                {kpiList.map((k) => (
                    <button
                        key={k.id}
                        type="button"
                        title={`${k.label}: ${k.formula} (Click to see calculation)`}
                        onClick={() => setActiveKpi(k)}
                        className="flex items-center gap-1.5 px-2.5 py-0.5 whitespace-nowrap text-left hover:bg-gray-50/80 dark:hover:bg-muted/40 transition-colors cursor-pointer shrink-0 first:pl-0 last:pr-0"
                    >
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-muted-foreground">
                            {k.label}
                        </span>
                        <span
                            className={
                                "text-xs font-bold font-mono " +
                                (k.tone === "success"
                                    ? "text-[#318d6c]"
                                    : k.tone === "warning"
                                        ? "text-[#d97706]"
                                        : k.tone === "danger"
                                            ? "text-[#d23a69]"
                                            : "text-gray-900 dark:text-foreground")
                            }
                        >
                            {k.value}
                        </span>
                    </button>
                ))}
            </div>

            {activeKpi && <KpiModal kpi={activeKpi} onClose={() => setActiveKpi(null)} />}
        </>
    )
}
