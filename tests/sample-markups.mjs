// A set of markups covering every tool, used by the export test.
export function sampleMarkups(page, k = 1) {
  const base = { page, k, opacity: 1, width: 2, color: '#e11d2a', fill: null, textColor: '#e11d2a', fontSize: 12, head: 'closed', border: false };
  const mpp = 0.0352778;      // 1:100
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
    // ---- added with the toolkit ----
    { ...base, id: id(), type: 'cloud', color: '#7c3aed', pts: [[440, 470], [560, 460], [600, 520], [520, 560], [450, 540]] },
    { id: id(), page, k, type: 'stamp', sym: 'vEXIT', name: 'Exit sign', rect: { x: 60, y: 520, w: 45, h: 33 }, rot: 0, tint: null, opacity: 1 },
    { id: id(), page, k, type: 'stamp', sym: 'vEXIT', name: 'Exit sign', rect: { x: 130, y: 520, w: 45, h: 33 }, rot: 30, tint: '#e11d2a', opacity: 1 },
    { id: id(), page, k, type: 'stamp', sym: 'pDISC', name: 'Disc', rect: { x: 200, y: 520, w: 30, h: 30 }, rot: 0, tint: null, opacity: 1 },
    { id: id(), page, k, type: 'stamp', sym: 'pDISC', name: 'Disc', rect: { x: 245, y: 520, w: 30, h: 30 }, rot: 45, tint: '#e11d2a', opacity: 0.8 },
    { id: id(), page, k, type: 'stamp', sym: 'jPHOTO', name: 'Photo', rect: { x: 290, y: 515, w: 60, h: 40 }, rot: 15, tint: null, opacity: 1 },
    { id: id(), page, k, type: 'stamp', sym: 'gone', name: 'Missing', rect: { x: 365, y: 520, w: 30, h: 30 }, rot: 0, tint: null, opacity: 1 },
    { id: id(), page, k, type: 'pin', n: page * 10 + 1, p: { x: 640, y: 480 }, color: '#e11d2a', opacity: 1, note: 'Exit sign missing above door D12', photo: 'jPHOTO' },
    { id: id(), page, k, type: 'pin', n: page * 10 + 2, p: { x: 680, y: 480 }, color: '#1d4ed8', opacity: 1, note: '', photo: null },
    { id: id(), page, k, type: 'pin', n: page * 10 + 3, p: { x: 720, y: 480 }, color: '#e11d2a', opacity: 1, note: 'Cover plate replaced', photos: ['jPHOTO', 'pDISC'], status: 'fixed', statusAt: 1795000000000 },
    { id: id(), page, k, type: 'pin', n: page * 10 + 4, p: { x: 760, y: 480 }, color: '#e11d2a', opacity: 1, note: 'Still loose', photos: [], status: 'rejected', statusAt: 1795000000000 },
    { id: id(), page, k, type: 'count', color: '#16a34a', size: 1, opacity: 1, label: 'Downlights', pts: [[640, 520], [670, 525], [700, 518], [730, 530], [760, 522]] },
    { ...base, id: id(), type: 'dim', color: '#1d4ed8', width: 1.5, fontSize: 10, mpp, p1: { x: 60, y: 235 }, p2: { x: 330, y: 235 } },
    { ...base, id: id(), type: 'path', color: '#0891b2', width: 1.5, fontSize: 10, mpp, pts: [[620, 200], [700, 200], [700, 260], [790, 260]] },
    { ...base, id: id(), type: 'area', color: '#15803d', fill: '#15803d', fillOpacity: 0.15, width: 1.5, fontSize: 10, mpp, pts: [[610, 380], [700, 380], [700, 450], [610, 450]] },
    { ...base, id: id(), type: 'sig', color: '#111111', width: 1.2, rect: { x: 300, y: 30, w: 110, h: 40 }, strokes: [[[0.02, 0.7], [0.2, 0.1], [0.3, 0.9], [0.45, 0.3], [0.6, 0.8]], [[0.55, 0.5], [0.98, 0.45]]] },
  ];
}
