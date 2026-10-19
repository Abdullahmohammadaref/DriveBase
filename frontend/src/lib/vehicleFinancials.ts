/**
 * Vehicle Financial Calculations — Pure Utility Functions
 *
 * Every financial variable in the DriveBase system is computed here.
 * All pages import from this single source. No calculation logic
 * is duplicated across components.
 *
 * Functions are pure: numbers in → numbers out, no side effects.
 * Nulls and division-by-zero are handled safely (return null or 0).
 */

// =============================================================================
// Configuration
// =============================================================================

/** Annual target return rate for holding cost calculation (10%) */
export const ANNUAL_TARGET_RATE = 0.10

/** Target margin for break-even price calculation (10%) */
export const TARGET_MARGIN = 0.10

// =============================================================================
// Helpers
// =============================================================================

function roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100
}

function safeNum(value: number | string | null | undefined): number | null {
    if (value === null || value === undefined) return null
    const n = typeof value === "string" ? parseFloat(value) : value
    return Number.isNaN(n) || !Number.isFinite(n) ? null : n
}

// =============================================================================
// Buy Side
// =============================================================================

/** buyNet = buyGross − buyTax */
export function calcBuyNet(
    buyGross: number | null | undefined,
    buyTax: number | null | undefined,
): number | null {
    const g = safeNum(buyGross)
    const t = safeNum(buyTax)
    if (g === null) return null
    return roundMoney(g - (t ?? 0))
}

/** Calculate buyTax from gross price and tax percentage */
export function calcBuyTaxAmount(
    buyGross: number | null | undefined,
    taxPercentage: number | null | undefined,
): number | null {
    const g = safeNum(buyGross)
    const pct = safeNum(taxPercentage)
    if (g === null) return null
    if (pct === null || pct === 0) return 0
    const divisor = 1 + pct / 100
    return roundMoney(g - g / divisor)
}

/** Calculate buyNet from gross and tax percentage */
export function calcBuyNetFromPercentage(
    buyGross: number | null | undefined,
    taxPercentage: number | null | undefined,
): number | null {
    const g = safeNum(buyGross)
    const pct = safeNum(taxPercentage)
    if (g === null) return null
    if (pct === null || pct === 0) return g
    const divisor = 1 + pct / 100
    return roundMoney(g / divisor)
}

// =============================================================================
// Sale Side
// =============================================================================

/** saleNet = saleGross − saleTax */
export function calcSaleNet(
    saleGross: number | null | undefined,
    saleTax: number | null | undefined,
): number | null {
    const g = safeNum(saleGross)
    const t = safeNum(saleTax)
    if (g === null) return null
    return roundMoney(g - (t ?? 0))
}

/** Calculate saleTax from gross price and tax percentage */
export function calcSaleTaxAmount(
    saleGross: number | null | undefined,
    taxPercentage: number | null | undefined,
): number | null {
    const g = safeNum(saleGross)
    const pct = safeNum(taxPercentage)
    if (g === null) return null
    if (pct === null || pct === 0) return 0
    const divisor = 1 + pct / 100
    return roundMoney(g - g / divisor)
}

/** Calculate saleNet from gross and tax percentage */
export function calcSaleNetFromPercentage(
    saleGross: number | null | undefined,
    taxPercentage: number | null | undefined,
): number | null {
    const g = safeNum(saleGross)
    const pct = safeNum(taxPercentage)
    if (g === null) return null
    if (pct === null || pct === 0) return g
    const divisor = 1 + pct / 100
    return roundMoney(g / divisor)
}

// =============================================================================
// Transaction Aggregation
// =============================================================================

export interface TransactionForCalc {
    amount: number | string | null
    tax: number | string | null
}

export interface ExpenseEarningForCalc {
    type: "expense" | "earning"
    amount: number | string | null
}

/** txnNet = txnGross − (txnGross × taxPct / (100 + taxPct)) */
export function calcTxnNet(
    txnGross: number | string | null | undefined,
    taxPercentage: number | string | null | undefined,
): number | null {
    const g = safeNum(txnGross)
    const pct = safeNum(taxPercentage)
    if (g === null) return null
    if (pct === null || pct === 0) return g
    const divisor = 1 + pct / 100
    return roundMoney(g / divisor)
}

/** totalTxnCost = Σ txnNet across all linked transactions */
export function calcTotalTxnCost(
    transactions: TransactionForCalc[] | null | undefined,
): number {
    if (!transactions || transactions.length === 0) return 0
    return roundMoney(
        transactions.reduce((sum, txn) => {
            const net = calcTxnNet(txn.amount, txn.tax)
            return sum + (net ?? 0)
        }, 0),
    )
}

/** Count of transactions linked to this vehicle */
export function countLinkedTransactions(
    transactions: TransactionForCalc[] | null | undefined,
): number {
    return transactions?.length ?? 0
}

/** netExpensesEarnings = Σ earning amounts − Σ expense amounts (matching the card's signed NET value) */
export function calcNetExpensesEarnings(
    entries: ExpenseEarningForCalc[] | null | undefined,
): number {
    if (!entries || entries.length === 0) return 0
    return roundMoney(
        entries.reduce((sum, e) => {
            const amt = safeNum(e.amount) ?? 0
            return sum + (e.type === "earning" ? amt : -amt)
        }, 0),
    )
}

// =============================================================================
// Derived Metrics
// =============================================================================

/** COGS = buyNet + netExpensesEarnings */
export function calcCOGS(
    buyNet: number | null | undefined,
    netExpensesEarnings: number | null | undefined = 0,
): number | null {
    const bn = safeNum(buyNet)
    if (bn === null) return null
    return roundMoney(bn + (safeNum(netExpensesEarnings) ?? 0))
}

/** Gross COGS = buyGross + netExpensesEarnings */
export function calcGrossCOGS(
    buyGross: number | null | undefined,
    netExpensesEarnings: number | null | undefined = 0,
): number | null {
    const bg = safeNum(buyGross)
    if (bg === null) return null
    return roundMoney(bg + (safeNum(netExpensesEarnings) ?? 0))
}

/** grossProfit = (saleGross − buyGross) + netExpensesEarnings */
export function calcGrossProfit(
    saleGross: number | null | undefined,
    buyGross: number | null | undefined,
    netExpensesEarnings: number | null | undefined = 0,
): number | null {
    const sg = safeNum(saleGross)
    const bg = safeNum(buyGross)
    if (sg === null || bg === null) return null
    const netExp = safeNum(netExpensesEarnings) ?? 0
    return roundMoney(sg - bg + netExp)
}

/** netProfit = (saleNet − buyNet) + netExpensesEarnings */
export function calcNetProfit(
    saleNet: number | null | undefined,
    buyNet: number | null | undefined,
    netExpensesEarnings: number | null | undefined = 0,
): number | null {
    const sn = safeNum(saleNet)
    const bn = safeNum(buyNet)
    if (sn === null || bn === null) return null
    const netExp = safeNum(netExpensesEarnings) ?? 0
    return roundMoney(sn - bn + netExp)
}

/** totalProfit = netProfit − taxLiability  (the real bottom line) */
export function calcTotalProfit(
    netProfit: number | null | undefined,
    taxLiability: number | null | undefined,
): number | null {
    const np = safeNum(netProfit)
    if (np === null) return null
    return roundMoney(np - (safeNum(taxLiability) ?? 0))
}

/** revenue = saleNet */
export function calcRevenue(
    saleNet: number | null | undefined,
): number | null {
    return safeNum(saleNet)
}

/** profitMargin = (grossProfit ÷ saleNet) × 100, displayed as % */
export function calcProfitMargin(
    grossProfit: number | null | undefined,
    saleNet: number | null | undefined,
): number | null {
    const gp = safeNum(grossProfit)
    const sn = safeNum(saleNet)
    if (gp === null || sn === null || sn === 0) return null
    return roundMoney((gp / sn) * 100)
}

/** ROI = (grossProfit ÷ COGS) × 100, displayed as % */
export function calcROI(
    grossProfit: number | null | undefined,
    cogs: number | null | undefined,
): number | null {
    const gp = safeNum(grossProfit)
    const c = safeNum(cogs)
    if (gp === null || c === null || c === 0) return null
    return roundMoney((gp / c) * 100)
}

/** daysOnStock = saleDate − purchaseDate (or today − purchaseDate if unsold) */
export function calcDaysOnStock(
    purchaseDate: string | null | undefined,
    saleDate: string | null | undefined,
): number | null {
    if (!purchaseDate) return null
    const buy = new Date(purchaseDate)
    if (isNaN(buy.getTime())) return null
    const end = saleDate ? new Date(saleDate) : new Date()
    if (isNaN(end.getTime())) return null
    const diffMs = end.getTime() - buy.getTime()
    return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)))
}

/** holdingCost = COGS × (annualRate ÷ 365) × daysOnStock */
export function calcHoldingCost(
    cogs: number | null | undefined,
    daysOnStock: number | null | undefined,
    annualTargetRate: number = ANNUAL_TARGET_RATE,
): number | null {
    const c = safeNum(cogs)
    const d = safeNum(daysOnStock)
    if (c === null || d === null) return null
    return roundMoney(c * (annualTargetRate / 365) * d)
}

/** adjustedProfit = totalProfit − holdingCost */
export function calcAdjustedProfit(
    totalProfit: number | null | undefined,
    holdingCost: number | null | undefined,
): number | null {
    const tp = safeNum(totalProfit)
    const hc = safeNum(holdingCost)
    if (tp === null) return null
    return roundMoney(tp - (hc ?? 0))
}

/**
 * taxLiability = |saleTaxAmount − buyTaxAmount|
 *
 * Represents the net VAT the business owes the government (Umsatzsteuerzahllast).
 * Both amounts are treated as positive (absolute values) before subtracting,
 * then the result is made absolute to handle the loss case (negative VAT → refund).
 *
 * Returns null if saleTaxAmount is null (sale not set yet, cannot compute liability).
 */
export function calcTaxLiability(
    buyTaxAmount: number | null | undefined,
    saleTaxAmount: number | null | undefined,
): number | null {
    const b = safeNum(buyTaxAmount)
    const s = safeNum(saleTaxAmount)
    if (s === null) return null
    return roundMoney(Math.abs(Math.abs(s) - Math.abs(b ?? 0)))
}

/** breakEvenPrice = COGS × (1 + targetMargin) */
export function calcBreakEvenPrice(
    cogs: number | null | undefined,
    targetMargin: number = TARGET_MARGIN,
): number | null {
    const c = safeNum(cogs)
    if (c === null) return null
    return roundMoney(c * (1 + targetMargin))
}

// =============================================================================
// Full Financial Summary (convenience)
// =============================================================================

export interface VehicleFinancials {
    // Buy side
    buyGross: number | null
    buyTax: number | null
    buyNet: number | null
    // Sale side
    saleGross: number | null
    saleTax: number | null
    saleNet: number | null
    // Expenses & Earnings
    netExpensesEarnings: number
    // Derived
    cogs: number | null
    grossCogs: number | null
    grossProfit: number | null
    netProfit: number | null
    totalProfit: number | null
    revenue: number | null
    profitMargin: number | null
    roi: number | null
    daysOnStock: number | null
    // VAT Liability — replaces Txn Expenses display; the net VAT owed to government
    taxLiability: number | null
    // COMMENTED OUT — recoverable: uncomment calc call in calcVehicleFinancials + MetricCell in FinancialMetricsStrip
    // holdingCost: number | null
    // adjustedProfit: number | null
    breakEvenPrice: number | null
}

export interface CalcVehicleFinancialsInput {
    buyGross: number | null | undefined
    buyTaxPercentage: number | null | undefined
    saleGross: number | null | undefined
    saleTaxPercentage: number | null | undefined
    buyDate: string | null | undefined
    saleDate: string | null | undefined
    transactions?: TransactionForCalc[] | null
    entries?: ExpenseEarningForCalc[] | null
    annualTargetRate?: number
    targetDaysOnStock?: number
    status?: string | null
}

/**
 * Calculate ALL financial metrics for a single vehicle in one call.
 * This is the main entry point used by detail/edit pages.
 */
export function calcVehicleFinancials(input: CalcVehicleFinancialsInput): VehicleFinancials {
    const buyGross = safeNum(input.buyGross)
    const buyTax = calcBuyTaxAmount(buyGross, input.buyTaxPercentage)
    const buyNet = calcBuyNetFromPercentage(buyGross, input.buyTaxPercentage)

    let { saleGross: rawSaleGross, saleTaxPercentage: rawSaleTaxPct, saleDate: rawSaleDate } = input;
    if (input.status === "purchased" || input.status === "inactive") {
        rawSaleGross = null;
        rawSaleTaxPct = null;
        rawSaleDate = null;
    }

    const saleGross = safeNum(rawSaleGross)
    const saleTax = calcSaleTaxAmount(saleGross, rawSaleTaxPct)
    const saleNet = calcSaleNetFromPercentage(saleGross, rawSaleTaxPct)

    const netExpensesEarnings = calcNetExpensesEarnings(input.entries)

    const cogs = calcCOGS(buyNet, netExpensesEarnings)
    const grossCogs = calcGrossCOGS(buyGross, netExpensesEarnings)
    const grossProfit = calcGrossProfit(saleGross, buyGross, netExpensesEarnings)
    const netProfit = calcNetProfit(saleNet, buyNet, netExpensesEarnings)
    const taxLiability = calcTaxLiability(buyTax, saleTax)
    const totalProfit = calcTotalProfit(netProfit, taxLiability)
    const revenue = calcRevenue(saleNet)
    const profitMargin = calcProfitMargin(grossProfit, saleNet)
    const roi = calcROI(grossProfit, cogs)
    const daysOnStock = calcDaysOnStock(input.buyDate, rawSaleDate)
    // COMMENTED OUT — re-enable when holding cost logic is re-implemented correctly
    // const holdingCost = calcHoldingCost(cogs, daysOnStock, input.annualTargetRate)
    // const adjustedProfit = calcAdjustedProfit(totalProfit, holdingCost)
    const breakEvenPrice = calcBreakEvenPrice(
        cogs,
        input.annualTargetRate != null ? input.annualTargetRate / 100 : TARGET_MARGIN
    )

    return {
        buyGross,
        buyTax,
        buyNet,
        saleGross,
        saleTax,
        saleNet,
        netExpensesEarnings,
        cogs,
        grossCogs,
        grossProfit,
        netProfit,
        totalProfit,
        revenue,
        profitMargin,
        roi,
        daysOnStock,
        taxLiability,
        // holdingCost,     // COMMENTED OUT
        // adjustedProfit,  // COMMENTED OUT
        breakEvenPrice,
    }
}

// =============================================================================
// Color System — Consistent variable → color mapping
// =============================================================================

/**
 * Returns Tailwind color classes for a financial variable name.
 * Each variable has one consistent color across the entire app.
 */
export function getFinancialColor(variable: string): string {
    const colors: Record<string, string> = {
        buyGross: "text-blue-700 dark:text-blue-300",
        buyTax: "text-emerald-600 dark:text-emerald-400",
        buyNet: "text-sky-600 dark:text-sky-400",
        saleGross: "text-teal-600 dark:text-teal-400",
        saleTax: "text-teal-800 dark:text-teal-300",
        saleNet: "text-cyan-600 dark:text-cyan-400",
        txnGross: "text-amber-600 dark:text-amber-400",
        txnTax: "text-orange-600 dark:text-orange-400",
        txnNet: "text-yellow-700 dark:text-amber-300",
        totalTxnCost: "text-pink-600 dark:text-pink-400",
        netExpensesEarnings: "text-amber-600 dark:text-amber-400",
        cogs: "text-slate-600 dark:text-slate-400",
        grossCogs: "text-slate-600 dark:text-slate-400",
        grossProfit: "text-purple-600 dark:text-purple-400",
        netProfit: "text-violet-700 dark:text-violet-400",
        totalProfit: "text-indigo-600 dark:text-indigo-400",
        revenue: "text-rose-600 dark:text-rose-400",
        profitMargin: "text-purple-500 dark:text-purple-300",
        roi: "text-fuchsia-600 dark:text-fuchsia-400",
        daysOnStock: "text-slate-600 dark:text-slate-400",
        taxLiability: "text-orange-600 dark:text-orange-400",
        holdingCost: "text-red-600 dark:text-red-400",
        adjustedProfit: "text-red-700 dark:text-red-300",
        breakEvenPrice: "text-amber-700 dark:text-amber-500",
    }
    return colors[variable] ?? "text-foreground"
}

/**
 * Returns color classes for profit/loss values (positive = variable color, negative = red).
 */
export function getProfitColor(value: number | null): string {
    if (value === null || value === 0) return "text-muted-foreground"
    return value > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"
}

/**
 * Returns color for totalProfit specifically — the most important metric.
 */
export function getTotalProfitColor(value: number | null): string {
    if (value === null || value === 0) return "text-muted-foreground"
    return value > 0 ? "text-indigo-600 dark:text-indigo-400" : "text-red-500 dark:text-red-400"
}

/**
 * Returns urgency color for days on stock.
 * Green < (target/2), Amber (target/2) to target, Red > target.
 */
export function getDaysOnStockColor(days: number | null, targetDays: number = 45): string {
    if (days === null) return "text-muted-foreground"
    if (days < targetDays * 0.5) return "text-emerald-600 dark:text-emerald-400"
    if (days <= targetDays) return "text-amber-600 dark:text-amber-400"
    return "text-red-500 dark:text-red-400"
}

/**
 * Returns background badge color for days on stock urgency dot.
 */
export function getDaysOnStockBgColor(days: number | null, targetDays: number = 45): string {
    if (days === null) return "bg-slate-400"
    if (days < targetDays * 0.5) return "bg-emerald-500"
    if (days <= targetDays) return "bg-amber-500"
    return "bg-red-500"
}

// =============================================================================
// Formatting Helpers
// =============================================================================

/** Format as percentage with 1 decimal */
export function formatPercent(value: number | null): string {
    if (value === null) return "—"
    return `${value.toFixed(1)}%`
}

/** Format days on stock */
export function formatDays(value: number | null): string {
    if (value === null) return "—"
    return `${value}d`
}
