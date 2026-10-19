# plan-ui-tweaks.md

> Feature: UI Polish — Light Mode, Transactions Split View, FinancialMetricsStrip Revert
> Depends on: `plan-statistics-dashboard.md` (already shipped)
> Created: 2026-05-10

---

## 🎯 What This Plan Covers

Four discrete fixes, in order of scope:

| # | Problem | Files Touched |
|---|---------|---------------|
| 1 | Light mode looks bad — sections don't separate visually | `index.css` only |
| 2 | Split-view transactions column too narrow to read without horizontal scroll | `VehicleForm.tsx`, `RelatedTransactionsTable.tsx` |
| 3 | `FinancialMetricsStrip` was broken by previous agent — revert it | `FinancialMetricsStrip.tsx`, `VehicleForm.tsx` |
| 4 | Transaction edit page never got its split view | `TransactionForm.tsx`, `EditTransactionPage.tsx` |

**Do NOT touch anything else.** The vehicle split view looks good — leave it alone. The dashboard, vehicle hooks, and backend are all out of scope here.

---

## Fix 1 — Light Mode Visual Separation

### Problem
In light mode, cards and sections blur into each other. The default `border-border` token (`#e4e7ec`) is too faint on white backgrounds, so sections look like one flat surface. Making borders thicker would make the UI feel heavy and cramped — not the goal.

### Solution: Two-pronged approach

**Prong A — Strengthen the border token in light mode only.**

In `frontend/src/index.css`, inside the `:root` (light) block, override the border color to a slightly darker value:

```css
/* index.css — light mode root block */
:root {
  /* existing tokens... */
  --border: 214 20% 82%;   /* current: too faint */
  /* change to: */
  --border: 214 20% 74%;   /* slightly more visible, still soft */
}
```

The `.dark` block should NOT be changed. Dark mode currently looks good.

**Prong B — Give cards a very subtle background tint in light mode.**

Cards currently use `bg-card` which resolves to pure white in light mode, same as `bg-background`. A 1-shade lift separates them from the page without adding visual noise:

```css
:root {
  --card: 0 0% 100%;        /* current: pure white */
  /* change to: */
  --card: 210 20% 98%;      /* barely-there blue-white tint */
}
```

This means cards look like they're sitting slightly above the page background — exactly what Access-style dense UIs do to separate sections.

### What NOT to do
- Do not add `border-2` anywhere — thickness is not the fix.
- Do not add `shadow-sm` to every card — shadows add visual weight and look bad in dense layouts.
- Do not change any component files — this fix is 100% CSS variable changes in `index.css`.
- Do not touch dark mode variables.

### Files changed
| File | Change |
|------|--------|
| `frontend/src/index.css` | Adjust `--border` and `--card` in `:root` block only |

---

## Fix 2 — Related Transactions Table: Reduce Horizontal Overflow

### Problem
In the vehicle split view, the related transactions table panel is ~400px wide. The table has columns including a status badge that reads "Review Required" or "Under Review" as a single-line badge — this makes the row too wide, forcing horizontal scroll to reach the action icons (delete, etc.) on the right.

### Solution: Wrap multi-word status badges to two lines

The status badge text for `under_review` currently reads as one string. Instead, render it as two lines stacked inside the same badge:

```
Before:  [ Review Required ]   (wide, single line)

After:   [ Review  ]
         [ Required ]          (narrow, two lines, same badge style)
```

**Implementation:** In `RelatedTransactionsTable.tsx`, find where the status badge is rendered. Wrap the display text in a `<span className="flex flex-col items-center leading-tight text-[10px]">` so each word sits on its own line. Apply only when the status value is `under_review` — other statuses (`reviewed`, `inactive`) are short enough as single words.

```tsx
// RelatedTransactionsTable.tsx — status badge rendering
function StatusBadgeCompact({ status }: { status: string }) {
  if (status === "under_review") {
    return (
      <Badge
        className="flex flex-col items-center gap-0 leading-tight text-[10px] px-1.5 py-0.5"
        style={{ color: "...", backgroundColor: "..." }}  // existing color logic
      >
        <span>Review</span>
        <span>Required</span>
      </Badge>
    )
  }
  // all other statuses: render normally
  return <Badge ...>{statusLabel}</Badge>
}
```

This is a **targeted change only to `RelatedTransactionsTable.tsx`**. Do not change the status badge in other parts of the app (transaction list page, vehicle cards, etc.) — those have more horizontal space and look fine.

### Also check: column minimum widths
While in the file, audit each column's `min-w-*` or explicit width. The action column (delete/edit icons) must never be clipped. If any column has a hardcoded wide `min-w`, reduce it or remove it and let the table reflow.

### Files changed
| File | Change |
|------|--------|
| `frontend/src/components/transactions/RelatedTransactionsTable.tsx` | Add `StatusBadgeCompact` for `under_review` status; audit column widths |

---

## Fix 3 — FinancialMetricsStrip: Revert Agent's Changes

### Problem
The previous agent modified `FinancialMetricsStrip.tsx` and its usage in `VehicleForm.tsx` in a way that:
1. Broke it into 3 rows (4 + 5 + 1) instead of the planned 2 rows (4 + 5)
2. Removed informative labels/equations that were there before
3. Made the layout take MORE vertical space than the original

### What the correct state should look like

Per `components.md` (section 7 — `FinancialMetricsStrip`):

> **Row 1 (Cost Basis):** COGS, Txn Expenses, Break-Even, Holding Cost
> **Row 2 (Profit — only when sold):** Gross Profit, Net Profit, Total Profit (highlighted), Margin, ROI
> Equations use compact format: `€12,000 − €10,000` (not `saleNet(€12,000) − buyNet(€10,000)`)

That is two rows maximum. 4 metrics in row 1, 5 metrics in row 2. Row 2 only renders when the vehicle status is `sold`.

### What to do

**Step 1 — Read `git diff` or the feature docs the previous agent produced** for the `plan-statistics-dashboard` feature. The `.agentrules` required the agent to save docs in `.agents/artifacts/statistics-dashboard/`. Read those docs to understand exactly what was changed.

**Step 2 — Revert `FinancialMetricsStrip.tsx` to a clean implementation** matching this exact spec:

```
FinancialMetricsStrip
├── Row 1: always shown when buy data exists
│   ├── COGS         = buy_price_gross + repair_costs (or just buy_price_gross if no repairs)
│   ├── Txn Expenses = sum of linked transaction expenses
│   ├── Break-Even   = COGS + Txn Expenses (minimum sale price to break even)
│   └── Holding Cost = days_on_stock × daily_rate (informational, muted)
│
└── Row 2: only shown when status === 'sold'
    ├── Gross Profit = sale_price_gross − buy_price_gross − commission
    ├── Net Profit   = sale_price_net − buy_price_net − commission
    ├── Total Profit = (highlighted card) — primary display metric
    ├── Margin %     = (gross_profit / sale_price_gross) × 100
    └── ROI %        = (gross_profit / buy_price_gross) × 100
```

**Layout rules:**
- Each metric is a compact chip: `label` (muted, `text-xs`) + `value` (bold, `text-sm`, color-coded)
- The equation string shows below the value in `text-[10px] text-muted-foreground`
- Row 1 chips use a neutral `bg-muted/40` tint
- Row 2 profit chips use green/red tint based on sign
- Total Profit chip uses a slightly more prominent style (slight border highlight)
- Entire strip fits in ~72px height for row 1 alone, ~140px when both rows visible
- Uses `grid grid-cols-4` for row 1 and `grid grid-cols-5` for row 2

**Color rules (same as established in plan-statistics-dashboard):**
- Positive → `text-green-600 dark:text-green-400` + `bg-green-50 dark:bg-green-950/30`
- Negative → `text-red-500` + `bg-red-50 dark:bg-red-950/30`
- Zero/neutral → `text-muted-foreground`
- Structural/informational (COGS, break-even) → `text-foreground` (neutral)

**Step 3 — In `VehicleForm.tsx`**, verify the `<FinancialMetricsStrip>` usage:
- It should appear AFTER the buy/sale detail cards
- It should receive the computed values from the form state (already calculated in `vehicleFinancials.ts`)
- It should NOT appear on the Add New Vehicle page (`isEditing === false`)

### Files changed
| File | Change |
|------|--------|
| `frontend/src/components/vehicles/FinancialMetricsStrip.tsx` | Full rewrite to match correct 2-row spec |
| `frontend/src/components/vehicles/VehicleForm.tsx` | Verify props passed to `FinancialMetricsStrip` are correct |

---

## Fix 4 — Transaction Edit Page: Add Split View

### Problem
The previous agent implemented split view only on the vehicle edit page. The transaction edit page still has everything stacked vertically — the form fields, then below them, the vehicle selector, then below that, the related transactions table. This means the manager has to scroll to see transactions while editing, which defeats the purpose.

### What the split view should look like

```
Split View ON (default):
┌────────────────────────────┬──────────────────────────────┐
│  LEFT: Form fields         │  RIGHT: Vehicle + Transactions│
│                            │                               │
│  [Transaction Details]     │  Vehicle field                │
│  [From / To]               │  ↗ Go to Vehicle  (blue link)│
│  [Additional Info]         │                               │
│  [Financial Details]       │  ┌─ Related Transactions ────┐│
│                            │  │  table rows...            ││
│                            │  │  (overflow-y-auto)        ││
│                            │  └───────────────────────────┘│
└────────────────────────────┴──────────────────────────────┘

Normal View (split OFF):
Everything stacked vertically — DO NOT CHANGE THIS. It must remain identical to what it looks like today.
```

### Implementation detail

**In `TransactionForm.tsx`** (used by both `EditTransactionPage` and `AddTransactionPage`):

The split view applies **only on the edit page**, not the add page. On the add page, the layout stays stacked.

The component already receives an `isEditing` (or similar) prop. Gate the split layout on that prop.

**Layout structure:**

```tsx
// TransactionForm.tsx — conditional split layout

{isSplitView && isEditing ? (
  // SPLIT LAYOUT
  <div className="grid grid-cols-1 2xl:grid-cols-[1fr_420px] gap-6">
    {/* LEFT: all form cards stacked */}
    <div className="space-y-4">
      <TransactionDetailsCard />
      <FromToCard />
      <AdditionalInfoCard />
      <FinancialDetailsCard />
    </div>

    {/* RIGHT: vehicle selector + link + transactions table */}
    <div className="flex flex-col gap-4 2xl:sticky 2xl:top-4 2xl:self-start">
      <VehicleSelectorCard />          {/* the vehicle choice field */}
      {linkedVehicleId && (
        <a href={vehicleEditUrl} className="text-sm text-primary flex items-center gap-1 hover:underline">
          <ExternalLink className="h-3.5 w-3.5" />
          {t("transactions.goToVehicle")}   {/* the blue "go to vehicle" link */}
        </a>
      )}
      <RelatedTransactionsPanel />     {/* table with overflow-y-auto, max-h-[60vh] */}
    </div>
  </div>
) : (
  // NORMAL LAYOUT — unchanged, identical to current
  <div className="space-y-6">
    ...current layout unchanged...
  </div>
)}
```

**Left panel — card stacking:**
In split view, the form cards on the left switch to **single-column fields** inside each card (instead of 2-3 fields per row). This is because the left panel is narrower than the full-width form. This only applies in split view — in normal view the multi-column card layouts stay as they are.

```tsx
// Example: inside TransactionDetailsCard, in split view:
<div className={cn(
  "grid gap-4",
  isSplitView ? "grid-cols-1" : "grid-cols-1 md:grid-cols-3"
)}>
  {/* fields */}
</div>
```

The `isSplitView` prop should be threaded down through the card sub-components, or use a React context if threading gets deep. Prefer prop-threading first since the depth is only 1 level.

**Right panel — vehicle selector:**
Move the vehicle selector field (`SearchableSelect` for vehicle) to the right panel in split view. In normal view it stays in its current position on the left. This means the vehicle field needs to be conditionally rendered in two different locations based on `isSplitView`. Extract it into its own small component to avoid duplicating the JSX.

**The "Go to Vehicle" link:**
This already exists in the current code as a clickable link above the transactions table. In split view it moves to the right panel, sitting between the vehicle selector and the table. Do not remove it from the normal view — it stays where it is.

**Split view toggle button:**
Add to the `StickyFooter` of `EditTransactionPage` — same pattern as the vehicle edit page uses (`PanelRightOpen` / `PanelRightClose` icons from lucide-react, wrapped in a Tooltip). See `components.md` section 8 for the exact pattern.

**localStorage key:** `acar_transaction_split_view`

**Default value:** `true` (split ON by default for new users). Read preference as:
```ts
const [isSplitView, setIsSplitView] = useState<boolean>(() => {
  const stored = localStorage.getItem("acar_transaction_split_view")
  return stored === null ? true : stored === "true"  // default ON if never set
})
```

This is the same pattern the vehicle split view uses (see `components.md` section 8, key `drivebase_vehicle_split_view`). Copy that pattern exactly — consistency matters.

**Light mode default:** This should already be implemented. Verify that the app defaults to light mode on first load (no `.dark` class on `<html>` by default). If a `localStorage` theme preference is stored, it overrides this. If it's not already defaulting to light, find where the theme is initialized (likely `App.tsx` or `Header.tsx`) and set the default to `'light'`.

### Files changed
| File | Change |
|------|--------|
| `frontend/src/components/transactions/TransactionForm.tsx` | Add split view layout (gated on `isSplitView` + `isEditing` props) |
| `frontend/src/pages/EditTransactionPage.tsx` | Add split view toggle state + pass to `TransactionForm`; add toggle button to `StickyFooter` |

---

## 📁 Complete File Manifest

| File | Action | Fix # |
|------|--------|-------|
| `frontend/src/index.css` | Edit — adjust `--border` and `--card` in `:root` | 1 |
| `frontend/src/components/transactions/RelatedTransactionsTable.tsx` | Edit — `StatusBadgeCompact` + column width audit | 2 |
| `frontend/src/components/vehicles/FinancialMetricsStrip.tsx` | Rewrite — restore correct 2-row layout | 3 |
| `frontend/src/components/vehicles/VehicleForm.tsx` | Edit — verify `FinancialMetricsStrip` props | 3 |
| `frontend/src/components/transactions/TransactionForm.tsx` | Edit — add conditional split layout | 4 |
| `frontend/src/pages/EditTransactionPage.tsx` | Edit — split toggle state + footer button | 4 |
| `PROJECT_MAP.md` | Update — no new files, but note the changes | — |

**No backend changes. No new files. No new dependencies.**

---

## ⚠️ Constraints and Edge Cases

**Fix 1 (light mode):**
- Test in both light AND dark mode after changing `index.css`. Dark mode must look identical to before.
- The `--card` tint must be barely perceptible — if you can see it clearly as "blue", it's too much.

**Fix 2 (badge):**
- Only apply the two-line badge to `RelatedTransactionsTable` — not to `TransactionTable.tsx` (the main transactions list), not to vehicle cards. Those have more space.
- The badge must still use the same background color as the current `under_review` badge. Only the text layout changes.

**Fix 3 (FinancialMetricsStrip):**
- If the vehicle has no linked transactions, `Txn Expenses` should show `€0` or `—`, not crash.
- If `sale_price` is null (vehicle not yet sold), Row 2 must not render at all — not even empty chips.
- Holding cost daily rate: if the business hasn't configured this, show `—` instead of a calculation. Don't block Row 1 from rendering.
- The rewrite must preserve the `vehicleFinancials.ts` utility functions — do NOT inline calculations into the component. The lib functions are tested and correct; the component is the problem.

**Fix 4 (transaction split view):**
- **On `AddTransactionPage`, there is NO split view.** The `isEditing` guard must be hard-coded. Even if `isSplitView` is true, if `isEditing === false`, render the normal stacked layout. The add page has no transactions table to show on the right anyway.
- The right panel's transactions table must have `max-h-[calc(100vh-220px)] overflow-y-auto` — not a fixed pixel height. This adapts to whatever the footer/header are doing.
- The `2xl:sticky` on the right panel means it only sticks at 1536px+. Below that breakpoint it falls back to normal stacking naturally.
- The "Go to Vehicle" link should only render when a vehicle is actually linked (`linkedVehicleId !== null`). Do not render a disabled/greyed link when no vehicle is selected.
- The vehicle field moved to the right panel in split view means it should NOT appear in the left panel's card in split view. Use conditional rendering (`{!isSplitView && <VehicleFieldInline />}` on the left, `{isSplitView && <VehicleFieldInPanel />}` on the right) — both reference the same form state.

---

## 🔢 Implementation Order

```
Step 1  index.css                              ← light mode fix (isolated, zero risk)
Step 2  RelatedTransactionsTable.tsx           ← badge + column widths (isolated)
Step 3  Read agent's artifact docs             ← understand what changed in FinancialMetricsStrip
Step 4  FinancialMetricsStrip.tsx              ← rewrite to correct 2-row spec
Step 5  VehicleForm.tsx                        ← verify FinancialMetricsStrip props, fix if wrong
Step 6  TransactionForm.tsx                    ← add split layout (gated, non-destructive)
Step 7  EditTransactionPage.tsx                ← toggle state + footer button
Step 8  Verify light mode default              ← check App.tsx/Header.tsx theme init
Step 9  PROJECT_MAP.md                         ← update notes
```

---

## ✅ Verification Checklist

- [ ] Light mode: cards are visually distinct from page background
- [ ] Light mode: borders are visible without being thick or heavy
- [ ] Dark mode: unchanged from before (run side-by-side comparison)
- [ ] Vehicle split view: unchanged, still works, no regressions
- [ ] Related transactions table: `under_review` badge wraps to two lines
- [ ] Related transactions table: no horizontal scroll needed to reach action buttons
- [ ] `FinancialMetricsStrip`: exactly 2 rows (Row 2 only when status = sold)
- [ ] `FinancialMetricsStrip`: Row 1 has exactly 4 metrics, Row 2 has exactly 5 metrics
- [ ] `FinancialMetricsStrip`: equations still show (e.g., `€12,000 − €10,000`)
- [ ] Transaction edit page: split view toggle button appears in footer
- [ ] Transaction edit page: split view is ON by default (first load, no localStorage key set)
- [ ] Transaction edit page: in split view, form fields on left, vehicle + transactions table on right
- [ ] Transaction edit page: "Go to Vehicle" link visible in split view (when vehicle is linked)
- [ ] Transaction edit page: normal view unchanged (toggle off = current appearance)
- [ ] Add transaction page: always uses normal stacked layout (no split view, regardless of toggle)
- [ ] `npm run build` passes with zero TypeScript errors
