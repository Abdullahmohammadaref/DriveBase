# 📝 Documentation: Edit Vehicle Financial Formulas & COGS Sign Fix

**Date:** 2026-08-22  
**Plan Reference:** `prompt_edit_vehicle_cogs_profit_fix.md` & `edit_vehicle_formula_explanation.jsx`  
**Scope:** Edit Vehicle Details Page Financial Metrics Calculation Engine (`vehicleFinancials.ts`) & UI Display (`FinancialMetricsStrip.tsx`)

---

## 🎯 Summary of Changes

This update fixes the sign bug in the vehicle-scoped expense/earning calculation and restructures Gross Profit, Net Profit, and Total Profit formulas on the Vehicle Edit Details page:

### 1. Root Cause Fix: `calcNetExpensesEarnings` Sign Convention
- **Previous bug**: `entries.reduce((sum, e) => sum + (e.type === "expense" ? amt : -amt))` returned positive values for expenses and negative values for earnings, which inverted the true signed net balance.
- **Fix**: Updated to `sum + (e.type === "earning" ? amt : -amt)` (i.e. `totalEarnings − totalExpenses`).
- **Result**: Matches the literal `NET` display in `VehicleExpensesEarningsCard` (e.g. €300 expense with €0 earnings produces a signed value of `−300.00 €`).

### 2. COGS & Gross COGS Formula Alignment
- **COGS**: `buy_net + net_exp_earn` (where `net_exp_earn` is signed).  
  *Example*: `14,409.09 + (−300.00) = 14,109.09 €`
- **Gross COGS** (introduced as `grossCogs`): `buy_gross + net_exp_earn`  
  *Example*: `15,850.00 + (−300.00) = 15,550.00 €`

### 3. Restructured Profit Metrics (Gross, Net, Total Profit)
- **Gross Profit**: `(sale_gross − buy_gross) + net_exp_earn`.  
  *Example*: `(19,990.00 − 15,850.00) + (−300.00) = 4,140.00 − 300.00 = 3,840.00 €`
- **Net Profit**: `(sale_net − buy_net) + net_exp_earn`.  
  *Example*: `(18,172.73 − 14,409.09) + (−300.00) = 3,763.64 − 300.00 = 3,463.64 €`
- **VAT Liability**: `|sale_tax_amount − buy_tax_amount|` (unchanged).  
  *Example*: `|1,817.27 − 1,440.91| = 376.36 €`
- **Total Profit**: `Net Profit − VAT Liability`.  
  *Example*: `3,463.64 − 376.36 = 3,087.28 €`
- **Margin & ROI**:
  - `Margin`: `(Gross Profit ÷ sale_net) × 100` (`21.1%`)
  - `ROI`: `(Gross Profit ÷ COGS) × 100` (`27.2%`)

### 4. Financial Metrics Strip Equations
Updated equation text under each metric cell in `FinancialMetricsStrip.tsx`:
- **COGS**: `${fc(buyNet)} + (${fc(netExpensesEarnings)})` (or `+ ${fc(netExpensesEarnings)}`)
- **Gross Profit**: `${fc(saleGross)} − ${fc(buyGross)} + (${fc(netExpensesEarnings)})` (e.g. `19.990,00 € − 15.850,00 € + (-300,00 €)`)
- **Net Profit**: `${fc(saleNet)} − ${fc(buyNet)} + (${fc(netExpensesEarnings)})` (e.g. `18.172,73 € − 14.409,09 € + (-300,00 €)`)
- **Total Profit**: `${fc(netProfit)} − ${fc(taxLiability)}` (e.g. `3.463,64 € − 376,36 €`)
- **VAT Liability**: `|${fc(saleTax)} − ${fc(buyTax)}|` (e.g. `|1.817,27 € − 1.440,91 €|`)
- **Margin**: `${fc(grossProfit)} ÷ ${fc(saleNet)} × 100`
- **ROI**: `${fc(grossProfit)} ÷ ${fc(cogs)} × 100`
- **Break-Even**: Unchanged.

---

### 5. Vehicles Page Header Financial Summary Alignment
Aligned `calculate_financial_summary` in `backend/manager/api.py` and `calculate_summary` in `backend/manager/vehicle_api.py` with the vehicle financial calculations:
- **Gross Revenue**: `sum(vehicle.sale_price)` (`19.990,00 €`)
- **Net Revenue**: `sum(vehicle.sale_price_net)` (`18.172,73 €`)
- **Gross Expenses**: `sum(Gross COGS)` = `sum(buy_gross + net_exp_earn)` (`15.550,00 €`)
- **Net Expenses**: `sum(COGS)` = `sum(buy_net + net_exp_earn)` (`14.109,09 €`)
- **Gross Profit**: `sum((sale_gross − buy_gross) + net_exp_earn)` (`3.840,00 €`)
- **Net Profit**: `sum((sale_net − buy_net) + net_exp_earn)` (`3.463,64 €`)
- **VAT Liability**: `sum(|sale_tax_amount − buy_tax_amount|)` (`376,36 €`)
- **Total Profit**: `sum(Net Profit − VAT Liability)` (`3.087,28 €`)

---

## 📁 Modified Files

| File | Changes |
|------|---------|
| `backend/manager/api.py` | Updated `calculate_financial_summary` to aggregate vehicle-scoped COGS, Gross COGS, VAT liability, and profits. |
| `backend/manager/vehicle_api.py` | Updated `calculate_summary` and `VehicleSummarySchema` with matching financial calculations. |
| `backend/manager/schemas.py` | Updated `FinancialSummary` schema with `total_profit` and margin fields. |
| `frontend/src/types/vehicle.ts` | Added `total_profit` to `FinancialSummary` interface. |
| `frontend/src/components/vehicles/FinancialSummary.tsx` | Updated 5-card summary layout and aligned VAT Liability and Total Profit displays. |
| `frontend/src/lib/vehicleFinancials.ts` | Fixed `calcNetExpensesEarnings` sign calculation, added `calcGrossCOGS`, updated `calcGrossProfit(saleGross, grossCogs)`, `calcNetProfit(saleNet, cogs)`, `calcTotalProfit(netProfit, taxLiability)`, `calcProfitMargin(grossProfit, saleNet)`, `calcROI(grossProfit, cogs)`, added `grossCogs` to `VehicleFinancials` and `getFinancialColor`. |
| `frontend/src/components/vehicles/FinancialMetricsStrip.tsx` | Updated `MetricCell` equation props for COGS, Gross Profit, Net Profit, Total Profit, Margin, and ROI. |
| `.agents/design-system/components.md` | Updated Section 7 (FinancialMetricsStrip) formula specifications. |
| `.agents/artifacts/PROJECT_MAP.md` | Documented the financial formula fix and new documentation reference. |
