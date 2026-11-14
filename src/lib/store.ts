import { db } from '@/db';
import { and, desc, eq, sql } from 'drizzle-orm';
import { attachments, auditLog, documentTemplates, receiptCounters, schoolSettings, transactions } from '@/db/schema';
import { AppError } from './auth';
import { RECEIPT_NUMBER_FIELDS } from './receipt-layout';
import { CATEGORIES, EMPTY_SCHOOL, buildReceiptNumber, calculateAmount, categoryOf, documentChecks, missingSchool, type Attachment, type CategoryId, type Item, type SchoolProfile, type Transaction, type Worker } from './domain';

const fileColumns = { id: attachments.id, transactionId: attachments.transactionId, kind: attachments.kind, name: attachments.name, mime: attachments.mime, size: attachments.size, createdAt: attachments.createdAt };
export const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v));
export function validId(id: string) { if (!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(id)) throw new AppError('ID tidak valid.', 400); return id; }
export async function getSchool(): Promise<SchoolProfile> { const [row] = await db.select().from(schoolSettings).where(eq(schoolSettings.id, 1)); return { ...EMPTY_SCHOOL, ...row?.data }; }
export async function getTemplates() { return db.select({ key: documentTemplates.key, title: documentTemplates.title, content: documentTemplates.content }).from(documentTemplates); }
export async function listTransactions(withContent = false): Promise<Transaction[]> {
  const [rows, files] = await Promise.all([db.select().from(transactions).orderBy(desc(transactions.date), desc(transactions.createdAt)), withContent ? db.select().from(attachments) : db.select(fileColumns).from(attachments)]);
  return rows.map(row => ({ ...row, category: row.category as CategoryId, amount: Number(row.amount), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), files: files.filter(f => f.transactionId === row.id).map(f => ({ ...f, createdAt: f.createdAt.toISOString() })) }));
}
export async function getTransaction(id: string, withContent = false): Promise<Transaction> {
  validId(id);
  const [row] = await db.select().from(transactions).where(eq(transactions.id, id));
  if (!row) throw new AppError('Transaksi tidak ditemukan.', 404);
  const files = withContent ? await db.select().from(attachments).where(eq(attachments.transactionId, id)) : await db.select(fileColumns).from(attachments).where(eq(attachments.transactionId, id));
  return { ...row, category: row.category as CategoryId, amount: Number(row.amount), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), files: files.map(f => ({ ...f, createdAt: f.createdAt.toISOString() })) };
}
export async function getSchoolAssets(school: SchoolProfile): Promise<Attachment[]> {
  const ids = [...new Set([school.logoId, school.rightLogoId, school.principalSignatureId, school.treasurerSignatureId, school.receiptBackgroundId].filter(Boolean))];
  const result: Attachment[] = [];
  for (const id of ids) { validId(id); const [file] = await db.select().from(attachments).where(eq(attachments.id, id)); if (file) result.push({ ...file, createdAt: file.createdAt.toISOString() }); }
  return result;
}
export function validateTransaction(input: unknown) {
  if (!isRecord(input)) throw new AppError('Data transaksi tidak valid.');
  const category = String(input.category || '');
  if (!CATEGORIES.some(c => c.id === category)) throw new AppError('Pilih jenis transaksi yang valid.');
  const title = String(input.title || '').trim();
  const date = String(input.date || '');
  if (!title || title.length > 240) throw new AppError('Nama kegiatan wajib diisi, maksimal 240 karakter.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new AppError('Tanggal pembayaran tidak valid.');
  const year = Number(date.slice(0, 4));
  if (year < 2000 || year > 2100) throw new AppError('Tahun harus berada di antara 2000–2100.');
  const rawData = isRecord(input.data) ? input.data : {};
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawData)) {
    if (key.length > 60) continue;
    if (typeof value === 'string') { const longFields = ['participants', 'minutes', 'decreeText', 'agenda', 'meetingDates', 'workDates', 'inspectionResult', 'condition']; const limit = longFields.includes(key) ? 30000 : 240; if (value.length > limit) throw new AppError(`Isian ${key} melebihi batas ${limit} karakter.`); data[key] = value.trim(); }
    else if (typeof value === 'number' && Number.isFinite(value)) data[key] = value;
  }
  if (Array.isArray(rawData.items)) {
    if (rawData.items.length > 200) throw new AppError('Maksimal 200 barang per transaksi.');
    data.items = rawData.items.map(item => {
      if (!isRecord(item) || !String(item.name || '').trim() || !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0 || !Number.isFinite(Number(item.price)) || Number(item.price) < 0 || !Number.isInteger(Number(item.price))) throw new AppError('Lengkapi nama, jumlah, dan harga rupiah bulat pada setiap barang.');
      return { name: String(item.name).slice(0, 240), specification: String(item.specification || '').slice(0, 500), unit: String(item.unit || '').slice(0, 30), quantity: Number(item.quantity), price: Number(item.price) } satisfies Item;
    });
  }
  if (Array.isArray(rawData.workers)) {
    if (rawData.workers.length > 100) throw new AppError('Maksimal 100 pekerja per transaksi.');
    data.workers = rawData.workers.map(worker => {
      if (!isRecord(worker) || !String(worker.name || '').trim() || !Number.isFinite(Number(worker.days)) || Number(worker.days) <= 0 || !Number.isFinite(Number(worker.wage)) || Number(worker.wage) < 0 || !Number.isInteger(Number(worker.wage))) throw new AppError('Lengkapi nama, hari kerja, dan upah pada setiap pekerja.');
      return { name: String(worker.name).slice(0, 240), job: String(worker.job || '').slice(0, 240), days: Number(worker.days), wage: Number(worker.wage) } satisfies Worker;
    });
  }
  if (category === 'konsumsi' && (!Number.isFinite(Number(data.quantity)) || Number(data.quantity) <= 0 || !Number.isFinite(Number(data.unitPrice)) || Number(data.unitPrice) <= 0 || !Number.isInteger(Number(data.unitPrice)))) throw new AppError('Jumlah konsumsi dan harga satuan harus positif; harga berupa rupiah bulat.');
  const amount = calculateAmount(category, data, input.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999999 || !Number.isInteger(amount)) throw new AppError('Total pembayaran harus berupa rupiah bulat, lebih dari 0 dan maksimal Rp 999.999.999.999.');
  return { category, title, date, year, amount: String(amount), data };
}
export async function saveTransaction(input: unknown, id?: string) {
  const values = validateTransaction(input);
  const school = await getSchool();
  if (id) validId(id);
  const result = await db.transaction(async tx => {
    if (id) {
      const [before] = await tx.select().from(transactions).where(eq(transactions.id, id)).for('update');
      if (!before) throw new AppError('Transaksi tidak ditemukan.', 404);
      if (before.year !== values.year) throw new AppError('Tahun transaksi yang sudah bernomor tidak dapat diubah. Buat transaksi baru pada tahun yang sesuai.');
      const [updated] = await tx.update(transactions).set({ ...values, finalized: false, updatedAt: new Date() }).where(eq(transactions.id, id)).returning();
      await tx.insert(auditLog).values({ transactionId: id, action: 'Transaksi diperbarui', details: { before, after: updated } });
      return updated;
    }
    const [counter] = await tx.insert(receiptCounters).values({ year: values.year, value: 1 }).onConflictDoUpdate({ target: receiptCounters.year, set: { value: sql`${receiptCounters.value} + 1` } }).returning();
    const number = buildReceiptNumber(school.numberFormat || EMPTY_SCHOOL.numberFormat, counter.value, values.date, values.category, values.year);
    const [created] = await tx.insert(transactions).values({ ...values, number }).returning();
    await tx.insert(auditLog).values({ transactionId: created.id, action: 'Transaksi dibuat', details: { number, title: created.title } });
    return created;
  });
  return getTransaction(result.id);
}
export async function finalizeTransaction(id: string) {
  validId(id);
  await db.transaction(async tx => {
    const [row] = await tx.select().from(transactions).where(eq(transactions.id, id)).for('update');
    if (!row) throw new AppError('Transaksi tidak ditemukan.', 404);
    const files = await tx.select(fileColumns).from(attachments).where(eq(attachments.transactionId, id));
    const [settings] = await tx.select().from(schoolSettings).where(eq(schoolSettings.id, 1)).for('share');
    const school = { ...EMPTY_SCHOOL, ...settings?.data };
    const t: Transaction = { ...row, category: row.category as CategoryId, amount: Number(row.amount), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), files: files.map(f => ({ ...f, createdAt: f.createdAt.toISOString() })) };
    const missing = [...missingSchool(school), ...documentChecks(t, school).filter(c => !c.ready).map(c => c.title)];
    if (missing.length) throw new AppError(`Belum dapat difinalkan. Lengkapi: ${missing.join(', ')}.`);
    await tx.update(transactions).set({ finalized: true, updatedAt: new Date() }).where(eq(transactions.id, id));
    await tx.insert(auditLog).values({ transactionId: id, action: 'SPJ diperiksa dan difinalkan', details: { number: t.number } });
  });
  return getTransaction(id);
}
export async function removeTransaction(id: string) { const t = await getTransaction(id); await db.transaction(async tx => { await tx.delete(transactions).where(eq(transactions.id, id)); await tx.insert(auditLog).values({ transactionId: id, action: 'Transaksi dihapus', details: { number: t.number, title: t.title, amount: t.amount } }); }); }
export async function saveSchool(input: unknown) {
  if (!isRecord(input)) throw new AppError('Identitas sekolah tidak valid.');
  const school = await getSchool();
  for (const key of Object.keys(EMPTY_SCHOOL)) {
    if (key === 'year' || key === 'margin' || key === 'orientation' || key in RECEIPT_NUMBER_FIELDS || key === 'receiptBackgroundHasLabels') continue;
    if (typeof input[key] === 'string') (school as unknown as Record<string, unknown>)[key] = (input[key] as string).trim().slice(0, key === 'letterhead' ? 1000 : ['principal', 'treasurer', 'operator'].includes(key) ? 120 : ['email', 'website'].includes(key) ? 200 : 300);
  }
  school.year = Number(input.year || school.year); school.margin = Number(input.margin ?? school.margin); school.orientation = input.orientation === 'landscape' ? 'landscape' : 'portrait';
  if (!['blue', 'plain', 'text-only'].includes(school.receiptStyle)) throw new AppError('Pilih format kuitansi yang valid.');
  if (typeof input.receiptBackgroundHasLabels === 'boolean') school.receiptBackgroundHasLabels = input.receiptBackgroundHasLabels;
  for (const [key, rule] of Object.entries(RECEIPT_NUMBER_FIELDS)) {
    const name = key as keyof typeof RECEIPT_NUMBER_FIELDS;
    const value = Number(input[name] ?? school[name]);
    if (!Number.isFinite(value) || value < rule.min || value > rule.max) throw new AppError(`${rule.label} harus di antara ${rule.min}–${rule.max}.`);
    school[name] = value;
  }
  if (school.receiptBackgroundId) {
    validId(school.receiptBackgroundId);
    const [background] = await db.select({ mime: attachments.mime, kind: attachments.kind, transactionId: attachments.transactionId }).from(attachments).where(eq(attachments.id, school.receiptBackgroundId));
    if (!background || !background.mime.startsWith('image/') || background.kind !== 'receiptBackground' || background.transactionId) throw new AppError('Latar kuitansi tidak ditemukan. Unggah ulang gambar JPG atau PNG.');
  }
  if (!Number.isInteger(school.year) || school.year < 2000 || school.year > 2100) throw new AppError('Tahun anggaran tidak valid.');
  if (!Number.isFinite(school.margin) || school.margin < 10 || school.margin > 40) throw new AppError('Margin harus 10–40 mm.');
  if (!['two-logos', 'centered'].includes(school.letterheadStyle)) school.letterheadStyle = 'two-logos';
  if (school.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(school.email)) throw new AppError('Alamat email sekolah tidak valid.');
  if (school.website && /\s/.test(school.website)) throw new AppError('Alamat website tidak boleh mengandung spasi.');
  if (school.npsn && !/^\d{8}$/.test(school.npsn)) throw new AppError('NPSN harus terdiri dari 8 digit angka.');
  if (!school.numberFormat.includes('{nomor}') || !school.numberFormat.includes('{tahun}')) throw new AppError('Format nomor harus memuat {nomor} dan {tahun}.');
  await db.insert(schoolSettings).values({ id: 1, data: school }).onConflictDoUpdate({ target: schoolSettings.id, set: { data: school, updatedAt: new Date() } });
  return school;
}
export async function fileCount(transactionId: string, kind: string) { return db.select({ id: attachments.id }).from(attachments).where(and(eq(attachments.transactionId, transactionId), eq(attachments.kind, kind))); }
