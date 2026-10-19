# plan-deployment-changes.md — Oracle Linux Adjustments

> **Date:** 2026-05-18
> **Agent target:** Antigravity / Claude Code
> **What this does:** Updates the files created by `plan-deployment.md` to work with Oracle Linux instead of Ubuntu. The server user is `opc`, not `ubuntu`. That is the only real difference.
> **Pre-read:** `plan-deployment.md` (read it first to understand what files already exist)

---

## Context

The server is running **Oracle Linux 9**, not Ubuntu. This changes nothing about:
- The `Dockerfile` (runs Ubuntu internally — Docker doesn't care about host OS)
- `nginx/nginx.conf` (Nginx config is OS-agnostic)
- `backend/drivebase/settings_prod.py` (pure Python — OS-agnostic)
- `backend/requirements.txt` (Python packages — OS-agnostic)
- `docker-compose.yml` (Docker — OS-agnostic)

The **only two files** that reference the server's file system paths need updating:
1. `.github/workflows/deploy.yml` — has `/home/ubuntu/` paths hardcoded
2. `scripts/backup.sh` — has `/home/ubuntu/` paths hardcoded

---

## Change 1: `.github/workflows/deploy.yml`

**Path:** `.github/workflows/deploy.yml`

Replace the entire file content with this. The only changes are `/home/ubuntu/` → `/home/opc/` throughout:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SERVER_SSH_KEY }}
          script: |
            set -e
            cd /home/opc/drivebase

            echo "=== Pulling latest code ==="
            git pull origin main

            echo "=== Pulling private files ==="
            cd /home/opc/drivebase-private
            git pull origin main
            cp -r backend/manager/pdf_generators/*.py /home/opc/drivebase/backend/manager/pdf_generators/ 2>/dev/null || true
            cp -r backend/manager/templates/ /home/opc/drivebase/backend/manager/ 2>/dev/null || true
            cd /home/opc/drivebase

            echo "=== Building React frontend ==="
            cd frontend
            npm ci --prefer-offline
            npm run build
            cd ..

            echo "=== Rebuilding Django container ==="
            docker compose build django

            echo "=== Restarting ==="
            docker compose up -d --no-deps django
            sleep 5

            echo "=== Running migrations ==="
            docker compose exec -T django python manage.py migrate --noinput --settings=drivebase.settings_prod

            echo "=== Collecting static ==="
            docker compose exec -T django python manage.py collectstatic --noinput --settings=drivebase.settings_prod

            echo "=== Deploy complete ==="
```

---

## Change 2: `scripts/backup.sh`

**Path:** `scripts/backup.sh`

Replace the entire file content with this. The only changes are `/home/ubuntu/` → `/home/opc/` throughout:

```bash
#!/bin/bash
# DriveBase Daily Backup
# Cron: 0 3 * * * /home/opc/drivebase/scripts/backup.sh >> /home/opc/backups/backup.log 2>&1

set -e

BACKUP_DIR="/home/opc/backups"
DATE=$(date +%Y-%m-%d_%H-%M)
DB_PATH="/home/opc/drivebase/backend/db.sqlite3"
MEDIA_PATH="/home/opc/drivebase/backend/media"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup..."

# SQLite hot backup (safe on live database)
sqlite3 "$DB_PATH" ".backup $BACKUP_DIR/db_$DATE.sqlite3"
echo "[$(date)] DB backed up"

# Media folder
tar -czf "$BACKUP_DIR/media_$DATE.tar.gz" -C "$(dirname $MEDIA_PATH)" "$(basename $MEDIA_PATH)"
echo "[$(date)] Media backed up"

# Keep 7 days locally
find "$BACKUP_DIR" -name "db_*.sqlite3" -mtime +7 -delete
find "$BACKUP_DIR" -name "media_*.tar.gz" -mtime +7 -delete

echo "[$(date)] Done. Backup size: $(du -sh $BACKUP_DIR | cut -f1)"
```

---

## Verify Checklist (Agent Self-Check)

After making changes, search the entire project for any remaining `/home/ubuntu/` references:

```
grep -r "/home/ubuntu" .github/ scripts/
```

This must return **zero results**. If any remain, fix them to `/home/opc/`.

Everything else from `plan-deployment.md` stays exactly as-is.
