// Writes a small Word file and a small Excel file, so they can be opened and checked.
// Usage: node tests/office-test.mjs   (files land in tests/out/)
import fs from 'node:fs';
import { docx, xlsx } from '../app/js/office.js';
import { sampleAssets } from './sample-assets.mjs';

const a = sampleAssets();
const photo = a.get('jPHOTO'), disc = a.get('pDISC');
fs.mkdirSync('tests/out', { recursive: true });

const word = docx([
  { h: 'Site report', level: 0 },
  { p: 'Test drawing\n24 November 2026 · A. Tester', muted: true },
  { h: 'Pins', level: 1 },
  { h: '1. Exit sign missing above door D12', level: 2 },
  { p: 'Page 1' },
  { img: photo, width: 8 },
  { img: disc, width: 3 },
  { h: 'Symbol counts', level: 1 },
  { table: [['Symbol', 'Page 1', 'Total'], ['Exit sign', 2, 2], ['Spitfire <EM1> & "quotes"', 1, 1]], header: true, widths: [9, 3, 3] },
  { pageBreak: true },
  { p: 'Second page.' },
], { title: 'Site report', author: 'A. Tester' });
fs.writeFileSync('tests/out/office-test.docx', word);

const sheet = xlsx([
  { name: 'Pins', rows: [['No', 'Page', 'Note', 'Photo'], [1, 1, 'Exit sign missing above door D12', 'Yes'], [2, 1, '', 'No']], widths: [6, 6, 50, 8] },
  { name: 'Symbol counts', rows: [['Symbol', 'Page 1', 'Total'], ['Exit sign', 2, 2]], widths: [30, 10, 10] },
]);
fs.writeFileSync('tests/out/office-test.xlsx', sheet);
console.log('wrote tests/out/office-test.docx', word.length, 'bytes and tests/out/office-test.xlsx', sheet.length, 'bytes');
