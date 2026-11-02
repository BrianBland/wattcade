// @ts-nocheck
/* Penrose Pedals engine: generative wall art. A seeded pattern (tiles, arcades, mosaic, chevrons, meander bands) is
 * painted onto a canvas and laid over a wall as a decal that shades like the wall under it, so a big face reads as
 * architecture instead of a blank slab. Decals are flat and sit under the road surface, so they never hide a road.
 * Installed into the shared engine scope in order (see ./index.ts); names come in from $scope and go back out to it. */
import * as T from 'three';

export function install($scope) {
const { V, mulberry, TAU } = $scope;

const DECAL_VS = `varying vec3 vW; varying vec2 vUv;
void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
// the same face-by-normal shading as the three-tone material, applied to the pattern's colours as a brightness factor
const DECAL_FS = `uniform sampler2D map; uniform float opacity; varying vec3 vW; varying vec2 vUv;
void main() {
  vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
  vec3 cz = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]); vec2 h = normalize(cz.xz + vec2(1e-5)), h0 = vec2(0.70710678);
  float np = dot(n.xz, h), nq = h.x * n.z - h.y * n.x; n = vec3(np * h0.x - nq * h0.y, n.y, np * h0.y + nq * h0.x);
  if (dot(n, vec3(1.0)) < 0.0) n = -n;
  vec3 w = pow(max(n, vec3(0.0)), vec3(1.6)); float s = w.x + w.y + w.z + 1e-4;
  float k = (0.72 * w.x + 1.0 * w.y + 0.86 * w.z) / s;
  vec4 t = texture2D(map, vUv);
  gl_FragColor = vec4(t.rgb * k, t.a * opacity); }`;

const STYLES = ['tiles', 'arcade', 'mosaic', 'chevron', 'meander'];
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };

/** Paint a pattern for a wall of w x h metres. pal: { light, dark, accent } hex colours. Returns a CanvasTexture. */
function wallPattern(style, w, h, seed, pal) {
  const ppm = 64, W = Math.max(64, Math.round(w * ppm)), H = Math.max(64, Math.round(h * ppm)), rnd = mulberry(seed * 7919 + 13);
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const L = (a) => rgba(pal.light, a), D = (a) => rgba(pal.dark, a), A = (a) => rgba(pal.accent, a);
  g.lineCap = 'round'; g.lineJoin = 'round';
  const band = (y0, y1) => { g.fillStyle = D(.18); g.fillRect(0, y0, W, y1 - y0); g.strokeStyle = L(.55); g.lineWidth = 3; g.beginPath(); g.moveTo(0, y0 + 4); g.lineTo(W, y0 + 4); g.moveTo(0, y1 - 4); g.lineTo(W, y1 - 4); g.stroke(); };
  if (style === 'tiles') {
    // azulejo-style tiles: two alternating rosettes on a grid, with a band top and bottom
    const n = Math.max(3, Math.round(w / 1.1)), s = W / n, motifs = [Math.floor(rnd() * 3), Math.floor(rnd() * 3)], petals = 4 + 2 * Math.floor(rnd() * 3);
    for (let y = 0; y * s < H; y++) for (let x = 0; x < n; x++) {
      const cx = (x + .5) * s, cy = (y + .5) * s, m = motifs[(x + y) % 2];
      g.strokeStyle = L(.28); g.lineWidth = 2; g.strokeRect(x * s + 2, y * s + 2, s - 4, s - 4);
      g.fillStyle = (x + y) % 2 ? A(.22) : L(.2); g.strokeStyle = (x + y) % 2 ? A(.5) : L(.5); g.lineWidth = 3;
      if (m === 0) { g.beginPath(); for (let k = 0; k < petals; k++) { const a = k / petals * TAU; g.ellipse(cx + Math.cos(a) * s * .2, cy + Math.sin(a) * s * .2, s * .17, s * .08, a, 0, TAU); } g.fill(); g.stroke(); }
      else if (m === 1) { g.beginPath(); g.moveTo(cx, cy - s * .38); g.lineTo(cx + s * .38, cy); g.lineTo(cx, cy + s * .38); g.lineTo(cx - s * .38, cy); g.closePath(); g.fill(); g.stroke(); g.beginPath(); g.arc(cx, cy, s * .12, 0, TAU); g.stroke(); }
      else { for (const r of [.36, .24, .12]) { g.beginPath(); g.arc(cx, cy, s * r, 0, TAU); g.stroke(); } g.beginPath(); g.arc(cx, cy, s * .12, 0, TAU); g.fill(); }
    }
    band(0, s * .35); band(H - s * .35, H);
  } else if (style === 'arcade') {
    // tiers of arched openings with sills and keystones
    const tiers = Math.max(2, Math.round(h / 1.8)), th = H / tiers, n = Math.max(2, Math.round(w / 1.2)), s = W / n;
    for (let t = 0; t < tiers; t++) {
      const y0 = t * th; g.fillStyle = D(.14); g.fillRect(0, y0 + th - 10, W, 10);
      for (let x = 0; x < n; x++) {
        const cx = (x + .5) * s, aw = s * .46, top = y0 + th * .22, bot = y0 + th - 14, lit = rnd() < .25;
        g.fillStyle = lit ? A(.55) : D(.32); g.beginPath(); g.moveTo(cx - aw / 2, bot); g.lineTo(cx - aw / 2, top + aw / 2); g.arc(cx, top + aw / 2, aw / 2, Math.PI, 0); g.lineTo(cx + aw / 2, bot); g.closePath(); g.fill();
        g.strokeStyle = L(.55); g.lineWidth = 4; g.stroke(); g.fillStyle = L(.6); g.fillRect(cx - 5, top - 8, 10, 12);
      }
    }
  } else if (style === 'mosaic') {
    // a jittered triangle mosaic, each tile a little lighter or darker than the wall
    const n = Math.max(4, Math.round(w / .7)), m = Math.max(4, Math.round(h / .7)), sx = W / n, sy = H / m, P = [];
    for (let j = 0; j <= m; j++) { P.push([]); for (let i = 0; i <= n; i++) { const e = i === 0 || j === 0 || i === n || j === m; P[j].push([i * sx + (e ? 0 : (rnd() - .5) * sx * .6), j * sy + (e ? 0 : (rnd() - .5) * sy * .6)]); } }
    for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) for (const tri3 of [[P[j][i], P[j][i + 1], P[j + 1][i]], [P[j][i + 1], P[j + 1][i + 1], P[j + 1][i]]]) {
      const r = rnd(); g.fillStyle = r < .12 ? A(.3) : r < .55 ? L(.12 + rnd() * .14) : D(.06 + rnd() * .1);
      g.beginPath(); g.moveTo(...tri3[0]); g.lineTo(...tri3[1]); g.lineTo(...tri3[2]); g.closePath(); g.fill(); g.strokeStyle = L(.3); g.lineWidth = 1.5; g.stroke();
    }
  } else if (style === 'chevron') {
    // stacked zigzag bands in alternating tints
    const rows = Math.max(4, Math.round(h / .55)), rh = H / rows, k = Math.max(4, Math.round(w / .8)), sw = W / k;
    for (let r = 0; r < rows; r++) {
      g.fillStyle = r % 3 === 0 ? A(.22) : r % 3 === 1 ? L(.18) : D(.1); g.beginPath(); g.moveTo(0, r * rh);
      for (let i = 0; i <= k; i++) g.lineTo(i * sw, r * rh + (i % 2 ? rh * .5 : 0));
      for (let i = k; i >= 0; i--) g.lineTo(i * sw, (r + 1) * rh + (i % 2 ? rh * .5 : 0));
      g.closePath(); g.fill();
    }
  } else {
    // meander (greek key) bands between plain courses of ashlar
    const course = 40; g.strokeStyle = L(.3); g.lineWidth = 2;
    for (let y = 0; y < H; y += course) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); for (let x = (y / course % 2) * 60; x < W; x += 120) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + course); g.stroke(); } }
    const bands = Math.max(1, Math.round(h / 2.4));
    for (let b = 0; b < bands; b++) {
      const y0 = (b + .5) * H / bands - 30; g.fillStyle = D(.2); g.fillRect(0, y0, W, 60); g.strokeStyle = A(.65); g.lineWidth = 5; g.beginPath();
      for (let x = 0; x < W; x += 48) { g.moveTo(x, y0 + 50); g.lineTo(x, y0 + 10); g.lineTo(x + 36, y0 + 10); g.lineTo(x + 36, y0 + 38); g.lineTo(x + 14, y0 + 38); g.lineTo(x + 14, y0 + 24); g.lineTo(x + 24, y0 + 24); }
      g.stroke();
    }
  }
  const tex = new T.CanvasTexture(c); tex.anisotropy = 4; return tex;
}

/**
 * Lay a wall-art decal on a wall. o: { centre: [x, y, z] (sketch coords, on the wall), u: unit vector along the wall,
 * up: unit vector up the wall, n: the wall's outward normal, w, h (metres), style?: one of STYLES, seed, pal?, opacity? }.
 * The decal sits .006 off the wall, under any road on it. Returns the mesh.
 */
function wallArt(L, parent, o) {
  const th = L.th, style = o.style || STYLES[(o.seed >>> 0) % STYLES.length];
  const pal = o.pal || { light: '#FFFFFF', dark: th.ink || '#22223A', accent: th.goal || '#FF8E6E' };
  const tex = wallPattern(style, o.w, o.h, o.seed, pal);
  const mat = new T.ShaderMaterial({ uniforms: { map: { value: tex }, opacity: { value: o.opacity ?? 1 } }, vertexShader: DECAL_VS, fragmentShader: DECAL_FS,
    transparent: true, depthWrite: false, side: T.DoubleSide, extensions: { derivatives: true }, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const m = new T.Mesh(new T.PlaneGeometry(o.w, o.h), mat);
  const ex = V(...o.u).normalize(), ey = V(...o.up).normalize(), ez = V(...o.n).normalize();
  // V() swaps y and z, which mirrors the frame; flip the plane's x so the pattern reads the right way round
  const flip = new T.Vector3().crossVectors(ex, ey).dot(ez) < 0;
  m.matrixAutoUpdate = false;
  m.matrix.makeBasis(flip ? ex.clone().negate() : ex, ey, ez).setPosition(V(...o.centre.map((v, i) => v + o.n[i] * .006)));
  m.userData.decor = true; m.renderOrder = 1;
  parent.add(m);
  return m;
}

Object.assign($scope, { WALL_STYLES: STYLES, wallPattern, wallArt });
}
