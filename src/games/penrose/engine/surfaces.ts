// @ts-nocheck
/* Penrose Pedals engine: ground surfaces. Seeded, seamlessly tiling patterns (striped lawn, meadow, flagstones, courtyard
 * tiles, raked gravel, flower beds; ashlar and strata for the sides) painted once per palette and laid on any box or
 * extruded slab in world space, so a plateau of any size reads as a designed place rather than a flat colour.
 * Installed into the shared engine scope after decor (see ./index.ts). */
import * as T from 'three';

export function install($scope) {
const { mulberry, TAU } = $scope;

const PPM = 64;                          // texture pixels per metre
const TOPS = ['lawn', 'meadow', 'flagstone', 'courtyard', 'gravel', 'beds'];
const SIDES = ['ashlar', 'strata'];
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const mix = (a, b, t) => { const A = hex(a), B = hex(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
const css = (h, a = 1) => { const [r, g, b] = hex(h); return `rgba(${r},${g},${b},${a})`; };

/**
 * Paint one tile of a surface. pal: { grass, grassDark, stone, stoneDark, soil, bloom: [..] } hex colours.
 * Every mark is drawn at its 9 wrapped copies, so the tile repeats without seams. Returns [canvas, metres per tile].
 */
function paintTile(style, pal, seed) {
  const m = style === 'courtyard' || style === 'flagstone' ? 6 : style === 'ashlar' || style === 'strata' ? 4.8 : 6, W = m * PPM;
  const c = document.createElement('canvas'); c.width = c.height = W; const g = c.getContext('2d'), rnd = mulberry(seed * 4561 + style.length * 97);
  const wrap = (fn) => { for (const dx of [-W, 0, W]) for (const dy of [-W, 0, W]) { g.save(); g.translate(dx, dy); fn(); g.restore(); } };
  const fill = (col) => { g.fillStyle = col; g.fillRect(0, 0, W, W); };
  // fine grass texture: short strokes in lighter and darker greens
  const blades = (n, base, a = .5) => { for (let i = 0; i < n; i++) { const x = rnd() * W, y = rnd() * W, l = 3 + rnd() * 5, dark = rnd() < .5;
    wrap(() => { g.strokeStyle = css(dark ? mix(base, '#1E3B12', .35) : mix(base, '#FFFFE0', .3), a); g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - .5) * 3, y - l); g.stroke(); }); } };
  const blot = (n, cols, r0, r1, a) => { for (let i = 0; i < n; i++) { const x = rnd() * W, y = rnd() * W, r = (r0 + rnd() * (r1 - r0)) * PPM, col = cols[Math.floor(rnd() * cols.length)];
    wrap(() => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, css(col, a)); gr.addColorStop(1, css(col, 0)); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }); } };
  const flowers = (n, size = .1) => { for (let i = 0; i < n; i++) { const cx = rnd() * W, cy = rnd() * W, col = pal.bloom[Math.floor(rnd() * pal.bloom.length)], k = 2 + Math.floor(rnd() * 4);
    for (let j = 0; j < k; j++) { const x = cx + (rnd() - .5) * .5 * PPM, y = cy + (rnd() - .5) * .5 * PPM, r = size * PPM * (.7 + rnd() * .5);
      wrap(() => { g.fillStyle = css(col); for (let p = 0; p < 5; p++) { const a = p / 5 * TAU; g.beginPath(); g.arc(x + Math.cos(a) * r * .55, y + Math.sin(a) * r * .55, r * .48, 0, TAU); g.fill(); }
        g.fillStyle = css('#FFE27A'); g.beginPath(); g.arc(x, y, r * .3, 0, TAU); g.fill(); }); } } };
  const pebbles = (n, cols, r0, r1) => { for (let i = 0; i < n; i++) { const x = rnd() * W, y = rnd() * W, rx = (r0 + rnd() * (r1 - r0)) * PPM, ry = rx * (.6 + rnd() * .4), a = rnd() * TAU, col = cols[Math.floor(rnd() * cols.length)];
    wrap(() => { g.fillStyle = css(col); g.beginPath(); g.ellipse(x, y, rx, ry, a, 0, TAU); g.fill(); g.fillStyle = css('#FFFFFF', .25); g.beginPath(); g.ellipse(x - rx * .25, y - ry * .3, rx * .45, ry * .35, a, 0, TAU); g.fill(); }); } };
  // a jittered grid that wraps: corner (i, j) is shared by the four cells around it, mod n
  const jgrid = (n, jit) => { const P = []; for (let j = 0; j < n; j++) { P.push([]); for (let i = 0; i < n; i++) P[j].push([(rnd() - .5) * jit, (rnd() - .5) * jit]); }
    const s = W / n; return (i, j) => { const q = P[((j % n) + n) % n][((i % n) + n) % n]; return [i * s + q[0] * s, j * s + q[1] * s]; }; };

  if (style === 'lawn') {
    // mown stripes, soft and wide, with grass grain, clover and a few flowers
    fill(pal.grass); const bands = 4, bw = W / bands;
    for (let b = 0; b < bands; b++) if (b % 2) { g.fillStyle = css(mix(pal.grass, '#FFFFE8', .14)); g.fillRect(0, b * bw, W, bw); }
    blades(1400, pal.grass, .35); blot(10, [pal.grassDark], .3, .7, .18); flowers(9, .07);
  } else if (style === 'meadow') {
    // wild grass in drifting patches of tone, dense with flowers and the odd stone
    fill(pal.grass); blot(26, [pal.grassDark, mix(pal.grass, '#FFF6B0', .35), mix(pal.grass, '#7FB8E0', .15)], .5, 1.3, .32);
    blades(2200, pal.grass, .45); flowers(30, .085); pebbles(10, [pal.stone, pal.stoneDark], .05, .12);
  } else if (style === 'flagstone') {
    // large, quiet slabs in a cool sage stone, well away from the road's warm cream; joints barely darker, so the road reads first
    const slab = mix(mix(pal.grassDark, '#D9DED2', .72), '#9FB0A4', .12); fill(mix(slab, '#56685A', .22)); const rows = 4, rh = W / rows;
    for (let r = 0; r < rows; r++) { let x = rnd() * W; const end = x + W;
      while (x < end) { const l = (1.1 + rnd() * 1.1) * PPM, x1 = Math.min(x + l, end), y = r * rh, xx = x, tone = mix(slab, rnd() < .5 ? '#FFFFFF' : '#7E8F82', rnd() * .1);
        wrap(() => { g.fillStyle = css(tone); g.fillRect(xx + 2, y + 2, x1 - xx - 4, rh - 4); }); x = x1; } }
  } else if (style === 'courtyard') {
    // terracotta and cream squares with a small diamond at each meeting
    const n = 8, s = W / n, terra = pal.terra || '#D98A5F';
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { g.fillStyle = css((i + j) % 2 ? mix(terra, '#FFFFFF', rnd() * .12) : mix(pal.stone, '#FFFFFF', .2 + rnd() * .1)); g.fillRect(i * s, j * s, s, s); }
    g.strokeStyle = css(mix(pal.stoneDark, '#000000', .1), .55); g.lineWidth = 2; for (let k = 0; k <= n; k++) { g.beginPath(); g.moveTo(k * s, 0); g.lineTo(k * s, W); g.moveTo(0, k * s); g.lineTo(W, k * s); g.stroke(); }
    for (let j = 0; j <= n; j += 2) for (let i = 0; i <= n; i += 2) { g.fillStyle = css(pal.accent || pal.bloom[0]); g.beginPath(); g.moveTo(i * s, j * s - s * .22); g.lineTo(i * s + s * .22, j * s); g.lineTo(i * s, j * s + s * .22); g.lineTo(i * s - s * .22, j * s); g.closePath(); g.fill(); }
  } else if (style === 'gravel') {
    // raked gravel: gentle waves, fine grit, a few larger stones
    fill(mix(pal.stone, '#FFFFFF', .25)); pebbles(2600, [pal.stone, pal.stoneDark, '#FFFFFF'], .012, .03);
    g.strokeStyle = css(pal.stoneDark, .35); g.lineWidth = 3;
    for (let r = 0; r < 12; r++) { const y0 = (r + .5) * W / 12; g.beginPath(); for (let x = 0; x <= W; x += 6) { const y = y0 + Math.sin(x / W * TAU * 2) * 6; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
    pebbles(6, [pal.stoneDark], .1, .2);
  } else if (style === 'beds') {
    // lawn with long beds of soil, flowers along each
    fill(pal.grass); blades(1000, pal.grass, .35); const rows = 3, rw = W / rows;
    for (let r = 0; r < rows; r++) { const y = r * rw + rw * .3, h = rw * .4; g.fillStyle = css(pal.soil); g.fillRect(0, y, W, h); g.fillStyle = css(mix(pal.soil, '#000000', .2)); g.fillRect(0, y + h - 4, W, 4);
      const col = pal.bloom[r % pal.bloom.length]; for (let x = 10; x < W; x += 22) { const yy = y + h * (.3 + rnd() * .4), rr = 7 + rnd() * 3; g.fillStyle = css(mix(pal.grassDark, '#000000', .1)); g.beginPath(); g.arc(x, yy + 3, rr * 1.1, 0, TAU); g.fill(); g.fillStyle = css(col); g.beginPath(); g.arc(x, yy, rr * .75, 0, TAU); g.fill(); } }
  } else if (style === 'ashlar') {
    // dressed stone in courses of random length, each block a touch lighter or darker, with crisp mortar
    const rows = 12, rh = W / rows; fill(mix(pal.stoneDark, '#000000', .08));
    for (let r = 0; r < rows; r++) { let x = rnd() * W; const end = x + W; while (x < end) { const l = (.5 + rnd() * .9) * PPM, x1 = Math.min(x + l, end), tone = mix(pal.stone, rnd() < .5 ? pal.stoneDark : '#FFFFFF', rnd() * .3);
      const y = r * rh, xx = x; wrap(() => { g.fillStyle = css(tone); g.fillRect(xx + 2, y + 2, x1 - xx - 4, rh - 4); g.fillStyle = css('#FFFFFF', .22); g.fillRect(xx + 2, y + 2, x1 - xx - 4, 3); }); x = x1; } }
  } else if (style === 'strata') {
    // natural rock in bands of uneven height and tone, with cracks
    const cols = [pal.stone, pal.stoneDark, mix(pal.stone, pal.soil, .3), mix(pal.stoneDark, '#000000', .1)]; let y = 0;
    while (y < W) { const h = Math.min(W - y, (.25 + rnd() * .5) * PPM); g.fillStyle = css(mix(cols[Math.floor(rnd() * cols.length)], '#FFFFFF', rnd() * .15)); g.fillRect(0, y, W, h);
      g.fillStyle = css('#FFFFFF', .2); g.fillRect(0, y, W, 2); y += h; }
    g.strokeStyle = css('#000000', .18); g.lineWidth = 2; for (let i = 0; i < 18; i++) { let x = rnd() * W, yy = rnd() * W; g.beginPath(); g.moveTo(x, yy); for (let k = 0; k < 4; k++) { x += (rnd() - .5) * 20; yy += 8 + rnd() * 14; g.lineTo(x, yy); } g.stroke(); }
  }
  return [c, m];
}

const VS = `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
// the decal shading (face-by-normal brightness, turned with the camera) over a top texture and a side texture, both in world space
const FS = `uniform sampler2D uTop, uSide; uniform float tTop, tSide; varying vec3 vW;
void main() {
  vec3 n0 = normalize(cross(dFdx(vW), dFdy(vW))), n = n0;
  vec3 cz = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]); vec2 h = normalize(cz.xz + vec2(1e-5)), h0 = vec2(0.70710678);
  float np = dot(n.xz, h), nq = h.x * n.z - h.y * n.x; n = vec3(np * h0.x - nq * h0.y, n.y, np * h0.y + nq * h0.x);
  if (dot(n, vec3(1.0)) < 0.0) n = -n;
  vec3 w = pow(max(n, vec3(0.0)), vec3(1.6)); float s = w.x + w.y + w.z + 1e-4;
  float k = (0.74 * w.x + 1.0 * w.y + 0.86 * w.z) / s;
  vec3 a = abs(n0), c;
  if (a.y > 0.6) c = texture2D(uTop, vW.xz / tTop).rgb;
  else c = texture2D(uSide, vec2(a.x > a.z ? vW.z : vW.x, vW.y) / tSide).rgb;
  gl_FragColor = vec4(pow(c, vec3(2.2)) * k, 1.0); }`;

const texCache = new Map(), matCache = new Map();
function tileTex(style, pal, seed) {
  const key = style + JSON.stringify(pal) + seed; if (texCache.has(key)) return texCache.get(key);
  const [c, m] = paintTile(style, pal, seed), t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8; t.needsUpdate = true;
  const out = { t, m }; texCache.set(key, out); return out;
}
/** A palette for a theme: grass, stone and blooms drawn from the theme's own colours. */
function groundPal(th) {
  const turf = th.turf || th.stone, st = th.stone;
  return { grass: turf.t, grassDark: turf.l, stone: st.l, stoneDark: st.r, soil: '#8A5E3C', terra: '#D98A5F', accent: th.goal || '#E8553B',
    bloom: ['#FFFFFF', th.goal || '#EE6C98', '#FFD45A', '#B9A2F0'] };
}
/** A material for a solid whose top shows `top` and whose sides show `side` (styles above), in world space. */
function surface(th, top, side = 'ashlar', o = {}) {
  const pal = { ...groundPal(th), ...(o.pal || {}) }, seed = o.seed ?? 1, key = top + side + JSON.stringify(pal) + seed;
  if (matCache.has(key)) return matCache.get(key);
  const A = tileTex(top, pal, seed), Bt = tileTex(side, { ...pal, ...(o.sidePal || {}) }, seed + 1);
  const m = new T.ShaderMaterial({ uniforms: { uTop: { value: A.t }, uSide: { value: Bt.t }, tTop: { value: A.m }, tSide: { value: Bt.m } }, vertexShader: VS, fragmentShader: FS, extensions: { derivatives: true } });
  matCache.set(key, m); return m;
}

Object.assign($scope, { GROUND_TOPS: TOPS, GROUND_SIDES: SIDES, paintTile, groundPal, surface });
}
