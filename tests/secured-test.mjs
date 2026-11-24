// A "secured" PDF (owner password only) must still take markups and come out readable.
import fs from 'node:fs';
import * as PDFLib from '../app/vendor/pdf-lib/pdf-lib.esm.min.js';
import { makeFont } from '../app/js/text.js';
import { exportPdf, importPdf } from '../app/js/pdf-export.js';
import { sampleMarkups } from './sample-markups.mjs';
const [input, output] = process.argv.slice(2);
const bytes = new Uint8Array(fs.readFileSync(input));
const imp = await importPdf(PDFLib, bytes);
console.log('writable:', imp.writable, imp.error || '');
const out = await exportPdf(PDFLib, imp.baseBytes, sampleMarkups(0, 2), { font: makeFont(PDFLib), author: 'Redline test' });
fs.writeFileSync(output, out);
console.log('wrote', output, out.length);
