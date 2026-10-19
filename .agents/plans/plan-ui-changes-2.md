# plan-ui-changes-2.md — Legal Entities, Pagination, Split View, Search & Choices

> **Date:** 2026-05-15
> **Agent target:** Antigravity / Gemini Pro
> **Priority:** Frontend (primary) + small Backend (city filter only)
> **Pre-read (mandatory):** `idea.md`, `developer-guide.md`, `PROJECT_MAP.md`, `design-system/colors.md`, `design-system/components.md`, `design-system/spacing.md`, `design-system/typography.md`

---

## Context Summary

DriveBase is a single-business vehicle management system. Stack: Django + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui. All changes here are independent. Implement in order — later features reference patterns from earlier ones.

---

## Feature 1 — Legal Entities: City Filter

### Problem
The legal entities page has search (full-text), type filter (individual/company), and status filter (active/inactive), but no way to filter by city. The manager often works regionally and needs to narrow results by city.

### Backend

**File:** `backend/manager/api.py`

Find the legal entities list endpoint (the `GET /legal-entities` route). Add an optional `city` query parameter and filter the queryset:

```python
@router.get("/legal-entities", response=LegalEntitiesResponseSchema, auth=django_auth)
def list_legal_entities(request, ..., city: Optional[str] = None, ...):
    qs = LegalEntity.objects.filter(business=request.user.business)
    ...
    if city:
        qs = qs.filter(address_city__icontains=city)
    ...
```

The filter is case-insensitive (`icontains`). No schema change needed — it's a query parameter.

### Frontend hook

**File:** `frontend/src/hooks/useLegalEntities.ts`

1. Add `city?: string` to the `LegalEntityFilters` interface:

```ts
export interface LegalEntityFilters {
    search?: string
    type?: "individual" | "company"
    status?: "active" | "inactive"
    city?: string          // NEW
    page?: number
    per_page?: number
    sort?: string
    order?: "asc" | "desc"
}
```

2. In `fetchLegalEntities`, pass it as a query param:

```ts
if (filters.city) params.set("city", filters.city)
```

### Frontend UI

**File:** `frontend/src/pages/LegalEntitiesPage.tsx`

Add a city filter handler alongside the existing type/status handlers:

```ts
const handleCityFilter = useCallback((value: string) => {
    setFilters(prev => ({
        ...prev,
        city: value.trim() || undefined,
        page: 1,
    }))
}, [])
```

In the toolbar (`<div className="flex flex-wrap items-center gap-2">`), add a city text input **after** the status filter and before the reset button:

```tsx
{/* City Filter */}
<div className="relative w-[180px]">
    <Input
        placeholder={t("legalEntities.cityFilter", "Filter by city...")}
        className="h-10 pr-8"
        value={cityValue}
        onChange={(e) => {
            setCityValue(e.target.value)
            // Instant — debounced in useEffect below
        }}
    />
    {cityValue && (
        <button
            onClick={() => { setCityValue(""); handleCityFilter("") }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
            <X className="h-3 w-3" />
        </button>
    )}
</div>
```

Add a `cityValue` state alongside `searchValue`:
```ts
const [cityValue, setCityValue] = useState("")
```

Add a debounced `useEffect` for the city filter (500ms debounce — instant-ish but avoids hammering the API on every keystroke):
```ts
useEffect(() => {
    const timer = setTimeout(() => {
        handleCityFilter(cityValue)
    }, 500)
    return () => clearTimeout(timer)
}, [cityValue])
```

Update the reset button's onClick to also clear `cityValue`:
```ts
onClick={() => {
    setSearchValue("")
    setCityValue("")
    setFilters({ page: 1, per_page: filters.per_page, type: typeFromUrl || undefined })
}}
```

Update the reset button's visibility condition to include `filters.city`:
```ts
{(filters.search || filters.type || filters.status || filters.city) && (
    <Button ...>Reset</Button>
)}
```

---

## Feature 2 — Legal Entities: Always-Visible Action Icons

### Problem
In `LegalEntitiesPage.tsx`, the action buttons (Trash / RefreshCw) are hidden by default and only appear on hover (`opacity-0 group-hover:opacity-100`). The manager needs to see them at all times.

### Fix

**File:** `frontend/src/pages/LegalEntitiesPage.tsx`

Find the actions `<div>` inside the table row:

```tsx
<div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
```

Remove `opacity-0 group-hover:opacity-100 transition-opacity`. Replace with simply:

```tsx
<div className="flex items-center justify-end gap-1">
```

That is all. The buttons themselves already have hover styling — no further changes needed.

---

## Feature 3 — Legal Entities: "Inactive" Entry in Sidebar

### Problem
The sidebar has three legal entity entries: "All Entities", "Private Persons", "Companies". There is no quick filter for inactive entities. After deactivating an entity, there is no easy way to find and reactivate it without manually setting the status filter.

### Fix

**File:** `frontend/src/components/layout/Sidebar.tsx`

Find the legal entities `children` array:

```ts
{
    titleKey: "nav.legalEntities",
    path: "legal-entities",
    icon: Users,
    children: [
        { titleKey: "nav.all_entities", path: "legal-entities" },
        { titleKey: "nav.private", path: "legal-entities?type=individual", status: "individual" },
        { titleKey: "nav.companies", path: "legal-entities?type=company", status: "company" },
    ],
},
```

Add a fourth entry for inactive entities:

```ts
children: [
    { titleKey: "nav.all_entities", path: "legal-entities" },
    { titleKey: "nav.private", path: "legal-entities?type=individual", status: "individual" },
    { titleKey: "nav.companies", path: "legal-entities?type=company", status: "company" },
    { titleKey: "nav.inactive_entities", path: "legal-entities?status=inactive", status: "inactive_entity" },
],
```

Use a distinct `status` key (`"inactive_entity"`) to avoid collision with other status identifiers.

Add the active-link detection for it. In the `isActive` function in `Sidebar.tsx`, there's already special handling for legal entities type params. Extend it to handle the status param too:

```ts
if (path.includes("legal-entities")) {
    if (pathQuery?.includes("type=")) {
        return searchParams.get("type") === status
    }
    if (pathQuery?.includes("status=") && status === "inactive_entity") {
        return searchParams.get("status") === "inactive"
    }
}
```

Add the `statusColors` entry for it:
```ts
inactive_entity: "text-zinc-400",
```

Add translation keys in all four locale files (`de.json`, `en.json`, `tr.json`, `ar.json`):
```json
"nav.inactive_entities": "Inactive"
```

**In `LegalEntitiesPage.tsx`:** The page already reads the `type` URL param. Add reading of the `status` URL param on initial load:

```ts
const statusFromUrl = searchParams.get("status") as "active" | "inactive" | null

// In initial filters state:
const [filters, setFilters] = useState<LegalEntityFilters>({
    page: 1,
    per_page: 20,
    type: typeFromUrl || undefined,
    status: statusFromUrl || undefined,  // NEW
})

// In the useEffect that watches URL changes:
useEffect(() => {
    setFilters(prev => ({
        ...prev,
        type: typeFromUrl || undefined,
        status: statusFromUrl || undefined,  // NEW
        page: 1,
    }))
}, [typeFromUrl, statusFromUrl])
```

---

## Feature 4 — Legal Entities: Always-Visible StickyFooter with Pagination

### Problem
`LegalEntitiesPage.tsx` has a custom sticky footer div, but it only renders when `data.pages > 1`. The idea.md lists "Legal entities page missing footer/pagination in footer" as a known bug. The footer must:
1. Always be visible (consistent with all other pages)
2. Use the `StickyFooter` component for visual consistency
3. Show the "Showing X - Y of Z" summary even on page 1
4. Include page navigation controls (disabled when only 1 page)

### Fix

**File:** `frontend/src/pages/LegalEntitiesPage.tsx`

1. Import `StickyFooter`:
```ts
import { StickyFooter } from "@/components/StickyFooter"
```

2. Replace the current conditional footer block:

**Remove this:**
```tsx
{data && data.pages > 1 && (
    <div className="sticky bottom-0 z-10 border-t ...">
        ...
    </div>
)}
```

**Replace with** (always visible, uses StickyFooter):
```tsx
<StickyFooter>
    {/* Left: showing summary */}
    <p className="text-sm text-muted-foreground font-medium">
        {data
            ? <>
                {t("common.showing", "Showing")}{" "}
                <span className="text-foreground">
                    {data.total === 0 ? 0 : ((data.page - 1) * (filters.per_page || 20)) + 1}
                </span>
                {" – "}
                <span className="text-foreground">
                    {Math.min(data.page * (filters.per_page || 20), data.total)}
                </span>
                {" "}{t("common.of", "of")}{" "}
                <span className="text-foreground">{data.total}</span>
            </>
            : t("common.loading", "Loading...")
        }
    </p>

    {/* Right: page navigation */}
    <div className="flex items-center gap-2">
        <Button
            variant="outline"
            size="sm"
            disabled={!data || data.page <= 1 || isFetching}
            onClick={() => handlePageChange((data?.page ?? 1) - 1)}
            className="h-9"
        >
            <ChevronLeft className="h-4 w-4 mr-1" />
            {t("common.previous", "Previous")}
        </Button>
        <span className="text-sm text-muted-foreground px-2 font-medium">
            {t("common.page", "Page")}{" "}
            <span className="text-foreground">{data?.page ?? 1}</span>
            {" "}{t("common.of", "of")}{" "}
            <span className="text-foreground">{data?.pages ?? 1}</span>
        </span>
        <Button
            variant="outline"
            size="sm"
            disabled={!data || data.page >= data.pages || isFetching}
            onClick={() => handlePageChange((data?.page ?? 1) + 1)}
            className="h-9"
        >
            {t("common.next", "Next")}
            <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
    </div>
</StickyFooter>
```

3. Add bottom padding to the main scrollable content div to clear the footer:
```tsx
<div className="flex-1 overflow-auto p-6 pb-24 space-y-6">
```
(Change `pb-6` or default to `pb-24` — must match what other pages use per spacing.md.)

4. Remove the old `isFetching` loading overlay (the `fixed inset-0 z-50` block) — it's a bad UX pattern (blocks all interaction). The footer already shows a loading state via disabled buttons. If a lightweight loading indicator is needed, add a small spinner next to the "Showing" text when `isFetching` is true. This is optional.

---

## Feature 5 — Editable Per-Page Count (All Pagination Pages)

### Problem
Every paginated page hardcodes `per_page: 20`. The user wants to control how many items show per page via an editable number input, with the preference saved in cookies.

### Cookie keys

| Page | Cookie key | Default |
|---|---|---|
| Vehicles | `acar_vehicles_per_page` | 20 |
| Transactions | `acar_txn_per_page` | 20 |
| Legal Entities | `acar_entities_per_page` | 20 |

### Shared utility

**File:** `frontend/src/lib/paginationPrefs.ts` (new file)

```ts
/** Read a per_page or current_page preference from cookies */
export function getPagePref(cookieKey: string, defaultValue: number): number {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${cookieKey}=([^;]+)`))
    const parsed = match ? parseInt(match[1], 10) : NaN
    if (!isNaN(parsed) && parsed > 0 && parsed <= 500) return parsed
    return defaultValue
}

/** Save a preference to a cookie (1-year expiry) */
export function savePagePref(cookieKey: string, value: number): void {
    if (value > 0 && value <= 500) {
        document.cookie = `${cookieKey}=${value}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`
    }
}
```

### Per-page input component

Create a small reusable inline input used in all three footers:

**File:** `frontend/src/components/PerPageInput.tsx` (new file)

```tsx
import { Input } from "@/components/ui/input"
import { useRef } from "react"

interface PerPageInputProps {
    value: number
    onChange: (value: number) => void
    label?: string
}

export function PerPageInput({ value, onChange, label = "per page" }: PerPageInputProps) {
    const inputRef = useRef<HTMLInputElement>(null)

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const num = parseInt(e.target.value, 10)
        if (!isNaN(num) && num >= 1 && num <= 500) {
            onChange(num)
        }
    }

    return (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Input
                ref={inputRef}
                type="number"
                value={value}
                min={1}
                max={500}
                onChange={handleChange}
                className="h-7 w-14 text-center px-1 text-sm font-medium text-foreground"
            />
            <span>{label}</span>
        </div>
    )
}
```

### VehiclesPage changes

**File:** `frontend/src/pages/VehiclesPage.tsx`

1. Import `getPagePref`, `savePagePref`, and `PerPageInput`
2. Change initial `per_page` in filters state:
```ts
const [filters, setFilters] = useState<VehicleFilters>({
    page: 1,
    per_page: getPagePref("acar_vehicles_per_page", 20),
    ...
})
```
3. Add a per-page change handler:
```ts
const handlePerPageChange = useCallback((newPerPage: number) => {
    savePagePref("acar_vehicles_per_page", newPerPage)
    setFilters(prev => ({ ...prev, per_page: newPerPage, page: 1 }))
}, [])
```
4. In the StickyFooter, add `<PerPageInput>` in the left section (next to "Showing X of Y"):
```tsx
<StickyFooter>
    <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">
            Showing {data?.vehicles?.items?.length || 0} of {data?.vehicles?.total || 0} vehicles
        </span>
        <PerPageInput
            value={filters.per_page || 20}
            onChange={handlePerPageChange}
        />
    </div>
    <div className="flex items-center gap-2">
        {/* existing page nav */}
    </div>
</StickyFooter>
```

### TransactionsPage changes

**File:** `frontend/src/pages/TransactionsPage.tsx`

Same pattern as VehiclesPage:
- Cookie key: `acar_txn_per_page`
- `getPagePref("acar_txn_per_page", 20)` for initial state
- `handlePerPageChange` handler with `savePagePref`
- `<PerPageInput>` in the StickyFooter left section

### LegalEntitiesPage changes

**File:** `frontend/src/pages/LegalEntitiesPage.tsx`

Same pattern:
- Cookie key: `acar_entities_per_page`
- Initial state: `per_page: getPagePref("acar_entities_per_page", 20)`
- `handlePerPageChange` handler
- `<PerPageInput>` in the StickyFooter left section (from Feature 4)

---

## Feature 6 — Editable Current Page Input (All Pagination Pages)

### Problem
The "Page 1 of 9" display is static text. The user wants to click on the page number and type a page number directly to jump to it.

### Implementation

The page number input replaces the `<span className="text-foreground">{data.page}</span>` display with a small number input. The user types a number and presses Enter (or the input blurs) to jump to that page.

**File:** `frontend/src/components/PageInput.tsx` (new file)

```tsx
import { Input } from "@/components/ui/input"
import { useState, useEffect } from "react"

interface PageInputProps {
    currentPage: number
    totalPages: number
    onPageChange: (page: number) => void
    disabled?: boolean
}

export function PageInput({ currentPage, totalPages, onPageChange, disabled }: PageInputProps) {
    const [inputValue, setInputValue] = useState(String(currentPage))

    // Keep input in sync when currentPage changes from external navigation
    useEffect(() => {
        setInputValue(String(currentPage))
    }, [currentPage])

    const commit = () => {
        const num = parseInt(inputValue, 10)
        if (!isNaN(num) && num >= 1 && num <= totalPages) {
            onPageChange(num)
        } else {
            // Revert to current page if invalid
            setInputValue(String(currentPage))
        }
    }

    return (
        <Input
            type="number"
            min={1}
            max={totalPages}
            value={inputValue}
            disabled={disabled}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit() } }}
            className="h-7 w-14 text-center px-1 text-sm font-medium text-foreground"
        />
    )
}
```

### Wire into all three pages

In **VehiclesPage**, **TransactionsPage**, and **LegalEntitiesPage**, replace the static page display:

**Before:**
```tsx
Page <span className="text-foreground">{data.page}</span> of <span className="text-foreground">{data.pages}</span>
```

**After:**
```tsx
<span className="text-sm text-muted-foreground flex items-center gap-1.5">
    {t("common.page", "Page")}
    <PageInput
        currentPage={data.page}
        totalPages={data.pages}
        onPageChange={handlePageChange}
        disabled={isFetching}
    />
    <span>{t("common.of", "of")} <span className="text-foreground">{data.pages}</span></span>
</span>
```

Import `PageInput` in each page file.

**Note:** The `PageInput` does NOT save to cookies. Cookie persistence is only for `per_page` (Feature 5). The current page resets to 1 on filter change (existing behaviour — preserve it).

---

## Feature 7 — Split View Panel Width Arrows (All Split-View Pages)

### Problem
The user wants small left/right arrow buttons in split view to shift the panel boundary — expanding the left side or the right side in steps. Each split-view page saves its own width preference in a cookie.

### Design

- Two small icon buttons placed in the StickyFooter, **next to the existing split view toggle button**
- `ChevronLeft` icon → expand right panel (shrink left)
- `ChevronRight` icon → expand left panel (shrink right)
- Each click changes the right panel width by **±50px**
- Min right panel width: **280px** | Max right panel width: **700px**
- Default right panel width: **420px** (matches current hardcoded value)
- Cookie saves only the right panel width (left panel takes the remaining flex space)

### Cookie keys

| Page | Cookie key | Default |
|---|---|---|
| Vehicle edit (VehicleFormPage) | `acar_vehicle_right_width` | 420 |
| Transaction edit (TransactionForm/EditTransactionPage) | `acar_txn_right_width` | 420 |

### Shared utility (add to `paginationPrefs.ts` or `splitView.ts`)

Add to **`frontend/src/lib/paginationPrefs.ts`** (from Feature 5, already exists):

```ts
const SPLIT_MIN = 280
const SPLIT_MAX = 700

export function getSplitWidth(cookieKey: string, defaultWidth = 420): number {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${cookieKey}=([^;]+)`))
    const parsed = match ? parseInt(match[1], 10) : NaN
    if (!isNaN(parsed) && parsed >= SPLIT_MIN && parsed <= SPLIT_MAX) return parsed
    return defaultWidth
}

export function saveSplitWidth(cookieKey: string, width: number): void {
    const clamped = Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, width))
    document.cookie = `${cookieKey}=${clamped}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`
}

export { SPLIT_MIN, SPLIT_MAX }
```

### VehicleFormPage changes

**File:** `frontend/src/pages/VehicleFormPage.tsx`

The vehicle split view renders (when `splitView && showTransactions`) as a flex row:
```tsx
<div className="flex flex-col 2xl:flex-row gap-6 2xl:items-start">
    <div className="min-w-0 flex-1">    {/* LEFT: Vehicle form */}
        <VehicleForm ... />
    </div>
    <div className="w-full 2xl:w-[420px] 2xl:flex-shrink-0 ...">    {/* RIGHT: Transactions */}
        ...
    </div>
</div>
```

**Step 1** — Add state for right panel width:
```ts
import { getSplitWidth, saveSplitWidth } from "@/lib/paginationPrefs"

const VEHICLE_SPLIT_COOKIE = "acar_vehicle_right_width"

const [rightPanelWidth, setRightPanelWidth] = useState<number>(() =>
    getSplitWidth(VEHICLE_SPLIT_COOKIE, 420)
)

const adjustSplitWidth = useCallback((delta: number) => {
    setRightPanelWidth(prev => {
        const next = Math.min(700, Math.max(280, prev + delta))
        saveSplitWidth(VEHICLE_SPLIT_COOKIE, next)
        return next
    })
}, [])
```

**Step 2** — Apply the dynamic width to the right panel div. Replace:
```tsx
<div className="w-full 2xl:w-[420px] 2xl:flex-shrink-0 ...">
```
with:
```tsx
<div
    className="w-full 2xl:flex-shrink-0 2xl:sticky 2xl:top-4 2xl:max-h-[calc(100vh-6rem)] 2xl:overflow-y-auto"
    style={{ width: `${rightPanelWidth}px` }}
>
```
(All other classes remain. Only the `2xl:w-[420px]` is replaced by the inline style.)

**Step 3** — Add width arrow buttons. These render next to the split view toggle in the StickyFooter.

The `splitViewToggle` prop is passed to `VehicleForm`. Inside `VehicleFormPage`, the toggle button is built like this:
```tsx
splitViewToggle={showTransactions ? (
    <button onClick={toggleSplitView} ...>
        ...
    </button>
) : undefined}
```

Add the arrow buttons **inside the same conditional**, wrapping them together:
```tsx
splitViewToggle={showTransactions ? (
    <div className="flex items-center gap-1">
        {/* Width arrows — only visible when split view is active */}
        {splitView && (
            <>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            onClick={() => adjustSplitWidth(50)}
                            className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-input bg-background text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent>Expand right panel</TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            onClick={() => adjustSplitWidth(-50)}
                            className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-input bg-background text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent>Expand left panel</TooltipContent>
                </Tooltip>
                <div className="h-6 w-px bg-border mx-1" />
            </>
        )}
        {/* Existing toggle button */}
        <button onClick={toggleSplitView} ...>
            ...
        </button>
    </div>
) : undefined}
```

Import `ChevronLeft`, `ChevronRight` from lucide-react and `Tooltip`, `TooltipTrigger`, `TooltipContent` from `@/components/ui/tooltip`. Add `type="button"` to all buttons to prevent form submission.

### EditTransactionPage + TransactionForm changes

The transaction split view is managed differently. The split view layout is defined inside `TransactionForm.tsx` as:

```tsx
showSplitView ? "grid grid-cols-1 2xl:grid-cols-[1fr_420px]" : "space-y-6"
```

The `420px` right column width needs to become dynamic.

**File:** `frontend/src/pages/EditTransactionPage.tsx`

Add the right panel width state and pass it down:

```ts
import { getSplitWidth, saveSplitWidth } from "@/lib/paginationPrefs"

const TXN_SPLIT_COOKIE = "acar_txn_right_width"
const [txnRightWidth, setTxnRightWidth] = useState<number>(() =>
    getSplitWidth(TXN_SPLIT_COOKIE, 420)
)

const adjustTxnSplitWidth = useCallback((delta: number) => {
    setTxnRightWidth(prev => {
        const next = Math.min(700, Math.max(280, prev + delta))
        saveSplitWidth(TXN_SPLIT_COOKIE, next)
        return next
    })
}, [])
```

Add width arrow buttons to the `splitViewToggle` (same pattern as Vehicle):
```tsx
const splitViewToggle = (
    <div className="hidden lg:flex items-center gap-1">
        {isSplitView && (
            <>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button type="button" onClick={() => adjustTxnSplitWidth(50)}
                            className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-input bg-background text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent>Expand right panel</TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button type="button" onClick={() => adjustTxnSplitWidth(-50)}
                            className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-input bg-background text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent>Expand left panel</TooltipContent>
                </Tooltip>
                <div className="h-6 w-px bg-border mx-1" />
            </>
        )}
        {/* Existing toggle button */}
        <button type="button" onClick={() => setIsSplitView(!isSplitView)} ...>
            ...
        </button>
    </div>
)
```

Pass `rightPanelWidth={txnRightWidth}` as a new prop to `<TransactionForm>`.

**File:** `frontend/src/components/transactions/TransactionForm.tsx`

1. Add `rightPanelWidth?: number` to the props interface
2. Use it in the grid column template:

```tsx
// In the outer container:
<div
    className={cn("gap-6", showSplitView ? "grid grid-cols-1 2xl:grid" : "space-y-6")}
    style={showSplitView ? {
        gridTemplateColumns: `1fr ${rightPanelWidth ?? 420}px`
    } : undefined}
>
```

Remove the static `2xl:grid-cols-[1fr_420px]` class (it's replaced by the inline style). Only on `2xl` — the mobile stacking still works because grid is `grid-cols-1` for the base breakpoint in CSS, but the inline style overrides at all sizes. To preserve mobile stacking, use a `useEffect` or media query approach:

Actually, the simplest correct approach: keep the Tailwind class for `grid-cols-1` (mobile) and apply the custom column template only on 2xl via JavaScript:

```tsx
// Check if we're on 2xl+ (1536px+)
const [is2xl, setIs2xl] = useState(() => window.innerWidth >= 1536)

useEffect(() => {
    const mq = window.matchMedia("(min-width: 1536px)")
    const handler = (e: MediaQueryListEvent) => setIs2xl(e.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
}, [])

// Then in render:
style={showSplitView && is2xl ? {
    gridTemplateColumns: `1fr ${rightPanelWidth ?? 420}px`
} : undefined}
```

The `grid-cols-1` Tailwind class handles mobile layout; the inline style only kicks in at 2xl.

**Also update the right column div** to match:
```tsx
{showSplitView && (
    <div className="flex flex-col gap-4 2xl:sticky 2xl:top-5 2xl:self-start overflow-y-auto">
        ...
    </div>
)}
```
No width class needed here — the grid column width controls it automatically.

---

## Feature 8 — ChoicesManagementPage: Scrollable Content Area

### Problem
The choices list (inside `<div className="p-5">`) grows vertically with no height limit. The manager wants it to show approximately 20 items, then scroll within that area — keeping the tabs, search bar, and filter controls always visible above.

### Fix

**File:** `frontend/src/pages/ChoicesManagementPage.tsx`

Find the content container:
```tsx
<div className="p-5">
    {activeTab === "vehicle_model"
        ? renderVehicleModelContent()
        : ...}
</div>
```

Wrap it with a fixed-height scrollable container:
```tsx
<div className="p-5">
    <div className="overflow-y-auto max-h-[calc(100vh-280px)] pr-1">
        {activeTab === "vehicle_model"
            ? renderVehicleModelContent()
            : ...}
    </div>
</div>
```

The `max-h-[calc(100vh-280px)]` value accounts for:
- Header: 64px
- Page title area: ~60px
- Tabs row: ~50px
- Search/filter bar: ~64px
- Top/bottom padding: ~42px
= ~280px of non-list chrome

Adjust the `280px` offset if the visible height is wrong during testing. The goal is ~20 list items visible before scrolling starts. Add `pr-1` to prevent content from being visually clipped by the scrollbar.

**Note:** Do NOT add pagination to the choices page. The scrollable container is the intentional approach as stated by the user.

---

## Feature 9 — Instant Search Everywhere (All Search Bars)

### Problem
The choices management page uses instant/reactive search (results update on every keystroke via `onChange → setSearchValue`). All other search bars require pressing Enter or clicking a search button. The user wants all search bars to be instant.

### Pages/components to update

| File | Current behaviour | Change |
|---|---|---|
| `LegalEntitiesPage.tsx` | Enter key triggers `handleSearch()` | Remove `handleSearch`, make `onChange` update filters with debounce |
| `TransactionsPage.tsx` | Enter key triggers search | Same fix |
| `VehiclesPage.tsx` | Enter key triggers search | Same fix |

### Pattern to implement

For each page, replace the `handleSearch` + Enter-key pattern with a debounced `useEffect`:

**Before (example from LegalEntitiesPage):**
```tsx
const handleSearch = useCallback(() => {
    setFilters(prev => ({
        ...prev,
        search: searchValue || undefined,
        page: 1,
    }))
}, [searchValue])

// ...in Input:
onKeyDown={(e) => e.key === "Enter" && handleSearch()}
```

**After:**
```tsx
// Remove handleSearch entirely.
// Add debounced effect:
useEffect(() => {
    const timer = setTimeout(() => {
        setFilters(prev => ({
            ...prev,
            search: searchValue.trim() || undefined,
            page: 1,
        }))
    }, 400)
    return () => clearTimeout(timer)
}, [searchValue])

// In Input: remove onKeyDown prop (or keep it as an optional fast-path):
// onKeyDown={(e) => { if (e.key === "Enter") { clearTimeout(timer); setFilters(...) } }}
// Since the ref approach for "cancel timer on Enter" is messy, simply keep the debounce and
// remove the onKeyDown handler entirely — 400ms is fast enough.
```

The debounce delay should be **400ms** for all pages — this matches the instant feel of the choices page (which has no debounce since it filters local data) but avoids hammering the API on every keystroke.

**For LegalEntitiesPage:** The city filter from Feature 1 uses a 500ms debounce. Use 400ms for the main search to match the other pages. The city filter can also be changed to 400ms for consistency.

**Do NOT** change the choices management page search — it already filters local (in-memory) data and needs no debounce. Only server-fetching pages need the debounce.

### Important: do not remove the X (clear) button
The clear button that sets `searchValue("")` on each page is fine — it directly resets the state, which triggers the `useEffect` with an empty string, which fires the search after 400ms. This is acceptable behaviour (slightly delayed clear — not noticeable).

### VehiclesPage specifics
Check if `VehiclesPage` has a search bar with Enter-key handler. If the search is already wired through a filter `onChange` directly (without `handleSearch`), no change needed. Only apply the pattern where `handleSearch` function exists and Enter triggers it.

### TransactionsPage specifics
Same check — apply only if there is a `handleSearch` or Enter-key handler distinct from the filter state update.

---

## Files Modified Summary

| File | Change | Feature |
|---|---|---|
| `backend/manager/api.py` | Add `city` query param to legal entities list endpoint | 1 |
| `frontend/src/hooks/useLegalEntities.ts` | Add `city` to `LegalEntityFilters`, pass in fetch | 1 |
| `frontend/src/pages/LegalEntitiesPage.tsx` | City filter UI, always-visible icons, StickyFooter, per-page input, page input, instant search | 1,2,4,5,6,9 |
| `frontend/src/components/layout/Sidebar.tsx` | Add "Inactive" entry under Legal Entities | 3 |
| `frontend/src/locales/de.json` | Add `nav.inactive_entities` key | 3 |
| `frontend/src/locales/en.json` | Add `nav.inactive_entities` key | 3 |
| `frontend/src/locales/tr.json` | Add `nav.inactive_entities` key | 3 |
| `frontend/src/locales/ar.json` | Add `nav.inactive_entities` key | 3 |
| `frontend/src/pages/VehiclesPage.tsx` | Per-page input, page input, instant search | 5,6,9 |
| `frontend/src/pages/TransactionsPage.tsx` | Per-page input, page input, instant search | 5,6,9 |
| `frontend/src/pages/VehicleFormPage.tsx` | Split view width arrows, dynamic right panel width | 7 |
| `frontend/src/pages/EditTransactionPage.tsx` | Split view width arrows, pass rightPanelWidth to form | 7 |
| `frontend/src/components/transactions/TransactionForm.tsx` | Accept `rightPanelWidth` prop, apply to grid | 7 |
| `frontend/src/pages/ChoicesManagementPage.tsx` | Scrollable content area with max-height | 8 |
| `frontend/src/lib/paginationPrefs.ts` | **New:** cookie helpers for per_page, split width | 5,7 |
| `frontend/src/components/PerPageInput.tsx` | **New:** reusable per-page number input | 5 |
| `frontend/src/components/PageInput.tsx` | **New:** reusable jump-to-page number input | 6 |

---

## Order of Implementation

1. **Feature 9 (instant search)** — purely additive, no UI changes, safest to do first across all 3 pages
2. **Feature 2 (action icons always visible)** — one-word className change
3. **Feature 8 (choices scrollable)** — wrapping div, verify height feels right
4. **Feature 3 (sidebar inactive entry)** — sidebar + locale files + LegalEntitiesPage URL read
5. **Feature 1 (city filter)** — backend + hook + UI
6. **Feature 4 (legal entities StickyFooter)** — replace custom footer with StickyFooter
7. **Feature 5 (per-page input)** — new files + wire into all 3 pages
8. **Feature 6 (page input)** — new file + wire into all 3 pages
9. **Feature 7 (split view arrows)** — most files touched, do last

---

## TypeScript Verification

After all changes, run:
```bash
cd frontend && npx tsc --noEmit
```
All type errors must be resolved. No `any` types. Unused imports removed.

---

## Do Not Touch

- Backend files other than `api.py` (the city filter endpoint)
- Dark mode styles — do not add or remove `dark:` classes unless a new component specifically needs it
- The choices management page search — it's already instant and correct
- `StickyFooter.tsx` component itself — use it as-is
- `useLegalEntities.ts` mutations — only the filter interface and fetch function change
- Any locale keys that already exist — only add the new `nav.inactive_entities` key
