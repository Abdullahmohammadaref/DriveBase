# Vehicle Edit Layout Rework (UI Tweak Fix 2)

## Goal
To modernize the "Edit Vehicle" page layout, bringing it closer to the provided visual mockup by utilizing a structured 6-column grid and a denser, modal-driven "Expenses & Earnings" UI.

## Changes Implemented

### 1. `VehicleExpensesEarningsCard.tsx`
- **Rebuilt entirely** to match the mockup:
  - Replaced the inline form with an **AddDialog modal** triggered by an "Add" button in the header.
  - Replaced the vertical list of entries with a **Wrapping Pill List** (`flex flex-wrap`), using explicit mockup color classes (`bg-red-100 text-red-700`, `bg-green-100 text-green-700`).
  - Implemented a condensed header displaying the overall net balance calculation.

### 2. `FinancialMetricsStrip.tsx`
- Restructured the non-compact mode to use a single fixed `grid-cols-3` layout.
- The `hasSale` conditional logic now simply injects additional cells into the *same* 3-column grid container instead of rendering a separate row, ensuring consistent alignment with the transactions table.

### 3. `RelatedTransactionsTable.tsx`
- Wrapped the internal `<TransactionTable ... />` inside a `<div className="overflow-x-auto">` container. This prevents the table from breaking its new 3-column wrapper slot on smaller monitors.

### 4. `VehicleForm.tsx` (Layout Engine)
- Added an `inlineTransactions?: React.ReactNode` prop to accept the transactions table from the parent page.
- Extracted all major form sections into local JSX constants (`vehiclePhotoField`, `descriptionField`, `internalCommentsField`, `buyDetailsCard`, `saleDetailsCard`, `expensesEarningsBlock`, `financialMetricsBlock`).
- **Conditional Rendering via IIFE:** Used an immediately-invoked function expression to render the old stacked layout for "Add Mode", but a new **6-column grid layout** for "Edit Mode":
  - **Row 1:** Photo (1 col), Description (1 col), Comments (1 col), Expenses & Earnings (3 cols).
  - **Row 2:** Buy Details (3 cols), Sale Details (3 cols).
  - **Row 3:** Financial Metrics (3 cols), Transactions Table (3 cols).

### 5. `VehicleFormPage.tsx`
- Wired the `RelatedTransactionsTable` into the new layout.
- Removed the old `<RelatedTransactionsTable>` blocks rendered underneath the form.
- Passed the table into `VehicleForm` using the newly exposed `inlineTransactions` prop.

## Structural Notes
No new files or components were created during this process. `PROJECT_MAP.md` requires no updates as the component hierarchy remains structurally identical; only the layout rendering logic within the components was modified.
