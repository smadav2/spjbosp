import { drawReceiptPDF, receiptWordParagraphs } from './receipt-renderers';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { AlignmentType, BorderStyle, Document, ExternalHyperlink, Footer, ImageRun, Packer, PageNumber, PageOrientation, Paragraph, SectionType, Table, TableCell, TableRow, TextRun, VerticalAlignTable, WidthType } from 'docx';
import ExcelJS from 'exceljs';
import sharp from 'sharp';
import type { Block, DocumentPage } from './document-model';
import { CATEGORIES, FULL_MONTHS, STATUS_LABELS, categoryOf, letterheadLines, transactionStatus, type Attachment, type SchoolProfile, type Transaction } from './domain';
export interface PrintOptions { orientation: 'portrait' | 'landscape'; margin: number; origin?: string }
const mm = (n: number) => n * 72 / 25.4;
const twips = (n: number) => Math.round(n * 1440 / 25.4);
const content = (f: Attachment) => Buffer.from(f.content || '', 'base64');
function widthsOf(count: number, widths?: number[]) { const usable = widths?.length === count ? widths : Array(count).fill(1 / count) as number[]; const total = usable.reduce((a, b) => a + b, 0); return usable.map(v => v / total); }
function wrap(value: string, font: PDFFont, size: number, width: number) {
  const result: string[] = [];
  for (const paragraph of value.replace(/\r/g, '').replace(/\t/g, '    ').split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      const candidate = line ? line + ' ' + word : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) { line = candidate; continue; }
      if (line) { result.push(line); line = ''; }
      for (const char of word) { if (font.widthOfTextAtSize(line + char, size) > width && line) { result.push(line); line = ''; } line += char; }
    }
    result.push(line);
  }
  return result;
}
export async function renderPDF(documents: DocumentPage[], school: SchoolProfile, assets: Attachment[], options: PrintOptions) {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Dokumen SPJ BOSP'); pdf.setCreator('Aplikasi Administrasi & Cetak SPJ BOSP Sekolah');
  const regular = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const [w, h] = options.orientation === 'landscape' ? [mm(330), mm(215)] : [mm(215), mm(330)];
  const margin = mm(options.margin), usable = w - margin * 2;
  let page: PDFPage; let y = h - margin;
  const newPage = () => { page = pdf.addPage([w, h]); y = h - margin; };
  const ensure = (height: number) => { if (y - height < margin + 12) newPage(); };
  const write = (value: string, size = 12, isBold = false, center = false) => {
    const font = isBold ? bold : regular;
    const rows = wrap(value, font, size, usable);
    for (const row of rows) { ensure(size * 1.45); page.drawText(row, { x: center ? (w - font.widthOfTextAtSize(row, size)) / 2 : margin, y: y - size, size, font }); y -= size * 1.45; }
    y -= 8;
  };
  const imageEmbed = async (f: Attachment) => f.mime === 'image/png' ? pdf.embedPng(content(f)) : pdf.embedJpg(content(f));
  const drawTable = (block: Extract<Block, { type: 'table' }>) => {
    if (!block.rows.length && !block.headers.length) return;
    const count = block.headers.length || block.rows[0].length;
    const colWidths = widthsOf(count, block.widths).map(v => v * usable);
    const drawRow = (cells: string[], isHeader: boolean) => {
      const font = isHeader ? bold : regular;
      const cellLines = cells.map((value, i) => wrap(value || '', font, 12, Math.max(10, colWidths[i] - 12)));
      const totalLines = Math.max(1, ...cellLines.map(c => c.length));
      let start = 0;
      while (start < totalLines) {
        let availableLines = Math.floor((y - margin - 24) / 16);
        if (availableLines < 2) { newPage(); if (!isHeader && block.headers.length) drawRow(block.headers, true); availableLines = Math.floor((y - margin - 24) / 16); }
        if (totalLines - start <= Math.floor((h - 2 * margin - 60) / 16) && totalLines - start > availableLines) { newPage(); if (!isHeader && block.headers.length) drawRow(block.headers, true); availableLines = Math.floor((y - margin - 24) / 16); }
        const take = Math.min(totalLines - start, Math.max(1, availableLines));
        const rowHeight = Math.max(30, take * 16 + 12);
        let x = margin;
        for (let i = 0; i < count; i++) {
          page.drawRectangle({ x, y: y - rowHeight, width: colWidths[i], height: rowHeight, borderColor: rgb(0.25, 0.25, 0.25), borderWidth: 0.5, ...(isHeader ? { color: rgb(0.95, 0.95, 0.95) } : {}) });
          cellLines[i]?.slice(start, start + take).forEach((row, n) => page.drawText(row, { x: x + 6, y: y - 18 - n * 16, size: 12, font }));
          x += colWidths[i];
        }
        y -= rowHeight; start += take;
      }
    };
    if (block.headers.length) { ensure(64); drawRow(block.headers, true); }
    for (const row of block.rows) drawRow(row, false);
    y -= 16;
  };
  for (const document of documents) {
    newPage();
    if (document.receipt) {
      const receiptHeight = await drawReceiptPDF(pdf, page!, document.receipt, school, assets, margin, y, usable, regular, bold);
      y -= receiptHeight + 18;
    }
    if (document.letterhead) {
      const leftLogo = assets.find(f => f.id === school.logoId);
      const rightLogo = assets.find(f => f.id === school.rightLogoId);
      const head = letterheadLines(school);
      const logoSize = mm(21), gap = mm(5);
      const topY = y;
      const centerX = margin + (leftLogo ? logoSize + gap : 0);
      const centerW = usable - (leftLogo ? logoSize + gap : 0) - (rightLogo ? logoSize + gap : 0);
      if (leftLogo) { const image = await imageEmbed(leftLogo); const dim = image.scaleToFit(logoSize, logoSize); page!.drawImage(image, { x: margin + (logoSize - dim.width) / 2, y: topY - logoSize + (logoSize - dim.height) / 2, ...dim }); }
      if (rightLogo) { const image = await imageEmbed(rightLogo); const dim = image.scaleToFit(logoSize, logoSize); page!.drawImage(image, { x: w - margin - logoSize + (logoSize - dim.width) / 2, y: topY - logoSize + (logoSize - dim.height) / 2, ...dim }); }
      let hy = topY;
      const headLine = (value: string, size: number, isBold = false, underline = false) => { if (!value) return; const font = isBold ? bold : regular; for (const row of wrap(value, font, size, centerW)) { const x = centerX + (centerW - font.widthOfTextAtSize(row, size)) / 2; page!.drawText(row, { x, y: hy - size, size, font }); if (underline) page!.drawLine({ start: { x, y: hy - size - 1.5 }, end: { x: x + font.widthOfTextAtSize(row, size), y: hy - size - 1.5 }, thickness: .6 }); hy -= size * 1.25; } };
      headLine(head.government, 12);
      headLine(head.department, 15);
      headLine(head.school || '—', 17, true);
      if (school.letterhead) headLine(school.letterhead, 11, true);
      headLine(head.address, 10.5);
      headLine(head.contacts, 10, false, true);
      if (!head.contacts && head.npsn) headLine(head.npsn, 9.5);
      y = Math.min(hy, topY - logoSize) - 7;
      page!.drawLine({ start: { x: margin, y }, end: { x: w - margin, y }, thickness: .8 });
      page!.drawLine({ start: { x: margin, y: y - 2.2 }, end: { x: w - margin, y: y - 2.2 }, thickness: 2.1 });
      y -= 20;
    }
    if (!document.receipt && document.showTitle !== false) { write(document.title, 14, true, true); y -= 8; }
    for (const block of document.blocks) {
      if (block.type === 'text') { if (block.value.trim() === 'MEMUTUSKAN' && y - mm(62) < margin) newPage(); write(block.value, block.size || 12, block.bold, block.center); }
      if (block.type === 'table') drawTable(block);
      if (block.type === 'kv') {
        const labelW = mm(block.labelWidth ?? 34), valueX = margin + labelW + mm(2), valueW = usable - labelW - mm(2) - (block.right ? mm(62) : 0);
        block.rows.forEach(([label, value], index) => {
          const rows = wrap(value || '', regular, 12, valueW);
          ensure(rows.length * 17 + 12);
          const base = y;
          wrap(label, regular, 12, labelW - mm(2)).forEach((row, i) => page!.drawText(row, { x: margin, y: base - 12 - i * 16, size: 12, font: regular }));
          page!.drawText(':', { x: margin + labelW - mm(1), y: base - 12, size: 12, font: regular });
          rows.forEach((row, i) => page!.drawText(row, { x: valueX, y: base - 12 - i * 16, size: 12, font: regular }));
          if (index === 0 && block.right) page!.drawText(block.right, { x: w - margin - regular.widthOfTextAtSize(block.right, 12), y: base - 12, size: 12, font: regular });
          y = base - Math.max(17, rows.length * 16) - 6;
        });
        y -= 8;
      }
      if (block.type === 'diktum') {
        const labelW = mm(30), gap = mm(2), valueX = margin + labelW + gap, valueW = usable - labelW - gap;
        for (const row of block.rows) {
          const wrapped: { text: string; indent: number }[] = [];
          for (const paragraph of (row.value || '').split('\n')) wrap(paragraph, regular, 12, valueW - mm(7)).forEach((line, i) => wrapped.push({ text: line, indent: i ? mm(7) : 0 }));
          if (!wrapped.length) wrapped.push({ text: '-', indent: 0 });
          ensure(wrapped.length * 15 + 12);
          const base = y;
          wrap(row.label, regular, 12, labelW - mm(3)).forEach((line, i) => page!.drawText(line, { x: margin, y: base - 12 - i * 16, size: 12, font: regular }));
          page!.drawText(':', { x: margin + labelW - mm(1), y: base - 12, size: 12, font: regular });
          wrapped.forEach((line, i) => page!.drawText(line.text, { x: valueX + line.indent, y: base - 12 - i * 15, size: 12, font: regular }));
          y = base - wrapped.length * 15 - 8;
        }
        y -= 4;
      }
      if (block.type === 'tembusan') {
        ensure(24 + block.items.length * 13); y -= 4;
        write('Tembusan:', 11, false);
        block.items.forEach((item, i) => write(`${i + 1}. ${item}`, 10));
      }
      if (block.type === 'decree-sign') {
        const width = usable * .52, x0 = margin + usable - width, center = x0 + width / 2;
        const followUp = Math.max(0, documents.indexOf(document)); void followUp;
        ensure(146);
        page!.drawText(block.placeLine, { x: x0, y: y - 12, size: 12, font: regular }); y -= 17;
        page!.drawText(block.dateLine, { x: x0, y: y - 12, size: 12, font: regular }); y -= 16;
        const centered = (value: string, size = 12, isBold = false, underline = false) => { const font = isBold ? bold : regular; const x = center - font.widthOfTextAtSize(value, size) / 2; page!.drawText(value, { x, y: y - size, size, font }); if (underline) page!.drawLine({ start: { x, y: y - size - 1.7 }, end: { x: x + font.widthOfTextAtSize(value, size), y: y - size - 1.7 }, thickness: .7 }); y -= size * 1.3; };
        centered(block.role, 12);
        centered(block.schoolLine, 12);
        if (block.image) { const image = await imageEmbed(block.image); const dim = image.scaleToFit(width * .42, 40); page!.drawImage(image, { x: center - dim.width / 2, y: y - dim.height, ...dim }); y -= dim.height + 2; }
        else y -= 42;
        centered(block.name, 12, true, true);
        if (block.nip) centered(`NIP. ${block.nip}`, 11);
      }
      if (block.type === 'signatures') {
        const cellWidth = usable / block.signers.length;
        const nameLines = block.signers.map(s => wrap(s.name, bold, 12, cellWidth - 16));
        const maxNames = Math.max(...nameLines.map(n => n.length));
        const required = 164 + maxNames * 16;
        ensure(required);
        if (block.date) { const dateRows = wrap(block.date, regular, 12, usable); for (const row of dateRows) { page!.drawText(row, { x: w - margin - regular.widthOfTextAtSize(row, 12), y: y - 12, size: 12, font: regular }); y -= 17; } }
        y -= 15;
        for (let i = 0; i < block.signers.length; i++) {
          const signer = block.signers[i]; const center = margin + cellWidth * (i + 0.5);
          wrap(signer.role, regular, 12, cellWidth - 14).forEach((row, n) => page!.drawText(row, { x: center - regular.widthOfTextAtSize(row, 12) / 2, y: y - 12 - n * 16, size: 12, font: regular }));
          if (signer.image) { const image = await imageEmbed(signer.image); const dim = image.scaleToFit(cellWidth - 35, 50); page!.drawImage(image, { x: center - dim.width / 2, y: y - 95, ...dim }); }
          nameLines[i].forEach((row, n) => page!.drawText(row, { x: center - bold.widthOfTextAtSize(row, 12) / 2, y: y - 112 - n * 16, size: 12, font: bold }));
          if (signer.nip) { const nip = `NIP. ${signer.nip}`; page!.drawText(nip, { x: center - regular.widthOfTextAtSize(nip, 10) / 2, y: y - 116 - nameLines[i].length * 16, size: 10, font: regular }); }
        }
        y -= required;
      }
      if (block.type === 'image' && block.file.content) {
        if (block.file.mime === 'application/pdf') {
          const source = await PDFDocument.load(content(block.file));
          for (let i = 0; i < source.getPageCount(); i++) {
            if (i > 0) newPage();
            const embedded = await pdf.embedPage(source.getPages()[i]);
            const scale = Math.min(usable / embedded.width, (y - margin - 15) / embedded.height);
            const width = embedded.width * scale, height = embedded.height * scale;
            page!.drawPage(embedded, { x: (w - width) / 2, y: y - height, width, height });
            y -= height + 12;
          }
        } else {
          ensure(180); const embedded = await imageEmbed(block.file); const dim = embedded.scaleToFit(usable, y - margin - 15); page!.drawImage(embedded, { x: (w - dim.width) / 2, y: y - dim.height, ...dim }); y -= dim.height + 12;
        }
      }
    }
  }
  pdf.getPages().forEach((p, i) => { const label = `Halaman ${i + 1} dari ${pdf.getPageCount()}`; p.drawText(label, { x: (w - regular.widthOfTextAtSize(label, 10)) / 2, y: Math.max(12, margin / 2), size: 10, font: regular }); });
  return pdf.save();
}
const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const borders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
export async function renderWord(documents: DocumentPage[], school: SchoolProfile, assets: Attachment[], options: PrintOptions) {
  const landscape = options.orientation === 'landscape';
  const width = twips(landscape ? 330 : 215), height = twips(landscape ? 215 : 330);
  const margin = twips(options.margin); const available = width - margin * 2;
  const para = (text: string, bold = false, center = false) => new Paragraph({ alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT, spacing: { after: 160, line: 280 }, children: text.split('\n').flatMap((line, i) => [new TextRun({ text: line, bold, ...(i > 0 ? { break: 1 } : {}) })]) });
  const imageRun = async (file: Attachment, maxWidth = 550, maxHeight = 820) => { const data = content(file); const meta = await sharp(data).metadata(); const scale = Math.min(maxWidth / (meta.width || maxWidth), maxHeight / (meta.height || maxHeight), 1); return new ImageRun({ data, type: file.mime === 'image/png' ? 'png' : 'jpg', transformation: { width: Math.round((meta.width || maxWidth) * scale), height: Math.round((meta.height || maxHeight) * scale) } }); };
  const sections = [];
  for (const page of documents) {
    const children: (Paragraph | Table)[] = [];
    if (page.receipt) children.push(...await receiptWordParagraphs(page.receipt, school, assets, options.margin, available / 1440 * 25.4));
    if (page.letterhead) {
      const head = letterheadLines(school);
      const leftLogo = assets.find(f => f.id === school.logoId);
      const rightLogo = assets.find(f => f.id === school.rightLogoId);
      const headCell = (children: Paragraph[] = [], fraction = .15) => new TableCell({ borders, verticalAlign: VerticalAlignTable.CENTER, width: { size: Math.floor(available * fraction), type: WidthType.DXA }, children });
      const headPara = (value: string, size: number, bold = false, underline = false) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 20, line: 240 }, children: [new TextRun({ text: value, size, bold, ...(underline ? { underline: {} } : {}) })] });
      const center: Paragraph[] = [];
      if (head.government) center.push(headPara(head.government, 24));
      if (head.department) center.push(headPara(head.department, 30));
      center.push(headPara(head.school || '—', 34, true));
      if (school.letterhead) center.push(headPara(school.letterhead, 22, true));
      if (head.address) center.push(headPara(head.address, 21));
      if (head.contacts) center.push(headPara(head.contacts, 20, false, true));
      if (!head.contacts && head.npsn) center.push(headPara(head.npsn, 19));
      children.push(new Table({ width: { size: available, type: WidthType.DXA }, borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder }, rows: [new TableRow({ children: [headCell(leftLogo ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [await imageRun(leftLogo, 54, 54)] })] : []), headCell(center, .7), headCell(rightLogo ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [await imageRun(rightLogo, 54, 54)] })] : [])] })] }));
      children.push(new Paragraph({ border: { bottom: { color: '000000', size: 18, style: BorderStyle.DOUBLE, space: 1 } }, spacing: { after: 240 }, children: [new TextRun({ text: '', size: 2 })] }));
    }
    if (!page.receipt && page.showTitle !== false) children.push(new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 200, after: 300 }, children: [new TextRun({ text: page.title, bold: true, size: 28 })] }));
    for (const block of page.blocks) {
      if (block.type === 'text') children.push(new Paragraph({ alignment: block.center ? AlignmentType.CENTER : AlignmentType.LEFT, keepNext: block.value.trim() === 'MEMUTUSKAN', spacing: { after: 160, line: 280 }, children: block.value.split('\n').flatMap((line, i) => [new TextRun({ text: line, bold: block.bold, ...(i > 0 ? { break: 1 } : {}) })]) }));
      if (block.type === 'table' && (block.rows.length || block.headers.length)) {
        const count = block.headers.length || block.rows[0].length;
        const colWidths = widthsOf(count, block.widths).map(v => Math.floor(v * available)); colWidths[colWidths.length - 1] += available - colWidths.reduce((s, v) => s + v, 0);
        const rows = [...(block.headers.length ? [block.headers] : []), ...block.rows];
        children.push(new Table({ width: { size: available, type: WidthType.DXA }, columnWidths: colWidths, rows: rows.map((row, i) => new TableRow({ tableHeader: block.headers.length > 0 && i === 0, cantSplit: row.every(cell => cell.length < 600), children: row.map((cell, c) => new TableCell({ width: { size: colWidths[c], type: WidthType.DXA }, margins: { top: 110, bottom: 110, left: 100, right: 100 }, children: [para(cell, block.headers.length > 0 && i === 0)] })) })) }));
        children.push(para(''));
      }
      if (block.type === 'kv' || block.type === 'diktum') {
        const labelRatio = block.type === 'kv' ? .3 : .22;
        const rows: [string, string][] = block.type === 'kv' ? block.rows : block.rows.map(row => [row.label, row.value]);
        const labelWidth = Math.floor(available * labelRatio), valueWidth = available - labelWidth;
        const cell = (size: number, children: Paragraph[], right = false) => new TableCell({ borders, width: { size, type: WidthType.DXA }, margins: { top: 40, bottom: 40, left: right ? 40 : 0, right: 60 }, children });
        const tableRows = rows.map(([label, value], index) => new TableRow({ cantSplit: false, children: [cell(labelWidth, [new Paragraph({ children: [new TextRun(label)] })]), cell(valueWidth, value.split('\n').map(line => new Paragraph({ spacing: { after: 20, line: 250 }, children: [new TextRun(line)] }))), ...(block.type === 'kv' && index === 0 && block.right ? [cell(Math.floor(available * .28), [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun(block.right)] })], true)] : [])] }));
        const widths = block.type === 'kv' && block.right ? [Math.floor(available * .27), Math.floor(available * .45), Math.floor(available * .28)] : [labelWidth, valueWidth];
        children.push(new Table({ width: { size: available, type: WidthType.DXA }, columnWidths: widths, borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder }, rows: tableRows }));
        children.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
      }
      if (block.type === 'decree-sign') {
        children.push(new Paragraph({ alignment: AlignmentType.LEFT, indent: { left: Math.floor(available * .45) }, children: [new TextRun(block.placeLine)] }));
        children.push(new Paragraph({ alignment: AlignmentType.LEFT, indent: { left: Math.floor(available * .45) }, spacing: { after: 240 }, children: [new TextRun(block.dateLine)] }));
        children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun(block.role)] }));
        children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun(block.schoolLine)] }));
        if (block.image) children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [await imageRun(block.image, 110, 60)] }));
        else children.push(new Paragraph({ spacing: { before: 900 }, children: [] }));
        children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: block.name, bold: true, underline: {} })] }));
        if (block.nip) children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun(`NIP. ${block.nip}`)] }));
        children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
      }
      if (block.type === 'tembusan') {
        children.push(new Paragraph({ spacing: { before: 240 }, children: [new TextRun({ text: 'Tembusan:', size: 22 })] }));
        block.items.forEach((item, i) => children.push(new Paragraph({ spacing: { after: 20 }, indent: { left: 260 }, children: [new TextRun({ text: `${i + 1}. ${item}`, size: 20 })] })));
      }
      if (block.type === 'signatures') {
        if (block.date) children.push(new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 260, after: 200 }, keepNext: true, children: [new TextRun(block.date)] }));
        const cells = [];
        for (const signer of block.signers) {
          const contentChildren = [para(signer.role, false, true)];
          if (signer.image) contentChildren.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 100, after: 100 }, children: [await imageRun(signer.image, 110, 65)] }));
          else contentChildren.push(new Paragraph({ spacing: { before: 900 }, children: [] }));
          contentChildren.push(para(signer.name, true, true));
          if (signer.nip) contentChildren.push(para(`NIP. ${signer.nip}`, false, true));
          cells.push(new TableCell({ borders, width: { size: Math.floor(available / block.signers.length), type: WidthType.DXA }, children: contentChildren }));
        }
        children.push(new Table({ width: { size: available, type: WidthType.DXA }, borders: { ...borders, insideHorizontal: noBorder, insideVertical: noBorder }, rows: [new TableRow({ cantSplit: true, children: cells })] }));
      }
      if (block.type === 'image' && block.file.content) {
        if (block.file.mime === 'application/pdf') {
          children.push(para('Lampiran PDF asli disertakan dalam paket PDF. Buka tautan berikut untuk mengunduh berkas aslinya.'));
          children.push(new Paragraph({ children: [new ExternalHyperlink({ link: `${options.origin || ''}/api/spj?route=files/${block.file.id}`, children: [new TextRun({ text: block.file.name, style: 'Hyperlink' })] })] }));
        } else children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [await imageRun(block.file, (available / 1440) * 96, ((height - margin * 2) / 1440) * 96 - 150)] }));
      }
    }
    sections.push({ properties: { type: SectionType.NEXT_PAGE, page: { size: { width: twips(215), height: twips(330), orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT }, margin: { top: margin, bottom: margin, left: margin, right: margin, footer: twips(8) } } }, footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ['Halaman ', PageNumber.CURRENT, ' dari ', PageNumber.TOTAL_PAGES], size: 20 })] })] }) }, children });
  }
  const document = new Document({ creator: 'SPJ BOSP Sekolah', title: 'Dokumen SPJ BOSP', styles: { default: { document: { run: { font: 'Times New Roman', size: 24 }, paragraph: { spacing: { line: 280 } } } } }, sections });
  return Packer.toBuffer(document);
}
export async function renderExcel(list: Transaction[], school: SchoolProfile, year: number) {
  const workbook = new ExcelJS.Workbook(); workbook.creator = 'SPJ BOSP Sekolah';
  const sheet = (title: string, columns: string[], rows: (string | number)[][]) => { const s = workbook.addWorksheet(title); s.addRow([school.name || 'Identitas sekolah belum diisi']); s.addRow([`Tahun anggaran ${year}`]); s.addRow(columns); rows.forEach(row => s.addRow(row)); s.views = [{ state: 'frozen', ySplit: 3 }]; s.getRow(3).font = { bold: true, color: { argb: 'FFFFFFFF' } }; s.getRow(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF152C45' } }; s.columns.forEach((col, i) => { col.width = i === 0 ? 24 : 28; }); s.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: columns.length } }; s.eachRow(row => { row.alignment = { vertical: 'middle', wrapText: true }; }); return s; };
  const txRows = (ts: Transaction[]) => ts.map(t => [t.number, t.date, t.title, categoryOf(t.category).label, t.amount, STATUS_LABELS[transactionStatus(t, school)]]);
  sheet('Seluruh transaksi', ['Nomor kuitansi', 'Tanggal', 'Kegiatan', 'Kategori', 'Nominal (Rp)', 'Kelengkapan'], txRows(list)).getColumn(5).numFmt = '#,##0';
  sheet('Rekap bulanan', ['Bulan', 'Jumlah transaksi', 'Total (Rp)'], FULL_MONTHS.map((m, i) => { const ts = list.filter(t => Number(t.date.slice(5, 7)) === i + 1); return [m, ts.length, ts.reduce((s, t) => s + t.amount, 0)]; })).getColumn(3).numFmt = '#,##0';
  sheet('Rekap kategori', ['Kategori', 'Jumlah transaksi', 'Total (Rp)'], CATEGORIES.map(c => { const ts = list.filter(t => t.category === c.id); return [c.label, ts.length, ts.reduce((s, t) => s + t.amount, 0)]; })).getColumn(3).numFmt = '#,##0';
  sheet('Dokumen belum lengkap', ['Nomor kuitansi', 'Tanggal', 'Kegiatan', 'Kategori', 'Nominal (Rp)', 'Kelengkapan'], txRows(list.filter(t => transactionStatus(t, school) !== 'complete'))).getColumn(5).numFmt = '#,##0';
  const types = [...new Set(list.map(t => String(t.data.purchaseType || categoryOf(t.category).short)))];
  sheet('Jenis belanja', ['Jenis belanja', 'Jumlah transaksi', 'Total (Rp)'], types.map(type => { const ts = list.filter(t => String(t.data.purchaseType || categoryOf(t.category).short) === type); return [type, ts.length, ts.reduce((s, t) => s + t.amount, 0)]; })).getColumn(3).numFmt = '#,##0';
  return workbook.xlsx.writeBuffer();
}
