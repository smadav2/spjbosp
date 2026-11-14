import { makeReceipt, type ReceiptContent } from './receipt-layout';
import type { Block, Signer } from './blocks';
import { decreeDocument, invitationDocument } from './decree';
import { CATEGORIES, FULL_MONTHS, categoryOf, dateLabel, documentChecks, documentTitle, itemsOf, lines, money, terbilang, text, transactionStatus, STATUS_LABELS, workersOf, type Attachment, type DocTemplate, type DocumentKind, type SchoolProfile, type Transaction } from './domain';
export type { Block, Signer } from './blocks';
export interface DocumentPage { title: string; letterhead: boolean; blocks: Block[]; receipt?: ReceiptContent; showTitle?: boolean }
const p = (value: string, bold = false): Block => ({ type: 'text', value, bold });
const table = (headers: string[], rows: string[][], widths?: number[]): Block => ({ type: 'table', headers, rows, widths });
export function transactionDocuments(t: Transaction, school: SchoolProfile, templates: DocTemplate[], assets: Attachment[], scope = 'all'): DocumentPage[] {
  const d = (key: string) => { const value = text(t.data, key); if (key === 'period' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return `${FULL_MONTHS[Number(value.slice(5)) - 1]} ${value.slice(0, 4)}`; return value || '—'; };
  const schoolSigners: Signer[] = [
    { role: 'Mengetahui,\nKepala Sekolah', name: school.principal || '—', nip: school.principalNip, image: assets.find(f => f.id === school.principalSignatureId) },
    { role: 'Bendahara BOSP', name: school.treasurer || '—', nip: school.treasurerNip, image: assets.find(f => f.id === school.treasurerSignatureId) },
    { role: 'Penerima', name: d('recipient') },
  ];
  const sign = (signers = schoolSigners, date = t.date): Block => ({ type: 'signatures', signers, date: `${text(t.data, 'paymentPlace') || school.regency || school.village || '—'}, ${dateLabel(date)}` });
  const itemTable = () => table(['No.', 'Nama barang / spesifikasi', 'Jumlah', 'Satuan', 'Harga satuan', 'Total'], itemsOf(t).map((i, n) => [String(n + 1), `${i.name}${i.specification ? '\n' + i.specification : ''}`, String(i.quantity), i.unit || '—', money(i.price), money(i.quantity * i.price)]), [0.06, 0.32, 0.12, 0.1, 0.2, 0.2]);
  const workers = workersOf(t);
  const pages: DocumentPage[] = [];
  const checks = documentChecks(t, school);
  const requested = scope === 'attachments' ? [] : scope === 'all' || scope === 'documents' ? checks.filter(c => c.key === 'receipt' || (c.ready && (scope !== 'documents' || !c.uploaded))).map(c => c.key) : [scope as DocumentKind];
  const appendAttachment = (file: Attachment, title?: string) => pages.push({ title: title || documentTitle(file.kind as DocumentKind, t.category) || 'Lampiran dokumen', letterhead: false, blocks: [p(file.name), { type: 'image', file }] });
  for (const kind of requested) {
    if (!categoryOf(t.category).documents.some(key => key === kind)) continue;
    const uploaded = t.files.filter(f => f.kind === kind);
    if (scope !== 'documents' && uploaded.length && kind !== 'receipt') { uploaded.forEach(f => appendAttachment(f, documentTitle(kind, t.category))); continue; }
    if (kind === 'evidence' || kind === 'documentation') continue;
    const blocks: Block[] = [];
    const custom = templates.find(temp => temp.key === `${t.category}:${kind}` || temp.key === kind)?.content;
    const customText = custom?.replaceAll('{nama_sekolah}', school.name || '—').replaceAll('{nama_kegiatan}', t.title).replaceAll('{tanggal}', dateLabel(t.date)).replaceAll('{nama_penerima}', d('recipient')).replaceAll('{nomor_kuitansi}', t.number);
    if (kind === 'receipt') {
      pages.push({ title: 'KUITANSI PEMBAYARAN', letterhead: false, receipt: makeReceipt(t, school), blocks: customText ? [p(customText)] : [] });
      continue;
    }
    if (kind === 'invitation') {
      const doc = invitationDocument(t, school, assets);
      if (customText) doc.blocks.unshift(p(customText));
      pages.push({ title: doc.title, letterhead: true, blocks: doc.blocks });
      continue;
    }
    if (kind === 'decree') {
      const doc = decreeDocument(t, school, assets);
      if (customText) doc.blocks.push(p(customText));
      pages.push({ title: doc.title, letterhead: true, showTitle: false, blocks: doc.blocks });
      continue;
    }
    blocks.push(p(`Nomor kuitansi: ${t.number}`));
    if (customText) blocks.push(p(customText));
    switch (kind) {
      case 'minutes':
        blocks.push(p(`Kegiatan: ${t.title}`), p(`Tanggal: ${dateLabel(d('activityDate'))} | Waktu: ${d('time')}`), p(`Tempat: ${d('place')}`), p(`Agenda: ${d('agenda')}`), p('Hasil pembahasan / keputusan', true), p(d('minutes')), sign([{ role: 'Penanggung jawab rapat', name: d('responsible') }, schoolSigners[0]]));
        break;
      case 'attendance':
        blocks.push(p(`Kegiatan: ${t.title}`), p(`Hari / tanggal: ${dateLabel(d('activityDate'))}`), p(`Tempat: ${d('place')}`), table(['No.', 'Nama peserta', 'Tanda tangan'], lines(d('participants')).filter(n => n !== '—').map((name, i) => [String(i + 1), name, '']), [0.1, 0.55, 0.35]), sign([{ role: 'Penanggung jawab rapat', name: d('responsible') }]));
        break;
      case 'transport':
        blocks.push(p(`Kegiatan: ${t.title}`), p(`Periode: ${d('period')}`), table(['No.', 'Nama pembina', 'Pertemuan', 'Jumlah transport', 'Tanda tangan'], [['1', d('recipient'), String(lines(d('meetingDates')).length), money(t.amount), '']], [0.07, 0.29, 0.14, 0.25, 0.25]), sign());
        break;
      case 'coachAttendance':
        blocks.push(p(`Kegiatan: ${t.title}`), p(`Periode: ${d('period')}`), table(['No.', 'Tanggal kegiatan', 'Nama pembina', 'Tanda tangan'], lines(d('meetingDates')).filter(v => v !== '—').map((date, i) => [String(i + 1), date, d('recipient'), '']), [0.08, 0.25, 0.37, 0.3]), sign([schoolSigners[0]]));
        break;
      case 'participantsAttendance': {
        const dates = lines(d('meetingDates')).filter(v => v !== '—');
        const names = lines(d('participants')).filter(v => v !== '—');
        for (let i = 0; i < Math.max(1, dates.length); i += 4) {
          const chunk = dates.slice(i, i + 4);
          blocks.push(p(`Kegiatan: ${t.title} | Periode: ${d('period')}`), table(['No.', 'Nama peserta', ...chunk], names.map((name, n) => [String(n + 1), name, ...chunk.map(() => '')]), [0.08, 0.32, ...chunk.map(() => 0.6 / chunk.length)]));
        }
        blocks.push(sign([{ role: 'Pembina / pelatih', name: d('recipient') }]));
        break;
      }
      case 'order':
        blocks.push(p(`Kepada: ${d('recipient')}`), p(`Alamat penyedia: ${d('providerAddress')}`), p(`Tanggal pembelian: ${dateLabel(t.date)}`), p(`Nomor transaksi penyedia: ${d('providerNumber')}`), p(`Jenis belanja: ${d('purchaseType')}`), itemTable(), p(`Total pesanan: ${money(t.amount)}`, true), sign(schoolSigners.slice(0, 2)));
        break;
      case 'handover':
        blocks.push(p(`Tanggal: ${dateLabel(t.date)}`), table([], [['Pihak yang menyerahkan', d('handedBy')], ['Pihak yang menerima', d('receivedBy')], ['Penyedia', d('recipient')]], [0.38, 0.62]), itemTable(), p(`Kondisi / hasil serah terima: ${d('condition')}`), sign([{ role: 'Pihak yang menyerahkan', name: d('handedBy') }, { role: 'Pihak yang menerima', name: d('receivedBy') }]));
        break;
      case 'inspection':
        blocks.push(p(`Tanggal pemeriksaan: ${dateLabel(text(t.data, 'inspectionDate') || t.date)}`), p(`Pemeriksa: ${d('inspectedBy')}`), p(`Penyedia: ${d('recipient')}`), itemTable(), p('Hasil pemeriksaan teknis', true), p(d('inspectionResult')), sign([{ role: 'Pemeriksa', name: d('inspectedBy') }, schoolSigners[0]]));
        break;
      case 'wages':
        blocks.push(p(`Pekerjaan: ${t.title}`), p(`Lokasi: ${d('place')} | Periode: ${d('period')}`), table(['No.', 'Nama pekerja / pekerjaan', 'Hari', 'Upah / hari', 'Total', 'Tanda tangan'], workers.map((w, i) => [String(i + 1), `${w.name}\n${w.job}`, String(w.days), money(w.wage), money(w.days * w.wage), '']), [0.06, 0.28, 0.08, 0.2, 0.2, 0.18]), p(`Total upah: ${money(t.amount)}`, true), sign(schoolSigners.slice(0, 2)));
        break;
      case 'workersAttendance': {
        const dates = lines(d('workDates')).filter(v => v !== '—');
        blocks.push(p(`Pekerjaan: ${t.title}`), p(`Lokasi: ${d('place')} | Periode: ${d('period')}`));
        for (let i = 0; i < Math.max(1, dates.length); i += 4) { const chunk = dates.slice(i, i + 4); blocks.push(table(['No.', 'Nama pekerja', ...chunk], workers.map((w, n) => [String(n + 1), w.name, ...chunk.map(() => '')]), [0.08, 0.32, ...chunk.map(() => 0.6 / chunk.length)])); }
        blocks.push(sign(schoolSigners.slice(0, 2)));
        break;
      }
    }
    pages.push({ title: documentTitle(kind, t.category).toUpperCase(), letterhead: true, blocks });
  }
  if (scope === 'attachments') t.files.forEach(f => appendAttachment(f));
  if (scope === 'all') t.files.filter(f => !requested.includes(f.kind as DocumentKind)).forEach(f => appendAttachment(f));
  if (!pages.length) pages.push({ title: 'LAMPIRAN SPJ', letterhead: false, blocks: [p(`Nomor kuitansi: ${t.number}`), p('Belum ada lampiran yang tersedia.')] });
  return pages;
}
export function reportDocuments(list: Transaction[], school: SchoolProfile, year: number): DocumentPage[] {
  const total = list.reduce((sum, t) => sum + t.amount, 0);
  const head: Block[] = [p(`Tahun anggaran: ${year}`), p(`Total pengeluaran: ${money(total)}`, true), p(`Jumlah transaksi: ${list.length}`)];
  const sign: Block = { type: 'signatures', signers: [{ role: 'Kepala Sekolah', name: school.principal || '—', nip: school.principalNip }, { role: 'Bendahara BOSP', name: school.treasurer || '—', nip: school.treasurerNip }], date: school.regency || '' };
  const txRows = (txs: Transaction[]) => txs.map((t, i) => [String(i + 1), `${t.number}\n${dateLabel(t.date, true)}`, t.title, categoryOf(t.category).short, money(t.amount), STATUS_LABELS[transactionStatus(t, school)]]);
  return [
    { title: 'REKAPITULASI BELANJA BULANAN BOSP', letterhead: true, blocks: [...head, table(['Bulan', 'Jumlah transaksi', 'Total belanja'], FULL_MONTHS.map((month, i) => { const rows = list.filter(t => Number(t.date.slice(5, 7)) === i + 1); return [month, String(rows.length), money(rows.reduce((s, t) => s + t.amount, 0))]; }), [0.4, 0.25, 0.35]), sign] },
    { title: 'REKAPITULASI BELANJA PER KATEGORI', letterhead: true, blocks: [...head, table(['Kategori', 'Jumlah transaksi', 'Total belanja'], CATEGORIES.map(c => { const rows = list.filter(t => t.category === c.id); return [c.label, String(rows.length), money(rows.reduce((s, t) => s + t.amount, 0))]; }), [0.5, 0.2, 0.3]), sign] },
    { title: 'DAFTAR SELURUH TRANSAKSI BOSP', letterhead: true, blocks: [...head, table(['No.', 'Kuitansi / tanggal', 'Kegiatan', 'Kategori', 'Jumlah', 'Status'], txRows(list), [0.05, 0.2, 0.25, 0.17, 0.18, 0.15]), sign] },
    { title: 'REKAPITULASI DOKUMEN BELUM LENGKAP', letterhead: true, blocks: [p(`Tahun anggaran: ${year}`), table(['No.', 'Kuitansi / tanggal', 'Kegiatan', 'Kategori', 'Jumlah', 'Status'], txRows(list.filter(t => transactionStatus(t, school) !== 'complete')), [0.05, 0.2, 0.25, 0.17, 0.18, 0.15]), sign] },
    { title: 'REKAPITULASI BERDASARKAN JENIS BELANJA', letterhead: true, blocks: [...head, table(['Jenis belanja', 'Jumlah transaksi', 'Total belanja'], [...new Set(list.map(t => String(t.data.purchaseType || categoryOf(t.category).short)))].map(type => { const rows = list.filter(t => String(t.data.purchaseType || categoryOf(t.category).short) === type); return [type, String(rows.length), money(rows.reduce((s, t) => s + t.amount, 0))]; }), [0.5, 0.2, 0.3]), sign] },
  ];
}
