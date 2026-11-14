import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import JSZip from 'jszip';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { transactionDocuments } from '@/lib/document-model';
import { renderPDF, renderWord } from '@/lib/exports';
import { EMPTY_SCHOOL, type Attachment, type SchoolProfile, type Transaction } from '@/lib/domain';
const out = 'artifacts/upgrade';
const school: SchoolProfile = { ...EMPTY_SCHOOL, name: 'SD NEGERI SIDOMULYO II KOTAANYAR', government: 'PEMERINTAH KABUPATEN PROBOLINGGO', department: 'DINAS PENDIDIKAN DAN KEBUDAYAAN', address: 'Dusun Pareng Desa Sidomulyo', district: 'Kotaanyar', regency: 'Probolinggo', province: 'Jawa Timur', postalCode: '67293', website: 'sdvilla.eu.org', email: 'sdn.sidomulyo2@uji.sch.id', npsn: '00000000', principal: 'SUSWATI, S.Pd', principalNip: '19711021 199403 2 004', treasurer: 'NURHAYATI, S.Pd', treasurerNip: '19850603 202321 2 030', numberFormat: 'BNU{nomor}/SDN.SIDO 2/{bulan_romawi}/{tahun}' };
let marker = Buffer.alloc(0);
const assets: Attachment[] = ['logoId', 'rightLogoId', 'principalSignatureId'].map((key, i) => ({ id: `00000000-0000-4000-8000-00000000000${i + 1}`, transactionId: null, kind: key, name: 'aset.png', mime: 'image/png', size: 0, content: '', createdAt: '' }));
school.logoId = assets[0].id; school.rightLogoId = assets[1].id; school.principalSignatureId = assets[2].id;
const base = { id: '00000000-0000-4000-8000-000000000010', number: 'BNU001/SDN.SIDO 2/IX/2026', date: '2026-09-29', year: 2026, amount: 400000, finalized: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), files: [] as Attachment[] };
const pramuka: Transaction = { ...base, category: 'pramuka', title: 'Honor Ekstrakurikuler Pramuka September', data: { recipient: 'TRIYUNI PURNAMASARI', participants: 'TRIYUNI PURNAMASARI\nPEMBINA UJI KEDUA', meetingDates: '2026-09-05\n2026-09-12\n2026-09-19\n2026-09-26', decreeNumber: '800/07426.101.411.2.4/2026', decreeDate: '2026-07-02', honorUnit: '4 X pertemuan' } };
const tahfidz: Transaction = { ...base, id: '00000000-0000-4000-8000-000000000011', category: 'tahfidz', title: 'Honor Pembimbing Tahfidz September', amount: 400000, data: { recipient: 'FATIMATUS ZAHRO', participants: 'FATIMATUS ZAHRO\nFAUZAN ALI MASHURI', meetingDates: '2026-09-03\n2026-09-10\n2026-09-17\n2026-09-24', decreeNumber: '800/07426.101.411.2.4/2026', decreeDate: '2026-07-02' } };
const invitation: Transaction = { ...base, id: '00000000-0000-4000-8000-000000000012', category: 'konsumsi', title: 'Rapat Evaluasi Pembelajaran', amount: 200000, data: { invitationNumber: '421.2/045/SDN.SIDO 2/2026', subject: 'Undangan rapat evaluasi pembelajaran', attachmentNote: '-', activityDate: '2026-09-30', time: '09.00 WIB', place: 'Ruang Guru', agenda: 'Evaluasi pembelajaran dan rencana tindak lanjut', quantity: 10, unitPrice: 20000, responsible: 'Wali Kelas VI' } };
function readPDFText(file: string) { return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' }); }
async function checkPDF(file: string, pages: number | number[], phrases: string[], tolerance = 0.3) { const pdf = await PDFDocument.load(await readFile(file)); const allowed = Array.isArray(pages) ? pages : [pages]; assert.ok(allowed.includes(pdf.getPageCount()), `${file}: ${pdf.getPageCount()} pages, expected ${allowed.join(' atau ')}`); for (const page of pdf.getPages()) { assert.ok(Math.abs(page.getWidth() - 215 * 72 / 25.4) < tolerance); assert.ok(Math.abs(page.getHeight() - 330 * 72 / 25.4) < tolerance); } const text = readPDFText(file); for (const phrase of phrases) assert.ok(text.includes(phrase), `${file}: missing "${phrase}"`); return text; }
async function run() {
  marker = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><circle cx="80" cy="80" r="70" fill="none" stroke="#123" stroke-width="6"/><text x="38" y="95" font-size="42" fill="#123">UJI</text></svg>')).png().toBuffer();
  assets.forEach(asset => { asset.size = marker.length; asset.content = marker.toString('base64'); });
  await mkdir(out, { recursive: true }); await mkdir(`${out}/rendered`, { recursive: true });
  const cases = [
    { name: 'sk-pramuka', doc: pramuka, scope: 'decree', phrases: ['KEPUTUSAN KEPALA SEKOLAH', 'SD NEGERI SIDOMULYO II KOTAANYAR', 'TENTANG', 'Menimbang', 'Mengingat', 'MEMUTUSKAN', 'KESATU', 'KETIGA', 'Terbilang', 'KEEMPAT', 'Ditetapkan di', 'Tembusan', 'PEMERINTAH KABUPATEN PROBOLINGGO', 'DINAS PENDIDIKAN DAN KEBUDAYAAN', 'sdn.sidomulyo2@uji.sch.id', 'SUSWATI, S.Pd'] },
    { name: 'sk-tahfidz', doc: tahfidz, scope: 'decree', phrases: ['KEPUTUSAN KEPALA SEKOLAH', 'TAHFIDZUL', 'FATIMATUS ZAHRO', 'MEMUTUSKAN', 'Tembusan'] },
    { name: 'undangan', doc: invitation, scope: 'invitation', phrases: ['SURAT UNDANGAN', 'Nomor', '421.2/045/SDN.SIDO 2/2026', 'Kepada Yth.', 'Bapak/Ibu Guru', 'Hari / Tanggal', 'Ruang Guru', 'Wassalam', 'SUSWATI, S.Pd', 'DINAS PENDIDIKAN DAN KEBUDAYAAN'] },
  ];
  for (const item of cases) {
    const docs = transactionDocuments(item.doc, school, [], assets, item.scope);
    const pdfPath = `${out}/${item.name}.pdf`;
    await writeFile(pdfPath, await renderPDF(docs, school, assets, { orientation: 'portrait', margin: 20 }));
    await checkPDF(pdfPath, item.name.startsWith('sk-') ? [1, 2, 3] : [1, 2], item.phrases);
    const wordBytes = await renderWord(docs, school, assets, { orientation: 'portrait', margin: 20 });
    await writeFile(`${out}/${item.name}.docx`, wordBytes);
    const zip = await JSZip.loadAsync(wordBytes); const xml = await zip.file('word/document.xml')!.async('string');
    assert.ok(xml.includes('12189'), 'F4 portrait page size'); assert.ok(/w:drawing/.test(xml), 'logos embedded');
    execFileSync('libreoffice', ['-env:UserInstallation=file:///tmp/spj_upgrade_lo', '--headless', '--convert-to', 'pdf', '--outdir', `${out}/rendered`, `${out}/${item.name}.docx`], { timeout: 90000, stdio: 'pipe' });
    const rendered = await checkPDF(`${out}/rendered/${item.name}.pdf`, item.name.startsWith('sk-') ? [1, 2, 3] : [1, 2], item.phrases.filter(p => p !== 'MEMUTUSKAN'), 2);
    assert.ok(rendered.length > 400);
    console.log(`PASS: ${item.name} — PDF F4 & Word editable, kop dua logo, isi lengkap, tanpa halaman tambahan.`);
  }
  console.log('ALL DOCUMENT UPGRADE TESTS PASSED');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
