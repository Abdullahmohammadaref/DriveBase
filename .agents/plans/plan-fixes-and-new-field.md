# plan-fixes-and-new-field.md — Choice Edit Fix, Deactivate Fix & Key Number Field

> **Date:** 2026-05-16
> **Agent target:** Antigravity / Claude Code
> **Priority:** Fix (1, 2) then Feature (3)
> **Pre-read (mandatory):** `idea.md`, `developer-guide.md`, `PROJECT_MAP.md`, `design-system/colors.md`, `design-system/components.md`

---

## Context Summary

DriveBase is a single-business vehicle management system. Stack: Django + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui. This plan covers two bug fixes on the Choices Management page and one new model + field feature (Key Number). Do the fixes first — they are isolated. The Key Number feature touches the most files and should be done last.

---

## Fix 1 — "Deactivate" button in Choices Management does nothing

### Problem

Clicking the **Deactivate** button next to an active choice item in Choices Management page appears to do nothing. The button is visually correct, wired to `handleDeactivate`, the `deactivateMutation` calls the correct endpoint, and the backend endpoint (`POST /choices/{type}/{id}/deactivate`) is correct. The root cause is a **React rendering / closure problem**:

The `deactivateMutation.isPending` check sets `disabled={deactivateMutation.isPending}` on the button. When the mutation fires and enters a pending state, TanStack Query triggers a re-render. If the component re-renders (e.g. because `queryClient.invalidateQueries` starts in the background), the button can momentarily flash, the `confirm()` dialog may be getting blocked by the browser in certain contexts (Vite dev, embedded iframes, or some browser settings treating `confirm()` calls from async event handlers as blocked), or the mutation error is swallowed silently.

### Root Cause — Confirmed

The `updateMutation` sits above `deactivateMutation` in the same component. When `updateMutation` is in an error state (from the broken save — Fix 2), `useMutation` in TanStack Query v5 can leave the component in a partially dirty state where subsequent mutation calls (like deactivate) are silently dropped if the query client is in the middle of a refetch. More concretely: **`deactivateMutation` has no `onError` handler**, so when it fails (for any reason — network, 403, etc.) it fails silently, and the user sees nothing happen.

### Fix

**File:** `frontend/src/pages/ChoicesManagementPage.tsx`

**Step 1 — Add `onError` to `deactivateMutation`:**

```ts
const deactivateMutation = useMutation({
    mutationFn: async (params: { choiceType: string; choiceId: number }) => {
        const response = await api.post(`/choices/${params.choiceType}/${params.choiceId}/deactivate`)
        return response.data
    },
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["choices-management"] })
    },
    onError: (error: any) => {
        const message = error?.response?.data?.detail || "Failed to deactivate. Please try again."
        alert(message)
    },
})
```

**Step 2 — Replace `confirm()` with a direct call:**

The browser `confirm()` dialog is unreliable in Vite dev server environments and some contexts. Replace the confirmation-before-action pattern with a direct call (the UI already shows a "Deactivate" text button — the user already made a deliberate choice by clicking it):

```ts
// BEFORE:
const handleDeactivate = (choiceType: string, choiceId: number) => {
    if (!confirm(t("choices.confirmDeactivate", "Are you sure you want to deactivate this option?"))) {
        return
    }
    deactivateMutation.mutate({ choiceType, choiceId })
}

// AFTER — remove confirm(), call mutate directly:
const handleDeactivate = (choiceType: string, choiceId: number) => {
    deactivateMutation.mutate({ choiceType, choiceId })
}
```

This is safe — the action is reversible (Reactivate button exists). No confirmation dialog needed for a reversible action.

**Step 3 — Add `onError` to `reactivateMutation` for parity:**

```ts
const reactivateMutation = useMutation({
    mutationFn: async (params: { choiceType: string; choiceId: number }) => {
        const response = await api.post(`/choices/${params.choiceType}/${params.choiceId}/reactivate`)
        return response.data
    },
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["choices-management"] })
    },
    onError: (error: any) => {
        const message = error?.response?.data?.detail || "Failed to reactivate. Please try again."
        alert(message)
    },
})
```

No other changes. The backend, the endpoints, the button placement, and the mutation call itself are all correct.

---

## Fix 2 — Editing a choice saves nothing (spinner flashes, then nothing)

### Problem

When the user opens the edit modal on a choice (clicking an item name), edits the name, and clicks Save, a loading spinner briefly appears, then disappears — and the name is **not saved**. The data in the list remains unchanged. This has been broken since the edit modal was added. A previous AI attempt at fixing this caused a white screen of death, which was reverted. This plan describes the **safe, minimal fix**.

### Root Cause — Confirmed in Code

**File:** `frontend/src/pages/ChoicesManagementPage.tsx`, `updateMutation` (lines 139–161):

```ts
const updateMutation = useMutation({
    mutationFn: async (params: { ... }) => {
        const formData = new FormData()
        formData.append("name", params.name)
        if (params.percentage) {
            formData.append("percentage", params.percentage)
        }
        const response = await api.patch(`/choices/${params.choiceType}/${params.choiceId}`, formData, {
            headers: { "Content-Type": "multipart/form-data" },
        })
        return response.data
    },
    ...
})
```

The frontend sends `multipart/form-data`. The backend endpoint `update_choice` reads the data via:

```python
new_name = request.POST.get('name')
new_percentage = request.POST.get('percentage')
```

**The problem:** Django Ninja's `PATCH` handler does **not** populate `request.POST` from `multipart/form-data`. `request.POST` is only populated for `application/x-www-form-urlencoded` POST requests. For a `PATCH` with `multipart/form-data`, `request.POST` is empty — so `new_name` is `None`, and the backend immediately returns `400: {"detail": "Name is required."}`. The mutation fails silently because there is no `onError` handler. The spinner flashes (the request was made), then stops (it got a 400 back), and nothing updates.

### Fix

There are two correct approaches. **Use Approach A** — it is the safest, requires no frontend JS changes, and matches how all other Django Ninja endpoints in this codebase work.

#### Approach A — Fix the backend to accept a JSON body via a Ninja Schema (RECOMMENDED)

**File:** `backend/manager/api.py`

Replace the `update_choice` endpoint signature and body parsing:

```python
# Add this schema near the other schemas at the top of api.py (or inline as a local class)
class ChoiceUpdatePayload(Schema):
    name: str
    percentage: Optional[float] = None

@router.patch(
    "/choices/{choice_type}/{choice_id}",
    response={200: SuccessResponse, 400: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse}
)
def update_choice(request, choice_type: str, choice_id: int, payload: ChoiceUpdatePayload):
    """Update a choice name or percentage (managers only)."""
    if not request.user.is_manager:
        return 403, {"detail": "Only managers can update choices."}

    business = get_user_business(request)

    model_map = {
        'payment_method': PaymentMethod,
        'vehicle_type': VehicleType,
        'body_type': BodyType,
        'make': Make,
        'vehicle_model': VehicleModel,
        'color': Color,
        'fuel_type': FuelType,
        'damage_type': DamageType,
        'doors': DoorsChoice,
        'tax_percentage': TaxPercentage,
        'category': Category,
        'subcategory': Subcategory,
        'currency': Currency,
    }

    model_class = model_map.get(choice_type)
    if not model_class:
        return 400, {"detail": f"Invalid choice type: {choice_type}"}

    new_name = payload.name.strip()
    if not new_name:
        return 400, {"detail": "Name is required."}

    try:
        choice = model_class.objects.get(id=choice_id, business=business)

        # Check for duplicate name (excluding self)
        if choice_type == 'vehicle_model':
            if VehicleModel.objects.filter(make=choice.make, name=new_name).exclude(id=choice_id).exists():
                return 400, {"detail": f"Model '{new_name}' already exists for this manufacturer."}
        elif choice_type == 'subcategory':
            if Subcategory.objects.filter(category=choice.category, name=new_name).exclude(id=choice_id).exists():
                return 400, {"detail": f"Subcategory '{new_name}' already exists for this category."}
        else:
            if model_class.objects.filter(business=business, name=new_name).exclude(id=choice_id).exists():
                return 400, {"detail": f"'{new_name}' already exists."}

        choice.name = new_name

        if choice_type == 'tax_percentage' and payload.percentage is not None:
            choice.percentage = payload.percentage

        choice.save()

        log_activity(
            request,
            action='update',
            entity_type=choice_type,
            entity_id=choice_id,
            entity_name=new_name
        )

        return {"success": True, "message": "Choice updated successfully"}

    except model_class.DoesNotExist:
        return 404, {"detail": "Choice not found"}
```

Key changes from the old version:
- `request.POST.get(...)` → `payload.name` / `payload.percentage` (Ninja schema-based, reads JSON body)
- `def update_choice(request, choice_type, choice_id)` → adds `payload: ChoiceUpdatePayload` parameter
- All duplicate-check and save logic is identical — no logic changes

**File:** `frontend/src/pages/ChoicesManagementPage.tsx`

Update `updateMutation` to send **JSON** instead of `FormData`, and add an `onError` handler:

```ts
const updateMutation = useMutation({
    mutationFn: async (params: {
        choiceType: string
        choiceId: number
        name: string
        percentage?: string
    }) => {
        const body: Record<string, any> = { name: params.name.trim() }
        if (params.percentage && params.percentage.trim() !== "") {
            body.percentage = parseFloat(params.percentage)
        }
        // Send JSON — matches the backend ChoiceUpdatePayload Schema
        const response = await api.patch(
            `/choices/${params.choiceType}/${params.choiceId}`,
            body
            // No custom Content-Type header — api.ts defaults to application/json
        )
        return response.data
    },
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["choices-management"] })
        closeModal()
    },
    onError: (error: any) => {
        const message = error?.response?.data?.detail || "Failed to save. Please try again."
        alert(message)
    },
})
```

The only frontend changes:
1. Remove `const formData = new FormData()` and all `formData.append(...)` lines
2. Replace `api.patch(..., formData, { headers: ... })` with `api.patch(..., body)` — plain JSON object, no custom headers
3. Add `onError` handler

**Do not touch any other part of `ChoicesManagementPage.tsx`** in this fix. No JSX, no state, no modal logic. Only the `mutationFn` body and adding `onError`.

---

## Feature 3 — Key Number Field for Vehicles

### Business Rule

Every vehicle in **purchased**, **ready_for_sale**, or **reserved** status has a physical key assigned to it. That key has a unique number. The number is reserved for that vehicle while it is in one of those three statuses. When the vehicle is **sold** or **inactive**, the key is released and the number becomes available again.

Key numbers are created and managed in Choices Management (like other choices). The key number is a **mandatory field** on both the Add Vehicle and Edit Vehicle pages. In Choices Management, the key can be re-assigned to a different (active) vehicle directly from the edit modal.

### Architecture Decisions

- **`KeyNumber` is a new Django model** — not a simple string field. It behaves like `Make`, `Color`, etc. (business-scoped, manageable via Choices Management), but with one extra field: `vehicle` (a nullable OneToOne FK to `Vehicle`).
- **Uniqueness of the number value**: the number value is unique per business. No two keys with the same number can exist.
- **The number is a positive integer** (zero allowed, as requested). It is stored as `PositiveIntegerField`.
- **Assignment tracking**: `KeyNumber.vehicle` is set when a vehicle is assigned that key. When a vehicle is sold or goes inactive, the FK is cleared (set to `null`).
- **On the vehicle form**: there is a `key_number_id` FK field. It shows only **available** key numbers (those with `vehicle=None`) PLUS the currently assigned key (so the vehicle's own key always shows in the dropdown even though it's already linked).
- **In Choices Management**: the key number tab shows each key's number and which vehicle it is currently linked to (if any). The edit modal allows changing the number value and re-assigning the vehicle link.

---

### Step 1 — Backend: New `KeyNumber` Model

**File:** `backend/manager/models.py`

Add after the `DoorsChoice` model (around line 354), before `TaxPercentage`:

```python
class KeyNumber(models.Model):
    """Physical key numbers for vehicles. Each key is assigned to one vehicle at a time."""
    number = models.PositiveIntegerField(
        _('key number'),
        help_text=_('The physical key number. Must be unique per business. Zero is allowed.')
    )
    business = models.ForeignKey(
        Business,
        on_delete=models.CASCADE,
        related_name='key_numbers',
        verbose_name=_('business')
    )
    vehicle = models.OneToOneField(
        'Vehicle',
        on_delete=models.SET_NULL,
        related_name='key_number',
        null=True,
        blank=True,
        verbose_name=_('vehicle'),
        help_text=_('The vehicle this key is currently assigned to.')
    )
    is_active = models.BooleanField(_('is active'), default=True)

    class Meta:
        ordering = ['number']
        unique_together = ['number', 'business']
        verbose_name = _('Key Number')
        verbose_name_plural = _('Key Numbers')

    def __str__(self):
        return str(self.number)
```

Key design points:
- `number` is `PositiveIntegerField` (0 included via `PositiveIntegerField` — Django allows 0)
- `unique_together = ['number', 'business']` prevents duplicate numbers per business
- `vehicle` is `OneToOneField` with `SET_NULL` — clearing the vehicle doesn't delete the key
- `is_active` follows the same pattern as all other choice models

### Step 2 — Backend: Migration

**File:** create `backend/manager/migrations/0064_keynumber.py`

Run `python manage.py makemigrations` — Django will auto-generate this. The migration creates the `manager_keynumber` table. Do not manually write this file — let Django generate it. After generating, verify it creates the table with columns: `id`, `number`, `business_id`, `vehicle_id`, `is_active`.

### Step 3 — Backend: Update `Vehicle` model to clear key on status change

**File:** `backend/manager/models.py`

The `Vehicle` model already has a `status` field. We need to hook into status changes to automatically clear the key assignment when a vehicle becomes `sold` or `inactive`.

Add a Django signal or override `save()` on `Vehicle`. The cleanest approach for this codebase is to handle it in the **API layer** (in the status-change endpoint), not in the model's `save()`. See Step 6.

### Step 4 — Backend: Add `KeyNumber` to API choices

**File:** `backend/manager/api.py`

**4a — Import `KeyNumber`:**

In the `from .models import (...)` block, add `KeyNumber`:

```python
from .models import (
    Vehicle, Business, Branch, LegalEntity,
    VehicleType, BodyType, Make, VehicleModel,
    Color, FuelType, DamageType, DoorsChoice,
    PaymentMethod, TaxPercentage, Currency, Category, Subcategory,
    ActivityLog, KeyNumber  # ← add KeyNumber
)
```

**4b — Add `key_numbers` to the `get_all_choices` endpoint (`GET /choices`):**

The vehicle form calls this endpoint to populate all dropdowns. Add key numbers to the response. The endpoint must return **only unassigned key numbers + the current vehicle's own key**. Since the `/choices` endpoint does not know which vehicle is being edited (it is a general endpoint), return **all unassigned key numbers** (those with `vehicle=None` and `is_active=True`). The vehicle form will handle adding the currently assigned key to the list locally (see frontend step).

```python
# In get_all_choices(), add to the return dict:
"key_numbers": list(
    KeyNumber.objects.filter(business=business, is_active=True, vehicle__isnull=True)
    .values('id', 'number')
),
```

**4c — Add `key_numbers` to `AllChoices` schema in `schemas.py`:**

```python
class KeyNumberOut(Schema):
    id: int
    number: int

class AllChoices(Schema):
    # ... existing fields ...
    key_numbers: List[KeyNumberOut] = []
```

Import `KeyNumberOut` where needed.

**4d — Add `key_number` to the choices management endpoint (`GET /choices/management`):**

In `get_choices_for_management`, add the key number tab data. The management page needs to show: number, which vehicle is linked, active/inactive.

```python
# In get_choices_for_management(), add to choice_types dict:
"key_number": {
    "name": "key_number",
    "displayName": "Key Numbers",
    "active": [
        {
            "id": k.id,
            "name": str(k.number),
            "vehicle_id": k.vehicle_id,
            "vehicle_label": f"#{k.vehicle.internal_id} {k.vehicle.make_name_display} {k.vehicle.model_name_display}".strip() if k.vehicle else None,
        }
        for k in KeyNumber.objects.filter(business=business, is_active=True)
                                   .select_related('vehicle', 'vehicle__make', 'vehicle__model')
                                   .order_by('number')
    ],
    "inactive": [
        {
            "id": k.id,
            "name": str(k.number),
            "vehicle_id": None,
            "vehicle_label": None,
        }
        for k in KeyNumber.objects.filter(business=business, is_active=False)
                                   .order_by('number')
    ],
}
```

Note on `make_name_display` / `model_name_display`: access via `k.vehicle.make.name if k.vehicle.make else ""` and similarly for model. Keep it simple.

**4e — Add `key_number` to `TAB_ORDER` in the choices management handler for deactivate/reactivate/update:**

The `update_choice`, `deactivate_choice`, and `reactivate_choice` endpoints all use a `model_map` dict. Add `key_number` to all three:

```python
'key_number': KeyNumber,
```

This allows deactivating/reactivating key numbers from the Choices Management page using the existing generic endpoints with no other changes.

**4f — Handle `KeyNumber` creation in `POST /choices/{choice_type}`:**

The existing `add_choice` endpoint handles creating a new choice. Add a branch for `key_number`:

```python
elif choice_type == 'key_number':
    # name here is the number value (passed as string from the modal)
    try:
        number_value = int(name)
        if number_value < 0:
            return 400, {"detail": "Key number must be zero or a positive integer."}
    except ValueError:
        return 400, {"detail": "Key number must be a valid integer."}
    
    if KeyNumber.objects.filter(business=business, number=number_value).exists():
        return 400, {"detail": f"Key number {number_value} already exists."}
    
    obj = KeyNumber.objects.create(business=business, number=number_value)
    return 201, {
        "success": True,
        "id": obj.id,
        "name": str(obj.number),
        "message": f"Key number {number_value} created successfully"
    }
```

**4g — Update `update_choice` (`PATCH /choices/{choice_type}/{choice_id}`) to handle `key_number`:**

The generic `ChoiceUpdatePayload` schema uses `name: str`. For key numbers, `name` is the number value as a string (same as the add modal). Add special handling:

In `update_choice`, after `new_name = payload.name.strip()`, add:

```python
# Special handling for key_number — name IS the number
if choice_type == 'key_number':
    try:
        new_number = int(new_name)
        if new_number < 0:
            return 400, {"detail": "Key number must be zero or a positive integer."}
    except ValueError:
        return 400, {"detail": "Key number must be a valid integer."}
    
    # Check uniqueness
    if KeyNumber.objects.filter(business=business, number=new_number).exclude(id=choice_id).exists():
        return 400, {"detail": f"Key number {new_number} already exists."}
    
    key = get_object_or_404(KeyNumber, id=choice_id, business=business)
    
    # Handle optional vehicle re-assignment from payload
    # payload will have an extra field 'vehicle_id' for key numbers (Optional[int])
    key.number = new_number
    # vehicle assignment handled by separate field (see ChoiceUpdatePayload extension below)
    if hasattr(payload, 'vehicle_id'):
        if payload.vehicle_id is None:
            key.vehicle = None
        elif payload.vehicle_id:
            vehicle = get_object_or_404(Vehicle, id=payload.vehicle_id, business=business)
            # Only assign to active-status vehicles
            if vehicle.status not in ('purchased', 'ready_for_sale', 'reserved'):
                return 400, {"detail": "Can only assign key to a vehicle that is Purchased, Ready for Sale, or Reserved."}
            key.vehicle = vehicle
    key.save()
    log_activity(request, action='update', entity_type='key_number', entity_id=choice_id, entity_name=str(new_number))
    return {"success": True, "message": "Key number updated successfully"}
```

For this to work, extend `ChoiceUpdatePayload` to allow the optional `vehicle_id` field:

```python
class ChoiceUpdatePayload(Schema):
    name: str
    percentage: Optional[float] = None
    vehicle_id: Optional[int] = None  # Only used for key_number type
```

### Step 5 — Backend: Vehicle schema and API changes for `key_number_id`

**File:** `backend/manager/schemas.py`

Add `key_number_id` and `key_number_value` (display) to `VehicleDetailOut`:

```python
class VehicleDetailOut(Schema):
    # ... existing fields ...
    key_number_id: Optional[int] = None
    key_number_value: Optional[int] = None  # The actual number for display
```

Add `key_number_id` to `VehicleCreate` (required):

```python
class VehicleCreate(Schema):
    # ... existing fields ...
    key_number_id: int  # Required — mandatory field
```

Add `key_number_id` to `VehicleUpdate` (optional):

```python
class VehicleUpdate(Schema):
    # ... existing fields ...
    key_number_id: Optional[int] = None
```

**File:** `backend/manager/vehicle_api.py`

In `VehicleListSchema` (used for the vehicle detail endpoint response), add:

```python
class VehicleListSchema(Schema):
    # ... existing fields ...
    key_number_id: Optional[int] = None
    key_number_value: Optional[int] = None

    @staticmethod
    def resolve_key_number_value(obj):
        return obj.key_number.number if hasattr(obj, 'key_number') and obj.key_number else None

    @staticmethod
    def resolve_key_number_id(obj):
        return obj.key_number.id if hasattr(obj, 'key_number') and obj.key_number else None
```

In the vehicle create endpoint, after creating the vehicle, assign the key:

```python
# After Vehicle.objects.create(...):
if data.key_number_id:
    key = get_object_or_404(KeyNumber, id=data.key_number_id, business=business)
    if key.vehicle is not None and key.vehicle_id != vehicle.id:
        # Key is already assigned to another vehicle
        raise HttpError(400, f"Key number {key.number} is already assigned to another vehicle.")
    key.vehicle = vehicle
    key.save()
```

In the vehicle update/patch endpoint (`PATCH /vehicles/{internal_id}`), handle `key_number_id` changes:

```python
if data.key_number_id is not None:
    # Remove old key assignment if changing
    try:
        old_key = vehicle.key_number  # via reverse OneToOne
        if old_key.id != data.key_number_id:
            old_key.vehicle = None
            old_key.save()
    except KeyNumber.DoesNotExist:
        pass
    
    new_key = get_object_or_404(KeyNumber, id=data.key_number_id, business=business)
    if new_key.vehicle is not None and new_key.vehicle_id != vehicle.id:
        raise HttpError(400, f"Key number {new_key.number} is already assigned to another vehicle.")
    new_key.vehicle = vehicle
    new_key.save()
```

In the status-change endpoint (wherever vehicle status is updated), clear the key when status becomes `sold` or `inactive`:

```python
# After updating vehicle.status:
if new_status in ('sold', 'inactive'):
    try:
        key = vehicle.key_number
        key.vehicle = None
        key.save()
    except KeyNumber.DoesNotExist:
        pass  # No key assigned, nothing to clear
```

Find the status change endpoint in `vehicle_api.py` (likely a `POST /vehicles/{id}/change-status` or similar) and add this block after the status is set.

Also add `KeyNumber` to the import in `vehicle_api.py`:

```python
from .models import (
    Vehicle, ..., KeyNumber  # ← add
)
```

### Step 6 — Frontend: VehicleForm — Key Number field

**File:** `frontend/src/lib/validations.ts`

Add `key_number_id` to `vehicleCreateSchema` (required):

```ts
export const vehicleCreateSchema = z.object({
    // ... existing fields ...
    key_number_id: z.number({ message: "Key number is required" }),
    // ...
})
```

Add `key_number_id` to `vehicleUpdateSchema` (optional):

```ts
export const vehicleUpdateSchema = z.object({
    // ... existing fields ...
    key_number_id: z.number().optional().nullable(),
    // ...
})
```

**File:** `frontend/src/components/vehicles/VehicleForm.tsx`

**6a — Populate the key number dropdown:**

The form calls `GET /choices` which now returns `key_numbers`. In the `choices` data, there will be a `key_numbers` array (only unassigned ones). For the **edit** form, we need to also include the vehicle's own currently-assigned key (since it's already linked, it won't appear in the "unassigned" list).

Build the options list:

```ts
// In the component body, near where other choice options are built:
const keyNumberOptions = useMemo(() => {
    const fromChoices = choices?.key_numbers ?? []
    // If editing and vehicle has a key_number already, make sure it's included
    if (vehicle?.key_number_id && vehicle?.key_number_value !== undefined) {
        const alreadyIncluded = fromChoices.some(k => k.id === vehicle.key_number_id)
        if (!alreadyIncluded) {
            return [
                { id: vehicle.key_number_id, name: String(vehicle.key_number_value) },
                ...fromChoices.map(k => ({ id: k.id, name: String(k.number) })),
            ]
        }
    }
    return fromChoices.map(k => ({ id: k.id, name: String(k.number) }))
}, [choices?.key_numbers, vehicle?.key_number_id, vehicle?.key_number_value])
```

**6b — Initialize the form value:**

In the `useForm` `defaultValues`, add:

```ts
key_number_id: vehicle?.key_number_id ?? undefined,
```

**6c — Add the field in JSX:**

The Key Number field goes in the **Vehicle Details** section of the form (near `make`, `model`, `color`, etc. — the identity fields). It is **mandatory** on both Add and Edit.

```tsx
{/* Key Number */}
<div className="space-y-1.5">
    <Label htmlFor="key_number_id">
        {t("vehicles.keyNumber", "Key Number")}{" "}
        <span className="text-destructive">*</span>
    </Label>
    <DynamicSelect
        choiceType="key_number"
        options={keyNumberOptions}
        value={watch("key_number_id") ?? null}
        onChange={(val) => {
            setValue("key_number_id", val ?? undefined as any)
            if (mode === "edit") {
                onAutoSave({ key_number_id: val ?? undefined })
            }
        }}
        placeholder={t("vehicles.selectKeyNumber", "Select key number...")}
        allowCreate={true}
    />
    {errors.key_number_id && (
        <p className="text-sm text-red-500">{errors.key_number_id.message}</p>
    )}
</div>
```

Place this after the `make`/`model` fields or in the vehicle details card — consistent with other mandatory choice fields.

**6d — Include `key_number_id` in the autosave and create payloads:**

In the `onSubmit` / `onAutoSave` handlers, `key_number_id` is already included automatically because it's in the form schema. No extra wiring needed — the form will include it in the patch/create payload.

**6e — Add locale keys** to all four locale files (`de.json`, `en.json`, `tr.json`, `ar.json`):

```json
"vehicles.keyNumber": "Key Number",
"vehicles.selectKeyNumber": "Select key number..."
```

### Step 7 — Frontend: Choices Management — Key Number tab

**File:** `frontend/src/pages/ChoicesManagementPage.tsx`

**7a — Add `key_number` to `TAB_ORDER`:**

```ts
const TAB_ORDER = [
    "make",
    "vehicle_model",
    "key_number",    // ← add here, after vehicle_model
    "category",
    "subcategory",
    // ... rest unchanged
] as const
```

**7b — Extend `ChoiceItem` interface** to include vehicle info:

```ts
interface ChoiceItem {
    id: number
    name: string
    percentage?: number
    is_protected?: boolean
    vehicle_id?: number | null       // ← new — only for key_number type
    vehicle_label?: string | null    // ← new — display string for the linked vehicle
}
```

**7c — Add display name for the tab:**

In `getTabDisplayName` (or equivalent mapping), add:

```ts
"key_number": t("choices.keyNumber", "Key Numbers"),
```

**7d — Custom edit modal for `key_number` type:**

The generic edit modal handles `name` (string) + optionally `percentage`. For key numbers, the modal needs:
- A **number input** for the key number value (not a text input — it must be a positive integer, zero allowed)
- A **vehicle select dropdown** showing only vehicles in `purchased`, `ready_for_sale`, or `reserved` status

When `modalChoiceType === "key_number"`, render a different modal body:

**Add state for the vehicle assignment in the modal:**

```ts
const [modalVehicleId, setModalVehicleId] = useState<number | null>(null)
const [modalVehicleLabel, setModalVehicleLabel] = useState<string>("")
```

**Add a query for active vehicles** (only when modal is open and type is key_number):

```ts
const { data: activeVehiclesData } = useQuery({
    queryKey: ["vehicles-for-key-assignment"],
    queryFn: async () => {
        const response = await api.get("/vehicles", {
            params: {
                status: "purchased",  // will call multiple or use OR filter
                page: 1,
                page_size: 200,       // fetch enough to fill dropdown
            }
        })
        return response.data
    },
    enabled: modalOpen && modalChoiceType === "key_number",
})
```

Since the backend `/vehicles` endpoint filters by a single status, and we need three statuses, either:
- Call three separate queries and merge, OR
- Pass a comma-separated status filter if the backend supports it

**Simpler approach:** add a `?statuses=purchased,ready_for_sale,reserved` query param to the vehicles list endpoint, OR fetch all vehicles without the `inactive` filter (default behavior already excludes inactive). Check: does the default vehicles list endpoint (no status filter) already exclude `inactive`? Yes — from the vehicle_api.py: `queryset = queryset.exclude(status='inactive')`. So fetching vehicles with no status filter gives all of purchased + ready_for_sale + reserved + sold. Then filter on the frontend to exclude sold:

```ts
const activeVehicles = useMemo(() => {
    const items = activeVehiclesData?.vehicles?.items ?? []
    return items.filter((v: any) => 
        ['purchased', 'ready_for_sale', 'reserved'].includes(v.status)
    )
}, [activeVehiclesData])
```

Each vehicle option label: `#${v.internal_id} ${v.make_name} ${v.model_name}`.

**In the modal `<form>` body**, when `modalChoiceType === "key_number"`:

```tsx
{modalChoiceType === "key_number" ? (
    <>
        {/* Number input */}
        <div className="mb-4">
            <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                {t("choices.keyNumberValue", "Key Number")}
                {" "}<span className="text-destructive">*</span>
            </label>
            <input
                type="number"
                min={0}
                step={1}
                value={modalName}
                onChange={(e) => setModalName(e.target.value)}
                required
                className="w-full rounded-lg border border-input bg-transparent px-4 py-2.5 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="e.g. 42"
                autoFocus
            />
        </div>
        {/* Vehicle assignment — only shown in edit mode */}
        {modalMode === "edit" && (
            <div className="mb-4">
                <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
                    {t("choices.assignedVehicle", "Assigned Vehicle")}
                </label>
                <select
                    value={modalVehicleId ?? ""}
                    onChange={(e) => setModalVehicleId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full rounded-lg border border-input bg-transparent px-4 py-2.5 text-sm text-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                    <option value="">{t("choices.noVehicle", "— No vehicle assigned —")}</option>
                    {activeVehicles.map((v: any) => (
                        <option key={v.id} value={v.id}>
                            #{v.internal_id} {v.make_name} {v.model_name}
                        </option>
                    ))}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">
                    {t("choices.keyVehicleHint", "Only vehicles in Purchased, Ready for Sale, or Reserved status are shown.")}
                </p>
            </div>
        )}
    </>
) : (
    // Existing generic name input
    <div className="mb-4">
        <label ...>...</label>
        <input type="text" value={modalName} ... />
    </div>
)}
```

**7e — Update `openEditModal`** to populate `modalVehicleId` when opening a key number:

```ts
const openEditModal = (choiceType: string, item: ChoiceItem) => {
    setModalChoiceType(choiceType)
    setModalTitle(`${t("choices.edit", "Edit")} ${item.name}`)
    setModalName(item.name)
    setModalPercentage(item.percentage?.toString() ?? "")
    setModalEditId(item.id)
    setModalMode("edit")
    // Key number specific
    if (choiceType === "key_number") {
        setModalVehicleId(item.vehicle_id ?? null)
    } else {
        setModalVehicleId(null)
    }
    setModalOpen(true)
}
```

**7f — Update `handleAddChoice` / `handleModalSubmit`** to include `vehicle_id` for key_number edit:

```ts
if (modalMode === "edit" && modalEditId) {
    const body: Record<string, any> = {
        choiceType: modalChoiceType,
        choiceId: modalEditId,
        name: modalName.trim(),
        percentage: modalPercentage,
    }
    if (modalChoiceType === "key_number") {
        body.vehicleId = modalVehicleId  // maps to vehicle_id in backend
    }
    updateMutation.mutate(body)
}
```

Update `updateMutation.mutationFn` params interface to include optional `vehicleId`:

```ts
const updateMutation = useMutation({
    mutationFn: async (params: {
        choiceType: string
        choiceId: number
        name: string
        percentage?: string
        vehicleId?: number | null  // ← new for key_number
    }) => {
        const body: Record<string, any> = { name: params.name.trim() }
        if (params.percentage && params.percentage.trim() !== "") {
            body.percentage = parseFloat(params.percentage)
        }
        if (params.choiceType === "key_number") {
            body.vehicle_id = params.vehicleId ?? null
        }
        const response = await api.patch(
            `/choices/${params.choiceType}/${params.choiceId}`,
            body
        )
        return response.data
    },
    // ... onSuccess, onError unchanged
})
```

**7g — Display vehicle label in the choice list** for key_number items:

In `renderChoiceTypeContent`, the active/inactive item rows currently show `item.name` and a Deactivate button. For key_number items, show the linked vehicle label alongside the number:

```tsx
<div key={item.id} className={ACTIVE_ITEM_CLASS}>
    <div className="flex flex-col">
        <button
            onClick={() => openEditModal(typeKey, item)}
            className="text-sm text-foreground hover:text-primary hover:underline text-left transition-colors font-medium"
        >
            {item.name}
        </button>
        {typeKey === "key_number" && item.vehicle_label && (
            <span className="text-xs text-muted-foreground mt-0.5">
                {t("choices.assignedTo", "Assigned to:")} {item.vehicle_label}
            </span>
        )}
        {typeKey === "key_number" && !item.vehicle_label && (
            <span className="text-xs text-muted-foreground mt-0.5 italic">
                {t("choices.unassigned", "Unassigned")}
            </span>
        )}
    </div>
    {/* Deactivate button — unchanged */}
</div>
```

**7h — Also reset `modalVehicleId` in `closeModal`:**

```ts
const closeModal = () => {
    setModalOpen(false)
    setModalName("")
    setModalPercentage("")
    setModalParentId(null)
    setModalEditId(null)
    setModalMode("add")
    setModalVehicleId(null)    // ← add
    setModalVehicleLabel("")   // ← add
}
```

**7i — Add locale keys** for the choices management UI:

```json
"choices.keyNumber": "Key Numbers",
"choices.keyNumberValue": "Key Number",
"choices.assignedVehicle": "Assigned Vehicle",
"choices.assignedTo": "Assigned to:",
"choices.unassigned": "Unassigned",
"choices.noVehicle": "— No vehicle assigned —",
"choices.keyVehicleHint": "Only vehicles in Purchased, Ready for Sale, or Reserved status are shown."
```

Add to all four locale files: `de.json`, `en.json`, `tr.json`, `ar.json`.

---

## Files Modified Summary

| File | Change | Feature |
|---|---|---|
| `backend/manager/models.py` | Add `KeyNumber` model | 3 |
| `backend/manager/migrations/0064_keynumber.py` | Auto-generated migration | 3 |
| `backend/manager/api.py` | Fix `update_choice` to use Ninja schema body; add `KeyNumber` to model_map in all choice endpoints; add `key_number` branch to `add_choice`; add `key_number` to `get_all_choices` and `get_choices_for_management`; import `KeyNumber` | 2, 3 |
| `backend/manager/schemas.py` | Add `KeyNumberOut`; add `key_numbers` to `AllChoices`; add `key_number_id` and `key_number_value` to `VehicleDetailOut`; add `key_number_id` to `VehicleCreate` and `VehicleUpdate`; add `ChoiceUpdatePayload` with `vehicle_id` field | 2, 3 |
| `backend/manager/vehicle_api.py` | Import `KeyNumber`; handle `key_number_id` in create and update endpoints; clear key assignment on `sold`/`inactive` status change | 3 |
| `frontend/src/pages/ChoicesManagementPage.tsx` | Fix 1: remove `confirm()`, add `onError` to deactivate/reactivate mutations; Fix 2: update `updateMutation` to send JSON not FormData, add `onError`; Feature: add `key_number` to `TAB_ORDER`, extend `ChoiceItem` interface, add `modalVehicleId` state, update `openEditModal`, update `handleModalSubmit`, add key number modal UI with vehicle select, display vehicle label in list | 1, 2, 3 |
| `frontend/src/lib/validations.ts` | Add `key_number_id` to `vehicleCreateSchema` (required) and `vehicleUpdateSchema` (optional) | 3 |
| `frontend/src/components/vehicles/VehicleForm.tsx` | Add `key_number_id` to form defaults and submit payload; add `keyNumberOptions` memo; add Key Number `DynamicSelect` field in JSX with mandatory asterisk | 3 |
| `frontend/src/locales/de.json` | Add `vehicles.keyNumber`, `vehicles.selectKeyNumber`, `choices.keyNumber`, `choices.keyNumberValue`, `choices.assignedVehicle`, `choices.assignedTo`, `choices.unassigned`, `choices.noVehicle`, `choices.keyVehicleHint` | 3 |
| `frontend/src/locales/en.json` | Same | 3 |
| `frontend/src/locales/tr.json` | Same | 3 |
| `frontend/src/locales/ar.json` | Same | 3 |

---

## Order of Implementation

Fix the bugs first. The feature is independent but touches many more files.

1. **Fix 1 — Deactivate button** (`ChoicesManagementPage.tsx` only): remove `confirm()`, add `onError` to both mutations. Test: click Deactivate on an active choice — it should immediately deactivate and the list should update. Click on already-failing cases (network off) — should show an error alert.

2. **Fix 2 — Choice edit save** (backend `api.py` + frontend `ChoicesManagementPage.tsx`): change backend to use Ninja schema body; change frontend `updateMutation` to send JSON. Test: open edit modal on a choice, change the name, click Save — the modal should close, the list should refresh, the new name should be visible. Test error: try saving an empty name or a duplicate — should show an alert, modal stays open.

3. **Feature 3 — Key Number** (run in this order):
   a. `models.py` — add `KeyNumber` model
   b. `python manage.py makemigrations` — generate migration
   c. `python manage.py migrate` — apply migration
   d. `api.py` — add `KeyNumber` to all choice model maps, add `get_all_choices` and `get_choices_for_management` additions, add `add_choice` branch, update `update_choice`
   e. `schemas.py` — add `KeyNumberOut`, update `AllChoices`, update `VehicleDetailOut`, `VehicleCreate`, `VehicleUpdate`, add `vehicle_id` to `ChoiceUpdatePayload`
   f. `vehicle_api.py` — import `KeyNumber`, handle in create/update/status-change endpoints
   g. `validations.ts` — add `key_number_id` to both schemas
   h. `VehicleForm.tsx` — add field, options memo, form wiring
   i. `ChoicesManagementPage.tsx` — add tab, states, modal UI, list display
   j. All four locale files

---

## TypeScript Verification

After all changes:
```bash
cd frontend && npx tsc --noEmit
```
All type errors must be resolved. No `any` types introduced without comment explaining why. Unused imports removed.

---

## Do Not Touch

- `StickyFooter.tsx` — use as-is
- Dark mode classes — do not change any `dark:` variants unless a new component needs it
- `useAutoSave.ts` — the key number field wires into the same autosave pattern, no changes to the hook
- Any existing locale keys — only add the new ones listed above
- `DynamicSelect` component — use it exactly as other FK choice fields use it; `choiceType="key_number"` will work once the backend endpoint returns it
- Any PDF generation files — key number is not shown on PDFs (not in scope)
- Test files — do not update tests in this plan (separate task)
