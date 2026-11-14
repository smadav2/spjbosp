#!/bin/sh
set -e

echo "SPJ BOSP — waiting for PostgreSQL..."
ready=0
i=0
while [ "$i" -lt 90 ]; do
  if node -e "const pg=require('pg');const c=new pg.Client({connectionString:process.env.DATABASE_URL});c.connect().then(()=>{c.end();process.exit(0)}).catch(()=>process.exit(1))" 2>/dev/null; then
    ready=1
    break
  fi
  i=$((i+1))
  sleep 2
done
if [ "$ready" -ne 1 ]; then
  echo "ERROR: could not reach the database. Check DATABASE_URL and the db service." >&2
  exit 1
fi

echo "SPJ BOSP — applying database schema (drizzle-kit push)..."
npx drizzle-kit push --config drizzle.docker.json

echo "SPJ BOSP — starting production server on port 3000..."
exec npm start
