# Vehicle Expenses & Earnings — Implementation Docs

## Overview

Adds lightweight, vehicle-scoped expense and earning tracking to the Vehicle Edit page. This is **independent** of the bank-transaction system (`Transaction` model) and designed as a quick-entry mechanism for the Manager to record costs and revenues associated with a specific vehicle.

Also removes the deprecated `sale_commission` field from the entire stack.

---

## Backend Changes

### New Model: `VehicleExpenseEarning`

| Field | Type | Notes |
|---|---|---|
| `business` | FK → `Business` | Tenant isolation |
| `vehicle` | FK → `Vehicle` | `related_name='expenses_earnings'` |
| `category` | FK → `Category` | Uses existing Category model |
| `subcategory` | FK → `Subcategory` | Uses existing Subcategory model |
| `type` | CharField | `'expense'` or `'earning'` |
| `amount` | DecimalField | Always positive; sign determined by `type` |
| `is_active` | BooleanField | Soft-delete convention |
| `created_at` | DateTimeField | Auto-set on creation |

Uses `on_delete=models.PROTECT` for category/subcategory to prevent accidental deletion of referenced choices.

### New API Endpoints

All endpoints use the existing `router` (no new Django Ninja Router — per `skill-unexpected-error`).

| Method | Path | Response | Description |
|---|---|---|---|
| `GET` | `/vehicles/{internal_id}/expenses-earnings` | `List[VehicleExpenseEarningOut]` | List active entries |
| `POST` | `/vehicles/{internal_id}/expenses-earnings` | `VehicleExpenseEarningOut` | Create new entry |
| `DELETE` | `/vehicles/{internal_id}/expenses-earnings/{ee_id}` | `SuccessResponse` | Soft-delete (is_active=False) |

### New Schemas

- `VehicleExpenseEarningOut` — Response schema with resolved category/subcategory names
- `VehicleExpenseEarningCreate` — Request schema with validation (amount > 0, type regex)

### Removed: `sale_commission`

Removed from: `Vehicle` model, `VehicleDetailOut`, `VehicleUpdate`, `serialize_vehicle_detail()`.

Migration: `0068_remove_vehicle_sale_commission_vehicleexpenseearning`

---

## Frontend Changes

### New Type: `VehicleExpenseEarning`

Added to `types/vehicle.ts`. The `VehicleDetail` interface now includes `expenses_earnings: VehicleExpenseEarning[]`.

### New Hooks (in `useVehicles.ts`)

| Hook | Purpose |
|---|---|
| `useVehicleExpensesEarnings(vehicleInternalId)` | Fetch active entries |
| `useCreateExpenseEarning()` | Create mutation with cache invalidation |
| `useDeleteExpenseEarning()` | Soft-delete mutation with cache invalidation |

### New Component: `VehicleExpensesEarningsCard`

Located at `components/vehicles/VehicleExpensesEarningsCard.tsx`.

**Features:**
- 3-column summary banner (Expenses / Earnings / Net) with color-coded values
- Inline add form with type toggle (Expense/Earning), amount input, and dependent Category → Subcategory dropdowns via `DynamicSelect`
- Scrollable entry list (max 48rem height) with hover-reveal delete button
- Uses existing `DynamicSelect` with `allowCreate` for on-the-fly choice creation

### Removed: `sale_commission`

Removed from:
- `validations.ts` — `vehicleUpdateSchema`
- `VehicleForm.tsx` — Default values (2 places) and Commission input field JSX

### Layout Integration

The card is placed **after** the Buy/Sale two-column grid and **before** the Financial Metrics Strip, visible only in **edit mode**.

---

## Files Changed

| File | Change |
|---|---|
| `backend/manager/models.py` | + `VehicleExpenseEarning` model, − `sale_commission` field |
| `backend/manager/schemas.py` | + 2 new schemas, + `expenses_earnings` on `VehicleDetailOut`, − `sale_commission` |
| `backend/manager/api.py` | + 3 endpoints, + serializer wiring, − `sale_commission` ref |
| `backend/manager/migrations/0068_*.py` | Auto-generated migration |
| `frontend/src/types/vehicle.ts` | + `VehicleExpenseEarning` type, + field on `VehicleDetail`, − `sale_commission` |
| `frontend/src/lib/validations.ts` | − `sale_commission` from update schema |
| `frontend/src/hooks/useVehicles.ts` | + 3 new hooks + query key factory |
| `frontend/src/components/vehicles/VehicleExpensesEarningsCard.tsx` | **New file** |
| `frontend/src/components/vehicles/VehicleForm.tsx` | + Import + card integration, − commission field |
