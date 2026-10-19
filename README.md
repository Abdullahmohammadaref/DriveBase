# 🚗 DriveBase — Vehicle Management System

A full-stack, multi-tenant vehicle management platform built for auto dealerships operating in the German market. Manage vehicle inventory, financial transactions, legal entities (buyers/sellers), and generate legally-compliant German PDF documents — all from a modern, multilingual web interface.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Overview](#api-overview)
- [Authentication](#authentication)
- [Data Model](#data-model)
- [Internationalization](#internationalization)
- [PDF Generation](#pdf-generation)
- [Testing](#testing)
- [Agent & AI Configuration](#agent--ai-configuration)
- [License](#license)

---

## Overview

**DriveBase** is a business management application designed for used-car dealerships in Germany. It provides a complete workflow — from purchasing a vehicle and tracking its lifecycle, through managing buyers/sellers (legal entities), to generating sale contracts, binding orders, receipts, and identity-check PDFs in compliance with German business standards.

The system is **multi-tenant**: each business operates in its own isolated data space, with role-based access control (managers vs. employees) and per-user permission flags.

---

## Features

### Vehicle Management
- Full vehicle lifecycle tracking: **Purchased → Ready for Sale → Reserved → Sold → Inactive**
- Auto-assignment of next available physical key numbers
- Detailed vehicle records: VIN, license plates, registration numbers, mileage, year of construction
- Buy & sale pricing with configurable tax percentages and payment methods
- Auto-generated internal IDs per business
- Vehicle image uploads
- Financial summary per vehicle (revenue, expenses, net profit)

### Financial Transactions
- Record buy/sell transactions with categorization and subcategories
- Configurable payment methods, currencies, and tax rates
- Commission tracking on sales
- CSV bank statement import
- Gross/net/tax financial summaries
- Transaction PDF export

### Legal Entity Management
- Maintain a directory of individuals and companies (buyers, sellers)
- Linked to vehicles for full traceability
- Auto-incrementing internal IDs per business

### PDF Document Generation
| Document | German Name | Description |
|---|---|---|
| Sale Contract | Kaufvertrag | Full vehicle sale agreement |
| Binding Order | Verbindliche Bestellung | Binding purchase order |
| Purchase Agreement | Verkaufvertrag | Vehicle purchase agreement |
| Receipt | Quittung | Receipt with German price-in-words |
| Identity Check | Identitätsprüfung | Customer identity verification |
| Transaction Receipt | Transaktionsbeleg | Financial transaction receipt |

All PDFs generated server-side using ReportLab with business logo, address, bank details, and tax IDs.

### Business Configuration
- Customize dropdown choices: vehicle types, body types, makes & models, colors, fuel types, damage types, door options, tax percentages, categories, subcategories, currencies, and payment methods
- Real-time business profile settings updates (address, bank details, tax IDs, court registration) that reflect immediately across the application
- Branch management

### User Management & Security
- Role-based access: **Manager** and **Employee** roles
- Granular permissions: transactions access, legal entities access
- Manager-approved employee login via email verification
- Password reset and email change flows with token-based verification
- CSRF protection with session-based authentication
- Rate limiting on sensitive endpoints
- Multi-tenant data isolation (strict business_id scoping)

### Activity Logging
- Track user actions across the system (create, update, delete, status change)
- Full audit trail for compliance
- Per-user persistent notification tracking for unread activities

### Internationalization (i18n)
- Full UI translation support: **German** (default), **English**, **Turkish**, **Arabic**
- RTL layout support for Arabic
- URL-based locale switching (`/:business_slug/:locale/...`)
- Backend translation via Django's `gettext` + Rosetta

---

## Tech Stack

### Backend

| Technology | Version | Purpose |
|---|---|---|
| Python | 3.12 | Runtime |
| Django | 5.2 | Web framework |
| Django Ninja | 1.3 | REST API framework (Pydantic schemas) |
| Pydantic | 2.12 | Request/response validation |
| SQLite | — | Database (development) |
| ReportLab | 4.4 | PDF generation |
| Pillow | 12.0 | Image processing |
| num2words | 0.5 | Number-to-words conversion (German) |
| Pandas | 2.3 | CSV import processing |
| django-cors-headers | 4.9 | CORS for SPA frontend |
| django-ratelimit | 4.1 | API rate limiting |
| django-rosetta | 0.10 | Translation management UI |

### Infrastructure & Deployment

| Technology | Purpose |
|---|---|
| Docker | Application containerization |
| Nginx | Reverse proxy, static file serving, SSL termination |
| GitHub Actions | Automated CI/CD pipeline |
| Oracle Cloud | Production hosting environment |

### Frontend

| Technology | Version | Purpose |
|---|---|---|
| React | 19.2 | UI framework |
| TypeScript | 5.9 | Type-safe JavaScript |
| Vite | 7.2 | Build tool & dev server |
| TailwindCSS | 4.1 | Utility-first CSS |
| Radix UI | Latest | Accessible component primitives |
| React Router | 7.12 | Client-side routing |
| TanStack Query | 5.90 | Server state management & caching |
| TanStack Table | 8.21 | Data table with sorting, filtering, pagination |
| React Hook Form | 7.70 | Form state management |
| Zod | 4.3 | Schema validation |
| i18next | 25.7 | Internationalization |
| Lucide React | 0.562 | Icon library |
| Axios | 1.13 | HTTP client |
| date-fns | 4.1 | Date utilities |

---

## Project Structure

> For a detailed file-by-file map, see [`PROJECT_MAP.md`](./PROJECT_MAP.md).

```
drivebase/
├── .agentrules              # AI agent rules
├── .agents/skills/          # 65+ AI skill packs
├── README.md                # ← You are here
├── schema.prisma            # Prisma data model reference
├── PROJECT_MAP.md           # Full file-level project map
│
├── backend/                 # Django backend
│   ├── drivebase/           # Django project config (settings, urls)
│   ├── manager/             # Main Django app
│   │   ├── models.py        # All data models (1,835 lines)
│   │   ├── api.py           # Core API (legal entities, choices, PDFs)
│   │   ├── auth_api.py      # Authentication API
│   │   ├── vehicle_api.py   # Vehicle CRUD API
│   │   ├── transaction_api.py # Transaction CRUD API
│   │   ├── settings_api.py  # Business settings API
│   │   ├── schemas.py       # Pydantic schemas
│   │   ├── views.py         # PDF generators (legacy)
│   │   └── tests/           # Test suite (API, models, security)
│   ├── locale/              # Backend translations (.po/.mo)
│   ├── static/              # Global static assets (fonts, etc.)
│   ├── media/               # Uploaded files
│   └── requirements.txt     # Python dependencies
│
└── frontend/                # React SPA
    ├── src/
    │   ├── App.tsx           # Root component & routing
    │   ├── pages/            # 11 page components + 6 auth pages
    │   ├── components/       # UI primitives, layout, domain components
    │   │   ├── ui/           # 23 shadcn/ui components
    │   │   ├── layout/       # AppLayout, Sidebar, Header, ProtectedRoute
    │   │   ├── vehicles/     # VehicleForm, VehicleTable, VehicleCard, etc.
    │   │   ├── transactions/ # TransactionForm, TransactionTable, etc.
    │   │   └── legal-entities/ # EntityForm
    │   ├── hooks/            # 6 custom hooks (useVehicles, useTransactions, etc.)
    │   ├── lib/              # API client, auth context, i18n, utils
    │   ├── types/            # TypeScript interfaces
    │   └── locales/          # Translation JSONs (de, en, tr, ar)
    └── package.json
```

---

## Getting Started

### Prerequisites

- **Python 3.10+**
- **Node.js 18+** and **npm**
- **Git**

### Backend Setup

```bash
# 1. Navigate to the backend directory
cd backend

# 2. Create and activate a virtual environment
python -m venv ../drivebase_venv
# Windows:
..\drivebase_venv\Scripts\activate
# macOS/Linux:
source ../drivebase_venv/bin/activate

# 3. Install Python dependencies
pip install -r requirements.txt

# 4. Create a .env file (see Environment Variables section)

# 5. Run database migrations
python manage.py migrate

# 6. Create a superuser (manager account)
python manage.py createsuperuser

# 7. Start the development server
python manage.py runserver
```

Backend API available at **http://localhost:8000/api/**

### Frontend Setup

```bash
# 1. Navigate to the frontend directory
cd frontend

# 2. Install Node.js dependencies
npm install

# 3. Start the development server
npm run dev
```

Frontend available at **http://localhost:5173/**

---

## Environment Variables

Create a `.env` file in the `backend/` directory:

| Variable | Description | Example |
|---|---|---|
| `SECRET_KEY` | Django secret key | `django-insecure-your-unique-key-here` |
| `ALLOWED_HOSTS` | Comma-separated allowed hosts | `localhost,127.0.0.1` |
| `BACKEND_URL` | Global backend URL for absolute links | `https://api.yourdomain.com` |
| `EMAIL_FROM` | Sender email address | `noreply@yourdomain.com` |
| `EMAIL_HOST_USER` | SMTP email username | `your-email@gmail.com` |
| `EMAIL_HOST_PASSWORD` | SMTP app password | `xxxx xxxx xxxx xxxx` |

> **Gmail users:** Generate an [App Password](https://support.google.com/accounts/answer/185833) — do not use your account password.

---

## API Overview

The REST API is built with **Django Ninja** and mounted at `/api/`. All endpoints use session-based authentication with CSRF protection.

| Prefix | Module | Description |
|---|---|---|
| `/api/auth/` | `auth_api.py` | Login, logout, password reset, email verification, polling |
| `/api/vehicles/` | `vehicle_api.py` | Vehicle CRUD operations |
| `/api/transactions/` | `transaction_api.py` | Transaction CRUD, financial summaries, CSV import |
| `/api/settings/` | `settings_api.py` | Business settings, user management, branches |
| `/api/activity-logs/` | `activity_logs_api.py` | Activity log retrieval |
| `/api/` | `api.py` | Legal entities, dynamic choices, PDF generation |

Interactive docs available at **http://localhost:8000/api/docs**

---

## Authentication

DriveBase implements a **dual authentication flow** using the `AuthActionRequest` model:

### Manager Login
```
1. Manager enters email + password
2. Backend creates AuthActionRequest, sends magic link email
3. Manager clicks link (on any device) → status = APPROVED
4. Frontend polls /api/auth/poll-status/ → detects approval → session established
```

### Employee Login
```
1. Employee enters username
2. Backend creates AuthActionRequest, sends approval email to business manager
3. Manager clicks "Approve" link → status = APPROVED
4. Employee's frontend detects approval via polling → session established
```

Both flows use CSRF-protected session authentication. The React frontend reads the CSRF token from cookies and includes it in every request via the `X-CSRFToken` header.

---

## Data Model

> Full schema: [`schema.prisma`](./schema.prisma)
> File map: [`PROJECT_MAP.md`](./PROJECT_MAP.md)

### Entity Relationship Overview

```
Business (tenant root)
├── Branch[]
├── User[] (manager / employee roles)
├── LegalEntity[] (buyers / sellers)
├── Vehicle[] ──→ Transaction[]
│   ├── seller (FK → LegalEntity)
│   ├── buyer (FK → LegalEntity)
│   ├── make (FK → Make) → model (FK → VehicleModel)
│   ├── buy_tax / sale_tax (FK → TaxPercentage)
│   ├── buy_payment_method / sale_payment_method (FK → PaymentMethod)
│   └── vehicle_type, body_type, color, fuel_type, damage_type, doors (FKs)
├── Dynamic Choices[] (PaymentMethod, VehicleType, BodyType, Make, etc.)
├── AuthActionRequest[] (auth flows)
└── ActivityLog[] (audit trail)
```

### Key Design Decisions
- **Multi-tenancy:** All data scoped by `business_id`. Cross-tenant access is impossible.
- **Internal IDs:** Auto-generated per business; never expose raw database PKs.
- **Legacy compatibility:** Transaction model carries both CharField choices and FK replacements for backward-compatible PDF generation.
- **Financial precision:** All money uses `Decimal(12,2)`, never `float`.

---

## Internationalization

### Supported Languages

| Code | Language | Direction | Status |
|---|---|---|---|
| `de` | German | LTR | Default, complete |
| `en` | English | LTR | Complete |
| `tr` | Turkish | LTR | Partial |
| `ar` | Arabic | RTL | Partial |

### Frontend (i18next)
- Translation files: `frontend/src/locales/{de,en,tr,ar}.json`
- Locale in URL: `/:business_slug/:locale/...`
- All user-visible strings use `t('key')` — no hardcoded text
- Arabic triggers RTL via `document.documentElement.dir = 'rtl'`

### Backend (Django gettext + Rosetta)
- Model labels use `gettext_lazy(_)`
- Translation files: `backend/locale/` (.po/.mo)
- Rosetta web UI: `/rosetta/`

---

## PDF Generation

All PDF documents are generated server-side using **ReportLab**. Generators live in `backend/manager/views.py` (legacy) with shared utilities in `pdf_helpers.py`.

Key features:
- Business logo, address, bank details, tax IDs in header
- German price-in-words via `num2words` library
- Auto-generated invoice numbers (`Rng-0001`, `Rng-0002`, etc.)

---

## Deployment

The application is containerized and configured for automated deployment:

- **Environment**: Oracle Cloud VM
- **Containerization**: Docker (Python 3.12 image)
- **Web Server**: Nginx handles reverse proxying to the backend API, serves React static files from `/frontend/dist`, and manages SSL termination.
- **CI/CD**: A GitHub Actions workflow (`.github/workflows/deploy.yml`) automatically builds the frontend, synchronizes code to the production server, and restarts the Docker containers upon pushing to the `master` branch.

---

## Testing

```bash
cd backend

# Run all tests
python manage.py test manager.tests

# Run specific test modules
python manage.py test manager.tests.test_api        # API endpoint tests
python manage.py test manager.tests.test_models      # Model logic tests
python manage.py test manager.tests.test_security    # Security & RBAC tests
```

### Test Coverage
| Module | Coverage |
|---|---|
| `test_setup.py` | Shared fixtures — 2 businesses, managers, employees with full data |
| `test_api.py` | CRUD operations, response codes, data validation |
| `test_models.py` | Auto-ID generation, computed properties, financial calculations |
| `test_security.py` | Multi-tenant isolation, RBAC enforcement, CSRF protection |

---

## Agent & AI Configuration

This project includes AI agent tooling for assisted development:

| File | Purpose |
|---|---|
| `GEMINI.md` | Master root agent beacon, stack overview, and AI resource map |
| `AGENTS.md` | Root agent guidelines pointing to `GEMINI.md` + GitNexus Code Intelligence |
| `.agentrules` | Mandatory rules for all AI agents (pre-work context loading, coding conventions, security constraints) |
| `.agents/skills/` | 65+ skill packs covering Django, React, TypeScript, API design, testing, security, i18n, and more |
| `schema.prisma` | Prisma-format data model reference for agents to understand the data layer |
| `PROJECT_MAP.md` | File-level codebase map for agents to navigate the project |

**Rule 0:** Before any code change, agents MUST read `GEMINI.md`, `schema.prisma`, `PROJECT_MAP.md`, and relevant skills.

---

## License

This project is proprietary software. All rights reserved.
