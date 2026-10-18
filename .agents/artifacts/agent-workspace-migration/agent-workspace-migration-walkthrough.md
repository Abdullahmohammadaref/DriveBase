# Walkthrough: AI Agent Workspace & Root Entrypoint Architecture

We completed the migration audit, established root entrypoints for AI agents (`GEMINI.md` and `AGENTS.md`), organized repository assets, and set up an isolated `.agents/scratch/` playground.

---

## What Was Accomplished

### 1. Workflow Migration Discovery (`migrate-workflows`)
- Audited both the repository (`.agents/`, `.claude/`) and global configuration (`~/.gemini/config/`).
- Verified that **0 legacy `.agents/workflows/*.md` files exist** and that all workflows have already transitioned into **65+ modern skill packs** under `.agents/skills/`.
- Removed an accidental duplicate directory: [`.agents/skills/django-security copy/`](file:///d:/Files/code/cars%20project/antigravity_application/acar/.agents/skills/).

### 2. Root AI Agent Entrypoints
- **[`GEMINI.md`](file:///d:/Files/code/cars%20project/antigravity_application/acar/GEMINI.md)**: Created in the repository root as the master configuration beacon for Antigravity & Gemini agents. It outlines:
  - High-level domain context (German used-car dealership multi-tenant VMS).
  - Exact file locations for rules ([`.agentrules`](file:///d:/Files/code/cars%20project/antigravity_application/acar/.agentrules)), developer guide ([`.agents/developer_guide.md`](file:///d:/Files/code/cars%20project/antigravity_application/acar/.agents/developer_guide.md)), product idea ([`.agents/idea.md`](file:///d:/Files/code/cars%20project/antigravity_application/acar/.agents/idea.md)), data model ([`schema.prisma`](file:///d:/Files/code/cars%20project/antigravity_application/acar/schema.prisma)), and codebase map ([`PROJECT_MAP.md`](file:///d:/Files/code/cars%20project/antigravity_application/acar/PROJECT_MAP.md)).
  - Mandatory engineering laws (tenant isolation on every query, Decimal math, React i18n, ReportLab PDF stability).
  - Code intelligence routing (CodeGraph and GitNexus).
  - Skill routing table mapping tasks to relevant skill packs in [`.agents/skills/`](file:///d:/Files/code/cars%20project/antigravity_application/acar/.agents/skills/).
  - Agent scratchpad protocol.
- **[`AGENTS.md`](file:///d:/Files/code/cars%20project/antigravity_application/acar/AGENTS.md)**: Created in the repository root for external agents (Cursor, Claude Code, etc.), establishing `GEMINI.md` as the single source of truth while embedding GitNexus Code Intelligence rules.

### 3. File Map & Scratch Environment
- **[`PROJECT_MAP.md`](file:///d:/Files/code/cars%20project/antigravity_application/acar/PROJECT_MAP.md)**: Placed directly in the repository root (fulfilling Rule 0) and mirrored in the artifact archive.
- **[`.agents/scratch/`](file:///d:/Files/code/cars%20project/antigravity_application/acar/.agents/scratch/)**: Initialized with a [`README.md`](file:///d:/Files/code/cars%20project/antigravity_application/acar/.agents/scratch/README.md) and `.gitkeep`.
  - Gives agents an isolated playground for one-off inspection or test scripts.
  - Prevents scratch scripts from polluting root, `backend/`, or the production `scripts/` directory (e.g. `scripts/backup.sh`).
- **[`.gitignore`](file:///d:/Files/code/cars%20project/antigravity_application/acar/.gitignore)**: Updated to ignore temporary `.tmp`, `.log`, and `__pycache__` files generated in `.agents/scratch/`.
- **[`README.md`](file:///d:/Files/code/cars%20project/antigravity_application/acar/README.md)**: Updated the Agent & AI Configuration table to document `GEMINI.md` and `AGENTS.md`.

---

## Verification Results

### 1. Relative Link Integrity
Verified that every single relative link in `GEMINI.md` and `AGENTS.md` resolves to a real, valid path on disk:
- `.agentrules`: Valid
- `schema.prisma`: Valid
- `PROJECT_MAP.md`: Valid
- `.agents/developer_guide.md`: Valid
- `.agents/idea.md`: Valid
- `.agents/skills/`: Valid
- `.agents/scratch/`: Valid
- `.agents/artifacts/`: Valid
- `.agents/design-system/`: Valid
- `reference_files_only/`: Valid
- `reference_ui/`: Valid
- `docs/`: Valid

### 2. Backend Automated Tests
Ran the backend API test suite via `acar_venv`:
```powershell
..\acar_venv\Scripts\python.exe manage.py test manager.tests.test_api
```
**Result:** 47 tests ran and passed cleanly (`OK`).

### 3. Frontend TypeScript Compilation
Ran the frontend build:
```powershell
npm --prefix frontend run build
```
**Result:** TypeScript compiler (`tsc -b`) and Vite production build passed cleanly (`0 errors`).
