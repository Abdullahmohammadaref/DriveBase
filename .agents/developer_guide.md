# developer-guide.md — Vehicle Management System (VMS)

> Technical rules for this codebase. Read this before writing a single line of code.
> This is not a tutorial — it is the law for this project.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | Django 5.x + Django Ninja (not DRF) |
| Database | SQLite (single file: `backend/db.sqlite3`) |
| Frontend | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS v4 + shadcn/ui (Radix primitives) |
| State / Data | TanStack Query v5 (React Query) |
| Forms | React Hook Form + Zod v4 |
| HTTP Client | Axios (configured instance at `frontend/src/lib/api.ts`) |
| Auth | Django sessions + CSRF cookies |
| Routing | React Router v7 |
| i18n | i18next (DE default, EN, AR, TR) |
| Icons | lucide-react |

---

## Project Structure

```
drivebase/
├── backend/
│   ├── drivebase/             # Django project config (settings, main urls.py)
│   ├── manager/               # The single Django app — all logic lives here
│   │   ├── models.py          # All database models
│   │   ├── api.py             # Choices + misc vehicle endpoints (Ninja router)
│   │   ├── vehicle_api.py     # Vehicle CRUD (Ninja router: /api/vehicles/...)
│   │   ├── transaction_api.py # Transaction CRUD (Ninja router: /api/transactions/...)
│   │   ├── auth_api.py        # Auth flows (Ninja router: /api/auth/...)
│   │   ├── settings_api.py    # Business + user settings (Ninja router: /api/settings/...)
│   │   ├── activity_logs_api.py
│   │   ├── schemas.py         # Ninja schemas for vehicles
│   │   ├── transaction_schemas.py
│   │   ├── pdf_generators/    # PDF generation (vehicle_pdfs.py, transaction_pdfs.py)
│   │   ├── urls.py            # Legacy Django template URLs (not the API)
│   │   └── views.py           # Legacy Django template views (not the API)
│   └── manage.py
├── frontend/
│   └── src/
│       ├── App.tsx            # Router config — all routes defined here
│       ├── lib/
│       │   ├── api.ts         # Axios instance — ALWAYS import this, never raw axios
│       │   ├── auth.tsx       # AuthContext + AuthProvider + useAuth hook
│       │   ├── validations.ts # All Zod schemas (vehicle, transaction)
│       │   ├── vehicleFinancials.ts # Financial calculations
│       │   └── utils.ts       # cn(), formatCurrency(), etc.
│       ├── hooks/             # TanStack Query hooks — data fetching lives here
│       ├── components/
│       │   ├── ui/            # shadcn/ui base components — do not modify these
│       │   ├── layout/        # AppLayout, Header, Sidebar, ProtectedRoute
│       │   ├── vehicles/      # Vehicle-specific components
│       │   ├── transactions/  # Transaction-specific components
│       │   └── legal-entities/
│       ├── pages/             # One file per page/route
│       └── types/             # TypeScript interfaces (vehicle.ts, transaction.ts)
├── idea.md                    # Product description — read before any feature work
└── developer-guide.md         # This file
```

---

## API Architecture

### Backend: Django Ninja (not DRF)

All API endpoints use **Django Ninja**, not Django REST Framework. Do not use DRF serializers, APIView, or `@api_view`. The pattern is:

```python
from ninja import Router, Schema
from ninja.security import django_auth

router = Router(auth=django_auth, tags=["Vehicles"])

class MySchema(Schema):
    name: str
    value: Optional[int] = None

@router.get("/endpoint", response=MySchema)
def my_view(request: HttpRequest, param: str = Query(...)):
    ...
```

All routers are mounted in `backend/drivebase/urls.py` under `/api/`. Routers requiring auth use `auth=django_auth`. The auth router (`auth_api.py`) has no auth requirement on public endpoints.

### Frontend: Always use `api` from `lib/api.ts`

**NEVER** import axios directly. Always use the configured instance:

```typescript
import api from "@/lib/api"

// GET
const response = await api.get("/vehicles")

// PATCH (auto-saves)
const response = await api.patch(`/vehicles/${id}`, data)

// POST with FormData (file uploads, status changes)
const formData = new FormData()
formData.append("status", status)
await api.post(`/vehicles/${id}/change-status`, formData, {
    headers: { "Content-Type": "multipart/form-data" }
})
```

The `api` instance handles:
- Base URL (`/api`)
- CSRF token injection on all POST/PUT/PATCH/DELETE
- Session cookies (`withCredentials: true`)
- 401 → redirect to `/login`

### CSRF Pattern

CSRF is handled automatically by the axios interceptor in `api.ts`. But for the very first mutating request in a session, call `ensureCsrfToken()` to seed the cookie. This is already done in `AuthProvider` on mount — do not call it again unless you have a specific reason.

```typescript
import { ensureCsrfToken } from "@/lib/api"
// Only call if you know the CSRF cookie may not exist yet
await ensureCsrfToken()
```

---

## Authentication System

### How Auth Works — Read This Carefully

Every auth flow (login, register, password reset, email change) uses the **same polling pattern**. Never reinvent this.

**Step 1 — Initiate:** User submits form → backend creates an `AuthActionRequest` record with a UUID (`request_id`) and sends an email with a link.

**Step 2 — Poll:** Frontend calls `GET /api/auth/poll-status/{request_id}` every 2 seconds.
- `200 OK + status: "approved"` → done, navigate
- `202 Accepted` → still pending, keep polling
- `410 Gone` → expired or rejected, show error

**Step 3 — Verify (server-side):** User clicks the email link → Django view processes it → `AuthActionRequest` status updates → next poll returns approved.

**The hook for this is `useAuthPolling` in `hooks/useAuthPolling.ts`. Always use it.**

```typescript
const { status, message, startPolling } = useAuthPolling({
    onApproved: (result) => {
        // result.action_type tells you what was approved
        if (result.action_type === "manager_login") {
            // Hard reload is already handled inside useAuthPolling
            // for login and register flows
        }
    },
    onExpired: () => { /* show error */ }
})

// After form submit:
const result = await login(formData)
if (result.success && result.request_id) {
    startPolling(result.request_id)
}
```

### Auth Context

User data lives in `AuthContext` (`lib/auth.tsx`). Access it with `useAuth()`.

```typescript
const { user, isAuthenticated, isLoading, businessSlug } = useAuth()
```

The `user` object contains:
```typescript
{
    id, email, username,
    is_manager: boolean,
    business_name, business_slug,
    business_logo?: string,
    backup_email?: string
}
```

### Route Protection

All app routes are wrapped in `<ProtectedRoute>`. It:
1. Redirects to `/login` if not authenticated
2. Validates `business_slug` in the URL matches the user's business
3. Redirects to the correct slug if mismatched

```typescript
// Getting business slug in any component:
import { useBusinessSlug } from "@/lib/auth"
const businessSlug = useBusinessSlug() // prefers URL param, falls back to auth context
```

### URL Pattern

All protected routes follow: `/:business_slug/[/:locale]?/page`

Examples:
- `/{slug}/vehicles`
- `/{slug}/vehicles/new`
- `/{slug}/vehicles/42/edit`
- `/{slug}/de/vehicles` (explicit locale)

---

## Data Fetching: TanStack Query

**Rule:** All server data lives in TanStack Query. No `useState` + `useEffect` + `fetch` patterns.

### Pattern for fetching

```typescript
// hooks/useVehicles.ts — follow this pattern for every entity
export const vehicleKeys = {
    all: ["vehicles"] as const,
    lists: () => [...vehicleKeys.all, "list"] as const,
    list: (filters: VehicleFilters) => [...vehicleKeys.lists(), filters] as const,
    detail: (id: number) => [...vehicleKeys.all, "detail", id] as const,
}

export function useVehicles(filters: VehicleFilters = {}) {
    return useQuery({
        queryKey: vehicleKeys.list(filters),
        queryFn: async () => {
            const params = new URLSearchParams()
            Object.entries(filters).forEach(([key, value]) => {
                if (value !== undefined && value !== null && value !== "") {
                    params.append(key, String(value))
                }
            })
            const response = await api.get(`/vehicles?${params}`)
            return response.data
        },
    })
}
```

### Mutations + cache invalidation

```typescript
const mutation = useMutation({
    mutationFn: async (data) => {
        const response = await api.patch(`/vehicles/${id}`, data)
        return response.data
    },
    onSuccess: () => {
        // Always invalidate affected queries after mutation
        queryClient.invalidateQueries({ queryKey: vehicleKeys.lists() })
        queryClient.invalidateQueries({ queryKey: vehicleKeys.detail(id) })
    }
})
```

---

## Autosave Pattern

All edit pages (vehicle, transaction) use autosave — no submit buttons. The hook is `useAutoSave` in `hooks/useAutoSave.ts`.

**Two save modes:**
- `saveNow(data)` — for dropdowns, selects, checkboxes (immediate)
- `saveDebounced(data)` — for text inputs (800ms debounce, merges rapid keystrokes)

```typescript
const { status, saveNow, saveDebounced } = useAutoSave<VehicleUpdateInput>({
    endpoint: `/vehicles/${vehicle.internal_id}`,
    method: "PATCH",
    invalidateQueryKeys: [
        vehicleKeys.detail(vehicle.internal_id),
        vehicleKeys.lists()
    ],
    updateQueryKey: vehicleKeys.detail(vehicle.internal_id),
})

// Dropdown:
onChange={(val) => {
    setValue("color_id", Number(val))
    saveNow({ color_id: Number(val) })
}}

// Text input:
onChange={(e) => {
    setValue("description", e.target.value)
    saveDebounced({ description: e.target.value })
}}
```

**Never use `saveNow` for text inputs** — it will fire on every keystroke and hammer the API.

The `AutoSaveIndicator` component (`components/AutoSaveIndicator.tsx`) displays the save status in the footer. Always include it on edit pages.

---

## Forms: React Hook Form + Zod

All forms use `react-hook-form` with Zod validation. Schemas live in `lib/validations.ts`.

```typescript
const form = useForm<VehicleCreateInput>({
    resolver: zodResolver(vehicleCreateSchema),
    defaultValues: { ... }
})
```

**Zod v4 syntax** — this project uses Zod 4, not v3. Key difference:
```typescript
// Zod 4: use `message` not `required_error`
z.number({ message: "This field is required" })

// Zod 4: optional number pattern
z.number().optional().nullable()
```

---

## Form Components

### Choice fields: always use DynamicSelect or SearchableSelect

Two variants:
- **`DynamicSelect`** (`ui/dynamic-select.tsx`) — for ID-based choices with Quick Add. Use for all vehicle/transaction dropdowns backed by `AllChoices`.
- **`SearchableSelect`** (`ui/searchable-select.tsx`) — for string-based choices (status, category, method). No Quick Add.

Both support: search bar, sorted options, keyboard navigation.

**Make → Model dependency pattern:**
```typescript
// When make changes, fetch models for that make only
const { data: models } = useModels(selectedMakeId)
// This uses: GET /api/choices/models/{makeId}
```

### Legal entity selection

Same as DynamicSelect but clicking "Add New" opens `<EntityForm>` inside a `<Dialog>`. This is already implemented in `VehicleForm.tsx` — follow the same pattern for any other place that needs it.

---

## Layout Components

### StickyFooter

All list and edit pages must have a `<StickyFooter>`. It is fixed to the bottom of the viewport and respects the sidebar width.

```typescript
import { StickyFooter } from "@/components/StickyFooter"

<StickyFooter>
    <div className="flex items-center gap-2">
        {/* Left side content */}
    </div>
    <div className="flex items-center gap-2">
        {/* Right side content */}
    </div>
</StickyFooter>
```

The footer has `left-0 md:left-64` to align with the sidebar. If the sidebar can be collapsed (64px), the footer will need dynamic width — check `AppLayout.tsx` for the current `sidebarCollapsed` state and pass it down if needed.

**Every list page needs a footer.** Legal entities is currently missing one — that is a known bug.

### AppLayout

`AppLayout` wraps all protected pages. It renders:
- `<Sidebar>` (collapsible, 64px collapsed / 256px expanded)
- `<Header>` (fixed top, 64px height)  
- `<main>` with `pt-16` (header) and `pl-64` or `pl-16` (sidebar)

Main content area padding: `p-8 pb-32`. The `pb-32` gives room for the sticky footer.

---

## Design System

### Colors — CSS Variables

**Always use CSS variables or Tailwind semantic classes. Never hardcode hex/hsl colors.**

```typescript
// Correct: uses CSS variables
className="bg-background text-foreground border-border"
className="bg-primary text-primary-foreground"
className="text-muted-foreground"

// Wrong: hardcoded values
className="bg-white text-black"  // breaks dark mode
style={{ color: "#465fff" }}      // breaks theming
```

### Status Colors

Status colors are defined as CSS custom properties and Tailwind tokens. Use them everywhere a status is displayed:

| Status | Color token | Hex |
|--------|-------------|-----|
| `purchased` | `--color-status-purchased` | `#f59e0b` (amber) |
| `ready_for_sale` | `--color-status-ready-for-sale` | `#465fff` (blue) |
| `reserved` | `--color-status-reserved` | `#9333ea` (purple) |
| `sold` | `--color-status-sold` | `#16a34a` (green) |
| `inactive` | `--color-status-inactive` | `#6b7280` (gray) |

**These colors must be consistent everywhere status is shown** — cards, table rows, badges, footer, dropdowns. No exceptions.

### Dark Mode

This project supports dark mode via `.dark` class. All components must work in both modes.
- Use `dark:` variants for anything that needs a different value in dark mode.
- Borders in light mode must be clearly visible — `border-border` (`#e4e7ec`) is the standard.
- The light mode border issue is a known problem — do not make it worse by omitting borders.

### Typography & Spacing

- Use Tailwind spacing scale (`p-4`, `gap-2`, etc.) — no arbitrary values unless unavoidable.
- Font sizes via Tailwind (`text-sm`, `text-base`, `text-lg`) — no inline `font-size`.
- Icons: `lucide-react` only. Use `h-4 w-4` for inline icons, `h-5 w-5` for buttons.

### Mandatory Fields

Every mandatory field in a form must show a red asterisk:
```typescript
<Label htmlFor="field">
    Field Name <span className="text-destructive">*</span>
</Label>
```
**Do not skip this.** Several fields are currently missing it — do not add new ones with the same problem.

### Hover States

Every clickable element must have a visible hover state:
- Cards: scale or background color change
- Buttons: already handled by shadcn variants
- Table rows: `hover:bg-muted/50`
- Icons: wrap in a `<Button variant="ghost" size="icon">` or add `hover:text-primary cursor-pointer`

### Tooltips

Every icon-only button must have a `<Tooltip>` from `@radix-ui/react-tooltip`:
```typescript
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

<Tooltip>
    <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" onClick={...}>
            <Trash2 className="h-4 w-4" />
        </Button>
    </TooltipTrigger>
    <TooltipContent>Deactivate vehicle</TooltipContent>
</Tooltip>
```

---

## i18n

The app supports German (DE, default), English (EN), Arabic (AR, RTL), and Turkish (TR). Translation files are in `frontend/src/locales/`.

```typescript
import { useTranslation } from "react-i18next"
const { t } = useTranslation()

// Usage
<label>{t("vehicles.make")}</label>
```

**All user-visible strings must use `t()`**. Never hardcode UI text in English (or any language) directly in JSX.

Locale is set from the URL (`/:business_slug/:locale/...`). RTL layout is applied automatically for Arabic via `document.documentElement.dir`.

---

## Permissions

### Transaction access

Employees may have transactions disabled. The flag is `user.transactions_access` from `useAuth()`.

**If `user.transactions_access` is false:**
- Hide the Transactions sidebar section entirely
- Do not show the transactions table on the vehicle edit page
- Do not expose any transaction-related UI anywhere in the app

```typescript
const { user } = useAuth()
const hasTransactionAccess = user?.is_manager || user?.transactions_access

{hasTransactionAccess && <TransactionsSection />}
```

### Manager-only features

- Business Settings page
- User Settings page (with identity verification flows)
- Creating/editing employees
- Notification bell logs

```typescript
const { user } = useAuth()
{user?.is_manager && <ManagerOnlySection />}
```

---

## Navigation Patterns

### Stack-based back (`<` arrow)

Use React Router's `navigate(-1)` or `useNavigate()` to go back in the browser history stack. This is for the `<` back arrow in headers:

```typescript
const navigate = useNavigate()
<Button variant="ghost" onClick={() => navigate(-1)}>
    <ArrowLeft className="h-4 w-4" />
</Button>
```

### Parent-page back (footer button)

The footer back button goes to the parent list page with a clear label:
```typescript
// On vehicle edit page:
<Button variant="outline" onClick={() => navigate(`/${businessSlug}/vehicles`)}>
    ← Back to Vehicles
</Button>

// On transaction edit page:
<Button variant="outline" onClick={() => navigate(`/${businessSlug}/transactions`)}>
    ← Back to Transactions
</Button>
```

### Prev/Next record navigation

Vehicle and transaction edit pages have left/right arrows to navigate between records. These are driven by `prev_vehicle_internal_id` / `next_vehicle_internal_id` returned from the detail API endpoint. They respect the current list filters because the backend computes them based on the same filter context.

The `RecordNavigation` component (`components/RecordNavigation.tsx`) handles this — use it, do not rebuild it.

---

## PDF Generation

PDFs are generated server-side in Python and returned as file responses. Generation is triggered via API calls from the frontend.

### Vehicle PDFs

The ContractModal (`components/vehicles/ContractModal.tsx`) handles the onboarding flow:
1. Buy vs Sale choice
2. EU vs Outside EU (for sale)
3. Document type (sale contract / receipt / binding order)

Each choice maps to a specific endpoint in `vehicle_api.py`. When multiple PDFs need to be generated, they currently open in separate browser tabs (`window.open(url)`).

⚠️ **Known risk:** Multiple `window.open()` calls are blocked by popup blockers. A server-side merge or in-app PDF viewer is the correct long-term solution. Do not add more `window.open()` calls without addressing this.

PDF generation buttons are disabled (`can_generate_buy_contract`, `can_generate_sale_contract` flags from the API) when required fields are missing.

### Transaction PDFs

Simpler: one click → one PDF download. Endpoint: `GET /api/transactions/{id}/generate-pdf`.

---

## Database Rules

- **Never delete data.** Use `is_active = False` or `status = "inactive"` to soft-delete.
- **Vehicle `internal_id`** is the user-facing ID (sequential per business). `id` is the DB primary key (never shown to users).
- **Transaction `internal_id`** follows the same pattern.
- All vehicles, transactions, and legal entities are scoped to a `Business` — never query across businesses.

---

## What NOT to Do

| Never | Instead |
|-------|---------|
| Import `axios` directly | Import `api` from `@/lib/api` |
| Use `useState` + `useEffect` + `fetch` for server data | Use TanStack Query hooks |
| Write new auth flow logic from scratch | Use `useAuthPolling` + `useAuth` |
| Hardcode colors or status labels | Use CSS variables + `t()` |
| Add user-visible text in English | Add to locales files + use `t()` |
| Use `window.open()` for multiple PDFs | Plan a merge-to-single-PDF solution |
| Delete records from the database | Set `is_active = False` or `status = "inactive"` |
| Use DRF (serializers, APIView) | Use Django Ninja (Schema, Router) |
| Add a new form without Zod validation | Define schema in `lib/validations.ts` first |
| Add a mandatory field without a red `*` | Always mark mandatory fields |
| Add a list page without a StickyFooter | Every list page needs a footer |
| Skip `invalidateQueryKeys` on mutation | Always invalidate affected query keys |

---

## Feature Development Cycle (per the workflow guide)

For every new feature or bug fix:

1. **Write `plan.md`** — what files change, what the edge cases are, what the API contract is.
2. **Build** — implement against the plan. Use this guide and `idea.md` as context.
3. **Write `feature-docs.md`** — what was built, decisions made, gotchas for the next session.
4. **Update this file** if any new pattern was established.

**Start every Antigravity chat with:**
> "Read idea.md and developer-guide.md before touching anything. Then read plan.md for this feature."