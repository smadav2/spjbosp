# APLIKASI ADMINISTRASI & CETAK SPJ BOSP SEKOLAH

Aplikasi Next.js App Router untuk administrasi belanja sekolah, penyimpanan bukti, dan penyusunan paket SPJ. PostgreSQL diakses melalui Drizzle ORM. Tidak ada akun bawaan, transaksi contoh, nominal, nama, atau tanda tangan yang diisikan ke database produksi.

## Mulai menggunakan

1. Buka dashboard, pilih **Tambah Transaksi**, atau buka menu **Administrator** di kanan atas.
2. Pada penggunaan pertama, buat akun administrator. Gunakan password yang kuat (minimal 8 karakter) dan simpan kredensial dengan aman.
3. Isi **Identitas Sekolah**: profil, penanggung jawab, tahun anggaran, kop, logo, serta tanda tangan yang memang diizinkan.
4. Tambahkan transaksi berdasarkan jenis kegiatan, isi data sebenarnya, lalu unggah bukti pendukung.
5. Buka **Detail Transaksi** untuk pemeriksaan kelengkapan. Transaksi dapat disimpan sebagai draft; finalisasi hanya diperbolehkan setelah persyaratan lengkap.
6. Gunakan **Cetak Paket SPJ Lengkap**, atau preview/ekspor masing-masing dokumen.
7. Cadangkan data secara berkala melalui **Backup & Restore**.

## Modul terintegrasi

- Internet, listrik, konsumsi rapat, honor Pramuka, honor Tahfidz, pengadaan barang/pemeliharaan/kebersihan, dan upah tukang.
- Tabel barang dan pekerja, perhitungan total di server, terbilang bahasa Indonesia, nomor kuitansi berurutan per tahun dengan penguncian transaksi database.
- Tambah, edit, hapus dengan konfirmasi, duplikasi tanpa menyalin bukti, pencarian, filter, riwayat perubahan, dan arsip tahun sebelumnya.
- Unggah beberapa JPG/JPEG/PNG/PDF; penggantian berkas atomik, penghapusan, pratinjau, serta validasi jenis berkas berdasarkan isi.
- Maksimal 8 MB per berkas; maksimal 10 berkas dokumentasi Pramuka/Tahfidz. PDF maksimal 100 halaman. Gambar dioptimalkan dengan Sharp; PDF asli dipertahankan.
- Identitas sekolah, teks template dengan variabel, kop, logo, tanda tangan, format nomor kuitansi, orientasi, dan margin dapat disesuaikan.
- Rekap bulanan, kategori, jenis belanja, seluruh transaksi, serta kelengkapan; ekspor Excel, Word, dan PDF.

## Cetak dan ekspor

- PDF dibuat di server dengan ukuran halaman **F4 215 × 330 mm**, portrait atau landscape, margin 10–40 mm, tabel berpaginasi dengan header berulang, nomor halaman, serta blok tanda tangan yang tidak dipisah.
- Word merupakan dokumen OOXML `.docx` yang sebenarnya: teks dan tabel dapat diedit, dengan Times New Roman 12 pt, pengaturan ukuran F4, serta footer nomor halaman. PDF menggunakan keluarga Times-Roman 12 pt.
- Pilihan cetak meliputi satu dokumen, seluruh dokumen otomatis, seluruh lampiran, atau paket SPJ yang tersedia sesuai urutan kategori.
- Foto tertanam di Word dan PDF. **Halaman lampiran PDF asli digabungkan dalam paket PDF; Word menyertakan tautan unduhan berkas PDF aslinya**, bukan konversi halaman PDF menjadi teks editable.
- Gunakan ukuran printer khusus 215 × 330 mm/F4 dan skala 100%. Jangan memilih A4 atau Letter. Tampilan preview terpisah dari dashboard.
- Dokumen yang belum lengkap tidak dibuat seolah-olah lengkap. Kuitansi draft dapat dipratinjau, dengan tanda kosong pada identitas yang belum dimasukkan.
- Template menyediakan struktur administrasi umum. Isi dasar hukum, SK, hasil rapat, kondisi barang, dan hasil pemeriksaan harus dimasukkan pengguna dan diverifikasi terhadap juknis BOSP serta ketentuan daerah/sekolah yang berlaku.
- Mengubah identitas sekolah akan memengaruhi hasil cetak berikutnya, termasuk cetak ulang tahun sebelumnya. Simpan paket PDF final per tahun untuk mempertahankan arsip tampilan saat disahkan.

## Penyimpanan dan keamanan

Data, gambar, PDF, template, serta riwayat tersimpan di PostgreSQL, bukan hanya `localStorage`. Berkas disimpan sebagai data base64 dalam tabel lampiran sehingga backup mencakup seluruh bukti. File hanya disajikan kepada administrator yang memiliki sesi aktif.

Password menggunakan scrypt dengan salt acak. Token sesi acak di-hash di database, cookie HTTP-only/SameSite=Lax, Secure pada HTTPS, dan sesi berlaku 12 jam. Penulisan API membutuhkan autentikasi dan pemeriksaan origin. Terdapat pembatasan percobaan login. Database tidak dibuka ke browser.

Backup JSON **tidak** menyertakan password atau sesi. Restore membutuhkan akun aktif dan konfirmasi `PULIHKAN`, menggantikan data administrasi dalam satu transaksi database, dan tidak mengganti akun login. Backup berisi data pribadi dan perlu disimpan secara aman. Gunakan HTTPS dan cadangan infrastruktur PostgreSQL dalam deployment produksi.

## Pengembangan

Variabel server `DATABASE_URL` dikonfigurasi dalam `.env`. Jangan memasukkan kredensial ke kode atau bundle browser.

- `npm run dev`: pengembangan lokal.
- `npx drizzle-kit push`: menerapkan skema pada database yang sudah disiapkan.
- `npx next typegen`: menghasilkan tipe route.
- `npm exec tsc -- --noEmit --pretty false`: validasi TypeScript.
- `npm run build`: build produksi.

Skema: `src/db/schema.ts`. API: `src/app/api/spj/route.ts` (parameter `route`). Aturan dokumen: `src/lib/domain.ts` dan `src/lib/document-model.ts`. Generator Word/PDF/Excel: `src/lib/exports.ts`. Antarmuka: `src/components/`.

## Pengujian

- `node scripts/browser-check.mjs`: pemeriksaan dashboard kosong, navigasi, modal kategori, pengaturan, serta viewport desktop/laptop/mobile. Memerlukan server yang sudah berjalan dan Chromium Playwright.
- `npx tsx scripts/smoke-test.ts`: integrasi tujuh kategori, autentikasi, terbilang, validasi, unggahan, perhitungan, nomor paralel, edit/hapus/duplikasi, riwayat, Word editable, PDF F4, Excel, browser input, backup/restore, dan logout/login.
- Smoke test **menolak berjalan pada instance yang sudah memiliki administrator**, agar tidak menyentuh data pengguna. Fixture dan akun sementara dipulihkan/dihapus dalam blok `finally`.
- Pengujian memerlukan Chromium (`npx playwright install --with-deps chromium`) serta `pdftotext`/`pdftoppm` dari Poppler. File pemeriksaan dibuat dalam `artifacts/`; bukan berkas publik aplikasi.
- Pengujian format PDF dan preview tidak menggantikan uji fisik printer. Cetak satu halaman uji pada perangkat sekolah sebelum mencetak banyak dokumen.

## Format kuitansi bermotif (pembaruan)

Buka **Template Dokumen → Kuitansi pembayaran** untuk mengatur kuitansi mendatar. Latar biru bawaan dibuat sebagai motif vektor bergaya kuitansi; untuk menggunakan gambar asli sekolah, unggah scan kuitansi kosong JPG/PNG. Isian tidak dirasterisasi: PDF tetap memiliki teks, dan Word menggunakan frame teks yang dapat diedit di atas latar gambar.

- Tiga mode: **Latar biru / unggahan**, **Putih bersih**, dan **Teks saja** untuk kertas kuitansi yang sudah bercetak. Mode juga dapat diganti sementara di halaman cetak.
- Susunan: nomor, Bendahara + nama sekolah, terbilang, uraian dan periode, tanggal pembayaran, persetujuan kepala sekolah, bendahara/guru, penerima, nama tebal bergaris bawah, NIP jika diisi, dan nominal. Data selalu berasal dari sekolah/transaksi; tidak menyalin nama, NIP, tanggal, atau tanda tangan dari gambar referensi.
- Lebar, tinggi, font, posisi teks ±5 mm, dan jabatan tengah dapat diatur. Jika latar unggahan sudah memiliki label, aktifkan pilihan **Latar sudah memuat label…** agar tidak tercetak ganda.
- Jika tidak ada transaksi, pratinjau hanya menampilkan penanda [dalam kurung]. Penanda tidak disimpan sebagai transaksi.
- Ukuran halaman ekspor tetap F4 215 × 330 mm. Kuitansi diperkecil proporsional jika melebihi area cetak; pilih landscape untuk mempertahankan ukuran penuh. Lakukan uji cetak skala 100% untuk kalibrasi printer.
- Pengaturan dan berkas latar tersimpan di PostgreSQL dan disertakan dalam backup/restore. Backup versi lama tetap didukung dengan nilai bawaan untuk pengaturan kuitansi baru.
- Pengujian: `npx tsx scripts/receipt-check.ts` memeriksa PDF dan Word tiga mode/dua orientasi serta membukanya melalui LibreOffice. `node scripts/receipt-browser-check.mjs` hanya untuk server verifikasi terpisah pada port 3101, bukan database sekolah.
