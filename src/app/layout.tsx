import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/plus-jakarta-sans/800.css';
import './globals.css';
import './receipt.css';
export const metadata: Metadata = { title: 'APLIKASI ADMINISTRASI & CETAK SPJ BOSP SEKOLAH', description: 'Ruang kerja administrasi sekolah: kelola transaksi BOSP, lengkapi dokumen, dan cetak paket SPJ F4 yang rapi.', applicationName: 'SPJ BOSP Sekolah' };
export default function RootLayout({ children }: { children: ReactNode }) { return <html lang="id"><body>{children}</body></html>; }
