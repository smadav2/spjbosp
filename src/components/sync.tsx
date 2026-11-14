'use client';
import { useEffect, useState } from 'react';
import type { AppState } from '@/lib/domain';
import { clearSnapshot, formatBytes, lastPull, loadMode, markPulled, readSnapshot, relativeTime, saveMode, snapshotSize, writeSnapshot, type LocalSnapshot, type StorageMode } from '@/lib/local-store';
import { Icon, Notice, PageHeading, api, useApp } from './ui';
type PushResult = { created: number; updated: number; skipped: number; filesIgnored: number };
export default function SyncView() {
  const { state, refresh, notify, ensureAuth, navigate } = useApp();
  const [mode, setMode] = useState<StorageMode>('cloud');
  const [snapshot, setSnapshot] = useState<LocalSnapshot | null>(null);
  const [size, setSize] = useState(0); const [pulledAt, setPulledAt] = useState<string | null>(null);
  const [online, setOnline] = useState(true); const [busy, setBusy] = useState<'' | 'pull' | 'push' | 'save'>(''); const [result, setResult] = useState<PushResult | null>(null);
  useEffect(() => {
    setMode(loadMode()); setSnapshot(readSnapshot()); setSize(snapshotSize()); setPulledAt(lastPull()); setOnline(navigator.onLine);
    const update = () => setOnline(navigator.onLine); window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  function refreshLocalInfo() { setSnapshot(readSnapshot()); setSize(snapshotSize()); setPulledAt(lastPull()); }
  function changeMode(next: StorageMode) {
    saveMode(next); setMode(next); window.dispatchEvent(new Event('spj-mode-change'));
    if (next === 'local') { writeSnapshot(state); refreshLocalInfo(); notify('Mode penyimpanan lokal aktif. Data langsung dibaca dari perangkat.'); }
    else notify('Kembali ke mode cloud. Data dibaca langsung dari server.');
  }
  function saveToDevice() {
    if (!state.user) { ensureAuth(saveToDevice); return; }
    setBusy('save');
    const saved = writeSnapshot(state, 'device');
    refreshLocalInfo(); setBusy('');
    notify(saved ? 'Salinan data tersimpan di perangkat ini.' : 'Penyimpanan perangkat penuh. Hapus cache lain lalu coba lagi.', !saved);
  }
  async function pull() {
    if (!state.user) { ensureAuth(() => { void pull(); }); return; }
    setBusy('pull');
    try {
      const data = await api<Pick<AppState, 'school' | 'transactions' | 'templates'> & { serverTime: string }>('sync/pull');
      writeSnapshot(data, 'server'); markPulled(data.serverTime); await refresh(); refreshLocalInfo();
      notify(`Tarik data berhasil: ${data.transactions.length} transaksi dan identitas sekolah diperbarui dari server.`);
    } catch (error) { notify(`Tarik data gagal: ${(error as Error).message}`, true); }
    finally { setBusy(''); }
  }
  async function push() {
    if (!state.user) { ensureAuth(() => { void push(); }); return; }
    setBusy('push');
    try {
      const local = readSnapshot();
      const payload = {
        school: (mode === 'local' && local?.source === 'device' ? local.school : state.school),
        templates: (mode === 'local' && local?.source === 'device' ? local.templates : state.templates),
        transactions: (mode === 'local' && local?.source === 'device' ? local.transactions : state.transactions),
        applySchool: true,
      };
      const data = await api<Pick<AppState, 'school' | 'transactions' | 'templates'> & { serverTime: string; result: PushResult }>('sync/push', 'POST', payload);
      writeSnapshot(data, 'server'); markPulled(data.serverTime); setResult(data.result); await refresh(); refreshLocalInfo();
      notify(`Kirim data selesai: ${data.result.created} baru, ${data.result.updated} diperbarui, ${data.result.skipped} dilewati karena server lebih baru.`);
    } catch (error) { notify(`Kirim data gagal: ${(error as Error).message}`, true); }
    finally { setBusy(''); }
  }
  function forget() {
    if (!confirm('Hapus salinan data pada perangkat ini? Data di server tidak terhapus dan tetap dapat ditarik kembali.')) return;
    clearSnapshot(); refreshLocalInfo(); notify('Salinan data perangkat dihapus.');
  }
  const localCount = snapshot?.transactions.length ?? 0;
  return <><PageHeading title="Sinkronisasi & Penyimpanan" description="Bekerja lebih responsif di perangkat ini, lalu tarik atau kirim data agar HP dan laptop tetap sama."><button className="btn btn-outline" onClick={() => navigate('backup')}><Icon name="DatabaseBackup" size={17}/>Backup Database</button><button className="btn btn-primary" disabled={busy !== ''} onClick={() => { void pull(); }}><Icon name={busy === 'pull' ? 'LoaderCircle' : 'Download'} className={busy === 'pull' ? 'spin' : ''} size={17}/>{busy === 'pull' ? 'Menarik…' : 'Tarik Data'}</button></PageHeading>
    <div className={`sync-connection ${online ? 'online' : 'offline'}`}><Icon name={online ? 'ShieldCheck' : 'CircleAlert'} size={18}/><span><b>{online ? 'Terhubung ke server' : 'Tidak ada koneksi internet'}</b><small>{online ? 'Sinkronisasi tarik/kirim data dapat dijalankan. Ini juga menjadi titik sinkronisasi terakhir antarperangkat.' : 'Anda tetap dapat membuka data tersimpan di perangkat. Tarik/kirim data menunggu koneksi pulih.'}</small></span></div>
    <div className="sync-mode-grid">{([['cloud', 'Mode Cloud', 'Data selalu dibaca dari database server. Paling sesuai bila internet stabil dan dipakai bersama.', 'DatabaseBackup'], ['local', 'Mode Lokal', 'Data dibaca langsung dari perangkat sehingga dashboard terasa lebih cepat, termasuk saat koneksi lambat.', 'HardDrive']] as const).map(([value, title, description, icon]) => <button key={value} type="button" className={`sync-mode-card ${mode === value ? 'selected' : ''}`} onClick={() => changeMode(value)} aria-pressed={mode === value}><span className="sync-mode-icon"><Icon name={icon} size={23}/></span><span><b>{title}</b><small>{description}</small></span><span className="sync-radio">{mode === value && <Icon name="Check" size={11}/>}</span>{value === 'local' && mode === 'local' && <em className="sync-flag">AKTIF</em>}</button>)}</div>
    <div className="sync-status-grid"><div className="card sync-status"><span className="sync-status-icon mint"><Icon name="HardDrive" size={20}/></span><div><small>Salinan di perangkat</small><strong>{localCount} transaksi</strong><span>{snapshot ? `Disimpan ${relativeTime(snapshot.savedAt)} · ${formatBytes(size)}` : 'Belum ada salinan di perangkat'}</span></div></div><div className="card sync-status"><span className="sync-status-icon blue"><Icon name="RefreshCw" size={20}/></span><div><small>Tarik data terakhir</small><strong>{relativeTime(pulledAt)}</strong><span>Server: {state.transactions.length} transaksi</span></div></div><div className="card sync-status"><span className="sync-status-icon amber"><Icon name="Files" size={20}/></span><div><small>Lampiran</small><strong>{state.transactions.reduce((sum, item) => sum + item.files.length, 0)} berkas</strong><span>Bukti foto/PDF tersimpan di server</span></div></div></div>
    <div className="sync-action-grid"><section className="card sync-action"><h3><Icon name="Download" size={18}/>Tarik Data dari Server</h3><p>Mengambil identitas sekolah, transaksi, dan template terbaru. Cocok ketika Anda selesai menginput di laptop lalu ingin melihatnya di HP. Data di perangkat diganti dengan versi server.</p><button className="btn btn-primary" disabled={busy !== ''} onClick={() => { void pull(); }}><Icon name={busy === 'pull' ? 'LoaderCircle' : 'Download'} className={busy === 'pull' ? 'spin' : ''} size={16}/>{busy === 'pull' ? 'Menarik data…' : 'Tarik Data Sekarang'}</button></section><section className="card sync-action"><h3><Icon name="UploadCloud" size={18}/>Kirim Data ke Server</h3><p>Mengirim data perangkat ke server. Transaksi digabung berdasarkan nomor identitas dan waktu perubahan: versi terbaru menang, yang sudah lebih baru di server dilewati agar tidak tertimpa.</p><button className="btn btn-primary" disabled={busy !== ''} onClick={() => { void push(); }}><Icon name={busy === 'push' ? 'LoaderCircle' : 'UploadCloud'} className={busy === 'push' ? 'spin' : ''} size={16}/>{busy === 'push' ? 'Mengirim data…' : 'Kirim Data Sekarang'}</button></section><section className="card sync-action"><h3><Icon name="Save" size={18}/>Simpan Salinan Perangkat</h3><p>Menyimpan data yang sedang terlihat ke perangkat tanpa mengubah server. Berguna sebelum bepergian atau saat akan menarik data versi lain.</p><div className="sync-action-row"><button className="btn btn-outline" disabled={busy !== ''} onClick={saveToDevice}><Icon name={busy === 'save' ? 'LoaderCircle' : 'Save'} className={busy === 'save' ? 'spin' : ''} size={16}/>Simpan ke Perangkat</button><button className="text-button danger-text" disabled={!snapshot} onClick={forget}><Icon name="Trash2" size={14}/>Hapus salinan</button></div></section></div>
    {result && <Notice tone="success">Sinkronisasi terakhir: <b>{result.created}</b> transaksi baru, <b>{result.updated}</b> diperbarui, <b>{result.skipped}</b> dilewati karena versi server lebih baru.</Notice>}
    <Notice tone={mode === 'local' ? 'warning' : 'info'}>{mode === 'local' ? 'Mode lokal mempercepat tampilan. Penambahan dan perubahan transaksi tetap dikirim ke server saat koneksi tersedia; unggahan foto/PDF selalu memerlukan internet. Jalankan Kirim Data setelah bekerja agar perangkat lain menerima perubahan.' : 'Mode cloud selalu membaca data terbaru dari server. Gunakan Simpan Salinan Perangkat bila ingin tetap responsif saat koneksi lambat, lalu pilih Mode Lokal.'}</Notice>
    <section className="card sync-flow"><h3><Icon name="ListChecks" size={18}/>Alur kerja dua perangkat</h3><ol><li><b>Laptop:</b> input transaksi dan unggah bukti, lalu klik <b>Tarik Data</b> untuk memastikan versi terakhir sudah di server.</li><li><b>HP:</b> buka aplikasi, pilih <b>Tarik Data</b>, lalu data dan status kelengkapan yang sama akan tampil.</li><li><b>HP:</b> bila mengubah data, klik <b>Kirim Data</b> sebelum berpindah perangkat.</li><li><b>Laptop:</b> klik <b>Tarik Data</b> sekali lagi untuk menerima perubahan terakhir.</li><li>Sebelum menutup tahun anggaran, unduh juga <b>Backup Database</b> sebagai arsip lengkap beserta lampiran.</li></ol><p className="sync-footnote"><Icon name="CircleHelp" size={14}/>Hindari mengubah transaksi yang sama di dua perangkat secara bersamaan. Bila terjadi, versi dengan waktu perubahan terbaru yang dipakai pada sinkronisasi berikutnya.</p></section>
  </>;
}
