import { FULL_MONTHS, number, terbilang, text, type SchoolProfile, type Transaction } from './domain';
export type ReceiptSigner = { role: string; name: string; nip: string; imageId: string };
export interface ReceiptContent { number: string; from: string; words: string; purpose: string; amount: string; date: string; place: string; signers: ReceiptSigner[] }
export interface ReceiptText { key: string; text: string; x: number; y: number; width: number; height: number; size: number; bold?: boolean; underline?: boolean; align?: 'left' | 'center'; label?: boolean }
export interface ReceiptImage { id: string; x: number; y: number; width: number; height: number }
export const RECEIPT_DEFAULTS = { receiptStyle: 'blue' as const, receiptBackgroundId: '', receiptBackgroundHasLabels: true, receiptWidth: 190, receiptHeight: 100, receiptFontSize: 12, receiptOffsetX: 0, receiptOffsetY: 0, receiptTreasurerLabel: 'Bendahara / Guru' };
export const RECEIPT_NUMBER_FIELDS = { receiptWidth: { min: 140, max: 290, label: 'Lebar kuitansi' }, receiptHeight: { min: 90, max: 150, label: 'Tinggi kuitansi' }, receiptFontSize: { min: 10, max: 14, label: 'Ukuran teks' }, receiptOffsetX: { min: -5, max: 5, label: 'Geser teks horizontal' }, receiptOffsetY: { min: -5, max: 5, label: 'Geser teks vertikal' } } as const;
export function shortReceiptDate(value: string) { const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value); return match ? `${match[3]}/${match[2]}/${match[1]}` : '—'; }
export function makeReceipt(t: Transaction, school: SchoolProfile): ReceiptContent {
  const period = text(t.data, 'period');
  const periodLabel = /^\d{4}-(0[1-9]|1[0-2])$/.test(period) ? `${FULL_MONTHS[Number(period.slice(5)) - 1]} ${period.slice(0, 4)}` : period;
  const details = [periodLabel && !t.title.toLowerCase().includes(periodLabel.toLowerCase()) ? `Periode ${periodLabel}` : '', t.category === 'listrik' && text(t.data, 'customerId') ? `ID pelanggan ${text(t.data, 'customerId')}` : ''].filter(Boolean);
  const words = terbilang(t.amount);
  return { number: t.number || '[Nomor kuitansi]', from: school.name ? `Bendahara ${school.name}` : '[Bendahara dan nama sekolah]', words: t.amount > 0 ? words.charAt(0).toUpperCase() + words.slice(1) : '[Terbilang otomatis dari nominal transaksi]', purpose: [t.title || '[Uraian pembayaran dari transaksi]', ...details].join(' · '), amount: t.amount > 0 ? number(t.amount) : '[Nominal]', date: shortReceiptDate(t.date), place: text(t.data, 'paymentPlace') || school.regency || school.village || '[Tempat pembayaran]', signers: [{ role: 'Kepala Sekolah', name: school.principal || '[Nama kepala sekolah]', nip: school.principalNip, imageId: school.principalSignatureId }, { role: school.receiptTreasurerLabel || RECEIPT_DEFAULTS.receiptTreasurerLabel, name: school.treasurer || '[Nama bendahara]', nip: school.treasurerNip, imageId: school.treasurerSignatureId }, { role: 'Penerima', name: text(t.data, 'recipient') || '[Nama penerima]', nip: text(t.data, 'recipientNip'), imageId: '' }] };
}
export function receiptDimensions(school: SchoolProfile, availableMm: number) {
  const requestedWidth = school.receiptWidth || RECEIPT_DEFAULTS.receiptWidth;
  const width = Math.min(requestedWidth, availableMm);
  const scale = width / requestedWidth;
  return { width, height: (school.receiptHeight || RECEIPT_DEFAULTS.receiptHeight) * scale, scale };
}
export function receiptElements(data: ReceiptContent, school: SchoolProfile, width: number, height: number) {
  const settings = { ...RECEIPT_DEFAULTS, ...school };
  const dx = settings.receiptOffsetX * 72 / 25.4, dy = settings.receiptOffsetY * 72 / 25.4;
  const fs = settings.receiptFontSize;
  const texts: ReceiptText[] = [];
  const images: ReceiptImage[] = [];
  const add = (key: string, value: string, x: number, y: number, w: number, h: number, extra: Partial<ReceiptText> = {}) => texts.push({ key, text: value, x: Math.max(2, Math.min(x * width + dx, width - w * width - 2)), y: Math.max(2, Math.min(y * height + dy, height - h * height - 2)), width: w * width, height: h * height, size: fs, ...extra });
  const labels = settings.receiptStyle !== 'text-only' && !(settings.receiptStyle === 'blue' && settings.receiptBackgroundId && settings.receiptBackgroundHasLabels);
  if (labels) {
    add('label-number', 'No.', .205, .115, .075, .065, { size: 10, label: true });
    add('label-from', 'Telah terima dari', .205, .215, .174, .07, { size: 10, label: true });
    add('label-words', 'Uang sejumlah', .205, .315, .174, .07, { size: 10, label: true });
    add('label-purpose', 'Untuk pembayaran', .205, .445, .174, .07, { size: 9.5, label: true });
    add('label-amount', 'Rp.', .205, .905, .075, .06, { size: 12, label: true });
  }
  add('number', data.number, .295, .115, .66, .07);
  add('from', data.from, .39, .215, .565, .085);
  add('words', data.words, .39, .315, .565, .105);
  add('purpose', data.purpose, .39, .445, .565, .11);
  const left = .185, colWidth = .26;
  add('approved', 'Setuju dibayar', left, .56, colWidth, .045, { align: 'center', size: fs - 1 });
  add('paid', `dibayar, ${data.date}`, left + colWidth, .56, colWidth, .045, { align: 'center', size: fs - 1 });
  add('place-date', `${data.place}, ${data.date}`, left + 2 * colWidth, .56, colWidth, .045, { align: 'center', size: fs - 1 });
  for (let i = 0; i < 3; i++) {
    const signer = data.signers[i];
    const x = left + i * colWidth;
    add(`role-${i}`, signer.role, x, .612, colWidth, .045, { align: 'center', size: fs - 1 });
    if (signer.imageId) images.push({ id: signer.imageId, x: (x + .035) * width + dx, y: .668 * height + dy, width: .19 * width, height: .075 * height });
    add(`name-${i}`, signer.name, x, .755, colWidth, .08, { align: 'center', bold: true, underline: true });
    if (signer.nip) add(`nip-${i}`, `NIP. ${signer.nip}`, x, .845, colWidth, .045, { align: 'center', size: fs - 2 });
  }
  add('amount', data.amount, .295, .905, .4, .06, { bold: true, size: fs + 1 });
  return { texts, images, labels };
}
// The same wrapping and line positions are used by SVG preview, PDF and editable Word.
const estimatedWidth = (value: string, size: number) => Array.from(value).reduce((sum, c) => sum + (/\s/.test(c) ? .25 : /[ilI.,'!:;|]/.test(c) ? .27 : /[MW@%]/.test(c) ? .86 : /[A-Z0-9]/.test(c) ? .58 : .47) * size, 0);
export function fitReceiptText(field: ReceiptText, measure = estimatedWidth) {
  const wrap = (size: number) => {
    const result: string[] = [];
    for (const para of field.text.replace(/\r/g, '').split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/)) {
        if (measure(line ? `${line} ${word}` : word, size) <= field.width - 8) { line = line ? `${line} ${word}` : word; continue; }
        if (line) result.push(line);
        line = '';
        for (const char of word) { if (measure(line + char, size) > field.width - 8 && line) { result.push(line); line = ''; } line += char; }
      }
      result.push(line);
    }
    return result;
  };
  let size = field.size;
  if (/^(name-|nip-|number$|role-|place-date$)/.test(field.key)) {
    while (size > 8.25 && (measure(field.text, size) > field.width - 8 || size * 1.12 > field.height)) size -= .25;
  }
  let rows = wrap(size);
  while (size > 7 && rows.length * size * 1.12 > field.height) { size = Math.max(7, size - .25); rows = wrap(size); }
  // Keep all entered content; never ellipsize or silently discard a long name/description.
  if (rows.length * size * 1.12 > field.height) size = Math.max(4, size * field.height / (rows.length * size * 1.12));
  rows = wrap(size);
  return { rows, size, lineHeight: size * 1.12 };
}
