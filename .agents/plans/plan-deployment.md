# plan-deployment.md — Make DriveBase Production-Ready

> **Date:** 2026-05-17
> **Agent target:** Antigravity / Claude Code
> **What this does:** Creates all deployment infrastructure files so the project can be deployed to Oracle Cloud with automatic CI/CD on every git push to `main`.
> **Pre-read (mandatory):** `idea.md`, `developer-guide.md`, `SKILL.md`

---

## Context

- Stack: Django 5 + SQLite + React/Vite SPA
- Hosting target: Oracle Cloud Always Free ARM instance
- CI/CD: GitHub Actions — auto-deploys on push to `main`
- The React build outputs to `backend/static/dist/` (already configured in `vite.config.ts`)
- Django serves the React SPA via Nginx, API via Gunicorn
- Two repos: public (this one) + private (pdf_generators, templates, .env)

---

## What the Agent Must Create

The agent creates **only files**. No code execution. No server setup. Just file creation.

---

## File 1: `Dockerfile`

**Path:** `Dockerfile` (project root, next to `backend/` and `frontend/`)

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# System dependencies for Pillow, ReportLab, Pandas
RUN apt-get update && apt-get install -y \
    gcc \
    libffi-dev \
    libssl-dev \
    libjpeg-dev \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn whitenoise

# Copy entire backend
COPY backend/ /app/

# Collect static files (React build will be in /app/static/dist from CI)
RUN python manage.py collectstatic --noinput --settings=drivebase.settings_prod || true

EXPOSE 8000

CMD ["gunicorn", "drivebase.wsgi:application", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "2", \
     "--timeout", "120", \
     "--access-logfile", "-"]
```

---

## File 2: `docker-compose.yml`

**Path:** `docker-compose.yml` (project root)

```yaml
services:
  django:
    build: .
    restart: unless-stopped
    env_file: backend/.env.production
    volumes:
      - ./backend/db.sqlite3:/app/db.sqlite3
      - ./backend/media:/app/media
      - ./backend/locale:/app/locale
    expose:
      - "8000"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/auth/csrf"]
      interval: 30s
      timeout: 10s
      retries: 3

  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ./backend/media:/app/media:ro
      - ./backend/staticfiles:/app/staticfiles:ro
      - ./certbot/conf:/etc/letsencrypt:ro
      - ./certbot/www:/var/www/certbot:ro
    depends_on:
      - django
```

---

## File 3: `nginx/nginx.conf`

**Path:** `nginx/nginx.conf`

```nginx
server {
    listen 80;
    server_name _;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name _;

    ssl_certificate /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    client_max_body_size 25M;

    # Django API + admin + rosetta
    location ~ ^/(api|admin|rosetta|i18n)/ {
        proxy_pass http://django:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    # Media files (vehicle images, logos) — served directly by Nginx
    location /media/ {
        alias /app/media/;
        expires 7d;
        add_header Cache-Control "public";
    }

    # Django collected static (admin CSS, rosetta, etc.)
    location /static/ {
        alias /app/staticfiles/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # React SPA — everything else
    location / {
        root /app/staticfiles/dist;
        try_files $uri $uri/ /index.html;
        expires -1;
        add_header Cache-Control "no-store";
    }
}
```

---

## File 4: `backend/drivebase/settings_prod.py`

**Path:** `backend/drivebase/settings_prod.py`

This is the production settings file. It imports everything from `settings.py` and overrides what needs to change for production.

```python
"""
Production settings for DriveBase.
Loaded by Gunicorn via: --settings=drivebase.settings_prod
Or set DJANGO_SETTINGS_MODULE=drivebase.settings_prod in .env.production
"""
from .settings import *  # noqa: F401, F403
import os

# --- Security ---
DEBUG = False

SECRET_KEY = os.environ['SECRET_KEY']  # Must be set — fail loudly if missing

ALLOWED_HOSTS = os.getenv('ALLOWED_HOSTS', '').split(',')

CSRF_TRUSTED_ORIGINS = os.getenv('CSRF_TRUSTED_ORIGINS', '').split(',')
CSRF_TRUSTED_ORIGINS = [x.strip() for x in CSRF_TRUSTED_ORIGINS if x.strip()]

CSRF_COOKIE_SECURE = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SAMESITE = 'Lax'
SESSION_COOKIE_SAMESITE = 'Lax'

# --- WhiteNoise for static files ---
MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',  # right after SecurityMiddleware
] + [m for m in MIDDLEWARE if m not in (  # noqa: F405
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
)]

STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

# --- CORS — restrict to your domain in production ---
CORS_ALLOWED_ORIGINS = os.getenv('CORS_ALLOWED_ORIGINS', '').split(',')
CORS_ALLOWED_ORIGINS = [x.strip() for x in CORS_ALLOWED_ORIGINS if x.strip()]
CORS_ALLOW_CREDENTIALS = True

# --- Logging ---
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'WARNING',
    },
}

# --- Remove debug-only apps ---
INSTALLED_APPS = [app for app in INSTALLED_APPS if app != 'django_browser_reload']  # noqa: F405
```

---

## File 5: `backend/requirements.txt` — Add `whitenoise`

**Path:** `backend/requirements.txt`

Add this line at the end of the existing `requirements.txt`:

```
whitenoise==6.8.2
gunicorn==23.0.0
```

Do not remove any existing lines. Just append these two.

---

## File 6: `.github/workflows/deploy.yml`

**Path:** `.github/workflows/deploy.yml`

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
            cd /home/ubuntu/drivebase

            echo "=== Pulling latest code ==="
            git pull origin main

            echo "=== Pulling private files ==="
            cd /home/ubuntu/drivebase-private
            git pull origin main
            cp -r backend/manager/pdf_generators/*.py /home/ubuntu/drivebase/backend/manager/pdf_generators/ 2>/dev/null || true
            cp -r backend/manager/templates/ /home/ubuntu/drivebase/backend/manager/ 2>/dev/null || true
            cd /home/ubuntu/drivebase

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

## File 7: `scripts/backup.sh`

**Path:** `scripts/backup.sh`

```bash
#!/bin/bash
# DriveBase Daily Backup
# Cron: 0 3 * * * /home/ubuntu/drivebase/scripts/backup.sh >> /home/ubuntu/backups/backup.log 2>&1

set -e

BACKUP_DIR="/home/ubuntu/backups"
DATE=$(date +%Y-%m-%d_%H-%M)
DB_PATH="/home/ubuntu/drivebase/backend/db.sqlite3"
MEDIA_PATH="/home/ubuntu/drivebase/backend/media"

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

## File 8: `.env.production.template`

**Path:** `backend/.env.production.template`

This is a **template only** — committed to git so you know what variables to set. The real `.env.production` is created manually on the server and never committed.

```env
# Copy this to .env.production on the server and fill in real values
# Never commit .env.production to git

SECRET_KEY=generate-with-python-secrets-token-hex-50

DEBUG=False

# Your server's public IP or domain, comma-separated
ALLOWED_HOSTS=your-domain.com,123.45.67.89

# Full URL with https
CSRF_TRUSTED_ORIGINS=https://your-domain.com

# Same as CSRF_TRUSTED_ORIGINS
CORS_ALLOWED_ORIGINS=https://your-domain.com

# Email settings (Gmail app password)
EMAIL_FROM=your-email@gmail.com
EMAIL_HOST_USER=your-email@gmail.com
EMAIL_HOST_PASSWORD=your-16-char-app-password

# Tell Django to use production settings
DJANGO_SETTINGS_MODULE=drivebase.settings_prod
```

---

## File 9: Update `.gitignore` (root)

**Path:** `.gitignore`

Add these lines at the end of the existing root `.gitignore`. Do not remove existing entries:

```gitignore
# Production env template is committed, actual .env.production is not
backend/.env.production

# Docker volumes
certbot/

# Server backups (never in git)
backups/

# deploy script output
scripts/*.log
```

---

## After Creating All Files — What the Agent Should NOT Do

- Do NOT run any commands
- Do NOT try to connect to any server
- Do NOT modify `settings.py` (the original) — only `settings_prod.py` is new
- Do NOT touch `backend/drivebase/urls.py`
- Do NOT touch `vite.config.ts` — build output path is already correct (`../backend/static/dist`)

---

## Verify Checklist (Agent Self-Check)

After creating all files, confirm:

- [ ] `Dockerfile` exists at project root
- [ ] `docker-compose.yml` exists at project root
- [ ] `nginx/nginx.conf` exists
- [ ] `backend/drivebase/settings_prod.py` exists
- [ ] `backend/requirements.txt` has `whitenoise` and `gunicorn` added
- [ ] `.github/workflows/deploy.yml` exists
- [ ] `scripts/backup.sh` exists
- [ ] `backend/.env.production.template` exists
- [ ] `.gitignore` updated
