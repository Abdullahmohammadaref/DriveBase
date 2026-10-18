# Implementation Plan: AI Agent Workspace & Entrypoint Architecture Migration

This plan audits the current workflow and AI configuration in ACAR, organizes all agent assets into a clear, predictable hierarchy, establishes root entrypoints (`GEMINI.md` and `AGENTS.md`), creates a dedicated AI scratch environment, and ensures all future agent sessions navigate the project without hallucinating.

---

## 1. Goal Description

Currently, ACAR has rich AI context scattered across multiple directories:
- `.agentrules` in root (336 lines of core domain laws, stack definitions, and skill routing).
- `.agents/skills/` (65+ specialized skill packs).
- `.agents/developer_guide.md` & `.agents/idea.md` (detailed technical rules and business/persona specifications).
- `.agents/artifacts/PROJECT_MAP.md` (the file-level map expected by Rule 0 in root).
- Prototype assets in `reference_files_only/` and `reference_ui/`.
- Production scripts in `scripts/backup.sh`.
- GitNexus configuration in `.agents/AGENTS.md` and `.claude/skills/gitnexus/`.

**The Problem:**
1. Antigravity and Gemini-based agents look for `GEMINI.md` in the project root to load workspace rules and instructions. Because `GEMINI.md` is missing from the root, agents start sessions relying solely on global memories, requiring manual prompting or deep directory digging to locate `.agents/` and `.agentrules`.
2. Other agents (Cursor, Claude Code, Codeium) look for `AGENTS.md` in the root. The existing `AGENTS.md` is nested at `.agents/AGENTS.md` and only covers GitNexus.
3. `PROJECT_MAP.md` is referenced by Rule 0 as a root file, but only exists inside `.agents/artifacts/`.
4. There is no isolated, safe directory for AI agents to write and execute ad-hoc validation or inspection scripts without cluttering the root, `backend/`, or production `scripts/`.
5. An accidental duplicate folder `.agents/skills/django-security copy` clutters the skills folder.

**The Solution:**
1. **Workflow Discovery & Status:** Confirm via the `/migrate-workflows` standard that legacy workflows are already converted to modern skills (0 pending legacy workflows, 65+ active skills).
2. **Root Master Entrypoints:**
   - Create `GEMINI.md` in the root: Serves as the primary beacon, linking `.agentrules`, `.agents/developer_guide.md`, `.agents/idea.md`, `schema.prisma`, `PROJECT_MAP.md`, `.agents/skills/`, and CodeGraph/GitNexus.
   - Create `AGENTS.md` in the root: Points directly to `GEMINI.md` as the single source of truth, while embedding the GitNexus code intelligence section.
3. **Establish `PROJECT_MAP.md` in Root:** Copy `PROJECT_MAP.md` to the root directory to satisfy Rule 0.
4. **Create Dedicated `.agents/scratch/` Directory:** Provide an isolated area for agents to execute temporary exploratory or test scripts without bloating production files or polluting git status.
5. **Clean Up Clutter:** Remove the redundant `.agents/skills/django-security copy/` directory.

---

## 2. User Review Required

> [!IMPORTANT]
> **Single Source of Truth vs. Root Routing:**
> - `GEMINI.md` (in root) will be the comprehensive master document containing project identity, directory map, mandatory rules summary, and links to all supporting `.agents/` files.
> - `AGENTS.md` (in root) will be an intentional pointer to `GEMINI.md` with GitNexus MCP instructions, ensuring any agent tool lands on the exact same authoritative guidance.

> [!TIP]
> **AI Scratch Environment (`.agents/scratch/`):**
> - Production scripts (e.g. `scripts/backup.sh`) remain strictly reserved for production code and operations.
> - `.agents/scratch/` will contain a `README.md` defining it as an isolated playground for agents. We will configure `.gitignore` to track the folder and its README, while ignoring any temporary `.tmp`, `.log`, or `__pycache__` files generated during script runs.

---

## 3. Workflow Migration Assessment (`migrate-workflows`)

Based on our scan across global (`~/.gemini/config/`) and workspace directories:

| Scope | Discovered Workflows | Target Path | Status |
| :--- | :--- | :--- | :--- |
| Global | None (`.migrated` exists) | `~/.gemini/config/skills/` | Already Migrated |
| Workspace (`acar`) | 0 legacy `.md` workflows | `.agents/skills/` | Already Migrated (65+ skills active) |

No `.md` workflow files require conversion. All capabilities are already provided through `.agents/skills/`.

---

## 4. Proposed Changes

```
acar/
├── GEMINI.md                             # [NEW] Master project instructions for Gemini & Antigravity
├── AGENTS.md                             # [NEW] Root agent entrypoint pointing to GEMINI.md + GitNexus
├── PROJECT_MAP.md                        # [NEW] Root file map satisfying Rule 0
├── .gitignore                            # [MODIFY] Add scratch temp ignores
├── .agents/
│   ├── scratch/
│   │   ├── README.md                     # [NEW] Guidance for ad-hoc agent scripts
│   │   └── .gitkeep                      # [NEW] Directory placeholder
│   └── skills/
│       └── django-security copy/         # [DELETE] Redundant copy directory
```

---

### Component: Root AI Entrypoints

#### [NEW] `GEMINI.md`
Will contain:
- **Project Identity**: ACAR Vehicle Management System (multi-tenant German auto dealerships).
- **Stack & Architecture**: Django 5.2 + Django Ninja (backend, SQLite), React 19 + TypeScript + Vite 7 + TailwindCSS 4 (frontend).
- **Core Personas**: Manager (2FA email, full access, dense view, no scrolling, light mode), Employees (approval-based login, permission-controlled transactions).
- **Core Domain Concepts**: Vehicle pipeline (`Purchased → Ready for Sale → Reserved → Sold → Inactive`), Transactions (StarMoney CSV import, Decimal math, German tax rates), German Legal PDFs (6 types via ReportLab).
- **Mandatory Laws & Rules**:
  - Rule 0: Pre-work context reading order.
  - Multi-tenant data isolation (`business_id` scoping on every query).
  - Money math (never float, always `Decimal`).
  - Strict i18n (`t('key')` in React; German default, English, Turkish, Arabic RTL).
- **AI Workspace Topology**:
  - Rules: [`.agentrules`](./.agentrules)
  - Developer Guide: [`.agents/developer_guide.md`](./.agents/developer_guide.md)
  - Product & Personas: [`.agents/idea.md`](./.agents/idea.md)
  - Data Model: [`schema.prisma`](./schema.prisma) & [`backend/manager/models.py`](./backend/manager/models.py)
  - Codebase Map: [`PROJECT_MAP.md`](./PROJECT_MAP.md)
  - Skills Directory: [`.agents/skills/`](./.agents/skills/) (routing table included)
  - Scratch Workspace: [`.agents/scratch/`](./.agents/scratch/)
  - Reference Folders: [`reference_files_only/`](./reference_files_only/) & [`reference_ui/`](./reference_ui/) (read-only)
- **Code Intelligence Tools**:
  - CodeGraph: `.codegraph/` (use `codegraph_explore` first for code questions).
  - GitNexus: MCP impact analysis and query tools.

```markdown
# 🚗 ACAR — Gemini & Antigravity Agent Configuration

> This is the primary root configuration and context beacon for AI agents working on the ACAR repository.

## 📌 Project Identity
ACAR is a full-stack, multi-tenant vehicle management platform built for used-car dealerships operating in the German market.
- **Backend:** Python 3.12 · Django 5.2 · Django Ninja (REST API) · SQLite (`backend/db.sqlite3`)
- **Frontend:** React 19 · TypeScript · Vite 7 · TailwindCSS 4 · Radix UI / shadcn/ui · TanStack Query
- **Multi-Tenancy:** Strict tenant isolation — every database query and mutation MUST filter by `business_id` / `request.user.business`.
- **Domain Laws:** Financial calculations MUST use `Decimal`. UI strings MUST use `t()` translation keys (`de`, `en`, `tr`, `ar`). German legal PDFs are generated via ReportLab.
```

---

#### [NEW] `AGENTS.md`
Root agent file for Cursor, Claude Code, and other agent engines.

```markdown
<!-- gitnexus:start -->
# GitNexus & Agent Guidelines — ACAR

> For full architecture, domain conventions, and mandatory agent rules, see [GEMINI.md](./GEMINI.md).

This project is indexed by GitNexus as **acar** (4449 symbols, 7598 relationships, 118 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

## Primary Instructions
All agents must adhere to the rules and workspace topology specified in:
- [GEMINI.md](./GEMINI.md) — Master AI configuration, stack conventions, and resource map.
- [.agentrules](./.agentrules) — Mandatory agent laws and skill routing.
- [.agents/developer_guide.md](./.agents/developer_guide.md) — Technical implementation standards.
- [.agents/idea.md](./.agents/idea.md) — Product vision, personas, and workflows.

## GitNexus Rules
- **MUST run impact analysis before editing any symbol.**
- **MUST run `gitnexus_detect_changes()` before committing.**
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk.
<!-- gitnexus:end -->
```

---

#### [NEW] `PROJECT_MAP.md`
Copy from `.agents/artifacts/PROJECT_MAP.md` to root `PROJECT_MAP.md`.
Ensures Rule 0 compliance across all AI interactions.

---

### Component: AI Scratch & Workspace Organization

#### [NEW] `.agents/scratch/README.md` and `.gitkeep`
Defines rules for ad-hoc agent scripts:

```markdown
# Agent Scratch Directory (`.agents/scratch/`)

This directory is an isolated playground for AI agents to write and run temporary scripts during development tasks (e.g., verifying SQLite data, inspecting migration effects, testing CSV parsing, or debugging API responses).

## Guidelines for AI Agents:
1. **Never import scratch scripts in application code:** Nothing in `backend/` or `frontend/` may import files from this directory.
2. **Production scripts belong in `/scripts`:** Permanent tools (such as `scripts/backup.sh`) belong in the root `scripts/` folder.
3. **Clean up or document:** If a scratch script is useful for future troubleshooting, give it a descriptive name and docstring. Otherwise, clean up temporary data when done.
```

#### [MODIFY] `.gitignore`
Add entries for scratch temporary files:

```diff
+ # ----- Agent scratch temp files -----
+ .agents/scratch/*.tmp
+ .agents/scratch/*.log
+ .agents/scratch/__pycache__/
```

#### [DELETE] `.agents/skills/django-security copy`
Remove this accidental duplicate directory.

---

## 5. Verification Plan

### Automated Tests
1. Verify the project backend test runner functions properly:
   ```powershell
   ..\acar_venv\Scripts\python.exe manage.py test manager.tests.test_api
   ```
2. Verify frontend TypeScript compilation:
   ```powershell
   npm --prefix frontend run build
   ```

### Manual Verification
1. Verify `GEMINI.md` and `AGENTS.md` exist in root and all relative markdown links (`.agentrules`, `.agents/developer_guide.md`, `PROJECT_MAP.md`, etc.) resolve to valid existing files.
2. Verify `.agents/skills/django-security` remains intact and has valid content, while `django-security copy` is completely deleted.
3. Verify `.agents/scratch/` exists with its `README.md`.
4. Verify `git status` shows clean, organized files without unneeded tracking.
