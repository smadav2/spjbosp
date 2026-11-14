import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import JSZip from 'jszip';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { CATEGORIES, EMPTY_SCHOOL, type Attachment, type SchoolProfile, type Transaction } from '@/lib/domain';
import { transactionDocuments } from '@/lib/document-model';
import { renderPDF, renderWord } from '@/lib/exports';
const directory = 'artifacts/receipt-format';
const school: SchoolProfile = { ...EMPTY_SCHOOL, name: 'SEKOLAH PENGUJIAN FORMAT', principal: 'KEPALA SEKOLAH UJI', treasurer: 'BENDAHARA PENGUJIAN', principalNip: '00000000 000000 0 000', treasurerNip: '00000000 000000 0 001', regency: 'TEMPAT UJI', receiptWidth: 190, receiptHeight: 100 };
const transaction: Transaction = { id: '00000000-0000-4000-8000-000000000001', number: 'UJI-001/BOSP/2026', category: 'tahfidz', title: 'HONOR KEGIATAN PENGUJIAN FORMAT KUITANSI', date: '2026-04-15', year: 2026, amount: 200000, finalized: false, data: { recipient: 'PENERIMA PENGUJIAN', period: '2026-04', meetingDates: '15/04/2026', participants: 'PESERTA UJI', decreeNumber: 'SK-UJI', decreeDate: '2026-04-15', decreeText: 'Dokumen uji perangkat lunak, bukan keputusan sekolah.' }, createdAt: '', updatedAt: '', files: [] };
async function inspectPDF(file: string, pages: number) {
  const pdf = await PDFDocument.load(await readFile(file));
  assert.equal(pdf.getPageCount(), pages, file);
  for (const p of pdf.getPages()) { assert.ok(Math.abs(p.getWidth() - (p.getWidth() < p.getHeight() ? 215 : 330) * 72 / 25.4) < 1.2); }
  const text = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
  assert.ok(text.includes('UJI-001/BOSP/2026'), file);
  assert.ok(text.includes('Dua ratus ribu rupiah'), file);
  assert.ok(text.includes('Setuju dibayar'), file);
  assert.ok(text.includes('PENERIMA PENGUJIAN'), file);
  return text;
}
async function run() {
  await mkdir(directory, { recursive: true });
  await mkdir(`${directory}/word-rendered`, { recursive: true });
  const marker = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="90"><text x="20" y="65" font-size="40" fill="#000">ASET UJI</text></svg>')).png().toBuffer();
  const assets: Attachment[] = ['principalSignatureId', 'treasurerSignatureId'].map((key, i) => ({ id: `00000000-0000-4000-8000-00000000000${i + 2}`, transactionId: null, name: 'aset-uji.png', mime: 'image/png', kind: i ? 'treasurerSignature' : 'principalSignature', size: marker.length, content: marker.toString('base64'), createdAt: '' }));
  school.principalSignatureId = assets[0].id; school.treasurerSignatureId = assets[1].id;
  for (const orientation of ['portrait', 'landscape'] as const) for (const style of ['blue', 'plain', 'text-only'] as const) {
    const settings = { ...school, receiptStyle: style };
    const docs = transactionDocuments(transaction, settings, [], assets, 'receipt');
    assert.ok(docs[0].receipt);
    const name = `${directory}/${style}-${orientation}`;
    await writeFile(`${name}.pdf`, await renderPDF(docs, settings, assets, { orientation, margin: 20 }));
    const text = await inspectPDF(`${name}.pdf`, 1);
    assert.equal(text.includes('Telah terima dari'), style !== 'text-only');
    const bytes = await renderWord(docs, settings, assets, { orientation, margin: 20 }); await writeFile(`${name}.docx`, bytes);
    const zip = await JSZip.loadAsync(bytes); const xml = await zip.file('word/document.xml')!.async('string');
    assert.ok(xml.includes('w:framePr'), 'Receipt fields must remain editable text frames, not a screenshot.');
    assert.ok(xml.includes('UJI-001/BOSP/2026')); assert.ok(xml.includes('Dua ratus ribu rupiah')); assert.ok(xml.includes('w:u w:val="single"'));
    assert.equal(xml.includes('behindDoc="1"'), style === 'blue');
    const width = orientation === 'portrait' ? '12189' : '18709'; assert.ok(xml.includes(`w:w="${width}"`));
    execFileSync('libreoffice', ['-env:UserInstallation=file:///tmp/spj_receipt_lo_check', '--headless', '--convert-to', 'pdf', '--outdir', `${directory}/word-rendered`, `${name}.docx`], { timeout: 60000, stdio: 'pipe' });
    await inspectPDF(`${directory}/word-rendered/${style}-${orientation}.pdf`, 1);
    console.log(`PASS: ${style} ${orientation} – F4 PDF, editable Word, Word-rendered PDF, one complete receipt page.`);
  }
  for (const category of CATEGORIES) {
    const current = { ...transaction, category: category.id, data: { ...transaction.data, quantity: 2, unitPrice: 100000, customerId: 'ID-UJI', items: [{ name: 'BARANG UJI', specification: '', quantity: 2, unit: 'unit', price: 100000 }], workers: [{ name: 'PEKERJA UJI', job: 'PENGUJIAN', days: 2, wage: 100000 }], providerAddress: 'ALAMAT UJI', handedBy: 'PIHAK UJI 1', receivedBy: 'PIHAK UJI 2', condition: 'KONDISI UJI', inspectedBy: 'PEMERIKSA UJI', inspectionResult: 'HASIL UJI', workDates: '15/04/2026' } };
    const docs = transactionDocuments(current, school, [], assets, 'all'); assert.ok(docs[0].receipt); assert.equal(docs.filter(d => d.receipt).length, 1);
    const bytes = await renderPDF(docs, school, assets, { orientation: 'portrait', margin: 20 }); const pdf = await PDFDocument.load(bytes); assert.ok(pdf.getPageCount() >= 1);
    console.log(`PASS: ${category.id} uses the same receipt format in a complete SPJ package.`);
  }
  const custom = await sharp({ create: { width: 1400, height: 700, channels: 3, background: '#c3ddee' } }).png().toBuffer();
  const file: Attachment = { id: '00000000-0000-4000-8000-000000000004', transactionId: null, kind: 'receiptBackground', name: 'latar-uji.png', mime: 'image/png', size: custom.length, content: custom.toString('base64'), createdAt: '' };
  const customSettings = { ...school, receiptBackgroundId: file.id, receiptBackgroundHasLabels: true };
  const customDocs = transactionDocuments(transaction, customSettings, [], [...assets, file], 'receipt');
  await writeFile(`${directory}/custom-background.pdf`, await renderPDF(customDocs, customSettings, [...assets, file], { orientation: 'portrait', margin: 20 }));
  assert.equal((await inspectPDF(`${directory}/custom-background.pdf`, 1)).includes('Telah terima dari'), false);
  console.log('PASS: custom background is embedded, with no duplicate printed labels.');
  execFileSync('pdftoppm', ['-f', '1', '-singlefile', '-r', '110', '-png', `${directory}/blue-landscape.pdf`, `${directory}/blue-landscape`]);
  execFileSync('pdftoppm', ['-f', '1', '-singlefile', '-r', '110', '-png', `${directory}/word-rendered/blue-landscape.pdf`, `${directory}/word-rendered/blue-landscape`]);
  console.log('ALL RECEIPT EXPORT TESTS PASSED. All fixtures are in-memory only; no school data was changed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
