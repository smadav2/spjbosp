import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, sql } from 'drizzle-orm';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { db } from '@/db';
import { ensureSchema } from '@/db/ensure-schema';
import { RECEIPT_NUMBER_FIELDS } from '@/lib/receipt-layout';
import { administrators, attachments, auditLog, documentTemplates, receiptCounters, schoolSettings, transactions } from '@/db/schema';
import { AppError, checkLoginRate, checkOrigin, currentUser, endSession, hasAdministrator, hashPassword, requireUser, startSession, verifyPassword } from '@/lib/auth';
import { DOCUMENT_NAMES, EMPTY_SCHOOL, buildReceiptNumber, categoryOf, transactionStatus, type DocTemplate } from '@/lib/domain';
import { finalizeTransaction, getSchool, getSchoolAssets, getTemplates, getTransaction, isRecord, listTransactions, removeTransaction, saveSchool, saveTransaction, validId, validateTransaction } from '@/lib/store';
import { reportDocuments, transactionDocuments } from '@/lib/document-model';
import { renderExcel, renderPDF, renderWord, type PrintOptions } from '@/lib/exports';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
const binary = (bytes: Uint8Array | ArrayBuffer, mime: string, name: string, inline = false) => new Response(new Uint8Array(bytes as Uint8Array), { headers: { 'Content-Type': mime, 'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${name}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
async function handle(request: NextRequest) {
  try {
    await ensureSchema();
    const path = (request.nextUrl.searchParams.get('route') || 'state').split('/'); const route = path.join('/'); const method = request.method;
    if (method !== 'GET') checkOrigin(request);
    if (route === 'state' && method === 'GET') {
      const needsSetup = !(await hasAdministrator()); const user = await currentUser();
      if (!needsSetup && !user) return json({ school: EMPTY_SCHOOL, transactions: [], templates: [], user: null, needsSetup: false, loginRequired: true });
      const [school, list, templates] = await Promise.all([getSchool(), listTransactions(), getTemplates()]);
      return json({ school, transactions: list, templates, user, needsSetup });
    }
    if (route === 'auth/register' && method === 'POST') {
      const input = await request.json();
      if (!isRecord(input) || typeof input.username !== 'string' || !/^[a-zA-Z0-9_.-]{3,40}$/.test(input.username) || typeof input.password !== 'string' || input.password.length < 8 || input.password.length > 200 || typeof input.name !== 'string' || !input.name.trim()) throw new AppError('Isi nama, username (3–40 karakter), dan password minimal 8 karakter.');
      const passwordHash = await hashPassword(input.password);
      const user = await db.transaction(async tx => { await tx.execute(sql`select pg_advisory_xact_lock(818267)`); const existing = await tx.select({ id: administrators.id }).from(administrators).limit(1); if (existing.length) throw new AppError('Administrator sudah tersedia. Silakan masuk.', 409); const [created] = await tx.insert(administrators).values({ name: (input.name as string).trim().slice(0, 100), username: (input.username as string).toLowerCase(), passwordHash }).returning(); return created; });
      await startSession(user.id, request.headers.get('x-forwarded-proto') === 'https' || request.nextUrl.protocol === 'https:');
      return json({ success: true }, 201);
    }
    if (route === 'auth/login' && method === 'POST') {
      const input = await request.json();
      if (!isRecord(input) || typeof input.username !== 'string' || typeof input.password !== 'string' || input.password.length > 200) throw new AppError('Username dan password wajib diisi.');
      checkLoginRate(`${request.headers.get('x-forwarded-for') || 'local'}:${input.username.toLowerCase()}`);
      const [user] = await db.select().from(administrators).where(eq(administrators.username, input.username.toLowerCase())).limit(1);
      if (!user || !(await verifyPassword(input.password, user.passwordHash))) throw new AppError('Username atau password tidak sesuai.', 401);
      await startSession(user.id, request.headers.get('x-forwarded-proto') === 'https' || request.nextUrl.protocol === 'https:'); return json({ success: true });
    }
    if (route === 'auth/logout' && method === 'POST') { await endSession(); return json({ success: true }); }
    await requireUser();
    if (route === 'auth/password' && method === 'POST') {
      const user = await requireUser(); const input = await request.json();
      if (!isRecord(input) || typeof input.current !== 'string' || typeof input.next !== 'string' || input.next.length < 8 || input.next.length > 200) throw new AppError('Password baru wajib diisi, minimal 8 karakter.');
      if (input.current === input.next) throw new AppError('Password baru harus berbeda dari password saat ini.');
      const [row] = await db.select().from(administrators).where(eq(administrators.id, user.id));
      if (!row || !(await verifyPassword(input.current, row.passwordHash))) throw new AppError('Password saat ini tidak sesuai.', 400);
      await db.update(administrators).set({ passwordHash: await hashPassword(input.next) }).where(eq(administrators.id, user.id));
      await db.insert(auditLog).values({ action: 'Password administrator diubah', details: { username: user.username } });
      return json({ success: true });
    }
    if (path[0] === 'files' && path[1]) {
      const id = validId(path[1]); const [file] = await db.select().from(attachments).where(eq(attachments.id, id)); if (!file) throw new AppError('Berkas tidak ditemukan.', 404);
      if (method === 'GET') return new Response(new Uint8Array(Buffer.from(file.content, 'base64')), { headers: { 'Content-Type': file.mime, 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
      if (method === 'DELETE') { await db.transaction(async tx => { await tx.delete(attachments).where(eq(attachments.id, id)); if (file.transactionId) { await tx.update(transactions).set({ finalized: false, updatedAt: new Date() }).where(eq(transactions.id, file.transactionId)); await tx.insert(auditLog).values({ transactionId: file.transactionId, action: 'Lampiran dihapus', details: { name: file.name } }); } }); return json({ success: true }); }
    }
    if (route === 'upload' && method === 'POST') {
      const form = await request.formData(); const id = String(form.get('transactionId') || ''); const kind = String(form.get('kind') || 'documentation'); const replaceId = String(form.get('replaceId') || '');
      const files = form.getAll('files').filter((v): v is File => typeof v !== 'string');
      if (!files.length || files.length > 10) throw new AppError('Pilih 1–10 berkas dalam satu unggahan.');
      if (replaceId && (!id || files.length !== 1)) throw new AppError('Penggantian lampiran memerlukan satu berkas dan transaksi yang valid.');
      let transaction = null;
      if (id) { transaction = await getTransaction(id); if (!(kind in DOCUMENT_NAMES)) throw new AppError('Jenis lampiran tidak valid.'); }
      else if (!['logo', 'principalSignature', 'treasurerSignature', 'receiptBackground'].includes(kind)) throw new AppError('Jenis aset sekolah tidak valid.');
      const values: (typeof attachments.$inferInsert)[] = [];
      for (const file of files) {
        if (file.size > 8 * 1024 * 1024 || !file.size) throw new AppError('Ukuran setiap berkas harus antara 1 byte dan 8 MB.');
        let buffer: Buffer = Buffer.from(await file.arrayBuffer()); let mime = file.type;
        const pdf = buffer.subarray(0, 5).toString() === '%PDF-'; const png = buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])); const jpg = buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
        if (!(pdf || png || jpg) || !/\.(jpe?g|png|pdf)$/i.test(file.name)) throw new AppError('Berkas harus berupa JPG, JPEG, PNG, atau PDF yang valid.');
        if (!id && pdf) throw new AppError('Logo dan tanda tangan harus berupa gambar PNG atau JPG.');
        if (pdf) { mime = 'application/pdf'; try { const document = await PDFDocument.load(buffer); if (document.getPageCount() > 100) throw new Error('pages'); } catch { throw new AppError('PDF tidak dapat dibaca, dilindungi password, atau melebihi 100 halaman.'); } }
        else { try { const image = sharp(buffer, { limitInputPixels: 50000000 }).rotate().resize({ width: 2400, height: 3000, fit: 'inside', withoutEnlargement: true }); buffer = png ? await image.png({ compressionLevel: 8 }).toBuffer() : await image.jpeg({ quality: 90 }).toBuffer(); mime = png ? 'image/png' : 'image/jpeg'; } catch { throw new AppError('Gambar rusak atau berukuran terlalu besar.'); } }
        values.push({ transactionId: id || null, kind, name: file.name.replace(/[\r\n]/g, '').slice(0, 200), mime, size: buffer.length, content: buffer.toString('base64') });
      }
      const saved = await db.transaction(async tx => {
        if (id) {
          await tx.select().from(transactions).where(eq(transactions.id, id)).for('update');
          if (!replaceId && transaction && ['pramuka', 'tahfidz'].includes(transaction.category) && kind === 'documentation') { const current = await tx.select({ id: attachments.id }).from(attachments).where(and(eq(attachments.transactionId, id), eq(attachments.kind, kind))); if (current.length + values.length > 10) throw new AppError('Dokumentasi Pramuka dan Tahfidz maksimal 10 berkas per transaksi.'); }
          await tx.update(transactions).set({ finalized: false, updatedAt: new Date() }).where(eq(transactions.id, id));
          await tx.insert(auditLog).values({ transactionId: id, action: replaceId ? 'Lampiran diganti' : 'Lampiran diunggah', details: { names: values.map(v => v.name), kind } });
        }
        if (replaceId) {
          validId(replaceId); const [old] = await tx.select().from(attachments).where(eq(attachments.id, replaceId));
          if (!old || old.transactionId !== id || old.kind !== kind) throw new AppError('Lampiran yang diganti tidak sesuai dengan transaksi.', 400);
          return tx.update(attachments).set(values[0]).where(eq(attachments.id, replaceId)).returning({ id: attachments.id, name: attachments.name, kind: attachments.kind, mime: attachments.mime, size: attachments.size });
        }
        return tx.insert(attachments).values(values).returning({ id: attachments.id, name: attachments.name, kind: attachments.kind, mime: attachments.mime, size: attachments.size });
      }); return json({ files: saved }, 201);
    }
    if (route === 'school' && method === 'PUT') return json(await saveSchool(await request.json()));
    if (route === 'templates' && method === 'PUT') {
      const input = await request.json();
      if (!isRecord(input) || typeof input.key !== 'string' || !(input.key in DOCUMENT_NAMES) || typeof input.content !== 'string' || input.content.length > 30000) throw new AppError('Template tidak valid.');
      const title = DOCUMENT_NAMES[input.key as keyof typeof DOCUMENT_NAMES];
      await db.insert(documentTemplates).values({ key: input.key, title, content: input.content }).onConflictDoUpdate({ target: documentTemplates.key, set: { title, content: input.content, updatedAt: new Date() } }); return json({ success: true });
    }
    if (path[0] === 'transactions') {
      if (!path[1] && method === 'POST') return json(await saveTransaction(await request.json()), 201);
      if (path[1]) {
        const id = validId(path[1]);
        if (path[2] === 'history' && method === 'GET') return json(await db.select().from(auditLog).where(eq(auditLog.transactionId, id)).orderBy(desc(auditLog.createdAt)));
        if (path[2] === 'finalize' && method === 'POST') return json(await finalizeTransaction(id));
        if (path[2] === 'duplicate' && method === 'POST') { const original = await getTransaction(id); return json(await saveTransaction({ ...original, title: `${original.title} (salinan)`, finalized: false }), 201); }
        if (!path[2] && method === 'GET') return json(await getTransaction(id));
        if (!path[2] && method === 'PUT') return json(await saveTransaction(await request.json(), id));
        if (!path[2] && method === 'DELETE') { await removeTransaction(id); return json({ success: true }); }
      }
    }
    if ((path[0] === 'export' || path[0] === 'report') && method === 'GET') {
      const params = request.nextUrl.searchParams; const school = await getSchool();
      if (params.has('receiptStyle')) { const style = params.get('receiptStyle'); if (!['blue', 'plain', 'text-only'].includes(style || '')) throw new AppError('Format kuitansi tidak valid.'); school.receiptStyle = style as typeof school.receiptStyle; }
      const format = params.get('format') || 'pdf'; if (!['pdf', 'docx', 'xlsx'].includes(format)) throw new AppError('Format ekspor tidak didukung.');
      const margin = Number(params.get('margin') || school.margin); if (!Number.isFinite(margin) || margin < 10 || margin > 40) throw new AppError('Margin harus 10–40 mm.');
      const options: PrintOptions = { orientation: (params.get('orientation') || school.orientation) === 'landscape' ? 'landscape' : 'portrait', margin, origin: request.nextUrl.origin };
      const assets = await getSchoolAssets(school); let documents; let name = 'laporan-bosp';
      if (path[0] === 'export') { const transaction = await getTransaction(path[1] || '', true); const scope = params.get('scope') || 'all'; if (!['all', 'documents', 'attachments', ...categoryOf(transaction.category).documents].includes(scope)) throw new AppError('Dokumen tidak ditemukan.', 404); documents = transactionDocuments(transaction, school, await getTemplates(), assets, scope); name = `SPJ-${transaction.number.replace(/[^a-zA-Z0-9-]/g, '-')}`; }
      else {
        const year = Number(params.get('year') || school.year); let list = (await listTransactions()).filter(t => t.year === year);
        if (params.get('month')) list = list.filter(t => Number(t.date.slice(5, 7)) === Number(params.get('month')));
        if (params.get('category')) list = list.filter(t => t.category === params.get('category'));
        if (params.get('status')) list = list.filter(t => transactionStatus(t, school) === params.get('status'));
        if (format === 'xlsx') return binary(await renderExcel(list, school, year), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `Laporan-BOSP-${year}.xlsx`);
        documents = reportDocuments(list, school, year); name = `Laporan-BOSP-${year}`;
      }
      if (format === 'docx') return binary(await renderWord(documents, school, assets, options), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', `${name}.docx`);
      return binary(await renderPDF(documents, school, assets, options), 'application/pdf', `${name}.pdf`, params.get('download') !== '1');
    }
    if (route === 'sync/pull' && method === 'GET') {
      const [school, list, templates] = await Promise.all([getSchool(), listTransactions(), getTemplates()]);
      return json({ school, transactions: list, templates, serverTime: new Date().toISOString() });
    }
    if (route === 'sync/push' && method === 'POST') {
      const body = await request.json();
      if (!isRecord(body)) throw new AppError('Data sinkronisasi tidak valid.');
      const incoming = Array.isArray(body.transactions) ? body.transactions : [];
      if (incoming.length > 20000) throw new AppError('Terlalu banyak transaksi dalam satu sinkronisasi.');
      const school = await getSchool();
      let created = 0, updated = 0, skipped = 0, filesIgnored = 0;
      await db.transaction(async tx => {
        for (const raw of incoming) {
          if (!isRecord(raw)) continue;
          const values = validateTransaction(raw);
          const rawId = typeof raw.id === 'string' ? raw.id : '';
          const id = /^[a-f\d-]{36}$/i.test(rawId) ? rawId : null;
          if (id) {
            const [existing] = await tx.select().from(transactions).where(eq(transactions.id, id)).for('update');
            if (existing) {
              const incomingUpdated = new Date(String(raw.updatedAt || 0));
              if (!Number.isNaN(incomingUpdated.valueOf()) && incomingUpdated.getTime() <= existing.updatedAt.getTime()) { skipped++; continue; }
              await tx.update(transactions).set({ ...values, updatedAt: new Date() }).where(eq(transactions.id, id));
              updated++; continue;
            }
          }
          let number = typeof raw.number === 'string' ? raw.number.slice(0, 200).trim() : '';
          if (number) { const [clash] = await tx.select({ id: transactions.id }).from(transactions).where(eq(transactions.number, number)); if (clash) number = ''; }
          if (!number) {
            const [counter] = await tx.insert(receiptCounters).values({ year: values.year, value: 1 }).onConflictDoUpdate({ target: receiptCounters.year, set: { value: sql`${receiptCounters.value} + 1` } }).returning();
            number = buildReceiptNumber(school.numberFormat || EMPTY_SCHOOL.numberFormat, counter.value, values.date, values.category, values.year);
          }
          await tx.insert(transactions).values({ ...(id ? { id } : {}), ...values, number, finalized: false });
          created++;
        }
      });
      if (body.applySchool === true && isRecord(body.school)) await saveSchool(body.school);
      if (Array.isArray(body.templates)) {
        for (const item of body.templates) {
          if (!isRecord(item) || typeof item.key !== 'string' || !(item.key in DOCUMENT_NAMES) || typeof item.content !== 'string' || item.content.length > 30000) continue;
          const title = DOCUMENT_NAMES[item.key as keyof typeof DOCUMENT_NAMES];
          await db.insert(documentTemplates).values({ key: item.key, title, content: item.content }).onConflictDoUpdate({ target: documentTemplates.key, set: { title, content: item.content, updatedAt: new Date() } });
        }
      }
      for (const item of incoming) if (isRecord(item) && Array.isArray(item.files) && item.files.length) filesIgnored++;
      await db.insert(auditLog).values({ action: 'Sinkronisasi diterima', details: { created, updated, skipped, filesIgnored } });
      const [freshSchool, list, templates] = await Promise.all([getSchool(), listTransactions(), getTemplates()]);
      return json({ school: freshSchool, transactions: list, templates, serverTime: new Date().toISOString(), result: { created, updated, skipped, filesIgnored } });
    }
    if (route === 'backup' && method === 'GET') {
      const [school, list, files, templates, counters, history] = await Promise.all([getSchool(), db.select().from(transactions), db.select().from(attachments), getTemplates(), db.select().from(receiptCounters), db.select().from(auditLog)]);
      return new Response(JSON.stringify({ app: 'SPJ-BOSP', version: 1, createdAt: new Date().toISOString(), school, transactions: list, files, templates, counters, history }), { headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="Backup-SPJ-BOSP-${new Date().toISOString().slice(0, 10)}.json"`, 'Cache-Control': 'private, no-store' } });
    }
    if (route === 'restore' && method === 'POST') {
      const body = await request.json();
      if (!isRecord(body) || body.confirmation !== 'PULIHKAN' || !isRecord(body.backup)) throw new AppError('Ketik PULIHKAN untuk mengonfirmasi pemulihan.');
      const b = body.backup;
      if (b.app !== 'SPJ-BOSP' || b.version !== 1 || !isRecord(b.school) || !Array.isArray(b.transactions) || !Array.isArray(b.files) || !Array.isArray(b.templates) || !Array.isArray(b.counters)) throw new AppError('Format backup tidak dikenali.');
      if (b.transactions.length > 50000 || b.files.length > 100000) throw new AppError('Backup melebihi batas pemulihan.');
      const rows = b.transactions.map((r: unknown) => { if (!isRecord(r) || !r.id || !r.number) throw new AppError('Data transaksi backup tidak valid.'); const values = validateTransaction(r); return { ...values, id: validId(String(r.id)), number: String(r.number).slice(0, 200), finalized: Boolean(r.finalized), createdAt: new Date(String(r.createdAt)), updatedAt: new Date(String(r.updatedAt)) }; });
      const ids = new Set(rows.map(r => r.id));
      const fileRows = b.files.map((r: unknown) => { if (!isRecord(r) || typeof r.content !== 'string' || r.content.length > 15 * 1024 * 1024 || !['image/png', 'image/jpeg', 'application/pdf'].includes(String(r.mime))) throw new AppError('Berkas backup tidak valid.'); const transactionId = r.transactionId ? validId(String(r.transactionId)) : null; if (transactionId && !ids.has(transactionId)) throw new AppError('Referensi berkas backup tidak valid.'); return { id: validId(String(r.id)), transactionId, kind: String(r.kind), name: String(r.name).slice(0, 200), mime: String(r.mime), size: Buffer.from(r.content, 'base64').length, content: r.content, createdAt: new Date(String(r.createdAt)) }; });
      const school = { ...EMPTY_SCHOOL, ...b.school };
      if (!Number.isInteger(school.year) || school.year < 2000 || school.year > 2100 || typeof school.numberFormat !== 'string' || !school.numberFormat.includes('{nomor}') || !school.numberFormat.includes('{tahun}')) throw new AppError('Pengaturan backup tidak valid.');
      for (const [key, fallback] of Object.entries(EMPTY_SCHOOL)) {
        const value = (school as unknown as Record<string, unknown>)[key];
        if (typeof fallback === 'string' && (typeof value !== 'string' || value.length > (key === 'letterhead' ? 2000 : 500))) throw new AppError(`Identitas ${key} pada backup tidak valid.`);
      }
      if (!Number.isFinite(school.margin) || school.margin < 10 || school.margin > 40 || !['portrait', 'landscape'].includes(school.orientation) || (school.npsn && !/^\d{8}$/.test(school.npsn))) throw new AppError('Pengaturan cetak atau NPSN pada backup tidak valid.');
      if (!['blue', 'plain', 'text-only'].includes(school.receiptStyle) || typeof school.receiptBackgroundHasLabels !== 'boolean') throw new AppError('Format kuitansi pada backup tidak valid.');
      for (const [key, rule] of Object.entries(RECEIPT_NUMBER_FIELDS)) { const value = school[key as keyof typeof RECEIPT_NUMBER_FIELDS]; if (!Number.isFinite(value) || value < rule.min || value > rule.max) throw new AppError(`${rule.label} pada backup tidak valid.`); }
      for (const id of [school.logoId, school.principalSignatureId, school.treasurerSignatureId, school.receiptBackgroundId].filter(Boolean)) { validId(id); if (!fileRows.some(file => file.id === id && file.mime.startsWith('image/'))) throw new AppError('Aset sekolah pada backup tidak ditemukan.'); }
      for (const file of fileRows) {
        const bytes = Buffer.from(file.content, 'base64');
        const valid = file.mime === 'application/pdf' ? bytes.subarray(0, 5).toString() === '%PDF-' : file.mime === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
        if (!valid || Number.isNaN(file.createdAt.valueOf())) throw new AppError('Isi atau tanggal berkas backup tidak valid.');
      }
      if (rows.some(row => Number.isNaN(row.createdAt.valueOf()) || Number.isNaN(row.updatedAt.valueOf()))) throw new AppError('Tanggal transaksi backup tidak valid.');
      const templates: DocTemplate[] = b.templates.filter((r: unknown): r is DocTemplate => isRecord(r) && typeof r.key === 'string' && r.key in DOCUMENT_NAMES && typeof r.content === 'string' && typeof r.title === 'string');
      const counters = b.counters.map((r: unknown) => { if (!isRecord(r) || !Number.isInteger(r.year) || !Number.isInteger(r.value) || Number(r.value) < 0) throw new AppError('Nomor urut backup tidak valid.'); return { year: Number(r.year), value: Number(r.value) }; });
      await db.transaction(async tx => {
        await tx.delete(attachments); await tx.delete(transactions); await tx.delete(receiptCounters); await tx.delete(documentTemplates); await tx.delete(auditLog);
        await tx.insert(schoolSettings).values({ id: 1, data: school }).onConflictDoUpdate({ target: schoolSettings.id, set: { data: school, updatedAt: new Date() } });
        for (const row of rows) await tx.insert(transactions).values(row);
        for (const row of fileRows) await tx.insert(attachments).values(row);
        if (counters.length) await tx.insert(receiptCounters).values(counters);
        if (templates.length) await tx.insert(documentTemplates).values(templates);
        if (Array.isArray(b.history)) for (const r of b.history) if (isRecord(r) && typeof r.action === 'string') await tx.insert(auditLog).values({ transactionId: r.transactionId ? validId(String(r.transactionId)) : null, action: r.action.slice(0, 240), details: isRecord(r.details) ? r.details : {}, createdAt: new Date(String(r.createdAt)) });
        await tx.insert(auditLog).values({ action: 'Backup dipulihkan', details: { transactions: rows.length, files: fileRows.length } });
      }); return json({ success: true, transactions: rows.length, files: fileRows.length });
    }
    throw new AppError('Endpoint tidak ditemukan.', 404);
  } catch (error) {
    if (error instanceof AppError) return json({ error: error.message, ...(error.status === 409 && error.message.includes('sudah tersedia') ? { code: 'ADMIN_EXISTS', loginRequired: true } : {}) }, error.status);
    const e = error as { code?: string; cause?: { code?: string } };
    if (e.code === '23505' || e.cause?.code === '23505') return json({ error: 'Nomor transaksi sudah dipakai. Periksa format nomor kuitansi.' }, 409);
    const code = e.code || e.cause?.code || '';
    const detail = `${(error as Error)?.message || ''} ${(e.cause as { message?: string })?.message || ''}`;
    if (code === '42P01' || /relation .* does not exist/i.test(detail)) return json({ error: 'Tabel database belum siap. Aplikasi akan membuatnya otomatis — muat ulang halaman ini. Jika pesan tetap muncul, pastikan akun database pada DATABASE_URL memiliki izin CREATE TABLE.' }, 500);
    if (code === '28P01' || code === '28000' || /password authentication failed/i.test(detail)) return json({ error: 'Login database ditolak. Periksa username/password pada DATABASE_URL di pengaturan environment.' }, 500);
    if (['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EHOSTUNREACH'].includes(code) || /ENOTFOUND|ECONNREFUSED|getaddrinfo|timeout/i.test(detail)) return json({ error: 'Tidak dapat terhubung ke database. Periksa DATABASE_URL (gunakan connection string "pooled" dari Neon/Supabase) dan pastikan database aktif.' }, 500);
    if (code === '28000' || /SSL|sslmode/i.test(detail)) return json({ error: 'Koneksi database memerlukan SSL. Tambahkan "?sslmode=require" pada DATABASE_URL.' }, 500);
    console.error('SPJ API error', { code, detail });
    return json({ error: 'Permintaan tidak dapat diproses. Periksa data atau coba kembali.', code: 'SERVER_ERROR' }, 500);
  }
}
export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
