// Pictures and a symbol for the export test: one drawn symbol, one PNG with see-through parts, one small JPEG photo.
import zlib from 'node:zlib';

function png(w, h, pixel) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(pixel(x, y), y * (w * 4 + 1) + 1 + x * 4);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr.set([8, 6, 0, 0, 0], 8);
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

const JPEG = '/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAgADADASIAAhEBAxEB/8QAGAAAAwEBAAAAAAAAAAAAAAAAAgQGBQf/xAAnEAEBAAADBAsAAAAAAAAAAAACAAEFEQYHEhMUFSRDRVFhg6TC4v/EABUBAQEAAAAAAAAAAAAAAAAAAAUE/8QAGREAAwEBAQAAAAAAAAAAAAAAAAIDARES/9oADAMBAAIRAxEAPwDMBmQYAbucje3kgjL0cXBmAav2+w1xy/3PrSoMfSncLUTmhgzAMIMwDG1cumhNg14d4GvhfyPzRIMwDMVbNDJZuG3nme9edH7LyOTxd5xa66emHlZ4MAMwDG1cumoYMwDADMgxtXL5of/Z';

export function sampleAssets() {
  const list = [
    { // an exit-sign-like symbol: box, a stand-in figure, and its tag as text
      id: 'vEXIT', kind: 'vec', w: 30, h: 22,
      items: [
        { d: [['M', 1, 8], ['L', 29, 8], ['L', 29, 21], ['L', 1, 21], ['Z']], stroke: '#16a34a', fill: '#ffffff', w: 0.72 },
        { d: [['M', 10, 18], ['L', 15, 11], ['L', 20, 18], ['M', 15, 11], ['L', 15, 15]], stroke: '#16a34a', w: 0.72 },
        { t: 'text', s: 'EX1', x: 15, y: 3.4, size: 7, color: '#000000' },
      ],
    },
    { // a disc with a see-through surround
      id: 'pDISC', kind: 'img', mime: 'image/png', w: 32, h: 32, alpha: true,
      bytes: png(32, 32, (x, y) => { const d = Math.hypot(x - 15.5, y - 15.5); return d < 14 ? (d < 6 ? [255, 255, 255, 255] : [20, 60, 160, 255]) : [0, 0, 0, 0]; }),
    },
    { id: 'jPHOTO', kind: 'img', mime: 'image/jpeg', w: 48, h: 32, alpha: false, bytes: new Uint8Array(Buffer.from(JPEG, 'base64')) },
  ];
  const map = new Map(list.map(a => [a.id, a]));
  return { get: id => map.get(id), list };
}
