// A set of markups covering every tool, used by the export test.
export function sampleMarkups(page, k = 1) {
  const base = { page, k, opacity: 1, width: 2, color: '#e11d2a', fill: null, textColor: '#e11d2a', fontSize: 12, head: 'closed', border: false };
  let n = 0;
  const id = () => `T${page}${String(n++).padStart(3, '0')}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  return [
    { ...base, id: id(), type: 'cloud', rect: { x: 100, y: 295, w: 300, h: 200 } },
    { ...base, id: id(), type: 'cloudplus', head: 'none', rect: { x: 500, y: 295, w: 200, h: 150 }, box: { ax: 600, ay: 180, align: 'c', w: null }, text: 'RELOCATE GPO 300 RIGHT\nTO CLEAR JOINERY' },
    { ...base, id: id(), type: 'callout', color: '#1d4ed8', textColor: '#1d4ed8', border: true, tip: { x: 180, y: 255 }, box: { ax: 250, ay: 160, align: 'l', w: null }, text: 'CHECK CABLE SIZE' },
    { ...base, id: id(), type: 'callout', color: '#15803d', textColor: '#111111', fill: '#fef08a', border: true, head: 'open', tip: { x: 520, y: 120 }, box: { ax: 440, ay: 60, align: 'r', w: 150 }, text: 'Wrapped note inside a fixed width box, filled yellow' },
    { ...base, id: id(), type: 'text', textColor: '#111111', fontSize: 18, box: { ax: 60, ay: 80, align: 'l', w: null }, text: 'Plain text 18 pt' },
    { ...base, id: id(), type: 'arrow', color: '#15803d', p1: { x: 60, y: 195 }, p2: { x: 160, y: 115 } },
    { ...base, id: id(), type: 'arrow', color: '#7c3aed', head: 'dot', width: 3, p1: { x: 720, y: 60 }, p2: { x: 800, y: 110 } },
    { ...base, id: id(), type: 'arrow', color: '#111111', head: 'none', width: 1, p1: { x: 720, y: 130 }, p2: { x: 800, y: 130 } },
    { ...base, id: id(), type: 'pen', color: '#1d4ed8', pts: [[430, 520], [445, 500], [460, 525], [475, 500], [490, 525], [505, 505]] },
    { ...base, id: id(), type: 'hl', color: '#facc15', width: 14, opacity: 0.45, pts: [[60, 30], [200, 30], [420, 32]] },
    { ...base, id: id(), type: 'rect', color: '#ea580c', fill: '#fed7aa', opacity: 0.5, rect: { x: 720, y: 300, w: 90, h: 60 } },
    { ...base, id: id(), type: 'ellipse', color: '#0891b2', width: 3, rect: { x: 720, y: 400, w: 90, h: 60 } },
  ];
}
