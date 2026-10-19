# 🗺️ DriveBase — Project Map

> **Last updated:** 2026-08-19
> This file maps every module and file in the codebase. Read this before making changes.
> For data model details, see [`schema.prisma`](./schema.prisma).
> For project overview, see [`README.md`](./README.md).

---

## Repository Root

```
drivebase/
├── GEMINI.md                # Master root agent beacon, stack overview, and AI resource map
├── AGENTS.md                # Root agent guidelines pointing to GEMINI.md + GitNexus
├── .agentrules              # AI agent behavioral rules (MANDATORY reading)
├── .agents/skills/          # 65+ AI skill packs for guided development
├── .agents/scratch/         # Isolated workspace for temporary agent scripts
├── README.md                # Project overview, setup, API docs
├── schema.prisma            # Prisma data model (mirrors Django models 1:1)
├── PROJECT_MAP.md           # ← You are here
├── docs-plan_tax_liability_breakeven_cleanup.md # Tax Liability, Dynamic Break-Even, Holding Cost Cleanup docs
├── docs-fixes-and-new-field.md  # Documentation for Key Number management and Choices stability fixes
├── docs-ui-changes.md       # Documentation for UI stability, choices management hierarchy, and dashboard refinements
├── docs-ui-tweaks.md        # Documentation for legacy UI improvements
├── docs-ui-tweak-fix-2.md   # COGS + Total Profit formula fix (netExpensesEarnings replaces totalTxnCost)
├── docs-edit_vehicle_cogs_profit_fix.md # Edit vehicle COGS sign fix + Gross/Net/Total Profit formula restructuring
├── docs-deployment.md       # Documentation for deployment infrastructure
├── .gitignore
├── Dockerfile               # Production Django container (Python 3.11-slim + Gunicorn)
├── docker-compose.yml       # Django + Nginx orchestration
├── nginx/nginx.conf         # Reverse proxy, SSL, static/media serving, SPA fallback
├── .github/workflows/deploy.yml  # CI/CD — auto-deploy on push to main
├── scripts/backup.sh        # Daily SQLite + media backup with 7-day rotation
├── backend/                 # Django backend (Python)
└── frontend/                # React SPA (TypeScript)
```

---

## Backend — Django 5.2 + Django Ninja

### Django Project Config (`backend/drivebase/`)

| File | Purpose |
|---|---|
| `settings.py` | Main Django configuration (DB, auth, CORS, i18n, CSRF, middleware, static files) |
| `urls.py` | Root URL routing — mounts Django Ninja API at `/api/`, Rosetta at `/rosetta/` |
| `wsgi.py` | WSGI entry point for production deployment |
| `asgi.py` | ASGI entry point (unused in current deployment) |

### Main App (`backend/manager/`)

This is the **only Django app**. All models, APIs, and views live here.

#### Data Layer

| File | Purpose | Key Contents |
|---|---|---|
| `models.py` | **ALL data models** (1,870+ lines) | `Business`, `Branch`, `User`, `LegalEntity`, `Vehicle`, `Transaction`, `AuthActionRequest`, `ActivityLog`, `KeyNumber` + 11 dynamic choice models (`PaymentMethod`, `VehicleType`, `BodyType`, `Make`, `VehicleModel`, `Color`, `FuelType`, `DamageType`, `DoorsChoice`, `TaxPercentage`, `Category`, `Subcategory`, `Currency`) |
| `migrations/` | Django migration files | Auto-generated — never edit applied migrations |

#### API Layer (Django Ninja)

| File | Purpose | Endpoints |
|---|---|---|
| `api.py` | Core API — legal entities, dynamic choices, PDF generation | `/api/legal-entities/`, `/api/choices/`, `/api/pdf/` |
| `auth_api.py` | Authentication — login, logout, password reset, email verification | `/api/auth/login/`, `/api/auth/poll-status/`, `/api/auth/approve/` |
| `vehicle_api.py` | Vehicle CRUD operations | `/api/vehicles/` |
| `transaction_api.py` | Transaction CRUD + financial summaries + CSV import | `/api/transactions/` |
| `settings_api.py` | Business settings, user management, branch management | `/api/settings/` |
| `activity_logs_api.py` | Activity log retrieval (read-only) | `/api/activity-logs/` |
| `dashboard_api.py` | Aggregated dashboard KPIs, monthly trends, financial breakdown | `/api/dashboard/` |

#### Schema / Validation Layer

| File | Purpose |
|---|---|
| `schemas.py` | Pydantic schemas for vehicles, legal entities, choices, users, business settings |
| `transaction_schemas.py` | Pydantic schemas for transactions (request + response) |

#### PDF Generation

| File | Purpose |
|---|---|
| `views.py` | **Legacy views** — contains all PDF generators (~320 KB). Generates: Kaufvertrag, Verbindliche Bestellung, Verkaufvertrag, Quittung, Identitätsprüfung, Transaktionsbeleg |
| `pdf_helpers.py` | Shared PDF utility functions (fonts, header/footer, page layout) |

#### Authentication

| File | Purpose |
|---|---|
| `tokens.py` | Token generation helpers for auth flows (magic links, approval tokens) |

#### Admin

| File | Purpose |
|---|---|
| `admin.py` | Django admin registration for all models |

#### Tests

| File | Purpose | Coverage |
|---|---|---|
| `tests/__init__.py` | Test package init | — |
| `tests/test_setup.py` | Shared test fixtures & base class | Creates 2 businesses, 2 managers, 2 employees with full test data |
| `tests/test_api.py` | API endpoint tests | CRUD operations, response codes, data validation |
| `tests/test_models.py` | Model logic tests | Auto-ID generation, computed properties, financial calculations |
| `tests/test_security.py` | Security & RBAC tests | Multi-tenant isolation, permission checks, CSRF enforcement |

### Supporting Files

| File/Dir | Purpose |
|---|---|
| `manage.py` | Django management CLI |
| `requirements.txt` | Python dependencies |
| `.env` | Environment variables (SECRET_KEY, SMTP credentials) — **never commit** |
| `db.sqlite3` | SQLite database (development) — **never commit** |
| `locale/` | Backend translation files (.po/.mo) for German, English, Turkish, Arabic |
| `media/` | Uploaded files (business logos, vehicle images) |
| `templates/` | Django HTML templates (email templates, legacy pages) |
| `static/` | Global static assets (e.g., `fonts/ariblk.ttf`) |

---

## Frontend — React 19 + TypeScript + Vite 7

### Build & Config

| File | Purpose |
|---|---|
| `package.json` | Dependencies and scripts (`dev`, `build`, `lint`) |
| `vite.config.ts` | Vite configuration (proxy to Django backend, path aliases) |
| `tsconfig.json` | TypeScript root config |
| `tsconfig.app.json` | App-specific TypeScript config (strict mode) |
| `eslint.config.js` | ESLint rules |
| `components.json` | shadcn/ui component configuration |
| `index.html` | HTML entry point |

### Source (`frontend/src/`)

#### Entry Points

| File | Purpose |
|---|---|
| `main.tsx` | App bootstrap — renders `<App />` into DOM |
| `App.tsx` | Root component — routing, auth provider, locale setup, i18n |
| `index.css` | Global styles, design tokens, TailwindCSS directives |
| `App.css` | App-level component styles |

#### Pages (`src/pages/`)

| File | Route | Purpose |
|---|---|---|
| `DashboardPage.tsx` | `/:slug/:locale/` | Business dashboard overview |
| `VehiclesPage.tsx` | `/:slug/:locale/vehicles` | Vehicle inventory list (table + card views) |
| `VehicleFormPage.tsx` | `/:slug/:locale/vehicles/new` | Create/edit vehicle form |
| `TransactionsPage.tsx` | `/:slug/:locale/transactions` | Transaction list with filters |
| `AddTransactionPage.tsx` | `/:slug/:locale/transactions/new` | New transaction form |
| `EditTransactionPage.tsx` | `/:slug/:locale/transactions/:id` | Edit transaction |
| `LegalEntitiesPage.tsx` | `/:slug/:locale/legal-entities` | Buyer/seller directory |
| `UserManagementPage.tsx` | `/:slug/:locale/users` | User CRUD (manager only) |
| `BusinessSettingsPage.tsx` | `/:slug/:locale/settings` | Business profile, bank, etc. |
| `ChoicesManagementPage.tsx` | `/:slug/:locale/choices` | Dynamic choice CRUD |
| `ActivityLogsPage.tsx` | `/:slug/:locale/activity-logs` | Audit trail viewer |

##### Auth Pages (`src/pages/auth/`)

| File | Purpose |
|---|---|
| `LoginPage.tsx` | Login entry — role selection (manager vs employee) |
| `ManagerLoginPage.tsx` | Manager email + password login (triggers magic link) |
| `EmployeeLoginPage.tsx` | Employee username login (triggers manager approval) |
| `CheckEmailPage.tsx` | "Check your email" interstitial with polling |
| `ApprovalPages.tsx` | Manager-side approval/rejection of employee logins |
| `RecoveryPages.tsx` | Password reset + email change flows |

#### Components (`src/components/`)

##### UI Primitives (`src/components/ui/`) — shadcn/ui + Radix

| Component | File |
|---|---|
| AlertDialog | `alert-dialog.tsx` |
| Avatar | `avatar.tsx` |
| Badge | `badge.tsx` |
| Button | `button.tsx` |
| Calendar | `calendar.tsx` |
| Card | `card.tsx` |
| Dialog | `dialog.tsx` |
| DropdownMenu | `dropdown-menu.tsx` |
| DynamicSelect | `dynamic-select.tsx` |
| FilterSelect | `filter-select.tsx` |
| Form | `form.tsx` |
| Input | `input.tsx` |
| Label | `label.tsx` |
| Popover | `popover.tsx` |
| ScrollArea | `scroll-area.tsx` |
| SearchableSelect | `searchable-select.tsx` |
| Select | `select.tsx` |
| Separator | `separator.tsx` |
| Sheet | `sheet.tsx` |
| Skeleton | `skeleton.tsx` |
| Table | `table.tsx` |
| Textarea | `textarea.tsx` |
| Tooltip | `tooltip.tsx` |

##### Layout (`src/components/layout/`)

| File | Purpose |
|---|---|
| `AppLayout.tsx` | Main app shell — sidebar + header + content area |
| `Header.tsx` | Top navigation bar with user menu, notifications |
| `Sidebar.tsx` | Collapsible sidebar navigation |
| `LanguageSwitcher.tsx` | Locale selector (DE/EN/TR/AR) |
| `NotificationsDropdown.tsx` | Notification bell dropdown |
| `ProtectedRoute.tsx` | Auth guard — redirects to login if unauthenticated |

##### Auth (`src/components/auth/`)

| File | Purpose |
|---|---|
| `AuthLayout.tsx` | Centered card layout for auth pages |

##### Vehicles (`src/components/vehicles/`)

| File | Purpose |
|---|---|
| `VehicleForm.tsx` | Full vehicle create/edit form (65 KB — largest component) |
| `VehicleTable.tsx` | Vehicle list table with sorting/filtering |
| `VehicleCard.tsx` | Vehicle card view (grid layout) |
| `VehicleFilters.tsx` | Status, make, body type, and date range filters |
| `ContractModal.tsx` | PDF contract generation dialog |
| `FinancialSummary.tsx` | Vehicle-level financial summary card |
| `FinancialMetricsStrip.tsx` | Compact inline financial KPI grid (COGS, margin, ROI, etc.) |
| `VehicleExpensesEarningsCard.tsx` | Inline expense/earning entry card with add dialog and pill list |
| `VehicleImageUpload.tsx` | Vehicle photo upload with drag-and-drop support |
| `StatusBanner.tsx` | Vehicle lifecycle status banner |

##### Transactions (`src/components/transactions/`)

| File | Purpose |
|---|---|
| `TransactionForm.tsx` | Transaction create/edit form (43 KB) |
| `TransactionTable.tsx` | Transaction list table |
| `TransactionFilters.tsx` | Category, date, status filters |
| `FinancialSummaryTable.tsx` | Gross/net/tax breakdown table |
| `ImportTransactionsModal.tsx` | CSV import dialog |
| `RelatedTransactionsTable.tsx` | Vehicle-linked transactions inline table |
| `index.ts` | Barrel export |

##### Legal Entities (`src/components/legal-entities/`)

| File | Purpose |
|---|---|
| `EntityForm.tsx` | Legal entity create/edit form |

##### Shared Components (root of `src/components/`)

| File | Purpose |
|---|---|
| `AutoSaveIndicator.tsx` | Shows auto-save status (saving/saved/error) |
| `RecordNavigation.tsx` | Prev/next navigation between records |
| `ScrollToTop.tsx` | Scroll-to-top button |
| `StickyFooter.tsx` | Fixed footer bar for form pages |
| `SplitViewArrows.tsx` | Component to adjust split view proportions dynamically |
| `PerPageInput.tsx` | Table row limit selector component |
| `PageInput.tsx` | Direct page jump input component |

#### Hooks (`src/hooks/`)

| File | Purpose | Key Functions |
|---|---|---|
| `useVehicles.ts` | Vehicle API hooks | `useVehicleList`, `useVehicle`, `useCreateVehicle`, `useUpdateVehicle` |
| `useTransactions.ts` | Transaction API hooks | `useTransactions`, `useCreateTransaction`, `useUpdateTransaction` |
| `useLegalEntities.ts` | Legal entity API hooks | `useLegalEntities`, `useCreateEntity`, `useUpdateEntity` |
| `useActivityLogs.ts` | Activity log hooks | `useActivityLogs` |
| `useAutoSave.ts` | Auto-save debounced form persistence | `useAutoSave` |
| `useAuthPolling.ts` | Polls `AuthActionRequest` status during login | `useAuthPolling` |
| `useDashboard.ts` | Dashboard API hook | `useDashboard` |

#### Lib / Utilities (`src/lib/`)

| File | Purpose |
|---|---|
| `api.ts` | Axios instance — base URL, CSRF token injection, cookie handling |
| `auth.tsx` | `AuthProvider` context — login, logout, session check |
| `i18n.ts` | i18next configuration — locale detection, namespace setup |
| `utils.ts` | General utilities — `cn()` classname merger, date formatters |
| `paginationPrefs.ts` | Shared utilities to persist and retrieve user pagination settings using cookies |
| `vehicleFinancials.ts` | Financial calculation utilities (COGS, margin, ROI, break-even, netExpensesEarnings, taxLiability) |
| `validations.ts` | Zod validation schemas for forms |

#### Types (`src/types/`)

| File | Purpose |
|---|---|
| `vehicle.ts` | `Vehicle`, `VehicleFilters`, `VehicleFormData` interfaces |
| `transaction.ts` | `Transaction`, `TransactionFilters`, `TransactionFormData` interfaces |
| `dashboard.ts` | `DashboardData`, `MonthlyDataPoint`, `TopVehicle` interfaces |

#### Locales (`src/locales/`)

| File | Language | Direction |
|---|---|---|
| `de.json` | German (default) | LTR |
| `en.json` | English | LTR |
| `tr.json` | Turkish | LTR |
| `ar.json` | Arabic | RTL |

---

## Deployment Infrastructure

### Docker

| File | Purpose |
|---|---|
| `Dockerfile` | Python 3.11-slim container — installs system deps (Pillow, ReportLab), pip deps, copies backend, runs Gunicorn on port 8000 |
| `docker-compose.yml` | Orchestrates `django` (Gunicorn) + `nginx` (reverse proxy) services with volume mounts for DB, media, locale, SSL certs |

### Nginx

| File | Purpose |
|---|---|
| `nginx/nginx.conf` | HTTP→HTTPS redirect, Let's Encrypt ACME, proxies `/api/`, `/admin/`, `/rosetta/` to Django, serves `/media/` and `/static/` directly, React SPA fallback for `/*` |

### Production Settings

| File | Purpose |
|---|---|
| `backend/drivebase/settings_prod.py` | Imports from `settings.py`, overrides: `DEBUG=False`, enforces `SECRET_KEY` from env, adds WhiteNoise middleware, secure cookies, env-based CORS/CSRF |
| `backend/.env.production.template` | Template showing required env vars — committed to git, real `.env.production` is gitignored |

### CI/CD

| File | Purpose |
|---|---|
| `.github/workflows/deploy.yml` | GitHub Actions — on push to `main`: SSH into server, pull both repos, build React, rebuild Docker, migrate, collectstatic |

### Backup

| File | Purpose |
|---|---|
| `scripts/backup.sh` | Daily cron — SQLite `.backup` + media tarball, 7-day retention, intended for `0 3 * * *` crontab |

---

## Data Model Summary

> Full schema is in [`schema.prisma`](./schema.prisma). Here is the entity overview:

### Core Entities

| Entity | Table | Description |
|---|---|---|
| `Business` | `manager_business` | Multi-tenant root — ALL data scoped here |
| `Branch` | `manager_branch` | Physical locations within a business |
| `User` | `manager_user` | Custom AbstractUser with `is_manager`, permissions |
| `LegalEntity` | `manager_legalentity` | Buyers/sellers — individuals or companies |
| `Vehicle` | `manager_vehicle` | Vehicle inventory with full lifecycle |
| `Transaction` | `manager_transaction` | Financial records linked to vehicles |
| `VehicleExpenseEarning` | `manager_vehicleexpenseearning` | Lightweight vehicle-scoped expense/earning entries |

### Auth & Audit

| Entity | Table | Description |
|---|---|---|
| `AuthActionRequest` | `manager_authactionrequest` | Cross-device auth flows (magic link, approval polling) |
| `ActivityLog` | `manager_activitylog` | User activity audit trail |

### Dynamic Choice Models (13)

All follow the pattern: `{ id, name, business_id, is_active }` with `@@unique([name, businessId])`.

| Entity | Table | Extra Fields |
|---|---|---|
| `PaymentMethod` | `manager_paymentmethod` | — |
| `VehicleType` | `manager_vehicletype` | — |
| `BodyType` | `manager_bodytype` | — |
| `Make` | `manager_manufacturer` | Legacy table name |
| `VehicleModel` | `manager_manufacturermodel` | `makeId` (FK → Make, column: `manufacturer_id`) |
| `Color` | `manager_color` | — |
| `FuelType` | `manager_fueltype` | — |
| `DamageType` | `manager_damagetype` | — |
| `DoorsChoice` | `manager_doorschoice` | — |
| `TaxPercentage` | `manager_taxpercentage` | `percentage` (Decimal), `is_no_tax` (Boolean) |
| `Category` | `manager_category` | — |
| `Subcategory` | `manager_subcategory` | `categoryId` (FK → Category) |
| `Currency` | `manager_currency` | `code` (e.g., "EUR") |

---

## Key Architectural Patterns

### Multi-Tenancy
- Every model has a `business` FK (except `AuthActionRequest`)
- All API queries filter by `request.user.business`
- `internal_id` is auto-generated per business, unique within that scope

### Dual Authentication Flow
```
Manager Login:  Credentials → Magic Link email → Click → Session
Employee Login: Username → Approval email to manager → Manager approves → Session
```
Both use `AuthActionRequest` model with polling via `/api/auth/poll-status/`

### Legacy Compatibility (Transaction model)
The `Transaction` model carries **both** legacy CharField choices and FK replacements:
- `method` (CharField) ↔ `payment_method_id` (FK)
- `currency` (CharField) ↔ `currency_fk_id` (FK)
- `category` (CharField) ↔ `category_fk_id` (FK)
- `subcategory` (CharField) ↔ `subcategory_fk_id` (FK)

Legacy fields are used by PDF generation views. FK fields are used by the modern API.

### Financial Calculations
- All money fields use `Decimal` (never `float`)
- Tax: `gross = net × (1 + rate)` / `net = gross / (1 + rate)`
- Vehicle has computed properties: `buy_price_net`, `sale_price_net`, `net_profit`
- COGS = buyNet + netExpensesEarnings (from vehicle expense/earning entries, signed: earnings − expenses)
- Gross COGS = buyGross + netExpensesEarnings
- Gross Profit = (saleGross − buyGross) + netExpensesEarnings
- Net Profit = (saleNet − buyNet) + netExpensesEarnings
- VAT Liability = |saleTaxAmount − buyTaxAmount|
- Total Profit = Net Profit − VAT Liability
- Margin = (Gross Profit ÷ saleNet) × 100
- ROI = (Gross Profit ÷ COGS) × 100
- Transaction has class methods for gross/net/tax aggregations across querysets
