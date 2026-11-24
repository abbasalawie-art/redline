// Usage: node tests/export-test.mjs <input.pdf> <output.pdf> [--flatten]
import fs from 'node:fs';
import * as PDFLib from '../app/vendor/pdf-lib/pdf-lib.esm.min.js';
import { makeFont } from '../app/js/text.js';
import { exportPdf, importPdf } from '../app/js/pdf-export.js';
import { sampleMarkups } from './sample-markups.mjs';

const [input, output, flag] = process.argv.slice(2);
const font = makeFont(PDFLib);
const bytes = new Uint8Array(fs.readFileSync(input));
const markups = [...sampleMarkups(0), ...sampleMarkups(1)];
const out = await exportPdf(PDFLib, bytes, markups, { font, author: 'Redline test', flatten: flag === '--flatten' });
fs.writeFileSync(output, out);
console.log('wrote', output, out.length, 'bytes,', markups.length, 'markups');

if (flag !== '--flatten') {
  const back = await importPdf(PDFLib, out);
  const ok = back.markups.length === markups.length;
  console.log('re-import:', back.markups.length, 'markups', ok ? 'OK' : 'MISMATCH', '| base size', back.baseBytes.length);
  const again = await importPdf(PDFLib, back.baseBytes);
  console.log('base has', again.markups.length, 'Redline markups left (want 0)');
  const a = JSON.stringify(markups.map(m => m.id).sort()), b = JSON.stringify(back.markups.map(m => m.id).sort());
  console.log('ids match:', a === b);
  if (!ok || a !== b || again.markups.length) process.exit(1);
}
