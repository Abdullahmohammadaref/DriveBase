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
