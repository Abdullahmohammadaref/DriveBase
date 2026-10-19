# docs-deployment.md — Deployment Infrastructure

> **Date:** 2026-05-18
> **Implements:** `plan-deployment.md`

---

## Summary

Created all deployment infrastructure files to make DriveBase production-ready for Oracle Cloud Always Free ARM instance with GitHub Actions CI/CD.

---

## Files Created

| # | File | Purpose |
|---|------|---------|
| 1 | `Dockerfile` | Python 3.11-slim container with system deps for Pillow/ReportLab/Pandas, Gunicorn WSGI server |
| 2 | `docker-compose.yml` | Orchestrates Django + Nginx services with volume mounts for DB, media, locale, SSL certs |
| 3 | `nginx/nginx.conf` | HTTPS redirect, Let's Encrypt ACME, API proxy, static/media serving, React SPA fallback |
| 4 | `backend/drivebase/settings_prod.py` | Production settings overlay — DEBUG=False, WhiteNoise, secure cookies, env-based config |
| 5 | `backend/requirements.txt` | Added `whitenoise==6.8.2` and `gunicorn==23.0.0` |
| 6 | `.github/workflows/deploy.yml` | GitHub Actions CI/CD — SSH deploy on push to `main` |
| 7 | `scripts/backup.sh` | Daily cron backup script — SQLite hot backup + media tarball, 7-day rotation |
| 8 | `backend/.env.production.template` | Template showing required env vars (committed to git, real file is gitignored) |
| 9 | `.gitignore` | Added entries for `.env.production`, `certbot/`, `backups/`, `scripts/*.log` |

---

## Files NOT Modified (per plan)

- `backend/drivebase/settings.py` — untouched (development settings stay as-is)
- `backend/drivebase/urls.py` — untouched
- `frontend/vite.config.ts` — untouched (build output path already correct)

---

## Architecture Overview

```
Internet → Nginx (port 80/443)
              ├── /api/, /admin/, /rosetta/ → Django (Gunicorn, port 8000)
              ├── /media/ → Direct file serving from volume
              ├── /static/ → WhiteNoise-compressed Django static
              └── /* → React SPA (index.html fallback)
```

### Deploy Flow (on `git push main`)

```
GitHub Actions → SSH into Oracle Cloud
  → git pull (public repo)
  → git pull (private repo: PDFs, templates, .env)
  → npm ci && npm run build (React → backend/static/dist/)
  → docker compose build django
  → docker compose up -d --no-deps django
  → docker exec: migrate + collectstatic
```

### Backup Flow (daily cron at 3 AM)

```
SQLite .backup → /home/ubuntu/backups/db_YYYY-MM-DD.sqlite3
Media tar.gz   → /home/ubuntu/backups/media_YYYY-MM-DD.tar.gz
Rotation       → 7 days retained
```

---

## Design Decisions

1. **WhiteNoise over Nginx for static**: WhiteNoise is simpler for collectstatic output and handles compression/caching headers. Nginx still serves media files directly for performance (large vehicle images).

2. **React build on server, not in Docker**: The deploy script builds React on the server (where Node.js is available) and copies output into the backend's `static/dist/`. The Docker container only needs Python. This keeps the Docker image small.

3. **SQLite hot backup**: Uses SQLite's built-in `.backup` command which is safe on a running database — no need to stop the container.

4. **Two repos**: Public repo has all code. Private repo has PDF generators, email templates, and `.env.production`. Deploy script copies private files into the public repo's directory on the server.

---

## Server Setup Prerequisites (manual, one-time)

Before the first deploy, the server needs:

1. Docker + Docker Compose installed
2. Node.js + npm installed (for React builds)
3. Git configured with SSH keys for both repos
4. `.env.production` created from template
5. Let's Encrypt certificates generated via certbot
6. Crontab entry for `scripts/backup.sh`
7. GitHub repo secrets configured: `SERVER_HOST`, `SERVER_USER`, `SERVER_SSH_KEY`

---

## Known Limitations

- `DOMAIN_PLACEHOLDER` in `nginx/nginx.conf` must be replaced with the actual domain after SSL setup
- No zero-downtime deploy (container restarts during rebuild) — acceptable for single-user business app
- No container health recovery beyond Docker's `restart: unless-stopped`
