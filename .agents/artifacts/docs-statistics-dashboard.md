# Statistics Dashboard — Implementation Docs

> Feature: Statistics, Financial Calculations UX & Dashboard Overhaul  
> Implemented: 2026-05-10  
> Plan: [`plan-statistics-dashboard.md`](./plan-statistics-dashboard.md)

---

## What Changed

### Backend

| File | Action | Purpose |
|------|--------|---------|
| `backend/manager/dashboard_api.py` | **Created** | Dedicated `GET /api/dashboard/` endpoint. All KPIs pre-computed server-side. Scoped to `request.user.business`. |
| `backend/drivebase/urls.py` | Modified | Registered `dashboard_router` at `/` prefix |

### Frontend

| File | Action | Purpose |
|------|--------|---------|
| `frontend/src/types/dashboard.ts` | **Created** | TypeScript types matching backend `DashboardResponseSchema` |
| `frontend/src/hooks/useDashboard.ts` | **Created** | TanStack Query hook with 2-minute `staleTime` |
| `frontend/src/pages/DashboardPage.tsx` | **Rewritten** | Recharts-powered dashboard (bar chart, area chart, KPI cards) |
| `frontend/src/pages/VehicleFormPage.tsx` | **Rewritten** | Split-view toggle for side-by-side transactions |
| `frontend/src/components/vehicles/VehicleForm.tsx` | Modified | Added `splitViewToggle` prop rendered in StickyFooter |
| `frontend/src/components/vehicles/FinancialMetricsStrip.tsx` | **Rewritten** | 2-row grouped layout with shorter equations |

---

## API Endpoint

### `GET /api/dashboard/`

- **Auth**: `django_auth` (session-based, multi-tenant via `request.user.business`)
- **Caching**: 2 minutes on frontend (TanStack Query `staleTime`)
- **Single request** replaces old pattern of fetching 500 vehicles + 500 transactions

**Response fields:**
- `total_vehicles`, `in_stock`, `status_counts` — Inventory KPIs
- `total_revenue`, `total_cost`, `total_profit`, `overall_roi`, `overall_margin` — Financial KPIs
- `profit_distribution` — min/max/avg profit and margin
- `monthly_trend[]` — Last 12 months (revenue, expenses, profit, vehicles_sold)
- `top_vehicles[]`, `worst_vehicles[]` — Sorted by profit
- `financial_breakdown` — Net/Tax/Gross revenue vs expenses
- `days_on_stock` — Avg sold and avg unsold days
- `total_transactions`, `total_transaction_expenses`

---

## Dashboard UI Sections

1. **KPI Cards** (4 primary): Total Vehicles, Vehicles Sold, Total Net Profit, Overall ROI
2. **KPI Cards** (3 secondary): Total Revenue, Total Cost, Avg Days on Stock
3. **Status Distribution Bar**: Colored segments with legend
4. **Monthly Revenue vs Cost** (recharts `BarChart`)
5. **Profit Trend** (recharts `AreaChart` with gradient)
6. **Financial Breakdown Table**: Net/Tax/Gross with equation layout
7. **Profit Distribution**: Min/Max/Avg stats
8. **Top Performers**: Clickable top-5 vehicles with profit + margin

---

## Split-View Toggle

Added to `VehicleFormPage.tsx`:

- **Stack View** (default): Transactions table below vehicle form
- **Split View**: Transactions panel pinned side-by-side at `2xl` breakpoint (1536px+)
- **Persistence**: `localStorage` key `drivebase_vehicle_split_view`
- **Toggle button**: Rendered in StickyFooter via `splitViewToggle` prop on `VehicleForm`

---

## FinancialMetricsStrip Redesign

Restructured into two semantic rows:

- **Row 1 — Cost Basis**: COGS, Transaction Expenses, Break-Even, Holding Cost
- **Row 2 — Profit** (only when sold): Gross Profit, Net Profit, Total Profit (highlighted), Margin, ROI, Adjusted Profit

Equations shortened from `saleNet(€12,000) − buyNet(€10,000)` → `€12,000 − €10,000`

---

## Bug Fixed: Login Crash

**Root cause**: `dashboard_api.py` used `from manager.auth_api import session_auth` — but `session_auth` doesn't exist. The correct import is `from ninja.security import django_auth`.

**Impact**: Any import error in `urls.py` crashes the entire Django URL resolver, making ALL endpoints return 500 — including `/api/auth/login/`. The frontend catches this as "An unexpected error occurred".

**Prevention**: See [`skill-unexpected-error.md`](./.agents/skills/skill-unexpected-error.md) for the checklist to prevent this in the future.

---

## Design Decisions

1. **Server-side aggregation**: All dashboard math moved to Python to eliminate client-side processing
2. **Single endpoint**: One `GET /api/dashboard/` call instead of multiple vehicle/transaction fetches
3. **Split-view at 2xl only**: Side-by-side layout only at 1536px+ to avoid cramped UI on laptops
4. **recharts over custom SVG**: Using the existing `recharts` dependency for charts
