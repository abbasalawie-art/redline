// Line icons, 24 × 24, drawn with the current text colour.
const P = {
  select: '<path d="M6 3.5l12.5 8-5.6 1.3-1.9 5.7z"/>',
  cloud: '<path d="M7.2 18.5a3.7 3.7 0 0 1-1.1-7.2 4.3 4.3 0 0 1 7.6-2.9 3.6 3.6 0 0 1 5.3 3.2 3.5 3.5 0 0 1-1.2 6.9z"/>',
  cloudplus: '<path d="M5.6 20a2.9 2.9 0 0 1-.9-5.6 3.4 3.4 0 0 1 6-2.3 2.8 2.8 0 0 1 4.2 2.5 2.7 2.7 0 0 1-.9 5.4z"/><path d="M12.5 11.5l4-5"/><path d="M15 4h6M18 4v5"/>',
  callout: '<rect x="10.5" y="3.5" width="10.5" height="7" rx="1"/><path d="M13 7h5.5"/><path d="M10.5 7H8L4 19"/><path d="M3.2 15.4L4 19l3-2.2"/>',
  text: '<path d="M5 6V4.5h14V6M12 4.5v15M9 19.5h6"/>',
  arrow: '<path d="M5 19L19 5M10.5 5H19v8.5"/>',
  pen: '<path d="M4 20l1-4.2L16.3 4.5a1.8 1.8 0 0 1 2.6 0l.6.6a1.8 1.8 0 0 1 0 2.6L8.2 19z"/><path d="M14.5 6.3l3.2 3.2"/>',
  hl: '<path d="M8.5 13.5l6-8 4.5 3.4-6 8z"/><path d="M8.5 13.500l-2.800 3.700 2.200 1.700 1.500-.2 3.600-1.800"/><path d="M4 21h16"/>',
  rect: '<rect x="4" y="6" width="16" height="12" rx="1"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="8.5" ry="6.2"/>',
  lock: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  unlock: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path d="M8.500 10.500V8a3.500 3.500 0 0 1 6.600-1.600"/>',
  undo: '<path d="M8.500 5L4.500 9l4 4"/><path d="M4.500 9H14a5.500 5.500 0 0 1 0 11h-3.500"/>',
  redo: '<path d="M15.500 5l4 4-4 4"/><path d="M19.500 9H10a5.500 5.500 0 0 0 0 11h3.500"/>',
  files: '<path d="M3.500 7a2 2 0 0 1 2-2h4l2 2.500h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  share: '<path d="M12 15V3.500M8 7l4-4 4 4"/><path d="M7.500 10.500H6a1.500 1.500 0 0 0-1.500 1.500v7A1.500 1.500 0 0 0 6 20.500h12a1.500 1.500 0 0 0 1.500-1.500v-7a1.500 1.500 0 0 0-1.500-1.500h-1.500"/>',
  fit: '<path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4"/>',
  prev: '<path d="M14.500 5l-7 7 7 7"/>',
  next: '<path d="M9.500 5l7 7-7 7"/>',
  trash: '<path d="M4.500 7h15M9.500 7V4.500h5V7M6.500 7l.8 12.500h9.400L17.500 7M10 10.500v6M14 10.500v6"/>',
  copy: '<rect x="8.500" y="8.500" width="11" height="11" rx="2"/><path d="M5.500 15.500h-1v-10a1 1 0 0 1 1-1h10v1"/>',
  more: '<circle cx="5.500" cy="12" r="1.300"/><circle cx="12" cy="12" r="1.300"/><circle cx="18.500" cy="12" r="1.300"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M5 6V4.500h9V6M9.500 4.500v12M7.500 16.500h4"/><path d="M17 9.500v10M15 9.500h4M15 19.500h4"/>',
  download: '<path d="M12 4v11M8 11.500l4 4 4-4M5 19.500h14"/>',
  check: '<path d="M5 12.500l4.500 4.500L19 7.500"/>',
  pages: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  none: '<circle cx="12" cy="12" r="8"/><path d="M6.500 17.500l11-11"/>',
};

export function icon(name, size = 24) {
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}
