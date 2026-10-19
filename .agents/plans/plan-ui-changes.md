# plan-ui-changes.md — UI Polish & Feature Changes

> **Date:** 2026-05-15
> **Agent target:** Antigravity / Gemini Pro
> **Priority:** Frontend-only. No backend changes required.
> **Pre-read (mandatory):** `idea.md`, `developer-guide.md`, `PROJECT_MAP.md`, `docs-ui-tweaks.md`, `docs-ui-tweak-fix.md`, `docs-ui-tweak-fix-2.md`, `docs-statistics-dashboard.md`

---

## Context Summary

DriveBase is a single-business vehicle management system. The stack is Django + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui. The manager uses light mode on a large monitor. All changes in this plan are **light-mode-only** unless explicitly noted. Dark mode must not be touched.

This plan covers 4 independent features. Implement them in order — each is self-contained but later ones build on established patterns from earlier ones.

---

## Feature 1A — Fix Input Field Background Color in Buy/Sale Cards (Light Mode Only)

### Problem

In light mode, `--background` = `#ffffff` (pure white) and `--card` = `#f7f9fc` (a very subtle blue-white). The `Input` UI component (`frontend/src/components/ui/input.tsx`) uses `bg-transparent` as its base background class. When an `Input` is rendered inside a card (`bg-card`), it inherits the card's `#f7f9fc` background, making it look the same color as the surrounding card rather than pure white.

This is visually most noticeable on:
- **`VehicleForm.tsx`**: Buy Price, Buy Date, Buy Delivery/Collection Date fields (inside the Buy Details card), and Sale Price, Sale Date, Sale Delivery/Collection Date, Commission, Invoice Number fields (inside the Sale Details card)
- **`TransactionForm.tsx`**: The Amount field and Date field inside the Purchase Details card

The `DynamicSelect` and `SearchableSelect` components likely have the same issue but are managed separately — focus only on native `Input` components for this plan.

### Root Cause

In `frontend/src/components/ui/input.tsx`:
```tsx
className={cn(
  "... dark:bg-input/30 border-input h-9 w-full ... rounded-md border bg-transparent ...",
  className
)}
```

`bg-transparent` in light mode makes the input see-through to the `bg-card` parent.

### Fix

**File:** `frontend/src/components/ui/input.tsx`

Change `bg-transparent` to `bg-background` in the base className string. Keep `dark:bg-input/30` exactly as-is — it already handles dark mode correctly.

**Before:**
```
"... dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 ..."
```

**After:**
```
"... dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-background px-3 py-1 ..."
```

That single word change (`bg-transparent` → `bg-background`) fixes all affected inputs globally. It is the correct approach because `--background` = white in light mode. Dark mode is unaffected because `dark:bg-input/30` takes precedence.

**Do NOT add any dark mode overrides.** Do NOT touch any other file for this sub-feature.

**Verify:** After the change, all `<Input>` components inside cards should appear pure white in light mode. Date inputs, number inputs, and text inputs should all be white. Dark mode should look identical to before.

---

## Feature 1B — Give Each FinancialMetricsStrip Cell Its Own Unique Background Color

### Problem

In `frontend/src/components/vehicles/FinancialMetricsStrip.tsx`, the `MetricCell` component currently supports two visual states:
- `highlight=true` → `bg-primary/5 border-primary/20 ring-1 ring-primary/10` (used only by Total Profit)
- default → `bg-background border-border/40`

The user wants every metric cell to have its own distinctive background tint (like Total Profit's blue tint), making them visually distinguishable at a glance.

### Design

Each metric gets a named color scheme. These should be subtle — `bg-{color}/5 border-{color}/20` — matching the existing Total Profit pattern. The visual distinction comes from the border and background tint, not bold color.

| Metric | Color family | Tailwind classes |
|---|---|---|
| COGS | amber | `bg-amber-500/5 border-amber-500/20 hover:border-amber-500/40` |
| Txn Expenses | red | `bg-red-500/5 border-red-500/20 hover:border-red-500/40` |
| Break-Even | purple | `bg-purple-500/5 border-purple-500/20 hover:border-purple-500/40` |
| Holding Cost | orange | `bg-orange-500/5 border-orange-500/20 hover:border-orange-500/40` |
| Adj. Profit | slate | `bg-slate-500/5 border-slate-500/20 hover:border-slate-500/40` |
| Gross Profit | emerald | `bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40` |
| Net Profit | teal | `bg-teal-500/5 border-teal-500/20 hover:border-teal-500/40` |
| Total Profit | primary (keep existing) | `bg-primary/5 border-primary/20 ring-1 ring-primary/10` |
| Margin | violet | `bg-violet-500/5 border-violet-500/20 hover:border-violet-500/40` |
| ROI | cyan | `bg-cyan-500/5 border-cyan-500/20 hover:border-cyan-500/40` |

### Implementation

**File:** `frontend/src/components/vehicles/FinancialMetricsStrip.tsx`

**Step 1** — Add a new prop `accentClasses` to `MetricCell`:

```tsx
function MetricCell({
    label,
    value,
    equation,
    colorClass,
    highlight,
    icon,
    accentClasses,  // NEW: e.g. "bg-amber-500/5 border-amber-500/20 hover:border-amber-500/40"
}: {
    label: string
    value: string
    equation?: string
    colorClass: string
    highlight?: boolean
    icon?: React.ReactNode
    accentClasses?: string  // NEW
})
```

**Step 2** — Update the `MetricCell` className logic:

```tsx
<div
    className={cn(
        `flex flex-col min-w-0 rounded-lg border px-3 py-2 transition-colors`,
        highlight
            ? "bg-primary/5 border-primary/20 ring-1 ring-primary/10"
            : accentClasses
                ? accentClasses
                : "bg-background border-border/40 hover:border-border/70"
    )}
>
```

**Step 3** — Pass `accentClasses` to every `MetricCell` call in the strip:

```tsx
{/* COGS */}
<MetricCell
    label="COGS"
    ...
    accentClasses="bg-amber-500/5 border-amber-500/20 hover:border-amber-500/40"
/>

{/* Txn Expenses */}
<MetricCell
    label="Txn Expenses"
    ...
    accentClasses="bg-red-500/5 border-red-500/20 hover:border-red-500/40"
/>

{/* Break-Even */}
<MetricCell
    label="Break-Even"
    ...
    accentClasses="bg-purple-500/5 border-purple-500/20 hover:border-purple-500/40"
/>

{/* Holding Cost */}
<MetricCell
    label="Holding Cost"
    ...
    accentClasses="bg-orange-500/5 border-orange-500/20 hover:border-orange-500/40"
/>

{/* Adj. Profit */}
<MetricCell
    label="Adj. Profit"
    ...
    accentClasses="bg-slate-500/5 border-slate-500/20 hover:border-slate-500/40"
/>

{/* Gross Profit */}
<MetricCell
    label="Gross Profit"
    ...
    accentClasses="bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40"
/>

{/* Net Profit */}
<MetricCell
    label="Net Profit"
    ...
    accentClasses="bg-teal-500/5 border-teal-500/20 hover:border-teal-500/40"
/>

{/* Total Profit — keep existing highlight=true, no accentClasses needed */}
<MetricCell
    label="Total Profit"
    ...
    highlight
/>

{/* Margin */}
<MetricCell
    label="Margin"
    ...
    accentClasses="bg-violet-500/5 border-violet-500/20 hover:border-violet-500/40"
/>

{/* ROI */}
<MetricCell
    label="ROI"
    ...
    accentClasses="bg-cyan-500/5 border-cyan-500/20 hover:border-cyan-500/40"
/>
```

**Important:** The `compact` mode at the top of `FinancialMetricsStrip` returns early before `MetricCell` is used — do not touch that code path. The `accentClasses` prop has no effect there.

**Do NOT** change the `colorClass` values (the text color per metric) — those come from `getFinancialColor()` / `getProfitColor()` in `vehicleFinancials.ts`. Only the background/border of the cell is changing.

---

## Feature 2 — Add Financial Calculation Strip to Transaction Add/Edit Pages

### Problem

The transaction form (`TransactionForm.tsx`) already computes `netAmount`, `taxAmount`, `grossAmount` from the form's amount and tax fields. These are shown only as a small inline "pill" inside the Purchase Details card header area. The user wants them displayed as proper metric cells — same style as `FinancialMetricsStrip` in the vehicle form.

### What the calculations are

From the existing code in `TransactionForm.tsx`:
```ts
const netAmount = formData.amount || 0
const taxRate = formData.tax || 0
const taxAmount = -(netAmount * (taxRate / 100))   // negative = amount deducted
const grossAmount = netAmount - taxAmount            // = net + |taxAmount|
```

So the three metrics to display are:
- **Net Amount** — the entered amount (neutral color)
- **Tax Amount** — `taxRate`% of net (red/muted color, since it's a cost/deduction)
- **Gross Amount** — the total including tax (green if positive, red if negative)

### Implementation

**File:** `frontend/src/components/transactions/TransactionForm.tsx`

**Step 1** — Create a local `TxnMetricCell` inside the file (or reuse the pattern inline — do NOT import `FinancialMetricsStrip` since that's vehicle-specific). A minimal local version:

```tsx
function TxnMetricCell({
    label,
    value,
    equation,
    colorClass,
    accentClasses,
}: {
    label: string
    value: string
    equation?: string
    colorClass: string
    accentClasses: string
}) {
    return (
        <div className={cn("flex flex-col min-w-0 rounded-lg border px-3 py-2 transition-colors", accentClasses)}>
            <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold truncate">
                    {label}
                </span>
            </div>
            <div className={cn("text-sm font-bold leading-none truncate", colorClass)}>
                {value}
            </div>
            {equation && (
                <div className="text-[9px] text-muted-foreground/40 leading-tight mt-1 truncate font-mono">
                    {equation}
                </div>
            )}
        </div>
    )
}
```

**Step 2** — Add a `formatMoney` helper if not already imported, or use the existing `formatMoney` function already in `TransactionForm.tsx`.

**Step 3** — Insert the calculation strip. The correct placement is **inside the Purchase Details card, immediately below the existing pill (the `div` with `bg-background border-border/40`), before the field grid**. The existing pill at lines ~660-670 can be **removed** (replaced by the new strip), since the new strip conveys the same information more clearly.

Add this block where the pill was:

```tsx
{/* Financial Calculation Strip */}
<div className="rounded-xl border border-border/30 bg-muted/10 p-3 mx-5 mt-4 mb-2">
    <div className="grid grid-cols-3 gap-2">
        <TxnMetricCell
            label="Net Amount"
            value={formatMoney(netAmount)}
            equation="entered amount"
            colorClass={netAmount >= 0 ? "text-foreground" : "text-red-500"}
            accentClasses="bg-teal-500/5 border-teal-500/20 hover:border-teal-500/40"
        />
        <TxnMetricCell
            label={`Tax (${taxRate}%)`}
            value={formatMoney(Math.abs(taxAmount))}
            equation={`${formatMoney(netAmount)} × ${taxRate}%`}
            colorClass="text-amber-600 dark:text-amber-400"
            accentClasses="bg-amber-500/5 border-amber-500/20 hover:border-amber-500/40"
        />
        <TxnMetricCell
            label="Gross Total"
            value={formatMoney(grossAmount)}
            equation={`${formatMoney(netAmount)} + ${formatMoney(Math.abs(taxAmount))}`}
            colorClass={grossAmount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}
            accentClasses="bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40"
        />
    </div>
</div>
```

**Note on placement:** Keep the strip inside the Purchase Details card (inside the `<div className="rounded-xl border border-border bg-card">` for Purchase Details). Remove the old pill completely. The strip renders at all times (add and edit mode), because the calculations are live-reactive to what the user types.

**Step 4 — Split view behaviour:** In split view, this strip should still appear. The grid inside the strip is already `grid-cols-3` which is compact enough for the narrower split layout.

**Do NOT** touch the `FinancialSummaryTable` component or the list-level summary — those are a separate feature (Feature 3 below).

---

## Feature 3 — Replace the Ugly FinancialSummaryTable with a Clean MetricCell Grid

### Problem

`frontend/src/components/transactions/FinancialSummaryTable.tsx` renders a conventional HTML table showing Revenue, Expenses, and Difference broken into Net/Tax/Gross rows. The manager finds this ugly and inconsistent with the metric-cell style used elsewhere. The same table is inlined in `DashboardPage.tsx`.

### Data structure

The data always has these 9 values (from `TransactionFinancialSummary`):
- `net_total_revenue`, `net_total_expenses`, `net_difference`
- `tax_total_revenue`, `tax_total_expenses`, `tax_difference`
- `gross_total_revenue`, `gross_total_expenses`, `gross_difference`

### New Design

Replace the table with a **3-group MetricCell layout**. Organize by type (Net / Tax / Gross), each group showing its 3 values (Revenue, Expenses, Difference) as metric cells side by side.

Visual layout (3 groups × 3 cells = 9 total, displayed as 3 rows of 3):

```
[ Net Revenue ] [ Net Expenses ] [ Net Difference ]
[ Tax Revenue ] [ Tax Expenses ] [ Tax Difference ]
[Gross Revenue] [Gross Expenses] [Gross Difference]
```

Or, equivalently, a flat 9-cell grid `grid-cols-3` with implicit grouping by row label.

### Implementation

**File:** `frontend/src/components/transactions/FinancialSummaryTable.tsx`

Replace the entire component body with a new implementation:

```tsx
import { cn } from "@/lib/utils"
import type { TransactionFinancialSummary } from "@/types/transaction"

interface FinancialSummaryTableProps {
    summary?: TransactionFinancialSummary
    isLoading?: boolean
}

function SummaryCell({
    label,
    value,
    colorClass,
    accentClasses,
}: {
    label: string
    value: number
    colorClass: string
    accentClasses: string
}) {
    const formatted = new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR",
    }).format(value)

    return (
        <div className={cn("flex flex-col min-w-0 rounded-lg border px-3 py-2 transition-colors", accentClasses)}>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold truncate mb-1">
                {label}
            </span>
            <span className={cn("text-sm font-bold leading-none truncate font-mono", colorClass)}>
                {formatted}
            </span>
        </div>
    )
}

export function FinancialSummaryTable({ summary, isLoading }: FinancialSummaryTableProps) {
    if (isLoading) {
        return (
            <div className="rounded-xl border border-border bg-card p-4">
                <div className="h-24 animate-pulse bg-muted rounded" />
            </div>
        )
    }

    const parse = (v: string | number | undefined) =>
        typeof v === "string" ? parseFloat(v) || 0 : v ?? 0

    const rows = [
        {
            label: "Net",
            revenue: parse(summary?.net_total_revenue),
            expenses: parse(summary?.net_total_expenses),
            diff: parse(summary?.net_difference),
            accentRevenue: "bg-teal-500/5 border-teal-500/20 hover:border-teal-500/40",
            accentExpenses: "bg-red-500/5 border-red-500/20 hover:border-red-500/40",
        },
        {
            label: "Tax",
            revenue: parse(summary?.tax_total_revenue),
            expenses: parse(summary?.tax_total_expenses),
            diff: parse(summary?.tax_difference),
            accentRevenue: "bg-amber-500/5 border-amber-500/20 hover:border-amber-500/40",
            accentExpenses: "bg-orange-500/5 border-orange-500/20 hover:border-orange-500/40",
        },
        {
            label: "Gross",
            revenue: parse(summary?.gross_total_revenue),
            expenses: parse(summary?.gross_total_expenses),
            diff: parse(summary?.gross_difference),
            accentRevenue: "bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40",
            accentExpenses: "bg-rose-500/5 border-rose-500/20 hover:border-rose-500/40",
        },
    ]

    return (
        <div className="rounded-xl border border-border/30 bg-muted/10 p-3 space-y-2">
            {rows.map((row) => (
                <div key={row.label} className="grid grid-cols-[40px_1fr_1fr_1fr] gap-2 items-center">
                    {/* Row label */}
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {row.label}
                    </span>
                    {/* Revenue */}
                    <SummaryCell
                        label="Revenue"
                        value={row.revenue}
                        colorClass="text-emerald-600 dark:text-emerald-400"
                        accentClasses={row.accentRevenue}
                    />
                    {/* Expenses */}
                    <SummaryCell
                        label="Expenses"
                        value={row.expenses}
                        colorClass="text-red-500"
                        accentClasses={row.accentExpenses}
                    />
                    {/* Difference */}
                    <SummaryCell
                        label="Difference"
                        value={row.diff}
                        colorClass={row.diff >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}
                        accentClasses={
                            row.diff >= 0
                                ? "bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40"
                                : "bg-red-500/5 border-red-500/20 hover:border-red-500/40"
                        }
                    />
                </div>
            ))}
        </div>
    )
}
```

**Note:** The `TransactionFinancialSummary` type interface is unchanged. The component contract (props) is unchanged. Only the visual rendering changes. All callers (`TransactionsPage.tsx` and `DashboardPage.tsx`) continue to use it without modification.

### Dashboard inline table (`DashboardPage.tsx`)

The `DashboardPage.tsx` has an **inlined** version of the same table (not using `FinancialSummaryTable` component — it's raw JSX at around lines 330–365). This must also be replaced.

**File:** `frontend/src/pages/DashboardPage.tsx`

1. Import `FinancialSummaryTable` from `@/components/transactions/FinancialSummaryTable`
2. Locate the `<div className="overflow-x-auto"><table ...>` block (the financial breakdown table in the dashboard)
3. Replace the entire `<div className="overflow-x-auto">...</div>` block with:

```tsx
<FinancialSummaryTable
    summary={{
        net_total_revenue: d.financial_breakdown.net_total_revenue,
        net_total_expenses: d.financial_breakdown.net_total_expenses,
        net_difference: d.financial_breakdown.net_difference,
        tax_total_revenue: d.financial_breakdown.tax_total_revenue,
        tax_total_expenses: d.financial_breakdown.tax_total_expenses,
        tax_difference: d.financial_breakdown.tax_difference,
        gross_total_revenue: d.financial_breakdown.gross_total_revenue,
        gross_total_expenses: d.financial_breakdown.gross_total_expenses,
        gross_difference: d.financial_breakdown.gross_difference,
    }}
/>
```

Check the `TransactionFinancialSummary` type definition in `frontend/src/types/transaction.ts` to confirm exact field names match — adjust the mapping if they differ.

**Do NOT** remove the card wrapper (`<div className="rounded-xl border border-border bg-card p-4">`) that surrounds the table section in DashboardPage — just replace the table inside it.

---

## Feature 4 — Resizable Split View Divider (with Arrow Controls)

> ⚠️ **This is the most complex feature. Read the entire section before touching any file.**
> This feature applies to BOTH the transaction split view (`TransactionForm.tsx`) and the vehicle split view (`VehicleFormPage.tsx`).
> If this feature needs to be rolled back, every change is isolated within these two files plus a new shared hook.

### Concept

In split view, a draggable vertical divider sits between the left column (form) and the right column (transactions panel). The divider has:
- A visible handle line (1–2px wide, styled as a subtle bar)
- Two small arrow icons (`ChevronLeft` / `ChevronRight` from lucide-react) stacked vertically on the handle, for stepping the split ratio
- Dragging the handle adjusts the column widths live
- Default ratio: 65% left / 35% right (matching the current `1fr / 420px` feel)
- Position saved in a cookie so it persists across sessions
- Fields inside the left panel reflow naturally using CSS container queries

### Cookie key names

| Location | Cookie key |
|---|---|
| Transaction form | `acar_txn_split_ratio` |
| Vehicle form | `acar_vehicle_split_ratio` |

Value stored: a number between 30 and 80, representing the left panel's width as a percentage (e.g., `65` = 65% left, 35% right).

### New shared utility

**File:** `frontend/src/lib/splitView.ts` (new file)

```ts
const MIN_LEFT = 30   // left panel min %
const MAX_LEFT = 80   // left panel max %

export function getSplitRatio(cookieKey: string, defaultRatio = 65): number {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${cookieKey}=([^;]+)`))
    const parsed = match ? parseInt(match[1], 10) : NaN
    if (!isNaN(parsed) && parsed >= MIN_LEFT && parsed <= MAX_LEFT) return parsed
    return defaultRatio
}

export function saveSplitRatio(cookieKey: string, ratio: number): void {
    const clamped = Math.min(MAX_LEFT, Math.max(MIN_LEFT, ratio))
    // Persist 1 year
    document.cookie = `${cookieKey}=${clamped}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`
}

export const SPLIT_MIN = MIN_LEFT
export const SPLIT_MAX = MAX_LEFT
```

### New shared `ResizableDivider` component

**File:** `frontend/src/components/ResizableDivider.tsx` (new file)

```tsx
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useRef, useCallback } from "react"
import { SPLIT_MIN, SPLIT_MAX } from "@/lib/splitView"

interface ResizableDividerProps {
    ratio: number                          // current left % (30–80)
    containerRef: React.RefObject<HTMLDivElement>
    onRatioChange: (newRatio: number) => void
}

export function ResizableDivider({ ratio, containerRef, onRatioChange }: ResizableDividerProps) {
    const isDragging = useRef(false)

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        isDragging.current = true

        const onMouseMove = (ev: MouseEvent) => {
            if (!isDragging.current || !containerRef.current) return
            const rect = containerRef.current.getBoundingClientRect()
            const x = ev.clientX - rect.left
            const newRatio = Math.round((x / rect.width) * 100)
            onRatioChange(Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, newRatio)))
        }

        const onMouseUp = () => {
            isDragging.current = false
            window.removeEventListener("mousemove", onMouseMove)
            window.removeEventListener("mouseup", onMouseUp)
        }

        window.addEventListener("mousemove", onMouseMove)
        window.addEventListener("mouseup", onMouseUp)
    }, [containerRef, onRatioChange])

    const step = useCallback((direction: "left" | "right") => {
        const delta = direction === "left" ? -5 : 5
        onRatioChange(Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, ratio + delta)))
    }, [ratio, onRatioChange])

    return (
        <div
            className="relative flex-shrink-0 w-5 flex flex-col items-center justify-center cursor-col-resize group select-none self-stretch"
            onMouseDown={handleMouseDown}
            title="Drag to resize panels"
        >
            {/* The visible line */}
            <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border group-hover:bg-primary/40 transition-colors" />

            {/* Arrow buttons */}
            <div className="relative z-10 flex flex-col gap-0.5">
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); step("left") }}
                    className="flex items-center justify-center w-5 h-5 rounded bg-background border border-border shadow-sm hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    title="Expand right panel"
                >
                    <ChevronLeft className="h-3 w-3" />
                </button>
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); step("right") }}
                    className="flex items-center justify-center w-5 h-5 rounded bg-background border border-border shadow-sm hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    title="Expand left panel"
                >
                    <ChevronRight className="h-3 w-3" />
                </button>
            </div>
        </div>
    )
}
```

**Critical:** The component uses `type="button"` on all buttons to prevent form submission since this renders inside a `<form>` element in `TransactionForm.tsx`.

### Container query setup for the left panel

The left panel's internal field grids use Tailwind responsive classes like `grid-cols-2`, `grid-cols-3`. These respond to **viewport width** not container width. When the user resizes the split divider, the viewport doesn't change — only the column width changes. So standard responsive classes won't reflow the fields.

**Solution: Tailwind CSS v4 container queries**

Wrap the left panel content div with `@container` and use `@sm:`, `@md:`, `@lg:` prefixes on the inner field grids.

Tailwind v4 supports container queries natively. Add `@container` to the left panel wrapper, then replace responsive breakpoints in the inner grid classNames with container query equivalents:

| Replace | With |
|---|---|
| `md:grid-cols-2` | `@md:grid-cols-2` |
| `md:grid-cols-3` | `@md:grid-cols-3` |
| `lg:grid-cols-2` | `@lg:grid-cols-2` |
| `lg:grid-cols-3` | `@lg:grid-cols-3` |

**Only apply this to elements INSIDE the left panel of the split view.** Do not change classNames on elements that are conditionally rendered in both split and non-split modes without care — add the `@container` class only on the left panel wrapper element that exists in split view.

### Implementation: TransactionForm.tsx

**File:** `frontend/src/components/transactions/TransactionForm.tsx`

**Step 1** — Add imports at the top:
```tsx
import { ResizableDivider } from "@/components/ResizableDivider"
import { getSplitRatio, saveSplitRatio } from "@/lib/splitView"
```

**Step 2** — Add split ratio state inside the component (after `showSplitView` is defined):
```tsx
const containerRef = useRef<HTMLDivElement>(null)
const COOKIE_KEY = "acar_txn_split_ratio"

const [splitRatio, setSplitRatio] = useState<number>(() =>
    getSplitRatio(COOKIE_KEY, 65)
)

const handleRatioChange = useCallback((newRatio: number) => {
    setSplitRatio(newRatio)
    saveSplitRatio(COOKIE_KEY, newRatio)
}, [])
```

Add `useRef`, `useState`, `useCallback` to the React import if not already there.

**Step 3** — Update the outer grid container. Change from:
```tsx
<div className={cn(
    "gap-6",
    showSplitView ? "grid grid-cols-1 2xl:grid-cols-[1fr_420px]" : "space-y-6"
)}>
```

To:
```tsx
<div
    ref={containerRef}
    className={cn("gap-0", showSplitView ? "flex" : "space-y-6")}
    style={showSplitView ? { display: "flex" } : undefined}
>
```

**Step 4** — Update the LEFT COLUMN div. Add `@container` and inline width style:
```tsx
{/* LEFT COLUMN */}
<div
    className="@container space-y-5 min-w-0"
    style={showSplitView ? { width: `${splitRatio}%`, flexShrink: 0 } : undefined}
>
    {/* ... existing content ... */}
</div>
```

**Step 5** — Insert the `ResizableDivider` between left and right columns (only in split view):
```tsx
{showSplitView && (
    <ResizableDivider
        ratio={splitRatio}
        containerRef={containerRef}
        onRatioChange={handleRatioChange}
    />
)}
```

**Step 6** — Update the RIGHT COLUMN div to take remaining space:
```tsx
{showSplitView && (
    <div
        className="flex flex-col gap-4 min-w-0 flex-1"
        style={{ minWidth: 0 }}  // prevent overflow
    >
        {/* ... existing right column content ... */}
    </div>
)}
```

Remove the `2xl:sticky` class from the right panel — sticky positioning doesn't work reliably inside a flex container. Use the right panel as a naturally scrolling panel.

**Step 7** — Update inner field grids to use container queries. Only within the split view left panel, change grid responsive classes. The key grids to update are:
- Transaction Details card inner grid: change `grid-cols-2` → `@md:grid-cols-2`
- Usage Details card inner grid: same pattern
- Additional Information card: same
- Purchase Details card: `grid-cols-3` → `@md:grid-cols-3`

**Important:** These class changes only affect the grids inside the left panel. The non-split view layout (where these cards render full-width) may already use viewport-responsive classes — check that you don't break non-split mode. Use conditional className logic (based on `showSplitView`) if needed:

```tsx
<div className={cn("grid gap-4 p-5", showSplitView ? "@md:grid-cols-2" : "md:grid-cols-2")}>
```

### Implementation: VehicleFormPage.tsx

The vehicle form uses a flex-row layout at the **page level** (not inside `VehicleForm.tsx`). The split view is managed in `VehicleFormPage.tsx` where it renders:

```tsx
// Split view layout: form flex-1 | transactions panel fixed
<div className="flex gap-6 ...">
    <div className="min-w-0 flex-1">
        <VehicleForm ... />
    </div>
    <div className="w-[420px] flex-shrink-0 ...">
        {transactionsPanel}
    </div>
</div>
```

**File:** `frontend/src/pages/VehicleFormPage.tsx`

**Step 1** — Add imports:
```tsx
import { ResizableDivider } from "@/components/ResizableDivider"
import { getSplitRatio, saveSplitRatio } from "@/lib/splitView"
import { useState, useRef, useCallback } from "react"
```

**Step 2** — Add state for split ratio near the existing `splitView` state:
```tsx
const VEHICLE_SPLIT_COOKIE = "acar_vehicle_split_ratio"
const vehicleContainerRef = useRef<HTMLDivElement>(null)
const [vehicleSplitRatio, setVehicleSplitRatio] = useState<number>(() =>
    getSplitRatio(VEHICLE_SPLIT_COOKIE, 65)
)
const handleVehicleRatioChange = useCallback((newRatio: number) => {
    setVehicleSplitRatio(newRatio)
    saveSplitRatio(VEHICLE_SPLIT_COOKIE, newRatio)
}, [])
```

**Step 3** — Find the split view layout block (where `splitView && showTransactions` is true) and update it:

```tsx
if (splitView && showTransactions) {
    return (
        <AppLayout>
            <div
                ref={vehicleContainerRef}
                className="flex min-h-0"
            >
                {/* Left: Vehicle form */}
                <div
                    className="min-w-0 flex-shrink-0"
                    style={{ width: `${vehicleSplitRatio}%` }}
                >
                    <VehicleForm ... />
                </div>

                {/* Divider */}
                <ResizableDivider
                    ratio={vehicleSplitRatio}
                    containerRef={vehicleContainerRef}
                    onRatioChange={handleVehicleRatioChange}
                />

                {/* Right: Transactions panel */}
                <div className="flex-1 min-w-0 overflow-y-auto">
                    {transactionsPanel}
                </div>
            </div>
        </AppLayout>
    )
}
```

Preserve all existing props passed to `VehicleForm` and `transactionsPanel`. Only the wrapper structure changes.

**Note on VehicleForm inner fields:** VehicleForm's internal field grids already use viewport-responsive classes. Since the VehicleForm occupies a flex item (not a CSS grid cell with a fixed ratio), container queries are less critical here — the flex item already reflows when its pixel width changes due to the ratio changing. However, if fields don't reflow correctly, add `@container` to the form wrapper div and switch to `@md:` / `@lg:` prefixed classes on inner grids in `VehicleForm.tsx`. Only do this if testing shows it's needed — don't pre-emptively change all VehicleForm grid classes.

### Edge cases & safety rules

1. **Split view must still be at `2xl` viewport only** (1536px+). The `ResizableDivider` only renders when `showSplitView` is true, which already requires `isSplitView && mode === "edit"` — the viewport check happens via the toggle button being conditionally available. Do not add additional viewport checks inside `ResizableDivider` itself.

2. **Drag must not fire submit.** All `<button>` elements in `ResizableDivider` must have `type="button"`. The `onMouseDown` handler must call `e.preventDefault()`.

3. **Min/max enforcement.** The `SPLIT_MIN = 30` and `SPLIT_MAX = 80` constants ensure neither panel collapses to zero.

4. **Touch support.** Out of scope for this plan — the manager uses a desktop with a mouse. Do not add touch event handlers.

5. **TypeScript.** Ensure `containerRef.current` null checks are in place before accessing `.getBoundingClientRect()`. The `useRef<HTMLDivElement>(null)` type ensures this.

6. **Right panel overflow.** Add `overflow-hidden` or `overflow-y-auto` to the right panel to prevent it from overflowing when the left panel is very wide.

---

## Files Modified Summary

| File | Change | Feature |
|---|---|---|
| `frontend/src/components/ui/input.tsx` | `bg-transparent` → `bg-background` | 1A |
| `frontend/src/components/vehicles/FinancialMetricsStrip.tsx` | Add `accentClasses` prop + per-metric colors | 1B |
| `frontend/src/components/transactions/TransactionForm.tsx` | Add `TxnMetricCell`, replace pill, add resizable divider | 2, 4 |
| `frontend/src/components/transactions/FinancialSummaryTable.tsx` | Complete rewrite to MetricCell-style grid | 3 |
| `frontend/src/pages/DashboardPage.tsx` | Replace inline table with `FinancialSummaryTable` | 3 |
| `frontend/src/pages/VehicleFormPage.tsx` | Add resizable divider to split view layout | 4 |
| `frontend/src/lib/splitView.ts` | **New:** cookie helpers + constants | 4 |
| `frontend/src/components/ResizableDivider.tsx` | **New:** drag handle component | 4 |

---

## Order of Implementation

1. **Feature 1A** — smallest, safest, 1 file, 1 word change. Verify visually.
2. **Feature 1B** — `FinancialMetricsStrip.tsx` only, no data changes. Verify each metric has its own color.
3. **Feature 3** — `FinancialSummaryTable.tsx` rewrite + `DashboardPage.tsx` update. Verify both locations render the new style.
4. **Feature 2** — `TransactionForm.tsx` only, add `TxnMetricCell` and strip. Verify in both add and edit modes.
5. **Feature 4** — most complex last. Start with `splitView.ts` and `ResizableDivider.tsx`, then wire into `TransactionForm.tsx`, then `VehicleFormPage.tsx`. Test dragging, arrow stepping, cookie persistence across page reloads.

---

## TypeScript Verification

After all changes, run:
```bash
cd frontend && npx tsc --noEmit
```

All errors must be resolved before considering any feature done. Unused imports must be removed. No `any` types introduced.

---

## Do Not Touch

- Backend Python files — no backend changes needed
- `dark:` mode classes — leave all dark mode styling untouched
- `DynamicSelect`, `SearchableSelect` components — input bg fix is for native `<Input>` only
- `FinancialMetricsStrip` compact mode — the `if (compact)` early return path
- `localStorage` keys — Feature 4 uses cookies, not localStorage (the existing split toggle on/off preference stays in localStorage as before)
- Any locale/i18n files — no new translation keys needed for these UI-only changes
