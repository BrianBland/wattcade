/**
 * Minimal tag readers (pure): ID3v2.2/2.3/2.4 (MP3), MP4/M4A `ilst` atoms, FLAC Vorbis comments + PICTURE.
 * Only what the library needs: title, artist, album, track number, ISRC and the cover picture.
 */
export interface Tags {
  title?: string; artist?: string; album?: string; track?: number; isrc?: string;
  picture?: { mime: string; data: Uint8Array };
  format?: 'mp3' | 'mp4' | 'flac' | 'wav' | 'unknown';
}

const latin1 = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return s; };
const clean = (s: string) => s.replace(/\0+$/g, '').split('\0')[0].trim();

function decodeText(enc: number, b: Uint8Array): string {
  if (enc === 0) return clean(latin1(b));
  if (enc === 3) return clean(new TextDecoder('utf-8').decode(b));
  if (enc === 1 || enc === 2) {
    let le = enc === 1, start = 0;
    if (enc === 1 && b.length >= 2) {
      if (b[0] === 0xff && b[1] === 0xfe) { le = true; start = 2; } else if (b[0] === 0xfe && b[1] === 0xff) { le = false; start = 2; }
    }
    let s = '';
    for (let i = start; i + 1 < b.length; i += 2) {
      const c = le ? b[i] | (b[i + 1] << 8) : (b[i] << 8) | b[i + 1];
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s.trim();
  }
  return clean(latin1(b));
}
/** Length of a terminated string in encoding `enc` starting at `off` (excluding the terminator). */
function termLen(b: Uint8Array, off: number, enc: number): number {
  if (enc === 1 || enc === 2) { let i = off; while (i + 1 < b.length && !(b[i] === 0 && b[i + 1] === 0)) i += 2; return i - off; }
  let i = off; while (i < b.length && b[i] !== 0) i++; return i - off;
}
const syncsafe = (b: Uint8Array, o: number) => ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);
const be32 = (b: Uint8Array, o: number) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
const le32 = (b: Uint8Array, o: number) => b[o] + (b[o + 1] << 8) + (b[o + 2] << 16) + ((b[o + 3] << 24) >>> 0);

function unsync(b: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < b.length; i++) { out.push(b[i]); if (b[i] === 0xff && b[i + 1] === 0x00) i++; }
  return Uint8Array.from(out);
}

export function readId3(buf: Uint8Array): Tags | null {
  if (buf.length < 10 || latin1(buf.subarray(0, 3)) !== 'ID3') return null;
  const ver = buf[3], flags = buf[5], size = syncsafe(buf, 6);
  let tag = buf.subarray(10, Math.min(buf.length, 10 + size));
  if (flags & 0x80 && ver < 4) tag = unsync(tag);
  let o = 0;
  if (flags & 0x40) o = ver === 4 ? syncsafe(tag, 0) : be32(tag, 0) + 4;
  const t: Tags = { format: 'mp3' };
  const idLen = ver === 2 ? 3 : 4, hdr = ver === 2 ? 6 : 10;
  while (o + hdr <= tag.length) {
    const id = latin1(tag.subarray(o, o + idLen));
    if (!/^[A-Z0-9]+$/.test(id)) break;
    const fsize = ver === 2 ? (tag[o + 3] << 16) | (tag[o + 4] << 8) | tag[o + 5] : ver === 4 ? syncsafe(tag, o + 4) : be32(tag, o + 4);
    let body = tag.subarray(o + hdr, o + hdr + fsize);
    if (ver === 4 && (tag[o + 9] & 0x02)) body = unsync(body);
    o += hdr + fsize;
    if (!body.length) continue;
    const text = () => decodeText(body[0], body.subarray(1));
    switch (id) {
      case 'TIT2': case 'TT2': t.title = text(); break;
      case 'TPE1': case 'TP1': t.artist = text(); break;
      case 'TALB': case 'TAL': t.album = text(); break;
      case 'TRCK': case 'TRK': { const n = parseInt(text(), 10); if (Number.isFinite(n)) t.track = n; break; }
      case 'TSRC': case 'TRC': t.isrc = text(); break;
      case 'APIC': case 'PIC': {
        if (t.picture) break;
        const enc = body[0];
        let p = 1, mime: string;
        if (id === 'PIC') { const fmt = latin1(body.subarray(1, 4)).toLowerCase(); mime = fmt === 'png' ? 'image/png' : 'image/jpeg'; p = 4; }
        else { const ml = termLen(body, 1, 0); mime = latin1(body.subarray(1, 1 + ml)) || 'image/jpeg'; p = 1 + ml + 1; }
        p += 1; // picture type
        const dl = termLen(body, p, enc); p += dl + (enc === 1 || enc === 2 ? 2 : 1);
        if (p < body.length) t.picture = { mime: mime.includes('/') ? mime : `image/${mime}`, data: body.slice(p) };
        break;
      }
    }
  }
  return t;
}

/** Walk MP4 boxes: moov/udta/meta/ilst. */
export function readMp4(buf: Uint8Array): Tags | null {
  if (buf.length < 12 || latin1(buf.subarray(4, 8)) !== 'ftyp') return null;
  const t: Tags = { format: 'mp4' };
  const walk = (start: number, end: number, path: string[]) => {
    let o = start;
    while (o + 8 <= end) {
      let size = be32(buf, o); const type = latin1(buf.subarray(o + 4, o + 8));
      let hdr = 8;
      if (size === 1) { size = be32(buf, o + 12) + be32(buf, o + 8) * 2 ** 32; hdr = 16; } else if (size === 0) size = end - o;
      if (size < hdr || o + size > end) break;
      const body = o + hdr, stop = o + size;
      const here = [...path, type];
      if (type === 'moov' || type === 'udta' || type === 'ilst') walk(body, stop, here);
      else if (type === 'meta') walk(body + 4, stop, here); // full box
      else if (path[path.length - 1] === 'ilst') {
        // item → 'data' child: [size][data][type 4][locale 4][payload]
        const ds = be32(buf, body), dtype = latin1(buf.subarray(body + 4, body + 8));
        if (dtype === 'data' && ds >= 16) {
          const kind = be32(buf, body + 8) & 0xffffff, payload = buf.subarray(body + 16, body + ds);
          const str = () => new TextDecoder('utf-8').decode(payload).trim();
          if (type === '©nam') t.title = str();
          else if (type === '©ART' || (type === 'aART' && !t.artist)) t.artist = str();
          else if (type === '©alb') t.album = str();
          else if (type === 'trkn' && payload.length >= 4) t.track = (payload[2] << 8) | payload[3];
          else if (type === 'covr' && !t.picture) t.picture = { mime: kind === 14 ? 'image/png' : 'image/jpeg', data: payload.slice() };
        }
      }
      o = stop;
    }
  };
  walk(0, buf.length, []);
  return t;
}

export function readFlac(buf: Uint8Array): Tags | null {
  if (buf.length < 8 || latin1(buf.subarray(0, 4)) !== 'fLaC') return null;
  const t: Tags = { format: 'flac' };
  let o = 4;
  for (;;) {
    if (o + 4 > buf.length) break;
    const last = buf[o] & 0x80, type = buf[o] & 0x7f, len = (buf[o + 1] << 16) | (buf[o + 2] << 8) | buf[o + 3];
    const b = o + 4;
    if (type === 4) {
      let p = b; const vl = le32(buf, p); p += 4 + vl;
      const n = le32(buf, p); p += 4;
      for (let i = 0; i < n && p + 4 <= b + len; i++) {
        const cl = le32(buf, p); p += 4;
        const kv = new TextDecoder('utf-8').decode(buf.subarray(p, p + cl)); p += cl;
        const eq = kv.indexOf('='); if (eq < 0) continue;
        const k = kv.slice(0, eq).toUpperCase(), v = kv.slice(eq + 1).trim();
        if (k === 'TITLE') t.title = v; else if (k === 'ARTIST') t.artist ??= v; else if (k === 'ALBUM') t.album = v;
        else if (k === 'TRACKNUMBER') { const x = parseInt(v, 10); if (Number.isFinite(x)) t.track = x; } else if (k === 'ISRC') t.isrc = v;
      }
    } else if (type === 6 && !t.picture) {
      let p = b + 4; const ml = be32(buf, p); p += 4; const mime = latin1(buf.subarray(p, p + ml)); p += ml;
      const dl = be32(buf, p); p += 4 + dl + 16; const sz = be32(buf, p); p += 4;
      t.picture = { mime, data: buf.slice(p, p + sz) };
    }
    o = b + len;
    if (last) break;
  }
  return t;
}

/** Tags from any supported file, plus a filename fallback ("Artist - Title.mp3", "03 Title.m4a"). */
export function readTags(buf: Uint8Array, filename = ''): Tags {
  const t = readId3(buf) ?? readMp4(buf) ?? readFlac(buf) ?? { format: latin1(buf.subarray(0, 4)) === 'RIFF' ? 'wav' : 'unknown' } as Tags;
  const base = filename.replace(/^.*[\\/]/, '').replace(/\.[a-z0-9]{2,5}$/i, '');
  if (!t.title || !t.artist) {
    const m = base.match(/^(?:(\d{1,3})[\s.\-_]+)?(?:(.+?)\s+-\s+)?(.+)$/);
    if (m) {
      if (!t.track && m[1]) t.track = Number(m[1]);
      if (!t.artist && m[2]) t.artist = m[2].trim();
      if (!t.title) t.title = (m[3] ?? base).trim();
    }
  }
  return t;
}
