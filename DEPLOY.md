# Cara Mengambil Link Online yang Bisa Dibuka

> **Pembaruan: tabel database kini dibuat otomatis.** Saat aplikasi pertama kali dibuka, seluruh tabel dibuat sendiri di database (aman diulang). Jadi Build Command khusus **tidak wajib** lagi — cukup isi `DATABASE_URL`, biarkan Build Command default, lalu Deploy. Jika Anda sudah memakai `npx drizzle-kit push && next build`, itu tetap boleh.

Aplikasi ini **sudah berjalan** dan lolos seluruh pengujian (build, TypeScript, healthcheck, serta pengujian fitur). Link `*.e2b.app` yang muncul di tool ini hanya berupa **pratinjau sandbox** yang dikunci oleh lapisan keamanan platform (*traffic access token*). Token itu tidak bisa dikirim browser biasa, jadi URL mentahnya tidak bisa dibuka langsung di tab baru — **bukan** masalah pada kode aplikasi.

Ada dua cara untuk mencobanya:

## 1) Pratinjau bawaan platform (paling cepat)

Buka aplikasi melalui **panel preview bawaan tool** yang sedang Anda gunakan (bukan dengan menyalin URL mentah ke tab baru). Panel tersebut memproxy lalu lintas dan menyisipkan token secara otomatis, sehingga pratinjau bisa terbuka langsung.

> Pratinjau sandbox bersifat sementara dan datanya akan hilang saat sandbox di-reset.

## 2) Deploy ke hosting nyata (link permanen + bisa dibagikan)

Kode ini adalah **Next.js (App Router) + PostgreSQL**. Tidak ada dependensi eksternal selain database, dan seluruh file bukti (JPG/PNG/PDF) disimpan di dalam PostgreSQL. Jadi cukup satu server dengan Docker, atau PaaS mana pun yang menyediakan Postgres.

### A. Docker Compose di server/VPS (paling sederhana, URL bersih)

Prasyarat: Linux dengan **Docker + Docker Compose**.

```bash
# clone / salin seluruh proyek ke server, lalu:
docker compose up -d --build
```

- Aplikasi tersedia di **http://IP-ERVER:3000**.
- Postgres berjalan sebagai service `db` dan datanya persisten di volume `dbdata`.
- Skema database diterapkan otomatis saat server start (`drizzle-kit push` di `docker-entrypoint.sh`).

Untuk domain + HTTPS, letakkan reverse proxy (mis. Caddy atau Nginx + Let's Encrypt) di depan port 3000. Contoh Caddyfile:

```
https://spj. DOMAIN Anda {
  reverse_proxy localhost:3000
}
```

Gunakan password Postgres yang kuat di `docker-compose.yml` (ganti `spj:spj`) untuk produksi.

### B. Railway / Fly.io (terkelola, dapat domain siap pakai)

1. Push repo ke GitHub.
2. Di Railway/Fly, buat project dari repo tersebut.
3. Tambahkan/addon **PostgreSQL**.
4. Set env `DATABASE_URL` ke string koneksi Postgres yang diberikan.
5. Build command: `npm run build`. Start command:
   `npx drizzle-kit push --config <config yang sesuai DATABASE_URL> && npm start`
   (buat salinan `drizzle.docker.json` dan ubah `url` ke nilai `DATABASE_URL` Anda), atau jalankan `drizzle-kit push` sekali secara manual lewat shell.
6. Deploy → Anda mendapat URL publik langsung (mis. `https://nama-app.up.railway.app`).

### C. Vercel (`vercel.app`) — langkah detail

Vercel **tidak menyediakan PostgreSQL**, jadi Anda perlu satu Postgres terkelola. **Neon** paling cocok (serverless, gratis, dan dirancang untuk Vercel).

**1) Buat database (Neon)**
- Buka [neon.tech](https://neon.tech) → buat akun → **Create project** → pilih region.
- Salin **connection string** Postgres. Untuk Vercel, gunakan **pooled endpoint** (Neon menampilkan "Pooled connection" / host berakhiran `.pooler`), karena Vercel serverless membuka banyak koneksi singkat.

**2) Siapkan repo**
- Push seluruh proyek ini ke GitHub/GitLab/Bitbucket.
- Pastikan `package-lock.json` ikut ter-commit (Vercel akan menjalankan `npm ci`).
- Jangan commit kredensial; `DATABASE_URL` diisi lewat Vercel.

**3) Import ke Vercel**
- di [vercel.com](https://vercel.com) → **Add New… → Project** → pilih repo.
- **Framework Preset**: `Next.js` (otomatis terdeteksi).
- Pada tab **Environment Variables**, tambahkan:
  - Nama: `DATABASE_URL`
  - Nilai: connection string Neon Anda (berlaku untuk *Production* dan *Preview*).
- **Build Command**: ganti menjadi
  `npx drizzle-kit push && next build`
  (menjalankan `drizzle-kit push` membuat semua tabel di Neon pada saat deploy; aman diulang/idempoten).
- **Output Directory** dan **Install Command** biarkan default.

> Konfigurasi `drizzle.config.ts` sudah membaca `process.env.DATABASE_URL`, jadi `drizzle-kit push` di build Vercel otomatis menyambung ke Neon.

**4) Deploy**
- Klik **Deploy**. Selesai — Anda mendapat link publik, misalnya `https://nama-aplikasi.vercel.app`.
- Buka link tersebut → klik menu **Administrator** → **buat akun administrator** pertama (tidak ada kredensial bawaan).

**5) Deploy berikutnya**
- Setiap `git push` ke branch produksi akan otomatis redeploy. Build command yang sama akan dijalankan kembali (idempoten, tidak menghapus data).

**Hal yang perlu diperhatikan di Vercel**
- **Build di Vercel (git), bukan build lokal di OS lain.** Aplikasi memakai `sharp` (native). Jika Anda mengunggah build yang dibuat di Windows/Mac, biner native bisa tidak cocok. Deploy via git membuat Vercel meng-build di Linux → `sharp` terpasang sesuai.
- **Timeout function**: di plan **Hobby**, durasi function default 10 detik. Untuk ekspor paket SPJ besar (banyak lampiran/halaman), jika kena timeout, naikkan ke plan **Pro** (mendukung `maxDuration` lebih panjang). Untuk pemakaian normal (transaksi + beberapa lampiran), 10 detik sudah cukup.
- **HTTPS** aktif otomatis di Vercel, jadi cookie sesi (Secure) bekerja normal.
- **Backup**: Neon punya point-in-time backup; tetap juga unduh backup berkala lewat menu **Backup & Restore** di aplikasi.
- **Jangan** mengarahkan `DATABASE_URL` ke Postgres lokal/`127.0.0.1` — Vercel hanya bisa mengakses database terkelola publik/privat yang valid.

### D. Ringkasan cepat (copy-paste)

```
ENV (Vercel):
  DATABASE_URL=postgres://USER:PASS@HOST.pooler.neon.tech/DB?sslmode=require

Build Command:
  npx drizzle-kit push && next build

Framework: Next.js  |  Install: npm ci (otomatis)
```

### E. Jalur satu perintah via CLI (opsional)

Untuk yang lebih suka terminal (atau teknisi), sudah tersedia `scripts/deploy-vercel.sh`:

```bash
export VERCEL_TOKEN="vcp_xxxxxx"   # Vercel: Account -> Tokens -> New Token
export DATABASE_URL="postgres://USER:PASS@HOST.pooler.neon.tech/DB?sslmode=require"
bash scripts/deploy-vercel.sh
```

Script ini otomatis: menjalankan `drizzle-kit push` (buat tabel) → deploy ke Vercel → menyimpan `DATABASE_URL` → deploy ulang → menampilkan URL.

> **Penting:** file ini tidak pernah menyimpan token/URL. Masukkan sebagai `export` di terminal saja, jangan commit ke repo.

## Catatan penting sebelum dipakai sekolah

- **Buat akun administrator** melalui menu **Administrator** saat pertama kali masuk — tidak ada kredensial bawaan. Simpan password-nya dengan aman.
- **Gunakan HTTPS** untuk produksi.
- Lakukan **backup** rutin lewat menu **Backup & Restore**, dan aktifkan backup Postgres di sisi server/PaaS.
- Uji **cetak fisik satu halaman** pada printer sekolah (kertas F4, skala 100%) sebelum mencetak massal.
