---
name: drivebase-testing-framework
description: Master architectural and execution guide for the DriveBase Dealership Operating System End-to-End (E2E) and Integration Testing Suite. Covers Playwright setup, Page Object Models (POM), zero-latency email interception, PDF byte inspection, session persistence, and maintenance workflows.
---

# DriveBase Dealership Testing Framework & Maintenance Runbook

This skill documents the complete test engineering architecture, Page Object Model (POM) pattern, execution workflows, and maintenance guides for the **DriveBase Dealership Operating System**.

---

## 1. Directory Structure & Architecture

```
frontend/
├── e2e/
│   ├── auth.spec.ts                     # Phase 1: Registration, 2FA, password/email change/reset & employee approval
│   ├── dealership-lifecycle.spec.ts     # Phase 2: 14-Day sequential dealership manager operational journey
│   ├── fixtures/
│   │   ├── images/                      # Test assets (test_van.jpg, logo_square, logo_banner, logo_icon, logo_4k)
│   │   └── test-helpers.ts              # StarMoney CSV generators, API URLs, mailbox interception helpers
│   └── pages/
│       ├── AuthPage.ts                  # POM: Login, 2FA polling, registration, password/email recovery
│       ├── VehiclesPage.ts              # POM: Grid filters, vehicle creation, status updates, autosave verification
│       ├── TransactionsPage.ts          # POM: Ledger, StarMoney bulk CSV upload, filter combinations
│       └── SettingsPage.ts              # POM: Company profile, logo aspect ratios, choices & backup ZIP export
├── playwright.config.ts                 # Playwright configuration, browsers (Chromium), timeouts, webServer
├── .auth/
│   └── manager_session.json             # Persisted browser storageState for zero-latency operational test runs
└── test_artifacts/
    └── generated_pdfs/                  # Streaming destination for generated vehicle & transaction PDFs
```

---

## 2. Key Testing Innovations

### 2.1 Zero-Latency Mailbox Interceptor
Rather than polling third-party SMTP servers or waiting for external email round-trips, DriveBase uses an in-memory interceptor backed by `django.core.mail.outbox`:
- **API Endpoint**: `GET /api/auth/test-outbox`
- **Clearing**: `POST /api/auth/test-outbox/clear`
- **Capabilities**: Captures verification tokens, 2FA login approval URLs, password reset links, and employee login approval requests in under 5 milliseconds.

### 2.2 Reusable Page Object Models (POM)
All DOM selectors and interaction mechanics are encapsulated within dedicated classes:
```typescript
import { VehiclesPage } from './pages/VehiclesPage';
import { TransactionsPage } from './pages/TransactionsPage';

// Inside test:
const vehiclesPage = new VehiclesPage(page, 'haselhorst-automobile-gmbh');
await vehiclesPage.gotoNew();
await vehiclesPage.setStatus('ready_for_sale');
await vehiclesPage.verifyAutoSaveState('saved');
```
**Maintainability Rule**: If a UI component changes (e.g. replacing a dropdown with a combobox or adding bulk photo upload), update **only the single Page Object method**, leaving all 14 test stories untouched.

### 2.3 Automated PDF Inspection via `pypdf`
All generated vehicle contracts (*Ankaufvertrag*, *Verkaufsvertrag*, *Identitätsprüfung*, *Verbindliche Bestellung*, *Quittung*) and financial reports stream directly to disk under `test_artifacts/generated_pdfs/`:
- Assert HTTP 200 and binary `%PDF-` header.
- Execute Python script in `acar_venv` using `pypdf.PdfReader` to extract and assert textual content (dealership names, HRB numbers, German price words, VINs).

---

## 3. Test Execution Runbook

### Prerequisites
Ensure backend and frontend servers are running:
- Backend: `http://localhost:8000` (Django)
- Frontend: `http://localhost:5173` (Vite)

### Running Tests

```bash
cd frontend

# 1. Run All E2E Suites (Headless)
npx playwright test

# 2. Run Only Authentication Suite
npx playwright test e2e/auth.spec.ts

# 3. Run Only 14-Day Dealership Operational Lifecycle Suite
npx playwright test e2e/dealership-lifecycle.spec.ts

# 4. Run in Interactive UI Mode (Visual Debugger)
npx playwright test --ui

# 5. Run with Step-by-Step Heading / Trace
npx playwright test --headed --trace on
```

### Viewing Traces and HTML Reports
```bash
# Open interactive Playwright HTML report
npx playwright show-report

# Inspect failed test trace zip
npx playwright show-trace test-results/.../trace.zip
```

---

## 4. UI Maintenance Guidelines

### Updating Selectors for Radix UI Dropdowns
DriveBase uses Radix UI popovers for choices (`DynamicSelect.tsx`):
- **Combobox Triggers**: Located inside `FieldWrapper` (`div.min-w-0:has(> label)`).
- **Targeting specific fields**:
  ```typescript
  const label = page.locator('label').filter({ hasText: /Marke|Make/i }).first();
  const trigger = label.locator('..').locator('button[role="combobox"]').first();
  await trigger.click();
  ```
- **Option lists**: Render inside `[data-slot="popover-content"]`:
  ```typescript
  const popper = page.locator('[data-slot="popover-content"]:visible').last();
  await popper.locator('button').filter({ hasText: 'Ford' }).first().click();
  ```

### Handling Multi-Language Selectors
Dealership managers can operate in German (`de`) or English (`en`). Always use bilingual regex patterns for buttons, labels, and toasts:
```typescript
// Button selector pattern
page.locator('button:has-text("Save"), button:has-text("Speichern")')
page.locator('button:has-text("Create Vehicle"), button:has-text("Fahrzeug erstellen")')
```

### Preserving Database Baselines
Tests run against Business 1 (`Haselhorst Automobile GmbH`). When tests finish or before major suite runs, verify the database baseline:
- Exactly **92 vehicles**
- Exactly **568 transactions**
Pristine backup file: `backend/db_baseline_92.sqlite3`.
Restore with:
```powershell
Copy-Item "backend/db_baseline_92.sqlite3" -Destination "backend/db.sqlite3" -Force
```
