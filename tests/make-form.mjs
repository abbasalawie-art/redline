// Makes tests/test-form.pdf: a small fillable form (text, multi-line text, tick box, Yes / No / N-A choice, drop-down).
// Usage: node tests/make-form.mjs
import fs from 'node:fs';
import * as PDFLib from '../app/vendor/pdf-lib/pdf-lib.esm.min.js';

const { PDFDocument, StandardFonts, rgb } = PDFLib;
const doc = await PDFDocument.create();
const page = doc.addPage([595.28, 841.89]);
const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
const form = doc.getForm();
const label = (t, x, y, f = font, size = 11) => page.drawText(t, { x, y, size, font: f, color: rgb(0.1, 0.1, 0.1) });

label('Client services confirmation (test form)', 50, 780, bold, 16);
label('Site address', 50, 735);
form.createTextField('site.address').addToPage(page, { x: 160, y: 728, width: 380, height: 22 });
label('Comments', 50, 690);
const comments = form.createTextField('comments');
comments.enableMultiline();
comments.addToPage(page, { x: 160, y: 620, width: 380, height: 84 });
label('Emergency lighting to all exits?', 50, 580);
const radio = form.createRadioGroup('emergency.exits');
['Yes', 'No', 'NA'].forEach((opt, i) => { radio.addOptionToPage(opt, page, { x: 260 + i * 80, y: 574, width: 16, height: 16 }); label(opt === 'NA' ? 'N/A' : opt, 282 + i * 80, 578); });
label('Include data points', 50, 540);
form.createCheckBox('data.points').addToPage(page, { x: 260, y: 534, width: 16, height: 16 });
label('Switch plate range', 50, 500);
const dd = form.createDropdown('switch.range');
dd.addOptions(['HPM Linea', 'Clipsal Iconic', 'Clipsal Saturn', 'By builder']);
dd.addToPage(page, { x: 160, y: 493, width: 200, height: 22 });
label('Signed', 50, 420);
page.drawLine({ start: { x: 160, y: 418 }, end: { x: 400, y: 418 }, thickness: 0.8, color: rgb(0.2, 0.2, 0.2) });

fs.writeFileSync('tests/test-form.pdf', await doc.save());
console.log('wrote tests/test-form.pdf');
