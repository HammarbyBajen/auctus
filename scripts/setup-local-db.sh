#!/usr/bin/env bash
# Creates a local Postgres database and user for development and writes the
# connection details to .env.local. Prompts hide what you type. Run it from the repo root.
set -euo pipefail

PSQL="${PSQL:-/Library/PostgreSQL/18/bin/psql}"
ENV_FILE=".env.local"

if grep -q '^DATABASE_URL=' "$ENV_FILE" 2>/dev/null; then
  echo "DATABASE_URL already set in $ENV_FILE, nothing to do."
  exit 0
fi

read -rsp "Password of the local 'postgres' superuser: " PGPASSWORD; echo
export PGPASSWORD
read -rp "Owner email for the first login: " OWNER_EMAIL
read -rp "Owner name: " OWNER_NAME
read -rsp "Owner password (at least 10 characters): " OWNER_PASSWORD; echo

APP_PASSWORD="$(openssl rand -hex 16)"
SECRET="$(openssl rand -base64 32)"

"$PSQL" -h localhost -U postgres -v ON_ERROR_STOP=1 <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tegen_crm') THEN
    CREATE ROLE tegen_crm LOGIN PASSWORD '${APP_PASSWORD}';
  ELSE
    ALTER ROLE tegen_crm PASSWORD '${APP_PASSWORD}';
  END IF;
END \$\$;
SELECT 'CREATE DATABASE tegen_crm OWNER tegen_crm' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'tegen_crm')\gexec
SQL

touch "$ENV_FILE"
chmod 600 "$ENV_FILE"
{
  echo "DATABASE_URL=postgres://tegen_crm:${APP_PASSWORD}@localhost:5432/tegen_crm"
  echo "BETTER_AUTH_SECRET=${SECRET}"
  echo "BETTER_AUTH_URL=http://localhost:3000"
  echo "SEED_OWNER_EMAIL=${OWNER_EMAIL}"
  echo "SEED_OWNER_NAME=${OWNER_NAME}"
  echo "SEED_OWNER_PASSWORD=${OWNER_PASSWORD}"
} >> "$ENV_FILE"
echo "Done. Connection details were added to $ENV_FILE."
