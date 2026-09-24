---
name: dealership-data-restore
description: Disaster recovery and database restoration runbook for ACAR Dealership Operating System. Restores exported backup ZIP archives containing vehicles, transactions, legal entities, choices, and media assets safely with automated safety snapshots and foreign-key integrity.
---

# Dealership Data Restore & Disaster Recovery Runbook

This skill provides comprehensive instructions for executing full business data restoration from exported ACAR backup ZIP archives (`acar_backup_[business_name]_[date].zip`).

## 1. Overview & Safety Architecture

The ACAR restore system is designed with enterprise-grade safety protections:
- **Automatic Pre-Restore Safety Snapshot**: Before modifying or truncating any business data, the script automatically takes a timestamped copy of `db.sqlite3` (`db.sqlite3.pre_restore_YYYYMMDD_HHMMSS.bak`).
- **Atomic Database Transactions**: The entire restoration executes inside Django's `transaction.atomic()`. Any schema, foreign key, or file extraction failure triggers a 100% clean rollback.
- **Dry-Run Validation Mode**: Use `--dry-run` to validate backup ZIP archive integrity, inspect record counts, and simulate re-ingestion without committing changes to disk.
- **Media Asset Preservation**: Vehicle photos, business logos, and receipts are extracted from `media/` inside the ZIP and linked to Django's active media root.

---

## 2. CLI Tool Reference

The restore tool is located at:
```
backend/scripts/admin/restore_business_backup.py
```

### Command Syntax

```bash
# Windows PowerShell / CMD
..\acar_venv\Scripts\python.exe scripts/admin/restore_business_backup.py <path_to_zip> [--business-id <id>] [--dry-run]
```

### Arguments

| Flag | Required | Default | Description |
|---|---|---|---|
| `<path_to_zip>` | **Yes** | — | Absolute or relative path to the `.zip` backup archive |
| `--business-id` | No | `1` | Target business ID to restore data into |
| `--dry-run` | No | `False` | Validates archive integrity, parses all models without committing changes |

---

## 3. Step-by-Step Restoration Procedure

### Step 1: Pre-Flight Integrity Check (Dry-Run)

Always execute `--dry-run` first to verify that the archive contains all required components:

```bash
cd backend
..\acar_venv\Scripts\python.exe scripts/admin/restore_business_backup.py "C:\path\to\backup.zip" --business-id 1 --dry-run
```

**Expected Dry-Run Output:**
```
========================================================
  ACAR DEALERSHIP DISASTER RECOVERY RESTORE
  Target Business ID: 1
  Archive: C:\path\to\backup.zip
  Dry Run: True
========================================================

[INFO] Archive verified: Contains 17 required data tables and media files.
[INFO] Vehicles found: 92
[INFO] Transactions found: 568
[INFO] Legal Entities found: 24
[INFO] Choices found: 142
[DRY RUN] Validation successful! Zero errors detected.
```

### Step 2: Execute Live Production Restoration

When dry-run succeeds, run without `--dry-run`:

```bash
cd backend
..\acar_venv\Scripts\python.exe scripts/admin/restore_business_backup.py "C:\path\to\backup.zip" --business-id 1
```

The script will:
1. Create `backend/db.sqlite3.pre_restore_[timestamp].bak`.
2. Clear and rebuild Business 1 choices, legal entities, vehicles, and transactions.
3. Unpack photos and logos into `backend/media/business_1/`.
4. Output: `[SUCCESS] RESTORE COMPLETED SUCCESSFULLY`.

### Step 3: Verification & Sanity Check

Run Django shell to verify vehicle and transaction counts:

```bash
..\acar_venv\Scripts\python.exe -c "import django, os; os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'acar.settings'); django.setup(); from manager.models import Vehicle, Transaction; print('Vehicles:', Vehicle.objects.filter(business_id=1).count()); print('Transactions:', Transaction.objects.filter(business_id=1).count())"
```

---

## 4. Emergency Rollback

If a restore must be undone:
1. Stop Django dev server (`Ctrl+C`).
2. Identify the generated `.bak` file in `backend/` (e.g., `db.sqlite3.pre_restore_20260924_163000.bak`).
3. Overwrite `backend/db.sqlite3`:
   ```powershell
   Copy-Item "backend/db.sqlite3.pre_restore_20260924_163000.bak" -Destination "backend/db.sqlite3" -Force
   ```
4. Restart Django dev server:
   ```powershell
   py manage.py runserver
   ```
