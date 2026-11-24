// Usage: node tests/export-test.mjs <input.pdf> <output.pdf> [--flatten]
import fs from 'node:fs';
import * as PDFLib from '../app/vendor/pdf-lib/pdf-lib.esm.min.js';
import { makeFont } from '../app/js/text.js';
import { exportPdf, importPdf } from '../app/js/pdf-export.js';
import { sampleMarkups } from './sample-markups.mjs';
import { sampleAssets } from './sample-assets.mjs';

const [input, output, flag] = process.argv.slice(2);
const font = makeFont(PDFLib);
const bytes = new Uint8Array(fs.readFileSync(input));
const markups = [...sampleMarkups(0), ...sampleMarkups(1)];
const assets = sampleAssets();
const out = await exportPdf(PDFLib, bytes, markups, { font, author: 'Redline test', flatten: flag === '--flatten', assets, title: 'Test drawing' });
fs.writeFileSync(output, out);
console.log('wrote', output, out.length, 'bytes,', markups.length, 'markups');

if (flag !== '--flatten') {
  const back = await importPdf(PDFLib, out);
  const ok = back.markups.length === markups.length;
  console.log('re-import:', back.markups.length, 'markups', ok ? 'OK' : 'MISMATCH', '| base size', back.baseBytes.length, 'vs original', bytes.length);
  const again = await importPdf(PDFLib, back.baseBytes);
  console.log('base has', again.markups.length, 'Redline markups left (want 0)');
  const a = JSON.stringify(markups.map(m => m.id).sort()), b = JSON.stringify(back.markups.map(m => m.id).sort());
  console.log('ids match:', a === b);
  const pagesOk = back.markups.every(m => m.page === markups.find(x => x.id === m.id).page);
  console.log('markups came back on their own pages:', pagesOk);
  const scaleOk = back.markups.filter(m => m.mpp).every(m => m.mpp === markups.find(x => x.id === m.id).mpp);
  console.log('drawing scale on measurements kept exactly:', scaleOk);

  const want = ['jPHOTO', 'pDISC', 'vEXIT'], got = back.assets.map(x => x.id).sort();
  const same = back.assets.every(x => {
    const o = assets.get(x.id);
    return x.kind === 'vec' ? JSON.stringify(x.items) === JSON.stringify(o.items) : Buffer.compare(Buffer.from(x.bytes), Buffer.from(o.bytes)) === 0;
  });
  const assetsOk = JSON.stringify(got) === JSON.stringify(want) && same;
  console.log('pictures and symbols carried in the file:', got.join(' '), assetsOk ? 'OK' : 'MISMATCH');

  const count = async b => (await PDFLib.PDFDocument.load(b)).getPageCount();
  const pagesIn = await count(bytes), pagesOut = await count(out), pagesBack = await count(back.baseBytes);
  console.log('pages: in', pagesIn, '| exported', pagesOut, '(photo pages added) | base after re-import', pagesBack, pagesBack === pagesIn ? 'OK' : 'MISMATCH');

  // A second trip must not make the file grow: nothing of ours may be left behind.
  const out2 = await exportPdf(PDFLib, back.baseBytes, back.markups, { font, author: 'Redline test', assets, title: 'Test drawing' });
  const back2 = await importPdf(PDFLib, out2);
  const growth = back2.baseBytes.length - back.baseBytes.length;
  console.log('second round trip grows the base by', growth, 'bytes', Math.abs(growth) < 400 ? 'OK' : 'LEAK');

  if (!ok || a !== b || again.markups.length || !pagesOk || !scaleOk || !assetsOk || pagesBack !== pagesIn || Math.abs(growth) >= 400) process.exit(1);
}
