// Draws the app icon as SVG (the revision cloud comes from the app's own geometry code).
// Run:  node tools/make-icons.mjs  then  python tools/make-icons.py
import fs from 'node:fs';
import { cloud, rectCorners } from '../app/js/geometry.js';

const d = cmds => cmds.map(c => (c[0] === 'Z' ? 'Z' : c[0] + c.slice(1).map(n => n.toFixed(1)).join(' '))).join('');
function svg(pad) {
  const S = 512, r = { x: 96 + pad, y: 214 + pad * 0.4, w: 236 - pad * 1.2, h: 170 - pad * 1.1 };
  const c = cloud(rectCorners(r), 30 - pad * 0.12);
  const tip = { x: r.x + r.w * 0.78, y: r.y - 26 }, end = { x: 404 - pad * 0.7, y: 112 + pad * 0.7 };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
<rect width="${S}" height="${S}" fill="#e11d2a"/>
<path d="${d(c.stroke)}" fill="none" stroke="#fff" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M${tip.x.toFixed(1)} ${tip.y.toFixed(1)}L${end.x.toFixed(1)} ${end.y.toFixed(1)}" stroke="#fff" stroke-width="22" stroke-linecap="round"/>
<circle cx="${end.x.toFixed(1)}" cy="${end.y.toFixed(1)}" r="30" fill="#fff"/>
</svg>`;
}
fs.mkdirSync(new URL('../app/icons/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../app/icons/icon.svg', import.meta.url), svg(0));
fs.writeFileSync(new URL('../app/icons/icon-maskable.svg', import.meta.url), svg(44));
console.log('icon SVGs written');
