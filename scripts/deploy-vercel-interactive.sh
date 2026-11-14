#!/usr/bin/env bash
#
# Deploy SPJ BOSP ke Vercel TANPA token (login lewat tombol di browser).
# Jalankan di folder proyek (setelah npm install bila perlu).
#
# CARA PAKAI:
#   export DATABASE_URL="postgres://USER:PASS@HOST.pooler.neon.tech/DB?sslmode=require"
#   bash scripts/deploy-vercel-interactive.sh
#
# (Windows PowerShell: $env:DATABASE_URL="..." lalu bash scripts/deploy-vercel-interactive.sh)
#
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL dulu (connection string Neon/Postgres Anda).}"
export DATABASE_URL

if [ ! -d node_modules ]; then
  echo "==> Menyiapkan dependensi (npm ci)..."
  npm ci
fi

echo
echo "==> Login ke Vercel (tombol akan terbuka di browser; klik Login)..."
npx --yes vercel login

echo
echo "==> Deploy pertama (membuat project Vercel)..."
npx --yes vercel --prod --yes

echo
echo "==> Menyimpan DATABASE_URL ke project Vercel..."
echo "$DATABASE_URL" | npx --yes vercel env add DATABASE_URL production --force

echo
echo "==> Membuat tabel di database (drizzle-kit push)..."
npx --yes drizzle-kit push

echo
echo "==> Deploy ulang agar DATABASE_URL aktif..."
npx --yes vercel --prod --yes

echo
echo "Selesai! Buka URL produksi yang tercetak di atas."
echo "Kunjungan pertama: buat akun administrator lewat menu Administrator."
