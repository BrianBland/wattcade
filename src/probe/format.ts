export function toHex(b: ArrayBuffer | ArrayBufferView): string {
  const u = b instanceof ArrayBuffer ? new Uint8Array(b) : new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  return Array.from(u, (x) => x.toString(16).padStart(2, '0')).join(' ');
}
export function propsList(p: { [k: string]: boolean | undefined }): string {
  return Object.keys(p).filter((k) => p[k] === true).join(',') || '-';
}
export function fmtLine(tMs: number, tag: string, text: string): string {
  return `${(tMs / 1000).toFixed(3).padStart(9)}  ${tag.padEnd(8)} ${text}`;
}
export function isPrintable(b: Uint8Array): boolean { return b.length > 0 && b.every((x) => x >= 0x20 && x < 0x7f); }
