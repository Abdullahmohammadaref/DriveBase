# Deactivated Features Reference & Reactivation Guide

This document records UI features that have been deactivated for a cleaner, unified user experience, while preserving 100% of the underlying implementation code for easy future reactivation.

---

## 1. Split View in Edit Transaction (`EditTransactionPage.tsx` & `TransactionForm.tsx`)

### Overview
- **What it did**: Allowed splitting the Edit Transaction page into two side-by-side columns on large screens (Left: Transaction Form; Right: Related Transactions sub-table), with a `Stack View / Split View` toggle button in the header and a draggable divider.
- **Current State**: Deactivated. The page now uses the standard, full-width single-column layout with Related Transactions positioned cleanly below the form.

### Files Involved
1. `frontend/src/pages/EditTransactionPage.tsx`
2. `frontend/src/components/transactions/TransactionForm.tsx`

### How to Reactivate
1. In `frontend/src/pages/EditTransactionPage.tsx`:
   - Uncomment the `splitViewToggle` JSX block and the `isSplitView` localStorage state around line 35.
   - Pass `isSplitView={isSplitView}`, `splitViewToggle={splitViewToggle}`, `splitViewWidth={panelWidth}`, `onSplitViewWidthChange`, `onSplitViewWidthSave`, and `onSplitViewWidthStart` into `<TransactionForm />`.
2. In `frontend/src/components/transactions/TransactionForm.tsx`:
   - Change `const showSplitView = false;` (around line 200) to:
     ```ts
     const showSplitView = mode === "edit" && isSplitView;
     ```

---

## 2. Draggable Filter Dividers (`SplitViewDivider`)

### Overview
- **What it did**: Rendered a draggable vertical line handle between the filter sidebar and the main content area (table/cards) on `VehiclesPage.tsx`, `TransactionsPage.tsx`, and `LegalEntitiesPage.tsx`, allowing the user to resize the sidebar width dynamically.
- **Current State**: Deactivated. The filter sidebars now use a fixed, comfortable desktop width (`w-[265px]`) with standard layout spacing (`gap-3.5`), providing a clean enterprise look without the drag handle.

### Files Involved
1. `frontend/src/pages/VehiclesPage.tsx`
2. `frontend/src/pages/TransactionsPage.tsx`
3. `frontend/src/pages/LegalEntitiesPage.tsx`
4. `frontend/src/components/SplitViewDivider.tsx` (component preserved untouched)

### How to Reactivate
1. In `VehiclesPage.tsx`, `TransactionsPage.tsx`, and `LegalEntitiesPage.tsx`:
   - Uncomment the `panelWidth`, `isDragging`, `handleDrag`, and `handleDragEnd` hooks in the state section.
   - Replace the desktop sidebar container `w-[265px]` with `style={{ width: `${panelWidth}px` }}`.
   - Uncomment the `<SplitViewDivider />` component in the main layout JSX between the sidebar and the content area.
