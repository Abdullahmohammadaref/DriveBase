---
name: Prevent Unexpected Error (Login/Backend Crash)
description: >
  Use this skill BEFORE adding any new backend API file, router, or modifying urls.py.
  Prevents the recurring crash where a bad import in a new API module kills the entire
  Django URL resolver, making ALL endpoints (including /api/auth/login/) return 500.
  The frontend shows "An unexpected error occurred" on the login page.
---

# Skill: Prevent Unexpected Error (Backend Crash)

## When This Applies

- Creating a **new Django Ninja router** (e.g., `dashboard_api.py`, `reports_api.py`)
- Adding a **new import** to `backend/drivebase/urls.py`
- Modifying any file imported transitively by `urls.py`

## Why This Matters

Django's URL resolver is loaded at startup. If **any** import in `urls.py` fails,
the entire application crashes — no endpoint works, including login. The frontend
catches this as a generic 500 error and shows "An unexpected error occurred".

This has happened multiple times in this project. The pattern is always:
1. New API file created with a wrong import
2. Import registered in `urls.py`
3. Server crashes silently (or shows traceback in terminal)
4. User sees "unexpected error" on login page and reports it as a bug

## Mandatory Checklist

### Before Creating a New API Router File

1. **Check existing routers for the correct auth import pattern:**
   ```bash
   grep "Router(auth=" backend/manager/*_api.py
   ```
   The correct pattern is:
   ```python
   from ninja.security import django_auth
   router = Router(auth=django_auth, tags=["YourTag"])
   ```
   
   ❌ **NEVER** use `from manager.auth_api import session_auth` — it doesn't exist.

2. **Check existing routers for import patterns** before guessing:
   ```bash
   grep "^from\|^import" backend/manager/vehicle_api.py
   ```
   Copy the import block from an existing working router file.

3. **Match the existing `urls.py` registration pattern:**
   ```python
   # In backend/drivebase/urls.py
   from manager.your_new_api import your_router
   api.add_router("/your-prefix", your_router)
   ```

### After Creating the File

4. **Run `python manage.py check`** immediately:
   ```bash
   & "D:\Files\code\cars project\antigravity_application\acar\acar_venv\Scripts\python.exe" manage.py check
   ```
   If this fails, the server WILL crash. Fix it before proceeding.

5. **Test that login still works:**
   ```bash
   curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/auth/csrf
   ```
   Should return `200`. Any other code means the server is broken.

### If the Server Is Already Crashed

6. **Check the traceback** — it will always point to the bad import:
   ```
   File ".../backend/drivebase/urls.py", line XX, in <module>
       from manager.broken_file import broken_thing
   ImportError: cannot import name 'broken_thing' from 'manager.broken_file'
   ```

7. **Fix the import**, then restart the server. Django's auto-reloader should pick it up,
   but if it was a startup crash, the user may need to manually restart `py manage.py runserver`.

## Common Wrong Imports (History)

| Wrong Import | Correct Import | Why It Fails |
|---|---|---|
| `from manager.auth_api import session_auth` | `from ninja.security import django_auth` | `session_auth` was never defined in `auth_api.py` |

## Template: New API Router File

```python
"""
YourFeature API — description
"""
from ninja import Router, Schema
from ninja.security import django_auth  # ← ALWAYS this import
from typing import Optional

router = Router(auth=django_auth, tags=["YourFeature"])

# ... your endpoints ...
```

## Key Rule

> **Always verify imports exist before using them.**
> Run `grep "def session_auth\|session_auth =" backend/manager/auth_api.py`
> before importing something. If grep returns nothing, the import WILL fail.
