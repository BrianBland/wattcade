import { describe, expect, it } from 'vitest';
import { readTags } from '../library/tags';
import { paletteFromKey, paletteFromPixels } from '../library/palette';

const enc = (s: string) => new TextEncoder().encode(s);
const latin = (s: string) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));
const cat = (...parts: Uint8Array[]) => { const n = parts.reduce((s, p) => s + p.length, 0), out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
const be32 = (n: number) => Uint8Array.from([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const le32 = (n: number) => Uint8Array.from([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]);
const syncsafe = (n: number) => Uint8Array.from([(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);

function id3(ver: 3 | 4, frames: Array<[string, Uint8Array]>): Uint8Array {
  const body = cat(...frames.map(([id, b]) => cat(latin(id), ver === 4 ? syncsafe(b.length) : be32(b.length), Uint8Array.from([0, 0]), b)));
  return cat(latin('ID3'), Uint8Array.from([ver, 0, 0]), syncsafe(body.length), body, Uint8Array.from([0xff, 0xfb, 0x90, 0x64]));
}
const textFrame = (encByte: number, s: string) => {
  if (encByte === 1) { const u = new Uint8Array(2 + s.length * 2); u[0] = 0xff; u[1] = 0xfe; [...s].forEach((c, i) => { u[2 + 2 * i] = c.charCodeAt(0) & 255; u[3 + 2 * i] = c.charCodeAt(0) >> 8; }); return cat(Uint8Array.from([1]), u); }
  return cat(Uint8Array.from([encByte]), encByte === 3 ? enc(s) : latin(s));
};

describe('tags', () => {
  it('ID3v2.3 with UTF-16 text and a picture', () => {
    const apic = cat(Uint8Array.from([0]), latin('image/jpeg'), Uint8Array.from([0, 3]), latin('cover'), Uint8Array.from([0]), JPEG);
    const t = readTags(id3(3, [['TIT2', textFrame(1, 'Héllo')], ['TPE1', textFrame(0, 'Artist')], ['TALB', textFrame(0, 'LP')], ['TRCK', textFrame(0, '3/12')], ['TSRC', textFrame(0, 'USUM71703861')], ['APIC', apic]]));
    expect(t).toMatchObject({ format: 'mp3', title: 'Héllo', artist: 'Artist', album: 'LP', track: 3, isrc: 'USUM71703861' });
    expect(t.picture?.mime).toBe('image/jpeg');
    expect([...t.picture!.data]).toEqual([...JPEG]);
  });

  it('ID3v2.4 with UTF-8 and syncsafe sizes', () => {
    const t = readTags(id3(4, [['TIT2', textFrame(3, 'Ünïcode ✓')], ['TPE1', textFrame(3, 'Bänd')]]));
    expect(t.title).toBe('Ünïcode ✓');
    expect(t.artist).toBe('Bänd');
  });

  it('MP4 ilst atoms', () => {
    const box = (type: string, ...kids: Uint8Array[]) => { const body = cat(...kids); return cat(be32(8 + body.length), latin(type), body); };
    const data = (kind: number, payload: Uint8Array) => box('data', be32(kind), be32(0), payload);
    const ilst = box('ilst',
      box('©nam', data(1, enc('Song'))), box('©ART', data(1, enc('Singer'))), box('©alb', data(1, enc('Album'))),
      box('trkn', data(0, Uint8Array.from([0, 0, 0, 7, 0, 10, 0, 0]))), box('covr', data(14, JPEG)));
    const meta = box('meta', be32(0), box('hdlr', new Uint8Array(25)), ilst);
    const file = cat(box('ftyp', latin('M4A '), be32(0)), box('moov', box('mvhd', new Uint8Array(100)), box('udta', meta)), box('mdat', new Uint8Array(16)));
    expect(readTags(file)).toMatchObject({ format: 'mp4', title: 'Song', artist: 'Singer', album: 'Album', track: 7 });
    expect(readTags(file).picture?.mime).toBe('image/png');
  });

  it('FLAC Vorbis comments and picture', () => {
    const comments = ['TITLE=Flac Song', 'ARTIST=Flac Artist', 'TRACKNUMBER=5', 'ISRC=GBAYE0000001'].map(enc);
    const vc = cat(le32(3), latin('ref'), le32(comments.length), ...comments.flatMap((c) => [le32(c.length), c]));
    const pic = cat(be32(3), be32(9), latin('image/png'), be32(0), be32(1), be32(1), be32(24), be32(0), be32(JPEG.length), JPEG);
    const block = (type: number, last: boolean, b: Uint8Array) => cat(Uint8Array.from([(last ? 0x80 : 0) | type, (b.length >> 16) & 255, (b.length >> 8) & 255, b.length & 255]), b);
    const file = cat(latin('fLaC'), block(0, false, new Uint8Array(34)), block(4, false, vc), block(6, true, pic));
    expect(readTags(file)).toMatchObject({ format: 'flac', title: 'Flac Song', artist: 'Flac Artist', track: 5, isrc: 'GBAYE0000001' });
    expect(readTags(file).picture?.mime).toBe('image/png');
  });

  it('falls back to the file name', () => {
    expect(readTags(new Uint8Array(16), '03 - Daft Punk - One More Time.mp3')).toMatchObject({ track: 3, artist: 'Daft Punk', title: 'One More Time' });
    expect(readTags(new Uint8Array(16), 'Just A Title.m4a')).toMatchObject({ title: 'Just A Title' });
    expect(readTags(latin('RIFF0000WAVE'), 'x.wav').format).toBe('wav');
  });

  it('ignores garbage without throwing', () => {
    const junk = Uint8Array.from({ length: 300 }, (_, i) => (i * 37) & 255);
    expect(() => readTags(cat(latin('ID3'), Uint8Array.from([3, 0, 0, 0, 0, 2, 0]), junk))).not.toThrow();
    expect(() => readTags(cat(be32(20), latin('ftyp'), junk))).not.toThrow();
  });
});

describe('palette', () => {
  it('finds the dominant colours, vivid first', () => {
    const px: number[] = [];
    for (let i = 0; i < 400; i++) px.push(250, 20, 120, 255);  // hot pink
    for (let i = 0; i < 400; i++) px.push(20, 20, 30, 255);    // near black
    for (let i = 0; i < 200; i++) px.push(30, 220, 240, 255);  // cyan
    const p = paletteFromPixels(px, 3);
    expect(p).toHaveLength(3);
    expect(p[0]).toBe('#fa1478');
    expect(p).toContain('#14141e');
  });
  it('key fallback is deterministic and well-formed', () => {
    const p = paletteFromKey('8A');
    expect(p).toHaveLength(5);
    for (const c of p) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    expect(paletteFromKey('8A')).toEqual(p);
    expect(paletteFromKey('3B')).not.toEqual(p);
  });
});
