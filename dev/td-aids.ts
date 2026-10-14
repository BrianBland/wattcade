// Readability test for the blue brood on Codex's painted map: renderer aids side by side at iPad Pro game scale.
//   /dev/td-aids.html  (needs the #138 assets under public/td/environment)
import { SPECS, loadRig, place, type Aids } from './td-rig';

const DPR = window.devicePixelRatio || 1;
const bg = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = '/td/environment/background.webp'; });
const rigs = await Promise.all(SPECS.map(loadRig));
const by = (id: string) => rigs.find((r) => r.spec.id === id)!;
const K = 8.84; // px per field unit (full-height field on a 12.9" iPad Pro)
const IS = (K * 100) / 900; // background image scale for that field
const len = (radius: number, scale = 1.25) => radius * 2.6 * K * scale;
const VARIANTS: Array<[string, Aids, number]> = [
  ['as is', {}, 1], ['shell tint .35', { tint: 0.35 }, 1], ['tint + soft rim', { tint: 0.35, rim: 0.45, rimPx: 1 }, 1],
  ['tint + rim .6', { tint: 0.35, rim: 0.6, rimPx: 1 }, 1], ['skitter ×1.3 + tint + soft rim', { tint: 0.35, rim: 0.45, rimPx: 1 }, 1.3], ['strong rim (prev)', { rim: 0.9 }, 1],
];
const CW = 260, CH = 300, W = CW * VARIANTS.length, H = CH * 2 + 40;
const cv = document.getElementById('c') as HTMLCanvasElement;
cv.width = W * DPR; cv.height = H * DPR; cv.style.width = `${W}px`; cv.style.height = `${H}px`;
const g = cv.getContext('2d')!;
// two backdrops sampled from the painted map (image px): a path floor and a plateau
const FLOOR: [number, number] = [768, 560], ROCK: [number, number] = [590, 640];
function draw(t: number) {
  g.setTransform(DPR, 0, 0, DPR, 0, 0); g.fillStyle = '#111'; g.fillRect(0, 0, W, H);
  VARIANTS.forEach(([name, aids, skScale], i) => {
    [FLOOR, ROCK].forEach(([sx, sy], row) => {
      const x0 = i * CW, y0 = 30 + row * CH;
      g.save(); g.beginPath(); g.rect(x0, y0, CW - 4, CH - 4); g.clip();
      g.drawImage(bg, sx - (CW / 2) / IS, sy - (CH / 2) / IS, CW / IS, CH / IS, x0, y0, CW, CH);
      if (row === 0) {
        for (const [dx, dy, ph] of [[-60, -80, 0], [-20, -40, 0.3], [30, -95, 0.6], [55, -20, 0.9], [-45, 20, 1.2]]) place(g, by('skitter'), x0 + CW / 2 + dx, y0 + CH / 2 + dy, -Math.PI / 2, len(1.4, 1.25 * skScale), { t: t + ph }, aids);
        place(g, by('warrior'), x0 + CW / 2, y0 + CH - 70, -Math.PI / 2, len(2.7), { t }, {});
      } else {
        place(g, by('glider'), x0 + CW / 2 - 30, y0 + CH / 2 - 30, -Math.PI / 2, len(1.2) * 1.15, { t }, aids);
        place(g, by('glider'), x0 + CW / 2 + 50, y0 + CH / 2 + 70, -Math.PI / 2 + 0.3, len(1.2) * 1.15, { t: t + 1.3 }, aids);
      }
      g.restore();
    });
    g.fillStyle = '#e8ded0'; g.font = '600 15px system-ui, sans-serif'; g.fillText(name, i * CW + 8, 20);
  });
}
draw(0.3);
(window as unknown as { __ready: boolean }).__ready = true;
