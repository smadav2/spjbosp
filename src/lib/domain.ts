export const CATEGORIES = [
  { id: 'internet', label: 'Pembayaran Internet', short: 'Internet', code: 'INT', icon: 'Wifi', color: '#4e83e6', description: 'Tagihan internet dan bukti pembayaran', documents: ['receipt', 'evidence'] },
  { id: 'listrik', label: 'Pembayaran Listrik', short: 'Listrik', code: 'LST', icon: 'Zap', color: '#eab45c', description: 'Tagihan listrik dan bukti pembayaran', documents: ['receipt', 'evidence'] },
  { id: 'konsumsi', label: 'Konsumsi Rapat Guru', short: 'Konsumsi rapat', code: 'RPT', icon: 'Coffee', color: '#9b83d5', description: 'Administrasi rapat dan konsumsi guru', documents: ['receipt', 'invitation', 'minutes', 'attendance', 'documentation'] },
  { id: 'pramuka', label: 'Honor Ekstrakurikuler Pramuka', short: 'Honor Pramuka', code: 'PRM', icon: 'TentTree', color: '#44ad91', description: 'Honor, SK, kehadiran, dan kegiatan Pramuka', documents: ['receipt', 'transport', 'decree', 'coachAttendance', 'participantsAttendance', 'documentation'] },
  { id: 'tahfidz', label: "Honor Ekstrakurikuler Tahfidz Al-Qur’an", short: 'Honor Tahfidz', code: 'THF', icon: 'BookOpen', color: '#63b7cb', description: 'Honor dan administrasi kegiatan Tahfidz', documents: ['receipt', 'transport', 'decree', 'coachAttendance', 'participantsAttendance', 'documentation'] },
  { id: 'barang', label: 'Pembelian Barang & Pemeliharaan', short: 'Pengadaan barang', code: 'BRG', icon: 'Package', color: '#e88c70', description: 'Persediaan, pemeliharaan, dan kebersihan', documents: ['receipt', 'order', 'handover', 'inspection', 'evidence', 'documentation'] },
  { id: 'tukang', label: 'Ongkos Upah Tukang', short: 'Upah tukang', code: 'UPH', icon: 'HardHat', color: '#8393ae', description: 'Upah pekerja dan daftar kehadiran', documents: ['receipt', 'wages', 'workersAttendance'] },
] as const;
export type CategoryId = typeof CATEGORIES[number]['id'];
export type DocumentKind = 'receipt' | 'evidence' | 'invitation' | 'minutes' | 'attendance' | 'documentation' | 'transport' | 'decree' | 'coachAttendance' | 'participantsAttendance' | 'order' | 'handover' | 'inspection' | 'wages' | 'workersAttendance';
export const DOCUMENT_NAMES: Record<DocumentKind, string> = { receipt: 'Kuitansi pembayaran', evidence: 'Nota / bukti pembayaran', invitation: 'Undangan rapat', minutes: 'Notulen rapat', attendance: 'Daftar hadir rapat', documentation: 'Dokumentasi kegiatan', transport: 'Daftar penerimaan transport pembina', decree: 'SK pembina / pelatih', coachAttendance: 'Daftar hadir pembina', participantsAttendance: 'Daftar hadir peserta', order: 'Surat pesanan', handover: 'Berita acara serah terima barang', inspection: 'Berita acara pemeriksaan teknis hasil pengadaan barang/jasa', wages: 'Daftar penerimaan upah kerja tukang', workersAttendance: 'Daftar hadir tukang / pekerja' };
export interface SchoolProfile {
  name: string; npsn: string; address: string; village: string; district: string; regency: string; province: string; postalCode: string;
  principal: string; principalNip: string; treasurer: string; treasurerNip: string; operator: string; year: number;
  logoId: string; rightLogoId: string; government: string; department: string; website: string; email: string; letterheadStyle: 'two-logos' | 'centered';
  principalSignatureId: string; treasurerSignatureId: string; numberFormat: string; letterhead: string; margin: number; orientation: 'portrait' | 'landscape';
  receiptStyle: 'blue' | 'plain' | 'text-only'; receiptBackgroundId: string; receiptBackgroundHasLabels: boolean;
  receiptWidth: number; receiptHeight: number; receiptFontSize: number; receiptOffsetX: number; receiptOffsetY: number; receiptTreasurerLabel: string;
}
export const EMPTY_SCHOOL: SchoolProfile = { name: '', npsn: '', address: '', village: '', district: '', regency: '', province: '', postalCode: '', principal: '', principalNip: '', treasurer: '', treasurerNip: '', operator: '', year: new Date().getFullYear(), principalSignatureId: '', treasurerSignatureId: '', numberFormat: 'BNU{nomor}/SDN.SIDO 2/{bulan_romawi}/{tahun}', letterhead: '', logoId: '', rightLogoId: '', government: '', department: '', website: '', email: '', letterheadStyle: 'two-logos', margin: 20, orientation: 'portrait', receiptStyle: 'blue', receiptBackgroundId: '', receiptBackgroundHasLabels: true, receiptWidth: 190, receiptHeight: 100, receiptFontSize: 12, receiptOffsetX: 0, receiptOffsetY: 0, receiptTreasurerLabel: 'Bendahara / Guru' };
export interface Item { name: string; specification: string; quantity: number; unit: string; price: number }
export interface Worker { name: string; job: string; days: number; wage: number }
export interface Attachment { id: string; transactionId: string | null; kind: string; name: string; mime: string; size: number; createdAt: string; content?: string }
export interface Transaction { id: string; number: string; category: CategoryId; title: string; date: string; year: number; amount: number; data: Record<string, unknown>; finalized: boolean; createdAt: string; updatedAt: string; files: Attachment[] }
export interface DocTemplate { key: string; title: string; content: string }
export interface User { name: string; username: string }
export interface AppState { school: SchoolProfile; transactions: Transaction[]; templates: DocTemplate[]; user: User | null; needsSetup: boolean; loginRequired?: boolean }
export const INITIAL_STATE: AppState = { school: EMPTY_SCHOOL, transactions: [], templates: [], user: null, needsSetup: true };
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export const FULL_MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const money = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value).replace(/\u00a0/g, ' ');
export const number = (value: number) => new Intl.NumberFormat('id-ID').format(value);
export function dateLabel(date: string, short = false) { if (!date) return '—'; const value = new Date(date.slice(0, 10) + 'T12:00:00'); return Number.isNaN(value.valueOf()) ? '—' : new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: short ? 'short' : 'long', year: 'numeric' }).format(value); }
export const text = (data: Record<string, unknown>, key: string) => typeof data[key] === 'string' || typeof data[key] === 'number' ? String(data[key]) : '';
export const lines = (value: string) => value.split(/[\n;]+/).map(v => v.trim()).filter(Boolean);
export const categoryOf = (id: string) => CATEGORIES.find(c => c.id === id) || CATEGORIES[0];
export function itemsOf(t: Transaction): Item[] { return Array.isArray(t.data.items) ? t.data.items as Item[] : []; }
export function workersOf(t: Transaction): Worker[] { return Array.isArray(t.data.workers) ? t.data.workers as Worker[] : []; }
export function documentTitle(kind: DocumentKind, category: string) {
  const activity = category === 'pramuka' ? 'Pramuka' : "Tahfidz Al-Qur’an";
  if (kind === 'transport') return `Daftar penerimaan transport pembina ${activity}`;
  if (kind === 'decree') return category === 'pramuka' ? 'SK pelatih Pramuka dari kepala sekolah' : "SK pembimbing baca Al-Qur’an dalam kegiatan ekstrakurikuler Tahfidzul Qur’an";
  if (kind === 'coachAttendance') return `Daftar hadir ${category === 'pramuka' ? 'pelatih' : 'pembina'} ${activity}`;
  if (kind === 'participantsAttendance') return `Daftar hadir ${category === 'pramuka' ? 'anggota Pramuka' : 'ekstrakurikuler Tahfidz Al-Qur’an'}`;
  return DOCUMENT_NAMES[kind];
}
export function documentChecks(t: Transaction, school: SchoolProfile) {
  const has = (...keys: string[]) => keys.every(k => text(t.data, k).trim());
  const checks: Record<DocumentKind, boolean> = {
    receipt: Boolean(t.title && t.date && t.amount > 0 && has('recipient') && school.name && school.treasurer && (!['internet', 'listrik'].includes(t.category) || has('period')) && (t.category !== 'listrik' || has('customerId'))),
    evidence: false, documentation: false,
    invitation: Boolean(has('activityDate', 'time', 'place', 'agenda', 'responsible')),
    minutes: Boolean(has('minutes', 'activityDate')),
    attendance: Boolean(has('participants', 'activityDate')),
    transport: Boolean(has('recipient', 'period', 'meetingDates')),
    decree: Boolean(has('decreeNumber', 'decreeDate', 'decreeText')),
    coachAttendance: Boolean(has('recipient', 'meetingDates')),
    participantsAttendance: Boolean(has('participants', 'meetingDates')),
    order: Boolean(itemsOf(t).length && has('providerAddress')),
    handover: Boolean(itemsOf(t).length && has('handedBy', 'receivedBy', 'condition')),
    inspection: Boolean(itemsOf(t).length && has('inspectedBy', 'inspectionResult')),
    wages: workersOf(t).length > 0,
    workersAttendance: Boolean(workersOf(t).length && has('workDates')),
  };
  return categoryOf(t.category).documents.map(key => ({ key: key as DocumentKind, title: documentTitle(key as DocumentKind, t.category), ready: checks[key as DocumentKind] || t.files.some(f => f.kind === key), uploaded: t.files.some(f => f.kind === key) }));
}
export function missingSchool(school: SchoolProfile) { return [['name', 'Nama sekolah'], ['npsn', 'NPSN'], ['address', 'Alamat sekolah'], ['principal', 'Nama kepala sekolah'], ['treasurer', 'Nama bendahara']].filter(([key]) => !school[key as keyof SchoolProfile]).map(([, label]) => label); }
export function transactionStatus(t: Transaction, school: SchoolProfile): 'complete' | 'incomplete' | 'review' { if (documentChecks(t, school).some(d => !d.ready) || missingSchool(school).length) return 'incomplete'; return t.finalized ? 'complete' : 'review'; }
export const STATUS_LABELS = { complete: 'Lengkap', incomplete: 'Belum lengkap', review: 'Perlu diperiksa' };
export function terbilang(value: number): string {
  const n = Math.floor(Math.abs(value));
  const words = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
  const spell = (x: number): string => {
    if (x < 12) return words[x]; if (x < 20) return `${spell(x - 10)} belas`;
    if (x < 100) return `${spell(Math.floor(x / 10))} puluh ${spell(x % 10)}`.trim();
    if (x < 200) return `seratus ${spell(x - 100)}`.trim();
    if (x < 1000) return `${spell(Math.floor(x / 100))} ratus ${spell(x % 100)}`.trim();
    if (x < 2000) return `seribu ${spell(x - 1000)}`.trim();
    for (const [amount, unit] of [[1e12, 'triliun'], [1e9, 'miliar'], [1e6, 'juta'], [1e3, 'ribu']] as const) if (x >= amount) return `${spell(Math.floor(x / amount))} ${unit} ${spell(x % amount)}`.trim();
    return '';
  };
  return `${n === 0 ? 'nol' : spell(n)} rupiah`;
}
export function calculateAmount(category: string, data: Record<string, unknown>, amount: unknown) {
  if (category === 'barang') return (Array.isArray(data.items) ? data.items as Item[] : []).reduce((s, i) => s + Number(i.quantity) * Number(i.price), 0);
  if (category === 'tukang') return (Array.isArray(data.workers) ? data.workers as Worker[] : []).reduce((s, w) => s + Number(w.days) * Number(w.wage), 0);
  if (category === 'konsumsi') return Number(data.quantity || 0) * Number(data.unitPrice || 0);
  return Number(amount);
}

export const ROMAN_MONTHS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
export const romanMonth = (date: string) => ROMAN_MONTHS[Math.max(0, Math.min(11, Number(date.slice(5, 7)) - 1))] || '';
export const NUMBER_TOKENS = [
  { token: '{nomor}', label: 'nomor urut 3 digit', example: '001' },
  { token: '{nomor_polos}', label: 'nomor urut tanpa nol', example: '1' },
  { token: '{bulan_romawi}', label: 'bulan transaksi (I–XII)', example: 'IX' },
  { token: '{bulan}', label: 'bulan angka 2 digit', example: '09' },
  { token: '{tahun}', label: 'tahun anggaran', example: '2026' },
  { token: '{kategori}', label: 'kode kategori', example: 'THF' },
];
export function buildReceiptNumber(format: string, n: number, date: string, category: string, year = Number(date.slice(0, 4))) {
  return (format || EMPTY_SCHOOL.numberFormat)
    .replaceAll('{nomor}', String(n).padStart(3, '0'))
    .replaceAll('{nomor_polos}', String(n))
    .replaceAll('{bulan_romawi}', romanMonth(date))
    .replaceAll('{bulan}', date.slice(5, 7) || '')
    .replaceAll('{tahun}', String(year))
    .replaceAll('{kategori}', categoryOf(category).code);
}
export function letterheadLines(school: SchoolProfile) {
  const address = [school.address, school.village, school.district, school.regency, school.postalCode ? `(${school.postalCode})` : ''].filter(Boolean).join(', ');
  const contacts = [school.website ? `Website: ${school.website}` : '', school.email ? `Pos-el: ${school.email}` : ''].filter(Boolean).join(' · ');
  return { government: (school.government || '').toUpperCase(), department: (school.department || '').toUpperCase(), school: (school.name || '').toUpperCase(), address: address || school.address || '', contacts, npsn: school.npsn ? `NPSN: ${school.npsn}` : '' };
}
