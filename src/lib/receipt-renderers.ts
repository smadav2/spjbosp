import { PDFDocument, rgb, StandardFonts, type PDFPage, type PDFFont } from 'pdf-lib';
import { AlignmentType, FrameAnchorType, FrameWrap, HeightRule, HorizontalPositionRelativeFrom, ImageRun, LineRuleType, Paragraph, TextRun, TextWrappingType, UnderlineType, VerticalPositionRelativeFrom } from 'docx';
import sharp from 'sharp';
import { fitReceiptText, receiptDimensions, receiptElements, type ReceiptContent } from './receipt-layout';
import { receiptArtwork } from './receipt-artwork';
import type { Attachment, SchoolProfile } from './domain';
const pt = (mm: number) => mm * 72 / 25.4;
export async function drawReceiptPDF(pdf: PDFDocument, page: PDFPage, data: ReceiptContent, school: SchoolProfile, assets: Attachment[], left: number, top: number, available: number, regular: PDFFont, bold: PDFFont) {
  const dims = receiptDimensions(school, available * 25.4 / 72);
  const width = pt(dims.width), height = pt(dims.height);
  const artwork = await receiptArtwork(school, assets);
  if (artwork) page.drawImage(await pdf.embedPng(artwork), { x: left, y: top - height, width, height });
  const elements = receiptElements(data, school, width, height);
  for (const slot of elements.images) {
    const file = assets.find(f => f.id === slot.id && f.content && f.mime.startsWith('image/'));
    if (!file) continue;
    const png = await sharp(Buffer.from(file.content!, 'base64')).trim({ threshold: 20 }).png().toBuffer().catch(() => sharp(Buffer.from(file.content!, 'base64')).png().toBuffer());
    const image = await pdf.embedPng(png);
    const size = image.scaleToFit(slot.width, slot.height);
    page.drawImage(image, { x: left + slot.x + (slot.width - size.width) / 2, y: top - slot.y - size.height, ...size });
  }
  for (const field of elements.texts) {
    const font = field.bold ? bold : regular;
    const fitted = fitReceiptText(field, (text, size) => font.widthOfTextAtSize(text, size));
    fitted.rows.forEach((row, i) => {
      const textWidth = font.widthOfTextAtSize(row, fitted.size);
      const x = left + field.x + (field.align === 'center' ? (field.width - textWidth) / 2 : 0);
      const y = top - field.y - fitted.size - i * fitted.lineHeight;
      page.drawText(row, { x, y, size: fitted.size, font, color: rgb(.055, .055, .055) });
      if (field.underline && row.trim()) page.drawLine({ start: { x, y: y - 1.6 }, end: { x: x + textWidth, y: y - 1.6 }, color: rgb(.1, .1, .1), thickness: .55 });
    });
  }
  return height;
}
let metricFonts: Promise<{ regular: PDFFont; bold: PDFFont }> | undefined;
async function fontsForMetrics() { if (!metricFonts) metricFonts = PDFDocument.create().then(async doc => ({ regular: await doc.embedFont(StandardFonts.TimesRoman), bold: await doc.embedFont(StandardFonts.TimesRomanBold) })); return metricFonts; }
export async function receiptWordParagraphs(data: ReceiptContent, school: SchoolProfile, assets: Attachment[], marginMm: number, availableMm: number) {
  const dims = receiptDimensions(school, availableMm);
  const width = pt(dims.width), height = pt(dims.height), left = pt(marginMm), top = pt(marginMm);
  const { regular, bold } = await fontsForMetrics();
  const runs: ImageRun[] = [];
  const floatingImage = (bytes: Buffer, x: number, y: number, w: number, h: number, behind = false) => new ImageRun({ type: 'png', data: bytes, transformation: { width: w * 96 / 72, height: h * 96 / 72 }, altText: { name: behind ? 'Latar kuitansi' : 'Tanda tangan terunggah', description: behind ? 'Latar saja; semua isian adalah teks yang dapat diedit.' : 'Gambar tanda tangan yang dimasukkan pengguna', title: '' }, floating: { horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: Math.round(x * 12700) }, verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: Math.round(y * 12700) }, behindDocument: behind, allowOverlap: true, lockAnchor: true, layoutInCell: false, wrap: { type: TextWrappingType.NONE } } });
  const background = await receiptArtwork(school, assets);
  if (background) runs.push(floatingImage(background, left, top, width, height, true));
  const elements = receiptElements(data, school, width, height);
  for (const slot of elements.images) {
    const file = assets.find(f => f.id === slot.id && f.content && f.mime.startsWith('image/'));
    if (!file) continue;
    const bytes = await sharp(Buffer.from(file.content!, 'base64')).trim({ threshold: 20 }).png().toBuffer().catch(() => sharp(Buffer.from(file.content!, 'base64')).png().toBuffer());
    const meta = await sharp(bytes).metadata();
    const ratio = Math.min(slot.width / (meta.width || 1), slot.height / (meta.height || 1));
    const w = (meta.width || 1) * ratio, h = (meta.height || 1) * ratio;
    runs.push(floatingImage(bytes, left + slot.x + (slot.width - w) / 2, top + slot.y, w, h));
  }
  const paragraphs: Paragraph[] = [new Paragraph({ spacing: { before: 0, after: 0, line: 1, lineRule: LineRuleType.EXACT }, children: runs.length ? runs : [new TextRun({ text: '', size: 1 })] })];
  for (const field of elements.texts) {
    const font = field.bold ? bold : regular;
    const fit = fitReceiptText(field, (text, size) => font.widthOfTextAtSize(text, size));
    paragraphs.push(new Paragraph({
      frame: { type: 'absolute', position: { x: Math.round((left + field.x) * 20), y: Math.round((top + field.y) * 20) }, width: Math.round(field.width * 20), height: Math.ceil((field.height + 2) * 20), anchor: { horizontal: FrameAnchorType.PAGE, vertical: FrameAnchorType.PAGE }, wrap: FrameWrap.NONE, anchorLock: true, rule: HeightRule.ATLEAST, space: { horizontal: 0, vertical: 0 } },
      alignment: field.align === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT,
      spacing: { before: 0, after: 0, line: Math.ceil(fit.lineHeight * 20), lineRule: LineRuleType.EXACT },
      widowControl: false,
      children: fit.rows.map((row, i) => new TextRun({ text: row, font: 'Times New Roman', size: Math.floor(fit.size * 2), color: '101010', bold: Boolean(field.bold), ...(field.underline ? { underline: { type: UnderlineType.SINGLE } } : {}), ...(i > 0 ? { break: 1 } : {}) })),
    }));
  }
  paragraphs.push(new Paragraph({ spacing: { before: Math.ceil((height + 16) * 20), after: 0, line: 1, lineRule: LineRuleType.EXACT }, children: [new TextRun({ text: '', size: 1 })] }));
  return paragraphs;
}
