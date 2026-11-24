// Text measuring and wrapping with the real Helvetica metrics, so that line breaks on
// screen and in the saved PDF are identical.

export const LINE_HEIGHT = 1.15;   // × font size (same as Revu's default)
export const ASCENT = 0.83;        // first baseline below the top of the line box, × font size

export function makeFont(PDFLib) {
  const emb = PDFLib.StandardFontEmbedder.for(PDFLib.StandardFonts.Helvetica);
  const widths = new Map();
  for (const cp of emb.encoding.supportedCodePoints) {
    const ch = String.fromCodePoint(cp);
    try { widths.set(ch, emb.widthOfTextAtSize(ch, 1000)); } catch { /* not encodable */ }
  }

  /** Replace anything Helvetica (WinAnsi) cannot show. */
  function clean(s) {
    s = String(s ?? '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
    let out = '';
    for (const ch of s) out += ch === '\n' || widths.has(ch) ? ch : '?';
    return out;
  }

  /** Width without kerning: this is how PDF viewers lay out a plain text string. */
  function width(s, size) {
    let w = 0;
    for (const ch of s) w += widths.get(ch) ?? 556;
    return (w * size) / 1000;
  }

  function breakWord(word, size, maxW, lines) {
    let piece = '';
    for (const ch of word) {
      if (piece !== '' && width(piece + ch, size) > maxW) { lines.push(piece); piece = ''; }
      piece += ch;
    }
    return piece;
  }

  /** Greedy word wrap. Returns an array of lines (always at least one). */
  function wrap(text, size, maxW) {
    const lines = [];
    for (const para of clean(text).split('\n')) {
      let cur = null;                                   // null = line not started yet
      for (const word of para.split(' ')) {
        const cand = cur === null ? word : cur + ' ' + word;
        if (width(cand, size) <= maxW) { cur = cand; continue; }
        if (cur) lines.push(cur);
        cur = width(word, size) <= maxW ? word : breakWord(word, size, maxW, lines);
      }
      lines.push(cur ?? '');
    }
    return lines;
  }

  /** PDF hex string for a line of text. */
  function hex(s) { return String(emb.encodeText(clean(s))); }

  return { clean, width, wrap, hex };
}
