# plan-ui-changes-2-fix.md — Bug Fixes & UI Corrections (Round 2)

> **Date:** 2026-05-15
> **Agent target:** Antigravity / Claude Code
> **Priority:** Fixes only — no new features, no schema changes
> **Pre-read (mandatory):** `idea.md`, `developer-guide.md`, `PROJECT_MAP.md`, `design-system/colors.md`, `design-system/components.md`

---

## Context Summary

DriveBase is a single-business vehicle management system. Stack: Django + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui. This plan addresses 8 issues reported after the previous `plan-ui-changes-2` work was applied. Two are compile-breaking syntax errors (items 7 and 8) — fix these first or the dev server won't start.

---

## Issue 1 — Choices: "Deactivate" button on inactive items not working

### Problem

On the Choices Management page, the **Deactivate** button shown next to active items does nothing when clicked. The `handleDeactivate` function exists and the `deactivateMutation` is defined, but the button appears unresponsive.

### Root Cause

The `handleDeactivate` function calls `confirm()` to prompt the user before proceeding:

```ts
const handleDeactivate = (choiceType: string, choiceId: number) => {
    if (!confirm(t("choices.confirmDeactivate", "Are you sure you want to deactivate this option?"))) {
```

The `confirm()` call is followed by a `return` inside a truncated/malformed block. Somewhere in the code this block was broken — the function body either closes prematurely or the `return` statement is misplaced, causing the mutation to never be called. This is also likely related to the JSX syntax error in Issue 8 (broken structure from the same file).

### Fix

**File:** `frontend/src/pages/ChoicesManagementPage.tsx`

Ensure `handleDeactivate` is correctly formed:

```ts
const handleDeactivate = (choiceType: string, choiceId: number) => {
    if (!confirm(t("choices.confirmDeactivate", "Are you sure you want to deactivate this option?"))) {
        return
    }
    deactivateMutation.mutate({ choiceType, choiceId })
}
```

No other changes to this function. The mutation, its `onSuccess` invalidation, and the button that calls it are all correct — only the function body closure is broken.

---

## Issue 2 — Choices: Clicking a choice should open an edit modal

### Problem

Clicking on a choice item name (in any tab on the Choices Management page) does nothing. The user wants to be able to edit a choice's name (and amount/percentage, if it has one) by clicking on it — using the same modal pattern already present in the page for adding new choices.

### What already exists

The page already has:
- `modalOpen`, `modalTitle`, `modalName`, `modalPercentage`, `modalChoiceType`, `modalParentId` state
- `openAddModal()` / `closeModal()` functions
- A `fixed inset-0` modal with backdrop (`bg-black/50` + `onClick={closeModal}`), X button, and a form
- `addMutation` for creating choices

### What needs to be added

1. **New state for edit mode:**
```ts
const [modalMode, setModalMode] = useState<"add" | "edit">("add")
const [modalEditId, setModalEditId] = useState<number | null>(null)
```

2. **New `openEditModal` function:**
```ts
const openEditModal = (choiceType: string, item: { id: number; name: string; percentage?: number }, title: string) => {
    setModalChoiceType(choiceType)
    setModalTitle(title)
    setModalName(item.name)
    setModalPercentage(item.percentage?.toString() ?? "")
    setModalParentId(null)
    setModalEditId(item.id)
    setModalMode("edit")
    setModalOpen(true)
}
```

Also update `closeModal` to reset the new state:
```ts
const closeModal = () => {
    setModalOpen(false)
    setModalName("")
    setModalPercentage("")
    setModalParentId(null)
    setModalEditId(null)
    setModalMode("add")
}
```

3. **New `updateMutation`:**
```ts
const updateMutation = useMutation({
    mutationFn: async (params: { choiceType: string; choiceId: number; name: string; percentage?: string }) => {
        const response = await api.patch(`/choices/${params.choiceType}/${params.choiceId}`, {
            name: params.name,
            ...(params.percentage !== undefined && params.percentage !== "" ? { percentage: params.percentage } : {}),
        })
        return response.data
    },
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["choices-management"] })
        closeModal()
    },
})
```

4. **Update the modal form submit handler** to branch on mode:
```ts
const handleModalSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!modalName.trim()) return

    if (modalMode === "edit" && modalEditId !== null) {
        updateMutation.mutate({
            choiceType: modalChoiceType,
            choiceId: modalEditId,
            name: modalName.trim(),
            percentage: modalPercentage,
        })
    } else {
        addMutation.mutate({
            choiceType: modalChoiceType,
            name: modalName.trim(),
            percentage: modalPercentage,
            parentId: modalParentId,
        })
    }
}
```

Replace `handleAddChoice` with `handleModalSubmit` in the `<form onSubmit={...}>`.

5. **Update modal title dynamically** — the title is already set via `openAddModal`/`openEditModal`, so no change needed there.

6. **Make choice item names clickable** — in the general items list (the `activeItems.map` and `inactiveItems.map` inside `renderGenericContent`), wrap the item name in a clickable element:

```tsx
// Before:
<span className="text-sm text-foreground">{item.name}</span>

// After (active items):
<button
    onClick={() => openEditModal(typeKey, item, `${t("choices.edit", "Edit")} ${item.name}`)}
    className="text-sm text-foreground hover:text-primary hover:underline text-left transition-colors"
>
    {item.name}
</button>
```

Do the same for inactive items (`inactiveItems.map`), and for model/subcategory items inside `renderVehicleModelContent` and the categories section. The pattern is the same: clicking the name calls `openEditModal` with the correct `choiceType`.

**Choice type mapping for `openEditModal` calls:**
- General tab items → use `typeKey` (same as deactivate button already uses)
- Vehicle models → `"vehicle_model"` for models, `"make"` for make-level items
- Subcategories → `"subcategory"`, categories → `"category"`

7. **Backend:** Check that `PATCH /choices/{choiceType}/{choiceId}` exists in `backend/manager/api.py`. If it does not, add it:

```python
class ChoiceUpdateSchema(Schema):
    name: Optional[str] = None
    percentage: Optional[float] = None

@router.patch("/choices/{choice_type}/{choice_id}", auth=django_auth)
def update_choice(request, choice_type: str, choice_id: int, payload: ChoiceUpdateSchema):
    MODEL_MAP = {
        "make": Make,
        "vehicle_model": VehicleModel,
        "vehicle_type": VehicleType,
        "body_type": BodyType,
        "color": Color,
        "fuel_type": FuelType,
        "damage_type": DamageType,
        "doors": Doors,
        "tax_percentage": TaxPercentage,
        "payment_method": PaymentMethod,
        "currency": Currency,
        "category": Category,
        "subcategory": Subcategory,
    }
    Model = MODEL_MAP.get(choice_type)
    if not Model:
        raise HttpError(400, "Invalid choice type")
    obj = get_object_or_404(Model, id=choice_id, business=request.user.business)
    if payload.name is not None:
        obj.name = payload.name
    if payload.percentage is not None and hasattr(obj, "percentage"):
        obj.percentage = payload.percentage
    obj.save()
    return {"id": obj.id, "name": obj.name}
```

If the endpoint already exists, verify it accepts `name` and `percentage` and skip adding it.

---

## Issue 3 — Legal Entities: Remove "Add your first legal entity" from empty filter state

### Problem

When filtering legal entities returns no results, the empty state shows both "No legal entities found." and a clickable "Add your first legal entity" link. The "add" link should not appear when no results are found due to filtering — it should only appear when the list is genuinely empty (no entities at all).

### Fix

**File:** `frontend/src/pages/LegalEntitiesPage.tsx`

Find the empty state inside `<TableBody>`:

```tsx
<TableRow>
    <TableCell colSpan={6} className="text-center py-16 text-muted-foreground">
        <div className="flex flex-col items-center gap-2">
            <Search className="h-10 w-10 opacity-10 mb-2" />
            <p>{t("legalEntities.noEntities", "No legal entities found.")}</p>
            <button
                onClick={handleAddClick}
                className="text-primary hover:underline font-medium"
            >
                {t("legalEntities.addFirst", "Add your first legal entity")}
            </button>
        </div>
    </TableCell>
</TableRow>
```

Replace with a conditional — only show the "add" button when there are no filters active:

```tsx
<TableRow>
    <TableCell colSpan={6} className="text-center py-16 text-muted-foreground">
        <div className="flex flex-col items-center gap-2">
            <Search className="h-10 w-10 opacity-10 mb-2" />
            <p>{t("legalEntities.noEntities", "No legal entities found.")}</p>
            {!filters.search && !filters.type && !filters.status && !filters.city && (
                <button
                    onClick={handleAddClick}
                    className="text-primary hover:underline font-medium"
                >
                    {t("legalEntities.addFirst", "Add your first legal entity")}
                </button>
            )}
        </div>
    </TableCell>
</TableRow>
```

The logic: if any filter is active (`search`, `type`, `status`, or `city`), the empty state means "no results for this filter" — don't suggest adding. If no filters are active, the list is truly empty — suggest adding.

---

## Issue 4 — Pagination: Change "Showing X of Y" format everywhere

### Problem

The current pagination text is inconsistent and verbose. The user wants a clean, uniform format:

**Current (VehiclesPage, TransactionsPage):**
`Showing 2 of 32 vehicles`  ← shows items on current page, not range

**Current (LegalEntitiesPage):**
`Showing 1 – 20 of 32` ← shows range but no entity name

**Target format everywhere:**
`Showing 20 of 32 vehicles`  ← where "20" = items shown on the current page (length of current page results), "32" = total count

No "per page" label text, no dash-range format, just `Showing {currentPageCount} of {total} {entityName}`.

### Fix

**File: `frontend/src/pages/VehiclesPage.tsx`**

Current:
```tsx
Showing {data?.vehicles?.items?.length || 0} of {data?.vehicles?.total || 0} vehicles
```

This format is already correct structurally — but it's hardcoded English. Wrap in `t()`:
```tsx
{t("common.showing", "Showing")}{" "}
<span className="text-foreground">{data?.vehicles?.items?.length || 0}</span>
{" "}{t("common.of", "of")}{" "}
<span className="text-foreground">{data?.vehicles?.total || 0}</span>
{" "}{t("common.vehicles", "vehicles")}
```

**File: `frontend/src/pages/TransactionsPage.tsx`**

Same pattern:
```tsx
{t("common.showing", "Showing")}{" "}
<span className="text-foreground">{data?.transactions?.items?.length || 0}</span>
{" "}{t("common.of", "of")}{" "}
<span className="text-foreground">{data?.transactions?.total || 0}</span>
{" "}{t("common.transactions", "transactions")}
```

**File: `frontend/src/pages/LegalEntitiesPage.tsx`**

Replace the current range format (1–20 of 32) with the same clean format:

```tsx
{t("common.showing", "Showing")}{" "}
<span className="text-foreground">
    {data
        ? Math.min(filters.per_page || 20, data.total - ((data.page - 1) * (filters.per_page || 20)))
        : 0}
</span>
{" "}{t("common.of", "of")}{" "}
<span className="text-foreground">{data?.total ?? 0}</span>
{" "}{t("common.legalEntities", "legal entities")}
```

Or more simply, if `data.items` is available on the response object, use `data.items.length` instead of calculating.

**Locale files** — add keys to all four (`de.json`, `en.json`, `tr.json`, `ar.json`) if not already present:
```json
"common.vehicles": "vehicles",
"common.transactions": "transactions",
"common.legalEntities": "legal entities"
```

---

## Issue 5 — Pagination: Per-page input should allow clearing the field

### Problem

In the per-page input field (the `PerPageInput` component), if the current value is `20` and the user tries to clear it by deleting all digits, the input resists — it prevents the field from being fully empty. The user wants the field to allow being empty during typing, and when they click away (blur) without entering a value, it should default back to `20`.

### Fix

**File:** `frontend/src/components/PerPageInput.tsx`

The component currently uses a controlled input with a number value that's always set to the current `per_page`. Add an internal string state to allow temporary empty state:

```tsx
const PerPageInput = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => {
    const [inputValue, setInputValue] = useState(value.toString())

    // Sync external value changes into local state
    useEffect(() => {
        setInputValue(value.toString())
    }, [value])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(e.target.value) // allow empty string
    }

    const handleBlur = () => {
        const parsed = parseInt(inputValue, 10)
        if (!isNaN(parsed) && parsed >= 1) {
            onChange(Math.min(parsed, 200)) // cap at a sane max
        } else {
            // Empty or invalid — reset to previous value (or default 20)
            setInputValue(value.toString())
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.currentTarget.blur() // trigger blur/commit
        }
    }

    return (
        <input
            type="number"
            value={inputValue}
            onChange={handleChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            min={1}
            className={/* existing classes */}
        />
    )
}
```

Key behaviors:
- Typing clears the field fully — `inputValue` is a string, not a number, so empty string is valid.
- On blur with empty/invalid value → resets to the last valid `value` prop (no change emitted to parent).
- On blur with valid value → calls `onChange(parsed)`, which updates the parent filter state and triggers a re-fetch.
- Enter key commits (same as blur).

**Also apply the same fix to `PageInput.tsx`** (`frontend/src/components/PageInput.tsx`) — same pattern, same problem, same solution. On blur with empty/invalid value, reset to `currentPage`. On valid value, call `onPageChange`.

---

## Issue 6 — Legal Entities: Remove the city filter

### Problem

The city filter added in `plan-ui-changes-2` (Feature 1) is now considered pointless and should be removed.

### Fix

**File: `frontend/src/pages/LegalEntitiesPage.tsx`**

Remove:
- `cityValue` state (`const [cityValue, setCityValue] = useState("")`)
- The `useEffect` debounce for city filter
- The city filter `<div>` block in the toolbar (the `<div className="relative w-[180px]">` with the city `<Input>`)
- `filters.city` from the reset button visibility condition
- `setCityValue("")` from the reset button's `onClick`

**File: `frontend/src/hooks/useLegalEntities.ts`**

Remove `city?: string` from the `LegalEntityFilters` interface and remove the `params.set("city", filters.city)` line from the fetch function.

**File: `backend/manager/api.py`**

Remove the `city: Optional[str] = None` parameter and the `if city: qs = qs.filter(address_city__icontains=city)` block from the legal entities list endpoint.

---

## Issue 7 — TransactionForm: Duplicate `showSplitView` declaration (COMPILE ERROR)

### Problem

The app is broken with a white screen. The error is:

```
[plugin:vite:react-babel] Identifier 'showSplitView' has already been declared. (440:10)
```

**File:** `frontend/src/components/transactions/TransactionForm.tsx`

There are two `const showSplitView = ...` declarations:
- Line 184: `const showSplitView = mode === "edit" && isSplitView;`
- Line 440: `const showSplitView = isSplitView && mode === "edit"`

Both resolve to the same boolean. The second one was introduced by the split-view feature from `plan-ui-changes-2`. They are in the same function scope, causing the redeclaration error.

### Fix

**Delete line 440** (the second declaration). The first declaration at line 184 is correct and already used by the `widthClasses` logic below it. The second is a duplicate.

This is a one-line deletion. After deletion, confirm `showSplitView` is used throughout the rest of the function body — it should work without any other changes.

---

## Issue 8 — ChoicesManagementPage: JSX syntax error (COMPILE ERROR)

### Problem

The app occasionally breaks with:

```
[plugin:vite:react-babel] Unexpected token, expected "," (411:44)
```

**File:** `frontend/src/pages/ChoicesManagementPage.tsx`

The error is on line 411. The cause is malformed JSX — a `.map()` call is wrapped in `{}` inside a ternary expression but the outer ternary's truthy branch is itself `{}` (a block expression), not a JSX element. This is invalid JSX:

```tsx
// BROKEN — trying to use {} block inside JSX ternary truthy branch:
{filteredMakesWithModels.length > 0 ? (
        {filteredMakesWithModels.map((makeGroup) => {   // ← invalid: { inside (
            const isExpanded = ...
```

A ternary's truthy branch must be a JSX expression, not a block with `const` declarations inside.

### Fix

**File:** `frontend/src/pages/ChoicesManagementPage.tsx`

The `.map()` callback needs `const` declarations inside it, which requires a block body with an explicit `return`. The outer ternary needs the truthy branch to be a React fragment or a `<div>`. Fix:

```tsx
{filteredMakesWithModels.length > 0 ? (
    <div className="space-y-2">
        {filteredMakesWithModels.map((makeGroup) => {
            const isExpanded = expandedMakes.has(makeGroup.id)
            const activeModels = makeGroup.filteredActive || []
            const inactiveModels = makeGroup.filteredInactive || []
            const visibleChildrenCount = activeModels.length + inactiveModels.length

            return (
                <div key={makeGroup.id} className="mb-4 rounded-lg border border-border">
                    {/* ... rest of the existing makeGroup JSX ... */}
                </div>
            )
        })}
    </div>
) : (
    {/* ... existing empty state ... */}
)}
```

The exact change: replace `(` + `{` at the start of the truthy branch with `(` + `<div className="space-y-2">`, and close it with `</div>` before `)`. The `.map()` callback itself is correct — only the wrapper is broken.

Do the same audit for the **categories section** in the same file — it likely has the same structure (since the user hit the error "when in categories section"). Find the equivalent ternary around `filteredCategoriesWithSubs.map(...)` or similar and apply the same fix.

---

## Files Modified Summary

| File | Change | Issue |
|---|---|---|
| `frontend/src/pages/ChoicesManagementPage.tsx` | Fix `handleDeactivate` function body; add `openEditModal`, `updateMutation`, `modalMode`/`modalEditId` state; make item names clickable; fix JSX syntax errors in `.map()` wrappers | 1, 2, 8 |
| `frontend/src/pages/LegalEntitiesPage.tsx` | Remove "add" link from filtered empty state; remove city filter UI and state; fix pagination format | 3, 4, 6 |
| `frontend/src/pages/VehiclesPage.tsx` | Fix pagination format with `t()` | 4 |
| `frontend/src/pages/TransactionsPage.tsx` | Fix pagination format with `t()` | 4 |
| `frontend/src/hooks/useLegalEntities.ts` | Remove `city` from filters interface and fetch | 6 |
| `frontend/src/components/PerPageInput.tsx` | Allow empty field; commit on blur; reset on invalid | 5 |
| `frontend/src/components/PageInput.tsx` | Allow empty field; commit on blur; reset on invalid | 5 |
| `frontend/src/components/transactions/TransactionForm.tsx` | Delete duplicate `showSplitView` declaration at line 440 | 7 |
| `backend/manager/api.py` | Remove city filter param; add `PATCH /choices/{type}/{id}` if missing | 2, 6 |
| `frontend/src/locales/de.json` | Add `common.vehicles`, `common.transactions`, `common.legalEntities` | 4 |
| `frontend/src/locales/en.json` | Same | 4 |
| `frontend/src/locales/tr.json` | Same | 4 |
| `frontend/src/locales/ar.json` | Same | 4 |

---

## Order of Implementation

Fix compile errors first — the dev server is broken and nothing else can be tested until it starts.

1. **Issue 7** — Delete the duplicate `showSplitView` in `TransactionForm.tsx`. One-line fix. Dev server should restart.
2. **Issue 8** — Fix JSX syntax in `ChoicesManagementPage.tsx`. Wrap `.map()` truthy branches in `<div>`. Dev server must be fully green before continuing.
3. **Issue 1** — Fix `handleDeactivate` function closure in `ChoicesManagementPage.tsx`.
4. **Issue 6** — Remove city filter (frontend + backend). Clean removal.
5. **Issue 3** — Add filter guard to empty state in `LegalEntitiesPage.tsx`.
6. **Issue 4** — Update pagination text format in all three list pages + locale files.
7. **Issue 5** — Update `PerPageInput.tsx` and `PageInput.tsx` with internal string state.
8. **Issue 2** — Add edit modal to `ChoicesManagementPage.tsx` (most changes, do last).

---

## TypeScript Verification

After all changes:
```bash
cd frontend && npx tsc --noEmit
```
All type errors must be resolved. No `any` types introduced. No unused imports left behind.

---

## Do Not Touch

- `StickyFooter.tsx` — use as-is
- Dark mode classes — do not add or remove unless a new component specifically needs it
- Any locale keys that already exist — only add the new `common.*` keys listed above
- `VehicleFormPage.tsx` and its split view logic — no changes needed here
- Any backend model or migration files — the only backend change is removing the city filter param and optionally adding the PATCH choice endpoint
- The choices management page search — already instant, do not change
