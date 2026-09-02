#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: SUPABASE_DATABASE_URL=... $0 /path/to/backup.dump" >&2
  exit 2
fi

: "${SUPABASE_DATABASE_URL:?Set SUPABASE_DATABASE_URL to the Supabase direct or session-pooler URL}"

backup_path=$1
if [ ! -f "$backup_path" ]; then
  echo "Backup not found: $backup_path" >&2
  exit 2
fi

backup_dir=$(cd "$(dirname "$backup_path")" && pwd)
backup_file=$(basename "$backup_path")
postgres_url=$(printf '%s' "$SUPABASE_DATABASE_URL" | sed 's#^postgresql+psycopg2:#postgresql:#')

docker run --rm \
  -e PGRESTORE_URL="$postgres_url" \
  -e BACKUP_FILE="$backup_file" \
  -v "$backup_dir:/backup:ro" \
  postgres:15 \
  sh -c 'pg_restore --no-owner --no-privileges --clean --if-exists --schema=public --dbname="$PGRESTORE_URL" "/backup/$BACKUP_FILE"'

echo "Supabase restore completed"
