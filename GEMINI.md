# 🚗 DriveBase — Gemini & Antigravity Master Agent Guide

> **Primary AI Configuration Beacon for the DriveBase Repository.**
> All Gemini and Antigravity agents working in this repository must follow this document as the master entrypoint and architectural index.

---

## 1. Project Identity & Domain Context

**DriveBase** is a private, multi-tenant vehicle management platform custom-built for used-car dealerships in Germany. It replaces a legacy Microsoft Access application that the business ran for years.

- **Backend:** Python 3.12 · Django 5.2 · Django Ninja (REST API with Pydantic schemas) · SQLite (`backend/db.sqlite3`)
- **Frontend:** React 19 · TypeScript · Vite 7 · TailwindCSS 4 · Radix UI / shadcn/ui · TanStack Query v5 · React Router v7
- **Authentication:** Session-based cookies with CSRF protection (`csrf=True` on NinjaAPI). Dual auth flows:
  - **Manager:** Logs in with email 2FA verification. Full system permissions.
  - **Employee:** Login requires manual email approval by the manager. Transactions section visibility is permission-controlled per employee.
- **Key UX Benchmarks:**
  - High information density (the manager expects to see data without endless scrolling, honoring the Microsoft Access ergonomics).
  - Mouse-driven speed over typing: choice dropdowns over free text wherever possible.
  - Light mode optimized on large desktop monitors.

---

## 2. AI Workspace Topology & Resource Map

All AI-related configurations, specifications, skills, and references are structured in dedicated directories. **Use this map to navigate the repository:**

| Resource | Path | Description | Access Rule |
| :--- | :--- | :--- | :--- |
| **Mandatory Agent Rules** | [`.agentrules`](./.agentrules) | 336-line law governing code quality, safety, and constraints | **MANDATORY** (Read before work) |
| **Data Model Reference** | [`schema.prisma`](./schema.prisma) | Prisma data model mirroring Django ORM 1:1 | **MANDATORY** (Read before schema changes) |
| **Codebase Map** | [`PROJECT_MAP.md`](./PROJECT_MAP.md) | File-level map of every module, route, and component | **MANDATORY** (Read before file navigation) |
| **Developer Guide** | [`.agents/developer_guide.md`](./.agents/developer_guide.md) | Detailed technical stack, patterns, and component rules | **MANDATORY** reference |
| **Product & Personas** | [`.agents/idea.md`](./.agents/idea.md) | Product vision, user workflows, and business rules | **MANDATORY** domain reference |
| **Skill Packs (65+)** | [`.agents/skills/`](./.agents/skills/) | Specialized prompt/instruction skills for specific tasks | Consult per routing table below |
| **Agent Scratchpad** | [`.agents/scratch/`](./.agents/scratch/) | Dedicated workspace for temporary AI test/inspection scripts | Ephemeral / Scratch only |
| **Artifact Archives** | [`.agents/artifacts/`](./.agents/artifacts/) | Topic archives of implementation plans & walkthroughs | Living documentation |
| **Design System** | [`.agents/design-system/`](./.agents/design-system/) | Tokens, typography, colors, and UI component standards | Read for UI changes |
| **Reference PDFs & Scripts** | [`reference_files_only/`](./reference_files_only/) | Sample German legal PDFs & Python generator prototypes | **READ-ONLY** reference |
| **Reference UI Prototype** | [`reference_ui/`](./reference_ui/) | Standalone Lovable/Vite UI mockup & design system | **READ-ONLY** reference |
| **Documentation** | [`docs/`](./docs/) | External documentation (mobile.de API, deactivated features) | Informational |
| **Production Scripts** | [`scripts/`](./scripts/) | Operational scripts (e.g., `backup.sh`) | Production only |

---

## 3. Mandatory Engineering Laws

1. **🔒 Rule 0 — Pre-Work Context Loading:**
   Before proposing any plan or writing code, read:
   1. [`README.md`](./README.md)
   2. [`schema.prisma`](./schema.prisma)
   3. [`PROJECT_MAP.md`](./PROJECT_MAP.md)
   4. Relevant skills in [`.agents/skills/`](./.agents/skills/)
   5. Prior conversation artifacts.

2. **🏢 Strict Tenant Isolation:**
   DriveBase is multi-tenant. Every single query and mutation MUST be scoped to `business_id` / `request.user.business`. Cross-tenant data leaks are critical security violations. Never expose internal database auto-increment IDs to users; use `internal_id` scoped per business.

3. **💰 Financial & Currency Precision:**
   Never use `float` for monetary values. Always use Python `Decimal` / string representations. Respect the German tax calculation rules:
   - Gross = $\text{Net} \times (1 + \text{tax\_rate})$
   - Net = $\text{Gross} / (1 + \text{tax\_rate})$
   - Always handle `is_no_tax` flag on `TaxPercentage`.

4. **🌐 Strict Internationalization (i18n):**
   Supported locales: `de` (German, default), `en` (English), `tr` (Turkish), `ar` (Arabic, RTL).
   - In React: Never hardcode user-visible strings. Always use `t('key')` from `react-i18next`. New features must provide translation keys for all four locales in `frontend/src/locales/`.
   - In Django: Model fields must use `gettext_lazy` (`_`) for `verbose_name`.

5. **📄 ReportLab PDF Stability:**
   DriveBase produces 6 German legal documents: Kaufvertrag, Verbindliche Bestellung, Verkaufvertrag, Quittung, Identitätsprüfung, and Transaktionsbeleg. Never modify PDF layout or coordinates without explicit approval. Number-to-words conversion must use `num2words` with the German language setting.

6. **🧪 Verification Before Completion:**
   - Backend tests must pass: `python manage.py test manager.tests` (using `drivebase_venv` or active venv).
   - Frontend TypeScript must build cleanly: `npm run build` in `frontend/`.

---

## 4. Code Intelligence Triad & Dispatch Policy

This repository is indexed by three specialized code intelligence engines. To optimize token usage and avoid redundant tool calls, follow the **strict single-engine dispatch policy**:

```
Task Intent
 │
 ├── 1. Inspect source code, locate symbols, or trace direct call hops (90% of tasks)
 │    └── ➡️ CODEGRAPH (`codegraph_explore`)
 │
 ├── 2. Refactor/rename shared functions, models, or verify git diff safety
 │    └── ➡️ GITNEXUS (`gitnexus_impact`, `gitnexus_detect_changes`)
 │
 └── 3. Macro architecture audit, module coupling, god nodes, or PR triage
      └── ➡️ GRAPHIFY (`god_nodes`, `get_community`, `query_graph`)
```

### 4.1 Engine Responsibilities & Tools

| Engine | Primary Scope | MCP Tools | CLI Update Command | Auto-Update Behavior |
| :--- | :--- | :--- | :--- | :--- |
| **CodeGraph** (`.codegraph/`) | **Daily Implementation Workhorse:** Verbatim source retrieval, exact line numbers, cross-file dynamic hops. | `codegraph_explore` | `codegraph sync` | Incremental via `codegraph sync` (or background daemon) |
| **GitNexus** (`.gitnexus/`) | **Refactoring & Blast Radius Gate:** Upstream/downstream callers, execution flow impact, pre-commit diff checks. | `gitnexus_impact`, `gitnexus_detect_changes`, `gitnexus_query`, `gitnexus_context` | `npx gitnexus analyze` | On-demand / Manual refresh |
| **Graphify** (`graphify-out/`) | **Architectural Auditor:** High-level module dependencies, god nodes, circular coupling, PR package triage. | `query_graph`, `god_nodes`, `get_community`, `get_neighbors`, `get_pr_impact` | `python -m graphify update .` | On-demand / Manual refresh |

### 4.2 Mandatory Anti-Duplication Laws
1. **Never Double-Dip:** Never query multiple tools for the same information. If investigating a bug, use CodeGraph. Do not call GitNexus or Graphify unless performing a cross-cutting refactor.
2. **No Source Code via Graphify:** Graphify only stores graph topology and metadata. Never query Graphify expecting verbatim code.
3. **No Blast-Radius Over-Engineering:** Do not run `gitnexus_impact` for minor UI styling, CSS tweaks, or isolated leaf view changes. Reserve it for models, core shared utils, and API contracts.

### 4.3 Mandatory Bookend Synchronization Protocol (Sync-Before-Use, Sync-After-Task)
Whenever you interact with any code intelligence engine, you **MUST follow the bookend sync cycle**:
1. **At the Start (Before Querying):** If you decide to query a graph tool, run its refresh command first and wait for completion before relying on the index:
   - **CodeGraph:** `codegraph sync`
   - **GitNexus:** `npx gitnexus analyze --skip-agents-md --skip-skills`
   - **Graphify:** `python -m graphify update .`
2. **At the End (After Modifying Code):** After finishing all code modifications and before completing the turn or running confirmation tests, run the refresh command again so the knowledge graph is 100% synchronized with the newly modified codebase.

---

## 5. Agent Skill Routing Table

Consult the corresponding skill in [`.agents/skills/`](./.agents/skills/) before starting domain-specific work:

| Task Domain | Primary Skills |
| :--- | :--- |
| **Django Models, ORM & Migrations** | `django-expert`, `django-patterns`, `django-pro` |
| **Django Security, Auth & RBAC** | `django-security`, `django-patterns` |
| **API Design & Django Ninja** | `api-design`, `backend-engineering` |
| **Database Schema & Migrations** | `database-engineering`, `database-schema-designer`, `data-modeling` |
| **React Components & UI Patterns** | `react-writing-code`, `react-components`, `react-ui-patterns`, `frontend-design` |
| **Forms & Zod Validation** | `designing-zod-schemas` |
| **Tailwind CSS Styling** | `tailwind-css` |
| **i18n & RTL Layout** | `i18n`, `localization-i18n` |
| **End-to-End & Integration Tests** | `drivebase-testing-framework`, `typescript-testing`, `react-testing` |
| **PDF Inspection & Generation** | `nano-pdf` |
| **Mobile.de API Integration** | `mobile-de-api` |
| **Multi-Tenant Architecture** | `multi-tenant-architecture` |
| **Code Refactoring & Quality** | `clean-code`, `refactoring-patterns`, `software-principles` |

---

## 6. Agent Scratchpad Protocol (`.agents/scratch/`)

When you need to run temporary inspection scripts, migration verifications, or database probes:
- Place all temporary scripts in [`.agents/scratch/`](./.agents/scratch/).
- **Never** place test/scratch scripts in the root directory, `backend/`, or production `scripts/`.
- Scratch scripts must **never** be imported by production application code.
