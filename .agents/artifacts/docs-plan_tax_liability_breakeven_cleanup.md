# 📝 Documentation: Tax Liability Field, Dynamic Break-Even, and Holding Cost Cleanup

**Date:** 2026-08-13  
**Plan Reference:** `plan_tax_liability_breakeven_cleanup.md`  
**Scope:** Edit Vehicle Financial Metrics Strip + Business Settings Page Label  

---

## 🎯 Summary of Changes

This update refines the vehicle financial metrics strip on the vehicle edit page and updates settings labels for business clarity:

1. **VAT Liability Field Added**:
   - Replaced the "Txn Expenses" metric cell in the financial metrics strip with a new **"VAT Liability"** cell.
   - Formula: `|saleTaxAmount − buyTaxAmount|` (net VAT payable to government / Umsatzsteuerzahllast).
   - Displayed with an orange accent (`text-orange-600 dark:text-orange-400`).
   - If sale details/tax percentage are not set yet, displays `—` with equation `sale tax not set`.

2. **Dynamic Break-Even Calculation**:
   - Updated `calcBreakEvenPrice` in `vehicleFinancials.ts` to dynamically use `target_annual_return` from business settings (passed via `annualTargetRate` input as raw %, e.g., 10.0% → 0.10 decimal fraction).
   - Updated Break-Even metric cell equation in `FinancialMetricsStrip.tsx` from hardcoded `× 1.10` to dynamic multiplier string `${fc(f.cogs)} × ${(1 + (annualTargetRate ?? 10) / 100).toFixed(2)}`.

3. **Holding Cost & Adjusted Profit Commented Out**:
   - Commented out the `holdingCost` and `adjustedProfit` calculations in `vehicleFinancials.ts` and their corresponding `MetricCell` components in `FinancialMetricsStrip.tsx`.
   - The code remains preserved and commented out for quick, lossless recovery when full holding cost logic is revisited.

4. **Business Settings Page Relabeled**:
   - In `BusinessSettingsPage.tsx`, relabeled **"Target Annual Return (%)"** to **"Target Profit Margin (%)"**.
   - Updated field description to: *"Target profit margin used to calculate break-even sale price for each vehicle"*.
   - Database column and API payload key remain `target_annual_return` for backward compatibility.

---

## 📁 Modified Files

| File | Changes |
|------|---------|
| `frontend/src/lib/vehicleFinancials.ts` | Added `calcTaxLiability()`, updated `VehicleFinancials` interface (added `taxLiability`, commented `holdingCost`/`adjustedProfit`), updated `calcVehicleFinancials()` to compute `taxLiability` & dynamic `breakEvenPrice`, added `taxLiability` color to `getFinancialColor()`. |
| `frontend/src/components/vehicles/FinancialMetricsStrip.tsx` | Replaced `Txn Expenses` `MetricCell` with `VAT Liability`, commented out `Holding Cost` and `Adj. Profit` cells, updated `Break-Even` cell equation label to use dynamic target return rate. |
| `frontend/src/pages/BusinessSettingsPage.tsx` | Updated "Target Annual Return (%)" label to "Target Profit Margin (%)" and updated helper text. |

---

## 🛠️ Recovery Instructions (Holding Cost & Adjusted Profit)

To re-enable Holding Cost and Adjusted Profit in the future:
1. In `vehicleFinancials.ts`:
   - Uncomment `holdingCost` and `adjustedProfit` in `VehicleFinancials` interface.
   - Uncomment `calcHoldingCost` and `calcAdjustedProfit` calls in `calcVehicleFinancials()`. Note: ensure `annualTargetRate` is divided by 100 before passing to `calcHoldingCost`.
   - Uncomment fields in the return object.
2. In `FinancialMetricsStrip.tsx`:
   - Uncomment `Holding Cost` and `Adj. Profit` `MetricCell` blocks.
   - Re-enable `Timer` and `TrendingDown` in `lucide-react` imports.
