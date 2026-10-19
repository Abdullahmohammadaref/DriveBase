# DriveBase Desktop Application — Migration Context & Conversation Summary

> **Context for Migration**: This document condenses the full discovery, architecture decisions, and code state from the conversation regarding building a dedicated Windows Desktop App for DriveBase alongside the existing Cloud Web App.

---

## 1. User Goals & Motivation

The user asked:
- **Primary Need**: Host both frontend and backend on the cloud, but also have a dedicated **Windows Desktop version** of the frontend for dealership managers.
- **Why Desktop?**:
  1. Professional desktop appearance matching traditional dealership workflows.
  2. Dealership network connections are slow. Storing the heavy client-side assets (React bundle, CSS, SVGs, icons) locally on the manager's Windows PC dramatically speeds up initial loads and navigation.
  3. The web version must remain 100% active and accessible anytime from any browser.
- **Non-Negotiables**:
  - Do NOT break or change the behavior of the existing cloud web app.
  - Both web and desktop must hit the same cloud Django backend.

---

## 2. The 4 Core Questions & Concrete Findings

### Q1: What will happen to cookies?
- **Current Setup**:
  - `frontend/src/lib/api.ts` uses `withCredentials: true`.
  - CSRF protection reads `document.cookie` looking for `csrftoken=` and sends the `X-CSRFToken` header.
  - Backend uses Django Session authentication (`sessionid`) and `@ensure_csrf_cookie` in `backend/drivebase/urls.py`.
- **Desktop Behavior**:
  - A packaged local desktop app runs on `http://tauri.localhost` (or `app://`).
  - Webviews (Edge WebView2) consider remote cloud backend cookies (`https://api.yourcloud.com`) as **third-party cookies** and block cross-origin reading via `document.cookie`.
- **Solution Identified**:
  1. **Dual CSRF delivery**: In `backend/drivebase/urls.py`, update `get_csrf_token()` to return `csrfToken` in the JSON body (`{"detail": "CSRF cookie set", "csrfToken": get_token(request)}`) as well as setting the cookie.
  2. **Frontend Fallback**: In `frontend/src/lib/api.ts`, if `document.cookie` is empty (desktop webview), fall back to the token returned in the response body.
  3. **Backend Whitelist**: Whitelist `http://tauri.localhost` and `https://tauri.localhost` in `backend/drivebase/settings.py` under `CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS`.
  4. **Tauri Native HTTP**: Using `@tauri-apps/plugin-http` routes calls through the OS/Rust network layer with zero third-party cookie blocking.

---

### Q2: How will managers get updates when pushing code to GitHub?
- **Current Concern**: The user had never set up desktop application distribution before.
- **Solution Identified**:
  - **Auto-Updater via GitHub Actions & GitHub Releases**:
    - Tauri v2 has an official plugin: `@tauri-apps/plugin-updater`.
    - When code is pushed with a version tag (e.g., `v1.0.1`), a GitHub Actions workflow builds the Windows `.exe` / `.msi` and publishes a GitHub Release with a signed `latest.json` manifest.
    - On startup, the desktop app checks the repository releases endpoint. If a newer version is found, it silently downloads in the background and prompts: *"Update ready. Click to restart."*
    - The manager never needs to manually download a new installer.

---

### Q3: How will multi-PDF generation work (avoiding browser popup blockers)?
- **Current Issue**:
  - Located in `frontend/src/components/vehicles/ContractModal.tsx` (lines 103–115):
    Generating contracts produces 3 PDFs (e.g. Sales Agreement, Identity Check, Receipt).
    Browsers enforce strict anti-popup rules: only the 1st tab opens; tabs 2 and 3 are blocked by Chrome/Edge unless the user manually enables popups for the site.
- **Desktop Solution**:
  - On Desktop, there are **no browser popup restrictions**.
  - Using Tauri's `@tauri-apps/plugin-shell` and `@tauri-apps/plugin-fs`:
    - The desktop app downloads all 3 PDF byte streams in parallel.
    - It calls `shell.open(filePath)` for each file.
    - Windows instantly launches all 3 documents directly in the manager's default PDF application (Adobe Acrobat, Edge, etc.) without any warning or popup blocker.

---

### Q4: Will other features work smoothly? What are the transition gotchas?
- **Framework Choice**: **Tauri v2** was selected over Electron:
  - Rust toolchain (`cargo 1.83.0` and `rustc 1.83.0`) is **already installed** on the system.
  - Installer is ~10–15 MB (Electron is 150+ MB).
  - RAM usage is ~35–50 MB (Electron is 300+ MB).
  - Uses Windows Edge WebView2 (preinstalled on all Windows 10/11 machines).
- **Key Transition Gotchas**:
  1. `baseURL: "/api"` in `frontend/src/lib/api.ts` is relative. For desktop builds, it must use `import.meta.env.VITE_API_BASE_URL` pointing to the cloud backend.
  2. Windows SmartScreen may show a blue banner on first install for unsigned `.exe` files. Managers click *"More info" -> "Run anyway"* once.

---

## 3. Environment & Workspace Status

- **Git Branch**: `ui`
- **Working Tree**: Completely clean (`git status` reports nothing to commit).
- **Python / Django**: Virtualenv at `acar_venv` (Python 3.12, Django 5.2).
- **Node / Vite**: Frontend in `frontend/` (React 19, TypeScript ~5.9, Vite 7.2, TailwindCSS v4).
- **Rust Toolchain**: `cargo 1.83.0`, `rustc 1.83.0` verified present.

---

## 4. Key Reference Files

| File | Purpose in Desktop Transition |
| :--- | :--- |
| [`.agents/plans/plan-desktop-app-tauri.md`](file:///d:/Files/code/cars%20project/antigravity_application/acar/.agents/plans/plan-desktop-app-tauri.md) | **Master implementation plan** with all 6 phases and tasks. |
| [`frontend/src/lib/api.ts`](file:///d:/Files/code/cars%20project/antigravity_application/acar/frontend/src/lib/api.ts) | Axios client needing dynamic `VITE_API_BASE_URL` and response-based CSRF fallback. |
| [`frontend/src/components/vehicles/ContractModal.tsx`](file:///d:/Files/code/cars%20project/antigravity_application/acar/frontend/src/components/vehicles/ContractModal.tsx) | PDF generation triggers (lines 95–130) to integrate native `shell.open`. |
| [`backend/drivebase/urls.py`](file:///d:/Files/code/cars%20project/antigravity_application/acar/backend/drivebase/urls.py) | `get_csrf_token()` view on line 38 to add `csrfToken` to JSON body. |
| [`backend/drivebase/settings.py`](file:///d:/Files/code/cars%20project/antigravity_application/acar/backend/drivebase/settings.py) | Whitelist `http://tauri.localhost` and `https://tauri.localhost` in CORS and CSRF origins. |

---

## 5. Next Steps for the Resuming Agent

To continue immediately without losing momentum:
1. Open [`.agents/plans/plan-desktop-app-tauri.md`](file:///d:/Files/code/cars%20project/antigravity_application/acar/.agents/plans/plan-desktop-app-tauri.md).
2. Begin with **Phase 1**:
   - Update `backend/drivebase/urls.py` to return `csrfToken` in `get_csrf_token`.
   - Update `backend/drivebase/settings.py` for Tauri CORS & CSRF origins.
   - Run `python manage.py check` to verify backend integrity.
   - Update `frontend/src/lib/api.ts` to support `VITE_API_BASE_URL`.
3. Proceed to **Phase 2** (Tauri v2 initialization in `frontend/`).
