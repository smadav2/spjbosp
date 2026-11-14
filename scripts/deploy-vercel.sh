#!/usr/bin/env bash
#
# Deploy "APLIKASI ADMINISTRASI & CETAK SPJ BOSP SEKOLAH" ke Vercel (produksi)
# dengan database Postgres terkelola (Neon).
#
# PERSIAPAN (JANGAN pernah commit/menempelkan nilai ini ke repo):
#   1) VERCEL_TOKEN  -> Vercel dashboard : Akun -> Tokens -> New Token
#   2) DATABASE_URL  -> connection string Postgres Anda (Neon, pakai endpoint "pooled")
#
# CARA PAKAI:
#   export VERCEL_TOKEN="vcp_xxxxxx"
#   export DATABASE_URL="postgres://USER:PASS@HOST.pooler.neon.tech/DB?sslmode=require"
#   bash scripts/deploy-vercel.sh
#
# Script ini akan: membuat tabel di DB -> membuat/deplo project Vercel ->
# menyimpan DATABASE_URL -> deploy ulang agar env tertanam -> tampilkan URL.
#
set -euo pipefail

: "${VERCEL_TOKEN:?Set VERCEL_TOKEN dulu (Vercel access token).}"
: "${DATABASE_URL:?Set DATABASE_URL dulu (connection string Postgres/Neon).}"

export VERCEL_TOKEN
export DATABASE_URL

echo "==> [1/4] Membuat skema database (drizzle-kit push)..."
npx --yes drizzle-kit push

echo "==> [2/4] Membuat project & deploy pertama ke Vercel (produksi)..."
# --yes menerima pilihan default (project baru bernama sesuai folder saat pertama).
npx --yes vercel --prod --yes --token "$VERCEL_TOKEN"

echo "==> [3/4] Menyimpan DATABASE_URL di project Vercel..."
# --force menimpa bila sudah ada.
echo "$DATABASE_URL" | npx --yes vercel env add DATABASE_URL production --force

echo "==> [4/4] Deploy ulang agar DATABASE_URL tertanam ke aplikasi..."
npx --yes vercel --prod --yes --token "$VERCEL_TOKEN"

echo
echo "Selesai. Buka URL produksi yang tercetak di atas."
echo "Kunjungan pertama: buat akun administrator lewat menu Administrator."
