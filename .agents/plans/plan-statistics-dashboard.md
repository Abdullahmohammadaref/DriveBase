# plan-statistics-dashboard.md

> Feature: Statistics, Financial Calculations UX & Dashboard Overhaul
> Skills applied: `/dealership-dashboard-ui-architect`, `/professional-calculator-formula-ui`
> Created: 2026-05-08

---

## 📋 Pre-work Decision: Do We Need `docs.md`?

**No. Skip creating `docs.md` — you already have a superior equivalent.**

`PROJECT_MAP.md` is your docs.md. It maps every file, every endpoint, every component, and the full data model. It's more detailed than what the workflow guide's `docs.md` template would produce. The workflow's docs.md is meant to prevent the AI from re-scanning the whole codebase — `PROJECT_MAP.md` already does exactly that.

**What you should do after each feature cycle (per Rule 0.2 in `.agentrules`):**
- Append new files/components to `PROJECT_MAP.md`
- Update `README.md` if endpoints change
- Keep `schema.prisma` in sync with `models.py`

That's the loop. No separate `docs.md` needed.

---

## 🎯 Feature Scope

This plan covers **three interconnected problems**:

1. **Dashboard Page** — currently shows hardcoded fake numbers, broken "No vehicles" UI. Needs real data + visualizations.
2. **Transaction Formula Display** — the `Net - Tax = Gross` grid in `TransactionForm.tsx` is ugly and takes too much vertical space.
3. **Vehicle Financial Calculations Panel** — buy/sale breakdowns and the `grossProfit`/`netProfit` display need to be denser and more scannable.
4. **Responsive layout** — At smaller zoom levels, the related transactions table should sit to the right of the form, not below it.

---

## 🔍 Current State Audit (What You're Working With)

### Dashboard
- `DashboardPage.tsx` — 100% hardcoded fake data. No API calls. No chart library. Shows "No vehicles" because nothing is fetched.
- No dashboard endpoint on the backend.

### Transaction Formula (the ugly one you mentioned)
- Lives in `TransactionForm.tsx` lines ~655–667
- It's a raw CSS grid: `grid-cols-[auto_auto_auto_auto_auto]` with labels on top, values below
- "Net | - | Tax (19%) | = | Gross" header row, then values row
- Takes vertical space, looks like a spreadsheet inside a card

### Vehicle Financial Calculations
- `VehicleForm.tsx` lines ~419–425: `grossProfit` and `netProfit` computed values
- Buy breakdown shown in a small pill/badge near the buy price
- Sale breakdown shown similarly near sale price
- `grossProfit` and `netProfit` only shown inline next to sale price — not prominent
- The "10 calculations" mentioned: Currently only `grossProfit` + `netProfit` are in the form itself. `total_revenue`, `total_expenses`, `net_profit` come from the **API response** (`VehicleDetail` type) and are shown in `FinancialSummaryCard` on the vehicles *list* page, not the edit page. This means the edit page is actually missing most of the rich financial display the user describes.

### FinancialSummaryCard (vehicles list page)
- Shows 3 cards: Total Revenue, Total Expenses, Net Profit
- Good structure, but only uses `gross` values — doesn't show the Net/Tax breakdown
- Uses `md:grid-cols-3` — fine on desktop, but each card is padded too generously

### Related Transactions Table (vehicle edit page)
- Currently lives below the form in `VehicleForm.tsx`
- At smaller zoom levels it stays below — never goes side-by-side

---

## 🏗️ What We're Building

### Part 1 — Backend: New Dashboard Endpoint

**New file:** `backend/manager/dashboard_api.py`

**Endpoint:** `GET /api/dashboard/`

**Returns:**
```python
{
  # Vehicle pipeline stats
  "vehicles": {
    "purchased": 12,
    "ready_for_sale": 8,
    "reserved": 3,
    "sold": 47,
    "inactive": 6,
    "total_active": 23,           # purchased + ready + reserved
    "avg_days_on_stock": 18.4,    # avg active_for across non-sold, non-inactive
    "oldest_days_on_stock": 94,   # max active_for across purchased/ready/reserved
  },
  # Transaction financial summary (current calendar year)
  "transactions_ytd": {
    "gross_total_revenue": 284500.00,
    "gross_total_expenses": 196200.00,
    "gross_difference": 88300.00,
    "net_total_revenue": 239075.00,
    "net_total_expenses": 164874.00,
    "net_difference": 74201.00,
  },
  # Vehicle profit summary (sold vehicles, current year)
  "vehicle_profit_ytd": {
    "total_sold": 31,
    "gross_profit": 72400.00,
    "net_profit": 60840.00,
  },
  # Monthly breakdown for chart (last 12 months)
  "monthly_revenue": [
    {"month": "2025-06", "revenue": 18400.00, "expenses": 12600.00},
    ...
  ],
  # Recently added vehicles (last 5, any status)
  "recent_vehicles": [
    {"internal_id": 48, "make": "BMW", "model": "X5", "status": "ready_for_sale", "active_for": 3}
  ],
  # Recent transactions (last 5)
  "recent_transactions": [
    {"internal_id": 201, "from_or_to": "Müller GmbH", "amount": "4200.00", "date": "2026-05-07", "status": "under_review"}
  ]
}
```

**Implementation rules:**
- Filter everything by `request.user.business` (multi-tenant, no exceptions)
- Use `Decimal` for all money. Convert to `float` only in the response schema.
- YTD = from Jan 1 of current year to today
- `avg_days_on_stock` = average of `Vehicle.active_for` property (already computed on model) for status in `['purchased', 'ready_for_sale', 'reserved']`
- Monthly revenue uses `Transaction.date` field grouped by month

**Register in `drivebase/urls.py`:**
```python
api.add_router("/dashboard/", dashboard_router)
```

---

### Part 2 — Frontend: New Hook

**New file:** `frontend/src/hooks/useDashboard.ts`

```typescript
export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get("/api/dashboard/").then(r => r.data),
    staleTime: 60_000,   // refresh every 60s — not a live ticker
    refetchOnWindowFocus: true,
  })
}
```

**Add types to a new file:** `frontend/src/types/dashboard.ts`

---

### Part 3 — Dashboard Page Overhaul

**File:** `frontend/src/pages/DashboardPage.tsx` — full rewrite

**Layout (applies `dealership-dashboard-ui-architect` skill):**

```
┌─────────────────────────────────────────────────────────┐
│ KPI ROW (5 cards, compact, h-auto)                     │
│ Active Inventory | Days on Stock | YTD Revenue |        │
│ YTD Expenses     | YTD Net Profit                      │
├────────────────────────┬────────────────────────────────┤
│ Monthly Revenue Chart  │ Vehicle Pipeline Breakdown     │
│ (recharts BarChart)    │ (horizontal bar per status +   │
│ 12 months, revenue vs  │  count + colored badge)        │
│ expenses, 2 series     │                                │
├────────────────────────┼────────────────────────────────┤
│ Recent Vehicles        │ Recent Transactions            │
│ (mini table, 5 rows)   │ (mini table, 5 rows)           │
│ click → edit page      │ click → edit page              │
└────────────────────────┴────────────────────────────────┘
```

**Skill rules applied:**
- `h-[calc(100vh-4rem)]` container so it never page-scrolls — only inner panels scroll
- Text at `text-sm` base, `text-xs` for secondary
- Status colors from `--color-status-*` CSS variables (defined in `index.css`) — NOT hardcoded hex
- Chart accent: single primary brand color for revenue, `text-red-500/60` for expenses
- No `p-6` anywhere — use `p-3` or `p-4` for card interiors

**Chart library:** `recharts` — already listed as an available library. No new npm install needed.

**KPI cards format:**
```
┌─────────────────┐
│ 🚗 23            │  ← big number
│ Active Vehicles  │  ← label (muted, text-xs)
│ 8 ready for sale │  ← sub-detail (text-xs)
└─────────────────┘
```

**Pipeline breakdown card** (right of chart):
```
● purchased      12  ████░░░░░░  (amber bar)
● ready_for_sale  8  ██████░░░░  (blue bar)
● reserved        3  ██░░░░░░░░  (purple bar)
● sold           47  ████████░░  (green bar)
● inactive        6  █░░░░░░░░░  (gray bar)
```
Use `status colors` from `colors.md` for the dots and bars.

**Recent vehicles/transactions:**
- Mini tables, no headers, `hover:bg-muted/30 cursor-pointer`
- Click navigates to the record's edit page
- Status badges use the same status colors

---

### Part 4 — Transaction Formula Redesign

**File:** `frontend/src/components/transactions/TransactionForm.tsx`

**Problem:** Lines 655–667 — a raw 5-column CSS grid that takes a lot of vertical space and looks like a spreadsheet.

**Solution (applies `professional-calculator-formula-ui` skill):**

Replace the grid with a compact **inline formula pill row**:

```
Net Amount  →  Net: €4,200.00  −  Tax (19%): −€798.00  =  Gross: €3,402.00
```

Rendered as a single horizontal strip inside the card, using:
- `flex items-center gap-2 text-sm flex-wrap`
- Each value in a subtle badge: `bg-muted rounded px-2 py-0.5`
- Color coding: net = green/red based on sign, tax = muted, gross = bold primary
- The `=` and `−` operators are plain `text-muted-foreground`

**Before (current):**
```
Net    |  -  |  Tax (19%)  |  =  |  Gross
€4200  |  -  |  -€798      |  =  |  €3402
```
_(two rows, 5 columns, heavy)_

**After:**
```
[ Net: €4,200.00 ]  −  [ Tax (19%): −€798.00 ]  =  [ Gross: €3,402.00 ]
```
_(one row, pill badges, lightweight)_

This saves approximately 40px of vertical height and looks like a live formula bar, not a table.

**Color rules (same as existing logic — just moved to pills):**
- Positive value → `text-green-600 dark:text-green-400`
- Negative value → `text-red-500`
- Zero/neutral → `text-muted-foreground`

---

### Part 5 — Vehicle Financial Panel Improvement

**File:** `frontend/src/components/vehicles/VehicleForm.tsx`

**Problem:** `grossProfit` and `netProfit` are shown as two tiny inline `<div>` lines inside the sale price card. Not scannable. No real "financial summary panel" exists on the edit page.

**Solution:** After the Buy and Sale cards (edit mode only), add a new `VehicleFinancialPanel` component:

**New file:** `frontend/src/components/vehicles/VehicleFinancialPanel.tsx`

**Layout (applies `professional-calculator-formula-ui` skill — side-by-side context):**

```
┌─────────────────── Financial Summary ────────────────────┐
│  Buy Cost    Sale Revenue    Gross Profit    Net Profit   │
│  €12,500     €16,800         +€4,300         +€3,612     │
│  (gross)     (gross)         (color-coded)   (color-coded)│
├──────────────────────────────────────────────────────────┤
│  Formula: Sale(gross) − Buy(gross) − Commission = Gross  │
│  €16,800 − €12,500 − €0 = €4,300                        │
└──────────────────────────────────────────────────────────┘
```

This is a **single row of 4 KPI chips** + a **formula transparency bar** below them. Total height: ~90px. Not 10 individual cards.

**Data source:** All values are already computed in `VehicleForm.tsx` (lines ~419-425). No new API calls needed.

**Show conditions:** Only when `isEditing === true` AND at least `buyBreakdown.hasValue` is true. If sale hasn't happened yet, show the buy cost chip only + a placeholder for the rest.

**Color rules:**
- Profit positive → `text-green-600` with `bg-green-50 dark:bg-green-950/30`
- Profit zero → `text-muted-foreground`
- Profit negative → `text-red-500` with `bg-red-50 dark:bg-red-950/30`
- Buy cost and sale revenue → `text-foreground` (neutral, just data)

**Remove** the existing inline profit display from inside the sale price card (lines ~1136-1137 in VehicleForm.tsx) once `VehicleFinancialPanel` is in place.

---

### Part 6 — Responsive Side-by-Side Layout (Vehicle Edit)

**File:** `frontend/src/components/vehicles/VehicleForm.tsx`

**Problem:** The Related Transactions table always stacks below the form. At bigger screens or after zoom-out, it could sit alongside the form.

**Solution:** Wrap the form columns + related transactions table in a responsive grid:

```tsx
// Current structure (simplified):
<div>
  <div className="grid grid-cols-1 xl:grid-cols-2">  {/* form fields */}
    <div>...buy details...</div>
    <div>...sale details...</div>
  </div>
  <VehicleFinancialPanel />
  <RelatedTransactionsTable />  {/* ALWAYS below */}
</div>

// New structure:
<div className="grid grid-cols-1 2xl:grid-cols-[1fr_400px] gap-6">
  {/* Left: form + financial panel */}
  <div>
    <div className="grid grid-cols-1 xl:grid-cols-2">
      <div>...buy details...</div>
      <div>...sale details...</div>
    </div>
    <VehicleFinancialPanel />
  </div>
  
  {/* Right: related transactions (side-by-side at 2xl+) */}
  {isEditing && (
    <div className="2xl:sticky 2xl:top-4 2xl:self-start">
      <RelatedTransactionsTable />
    </div>
  )}
</div>
```

**Breakpoint rationale:**
- `2xl` = 1536px. At this width the table can sit at 400px wide without cramping the form.
- Below `2xl` → stacks below (current behavior — unchanged, not degraded)
- The transactions table gets `max-h-[60vh] overflow-y-auto` so it never forces the page to scroll
- `2xl:sticky top-4 self-start` makes it stay in view as the user scrolls through long form fields

**Safety condition:** Only apply the side-by-side layout when `isEditing === true`. On the "Add New Vehicle" page this entire section doesn't render anyway.

---

## 📁 Files Changed / Created

### Backend
| File | Action | Why |
|------|--------|-----|
| `backend/manager/dashboard_api.py` | **Create** | New dashboard endpoint |
| `backend/drivebase/urls.py` | **Edit** | Register dashboard router |

### Frontend
| File | Action | Why |
|------|--------|-----|
| `frontend/src/types/dashboard.ts` | **Create** | TypeScript types for dashboard API response |
| `frontend/src/hooks/useDashboard.ts` | **Create** | TanStack Query hook for dashboard data |
| `frontend/src/components/vehicles/VehicleFinancialPanel.tsx` | **Create** | Compact financial summary for edit page |
| `frontend/src/pages/DashboardPage.tsx` | **Rewrite** | Real data + recharts visualizations |
| `frontend/src/components/transactions/TransactionForm.tsx` | **Edit** | Replace grid formula with pill formula bar |
| `frontend/src/components/vehicles/VehicleForm.tsx` | **Edit** | Add `VehicleFinancialPanel`, responsive layout |

### Docs (after completing work)
| File | Action | Why |
|------|--------|-----|
| `PROJECT_MAP.md` | **Update** | Add new files above to the maps |
| `README.md` | **Update** | Add `/api/dashboard/` to endpoints section |

---

## ⚠️ Edge Cases to Handle

1. **Dashboard with zero data** — Business is brand new, no vehicles, no transactions. Show empty states, not zeros that look like bugs. Use a `<EmptyState>` pattern (text + icon, no broken chart).

2. **recharts not in package.json** — Check first. Run `npm list recharts` in frontend. If missing, add it. The `agentrules` says TanStack Table is used; recharts is a separate visualization library. It's in the artifact docs as available but check the actual `package.json`.

3. **Dashboard API multi-tenancy** — Every query in `dashboard_api.py` MUST filter by `request.user.business`. No exceptions. Employees with no transaction access: the dashboard endpoint should check `request.user.has_transaction_access` and omit transaction-related data if False (return nulls or zeros, same pattern as the sidebar hiding those sections).

4. **Transaction formula pill on very narrow screens** — Use `flex-wrap` so if the screen is too narrow the three pills wrap to two lines instead of overflowing.

5. **VehicleFinancialPanel when buy price = 0** — Treat as "no buy data" (same as `!buyBreakdown.hasValue`). Don't show a formula like `€0 − €0 = €0`. Show an empty/placeholder state.

6. **Side-by-side layout on the Add New Vehicle page** — `RelatedTransactionsTable` is not rendered when `isEditing === false`, so the responsive grid just collapses to single column naturally. No special handling needed.

7. **`active_for` field in dashboard API** — The `Vehicle` model has `active_for` as a computed property (days since `buy_date`). It is NOT stored in the DB. The avg/max calculation needs to iterate over Python objects, not use a DB aggregate. Keep this efficient — limit to active vehicles only (status in purchased/ready/reserved). If there are hundreds of vehicles this is still fast.

---

## 🔢 Implementation Order

Run in this exact order to avoid broken intermediate states:

```
Step 1  backend/manager/dashboard_api.py       ← creates the endpoint
Step 2  backend/drivebase/urls.py                   ← wires it up
Step 3  frontend/src/types/dashboard.ts        ← types before hook
Step 4  frontend/src/hooks/useDashboard.ts     ← hook before page
Step 5  frontend/src/pages/DashboardPage.tsx   ← use the hook
Step 6  VehicleFinancialPanel.tsx              ← isolated component first
Step 7  VehicleForm.tsx (financial panel)      ← import new component, remove old inline profit
Step 8  VehicleForm.tsx (responsive layout)   ← grid restructure
Step 9  TransactionForm.tsx                    ← formula pill redesign
Step 10 PROJECT_MAP.md + README.md             ← docs update (after everything works)
```

---

## 🧪 Verification Checklist

After each step, verify:

- [ ] `npm run build` in frontend compiles without TypeScript errors
- [ ] `python manage.py test manager.tests` passes (backend)
- [ ] Dashboard page loads with real vehicle counts (not hardcoded "124")
- [ ] Vehicle pipeline chart shows correct status breakdown
- [ ] Monthly chart shows last 12 months (may be empty if no data — that's fine, check empty state)
- [ ] Transaction formula pill shows correct Net / Tax / Gross values
- [ ] Profit on vehicle edit page shows in `VehicleFinancialPanel`, not inline next to sale price
- [ ] At `2xl` screen width (1536px), transactions table is to the right of form
- [ ] Below `2xl`, transactions table is below form (original behavior)
- [ ] Dark mode looks correct (no hardcoded colors anywhere)
- [ ] Employee with no transaction access: dashboard shows no transaction data

---

## 💬 Notes for the Agent

- **recharts** is the right chart library — it's React-native, SSR-friendly, and doesn't need a `<canvas>` polyfill. Use `BarChart` for monthly revenue, a custom `HorizontalBar` built with CSS for the pipeline breakdown (simpler + matches the design system better than a Recharts chart for 5 status values).

- **Don't use `any` types** — `dashboard.ts` types must be fully typed. Use `number` for all monetary values returned from the backend (the API should convert Decimal → float before returning).

- **i18n:** All new user-visible strings in `DashboardPage.tsx`, `VehicleFinancialPanel.tsx` need `t()` keys added to `de.json`, `en.json`, `tr.json`, `ar.json`. Add them even if some translations are approximate — they can be refined later.

- **Status colors in charts:** Reference `--color-status-purchased`, `--color-status-ready-for-sale` etc. from `index.css` CSS variables. Do NOT hardcode `#f59e0b` — use `getComputedStyle(document.documentElement).getPropertyValue('--color-status-purchased')` to pass to recharts fill props, or use Tailwind's inline style approach. Check how `StatusBanner.tsx` currently resolves status colors to copy the pattern.

- **The `professional-calculator-formula-ui` skill specifies "side-by-side: left = inputs, right = formula."** In `TransactionForm.tsx` this isn't fully achievable without a major layout restructure (the form is already a 2-column grid). Apply the spirit of the skill instead: the formula bar sits immediately below the Amount/Tax inputs, is clearly visual, and shows the math happening in real time. That satisfies the goal without a structural overhaul.
