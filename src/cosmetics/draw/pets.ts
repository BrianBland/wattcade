import { circle, line, oval, poly, rect, TAU, type G } from './prims';

/** What a pet animates with: `gait` = stride phase (radians, from distance), `speed` m/s, `color` the rider's. */
export interface PetCtx { t: number; speed: number; gait: number; color: string }

/** Runners trot ahead of the front wheel; fliers hover behind the rider's shoulder. */
export const FLIERS = new Set(['bee', 'parrot', 'bat', 'dragon', 'ghost', 'gull', 'drone', 'miniufo', 'ember']);
/** Where each kind sits in rider space (ground at y = 0). */
export const RUN_AT: [number, number] = [15, 0];
export const FLY_AT: [number, number] = [-12, -25];
/** Below this speed (m/s) a runner sits down and looks back at you. */
const REST = 0.6;

/**
 * Draws pet `id` with its feet (runners) or its centre (fliers) at (0,0), facing +x, ~6–8 px tall.
 * `sitting` forces the resting pose (riding in the cargo box).
 */
export function drawPet(g: G, id: string, c: PetCtx, sitting = false) {
  const f = PETS[id]; if (!f) return;
  const rest = sitting || (!FLIERS.has(id) && c.speed < REST);
  f(g, c, rest);
}

/** Two pairs of little legs: trotting (phase from distance) or tucked when resting. */
function legs(g: G, col: string, x0: number, x1: number, top: number, c: PetCtx, rest: boolean) {
  for (const [x, ph] of [[x0, 0], [x0 + 0.8, Math.PI], [x1, Math.PI], [x1 + 0.8, 0]] as const) {
    if (rest) { line(g, col, 0.9, [x, top], [x + 0.6, -0.3]); continue; }
    const s = Math.sin(c.gait + ph);
    line(g, col, 0.9, [x, top], [x + s * 1.2, -Math.max(0, -Math.cos(c.gait + ph)) * 0.8]);
  }
}
const flap = (c: PetCtx) => Math.sin(c.t * (14 + c.speed * 2));
const hover = (c: PetCtx) => Math.sin(c.t * 2.3) * 1.1;
const eye = (g: G, x: number, y: number) => circle(g, '#15151c', x, y, 0.32);

const PETS: Record<string, (g: G, c: PetCtx, rest: boolean) => void> = {
  corgi: (g, c, rest) => {
    const y=(rest?.6:0)-(rest?0:Math.abs(Math.sin(c.gait))*.3);
    legs(g,'#c37a36',-2.7,1.2,-1.5+y,c,rest);
    for(const [x,ph]of [[-2.7,0],[-1.9,Math.PI],[1.2,Math.PI],[2,0]]){
      const sx=rest?.6:Math.sin(c.gait+ph)*1.2,sy=rest?-.3:-Math.max(0,-Math.cos(c.gait+ph))*.8;
      rect(g,'#fff0d5',x+sx-.4,sy-.4,1.1,.7);
    }
    poly(g,'#e79a42',[-4,-3.5+y],[-3.1,-4.7+y],[.4,-4.8+y],[2.6,-4+y],[2.9,-2+y],[1.3,-1.2+y],[-3,-1.3+y],[-4,-2.2+y]);
    poly(g,'#f6c574',[-3.2,-4.3+y],[-.5,-4.4+y],[1.8,-3.9+y],[-2.8,-3.8+y]);
    poly(g,'#fff0d5',[-1.5,-2.8+y],[1.5,-3.4+y],[2.5,-2.8+y],[1,-1.4+y],[-1.9,-1.7+y]);
    const hx=rest?2.5:2.9,hy=-5.1+y;
    poly(g,'#e79a42',[hx-1.7,hy-.9],[hx-1.1,hy-1.6],[hx+1.2,hy-1.5],[hx+1.9,hy-.4],[hx+1.8,hy+1.5],[hx-.7,hy+1.7],[hx-1.8,hy+.6]);
    for(const dx of [-1.1,.7]){poly(g,'#df8b36',[hx+dx-.6,hy-1],[hx+dx-.4,hy-3.1],[hx+dx+.7,hy-1.1]);poly(g,'#edbd80',[hx+dx-.2,hy-1.3],[hx+dx-.2,hy-2.2],[hx+dx+.3,hy-1.3]);}
    poly(g,'#fff0d5',[hx+.1,hy+.1],[hx+1,hy+.3],[hx+2.2,hy+.4],[hx+2.2,hy+1.2],[hx+.7,hy+1.6],[hx-.4,hy+.9]);
    rect(g,'#25313a',hx+.8,hy-.6,.6,.7);rect(g,'#25313a',hx+1.9,hy+.3,.6,.5);rect(g,'#d47580',hx+1.1,hy+1.3,.5,.7);
    line(g,'#bc5546',.45,[hx-1.5,hy+1.3],[hx+.2,hy+1.7]);
    line(g,'#e79a42',1.1,[-3.6,-3.2+y],[-5,-4+y],[-5.2,-5+y+Math.sin(c.t*8)*.3]);rect(g,'#fff0d5',-5.6,-5.2+y,.9,.9);
  },
  cat: (g, c, rest) => {
    const y = rest ? 0.8 : 0;
    legs(g, '#3a3a48', -2, 1.4, -2.2 + y, c, rest);
    oval(g, '#4a4a5a', -0.3, -3.2 + y, 3, 1.3); circle(g, '#4a4a5a', rest ? 2 : 2.8, -4.8 + y, 1.4);
    const hx = rest ? 2 : 2.8;
    poly(g, '#4a4a5a', [hx - 1.2, -5.4 + y], [hx - 0.8, -7 + y], [hx - 0.2, -5.8 + y]); poly(g, '#4a4a5a', [hx + 0.2, -5.8 + y], [hx + 0.8, -7 + y], [hx + 1.2, -5.4 + y]);
    circle(g, '#9fe36b', hx + (rest ? -0.5 : 0.6), -5 + y, 0.35);
    g.strokeStyle = '#4a4a5a'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(-3.2, -3.4 + y); g.quadraticCurveTo(-5.4, -4 + y, -4.6, -7 + y + Math.sin(c.t * 3)); g.stroke();
  },
  pig: (g, c, rest) => {
    const y = rest ? 0.8 : 0;
    legs(g, '#f29bb0', -1.8, 1.2, -2 + y, c, rest);
    oval(g, '#ffb3c6', 0, -3.4 + y, 3.2, 2); circle(g, '#ffb3c6', 2.8, -4 + y, 1.5); oval(g, '#f29bb0', 4.1, -3.8 + y, 0.6, 0.7);
    eye(g, 3, -4.6 + y); poly(g, '#f29bb0', [2, -5.2 + y], [2.4, -6.4 + y], [3, -5.4 + y]);
    g.strokeStyle = '#f29bb0'; g.lineWidth = 0.5; g.beginPath(); g.arc(-3.6, -4 + y, 0.6, 0, TAU * 0.8); g.stroke();
  },
  chicken: (g, c, rest) => {
    const b = rest ? 0 : Math.abs(Math.sin(c.gait)) * 0.6;
    if (!rest) for (const ph of [0, Math.PI]) line(g, '#ff9a2b', 0.6, [0, -2.4], [Math.sin(c.gait + ph) * 1.2, 0]);
    oval(g, '#f8f8f0', -0.2, -3.6 - b, 2.4, 1.8); circle(g, '#f8f8f0', 1.8, -5.6 - b, 1.2); poly(g, '#e8322b', [1.4, -6.6 - b], [1.8, -7.4 - b], [2.4, -6.6 - b]);
    poly(g, '#ff9a2b', [2.9, -5.8 - b], [4, -5.5 - b], [2.9, -5.2 - b]); eye(g, 2.2, -5.9 - b);
    poly(g, '#e6e6dc', [-2.2, -4 - b], [-3.8, -5.6 - b], [-3, -3.2 - b]); oval(g, '#e6e6dc', -0.4, -3.6 - b, 1.4, 0.8, 0.2 + flap(c) * 0.2);
  },
  hamsterball: (g, c) => {
    const r = 3.4, a = c.gait * 0.6;
    g.fillStyle = '#cfefff55'; g.beginPath(); g.arc(0, -r, r, 0, TAU); g.fill();
    const run = Math.sin(c.gait * 2) * 0.5;
    oval(g, '#f2a33a', 0, -1.8, 1.8, 1.2); circle(g, '#f2a33a', 1.4, -2.6, 0.9); eye(g, 1.8, -2.8); line(g, '#d67f1a', 0.5, [-0.6, -0.8], [-0.6 + run, -0.2]); line(g, '#d67f1a', 0.5, [0.6, -0.8], [0.6 - run, -0.2]);
    oval(g,'#fff0d7',.2,-1.5,1.3,.6);circle(g,'#cc803b',.8,-3.3,.45);circle(g,'#ffb4af',2.1,-2.3,.25);
    line(g,'#f2fbf8',.4,[-2.3,-5.3],[-1.5,-6]);
    g.strokeStyle = '#9dcce2'; g.lineWidth = 0.4; g.beginPath(); g.arc(0, -r, r, 0, TAU); g.stroke();
    for (let i = 0; i < 3; i++) { const q = a + (i * TAU) / 3; line(g, '#e8f6ff88', 0.3, [Math.cos(q) * r * 0.9, -r + Math.sin(q) * r * 0.9], [Math.cos(q) * r * 0.55, -r + Math.sin(q) * r * 0.55]); }
  },
  trex: (g, c, rest) => {
    const b = rest ? 0 : Math.abs(Math.sin(c.gait)) * 0.5;
    if (!rest) for (const ph of [0, Math.PI]) line(g, '#3a8a3a', 1, [0, -3], [Math.sin(c.gait + ph) * 1.4, 0]);
    else line(g, '#3a8a3a', 1, [0, -3], [0.8, 0]);
    poly(g, '#4caf50', [-5, -3.4 - b], [-1, -5 - b], [1.6, -5.4 - b], [1.2, -2.4 - b], [-1, -2.6 - b]);
    poly(g,'#65af4c',[.6,-5.1-b],[1,-7.3-b],[2.2,-8-b],[4.4,-7.7-b],[5,-6.8-b],[4.8,-5.4-b],[3.1,-5-b]);
    poly(g,'#bed37c',[-.4,-3-b],[1.2,-4.8-b],[2.3,-4.6-b],[1.3,-2.4-b]);
    rect(g,'#293d35',2.8,-7.1-b,.6,.7);poly(g,'#324d38',[3,-6-b],[5,-6.2-b],[4.5,-5.4-b],[3.2,-5.4-b]);rect(g,'#f3ebce',3.6,-6-b,.6,.5);
    for(let i=0;i<4;i++)poly(g,'#32824d',[-3.7+i*1.1,-3.7-i*.3-b],[-3.2+i*1.1,-4.7-i*.3-b],[-2.7+i*1.1,-4-i*.3-b]);
    line(g, '#3a8a3a', 0.5, [1.4, -4.4 - b], [2.2, -4 - b + Math.sin(c.t * 9) * 0.3]);
  },
  penguin: (g, c, rest) => {
    const w = rest ? 0 : Math.sin(c.gait) * 0.18;
    g.save(); g.rotate(w);
    oval(g, '#20232c', 0, -3.4, 1.9, 3.2); oval(g, '#f8f8f0', 0.6, -3, 1.2, 2.5); circle(g, '#20232c', 0.4, -6.4, 1.3);
    poly(g, '#ff9a2b', [1.6, -6.5], [2.8, -6.2], [1.6, -5.9]); eye(g, 1, -6.7); rect(g, '#ff9a2b', -1, -0.4, 2.4, 0.5);
    g.restore();
  },
  ember: (g, c) => {
    const y = hover(c), f = 0.7 + Math.sin(c.t * 12) * 0.3;
    circle(g, '#ff8a1a', 0, y, 1.4 * f); circle(g, '#ffd23b', 0.2, y + 0.2, 0.7 * f);
    poly(g, '#e8322b', [-0.4, y + 0.6], [0, y - 1.6 * f], [0.5, y + 0.4]);
  },
  turret: (g, c, rest) => {
    const y = rest ? 0.6 : Math.abs(Math.sin(c.gait)) * 0.2;
    rect(g, '#5a616e', -2.2, -2.4 + y, 4.4, 2); rect(g, '#3a3f48', -2.6, -1.2 + y, 5.2, 0.8);
    g.save(); g.translate(0.4, -2.2 + y); g.rotate(Math.sin(c.t * 1.5) * 0.4);
    rect(g, '#7d8494', 0, -0.4, 3.2, 0.8); circle(g, '#ffd23b', 3.2, 0, 0.35); g.restore();
  },
  robodog: (g, c, rest) => {
    const y = rest ? 0.8 : 0;
    legs(g, '#7d8494', -2, 1.4, -2.2 + y, c, rest);
    rect(g, '#c6ccd6', -3, -4.4 + y, 5.6, 2.4); rect(g, '#c6ccd6', 2, -6.6 + y, 2.4, 2.2); rect(g, c.color, 3.4, -6 + y, 0.8, 0.6);
    line(g, '#7d8494', 0.4, [2.4, -6.6 + y], [2.2, -8 + y]); circle(g, Math.floor(c.t * 3) % 2 ? '#ff2e93' : '#555', 2.2, -8.1 + y, 0.4);
    line(g, '#7d8494', 0.5, [-3, -4 + y], [-4.4, -5 + y + Math.sin(c.t * 14) * 0.4]);
  },
  bee: (g, c) => {
    const y = hover(c), w = Math.abs(flap(c));
    oval(g, '#cfefffaa', -0.4, -1.6 + y, 1.1, 1.6 * w + 0.2); oval(g, '#ffd23b', 0, y, 1.8, 1.2);
    for (const x of [-0.6, 0.6]) rect(g, '#15151c', x - 0.25, y - 1.1, 0.5, 2.2); eye(g, 1.3, y - 0.3);
  },
  parrot: (g, c) => {
    const y = hover(c), w = flap(c);
    oval(g, '#e74c3c', 0, y, 2.2, 1.2, -0.3); circle(g, '#e74c3c', 1.8, y - 1, 1); poly(g, '#ffd23b', [2.6, y - 1.1], [3.4, y - 0.6], [2.5, y - 0.4]); eye(g, 2, y - 1.2);
    poly(g, '#3b82ff', [-0.6, y - 0.3], [-1.8, y - 2.4 * w], [0.8, y - 0.4]); poly(g, '#22b14c', [-2, y + 0.2], [-4.6, y + 1.4], [-2, y + 0.8]);
  },
  bat: (g, c) => {
    const y = hover(c), w = flap(c);
    poly(g, '#2a2236', [0, y], [-3.6, y - 2 * w], [-2.4, y - 0.2], [-1.2, y + 0.6]); poly(g, '#3a3048', [0, y], [3.6, y - 2 * w], [2.4, y - 0.2], [1.2, y + 0.6]);
    circle(g, '#3a3048', 0, y, 1.1); poly(g, '#3a3048', [-0.8, y - 0.6], [-0.6, y - 1.8], [-0.1, y - 0.8]); poly(g, '#3a3048', [0.1, y - 0.8], [0.6, y - 1.8], [0.8, y - 0.6]);
    circle(g, '#ff4d4d', 0.4, y - 0.2, 0.22);
  },
  dragon: (g, c) => {
    const y = hover(c), w = flap(c);
    poly(g, '#7d3bd1', [-0.4, y - 0.4], [-2.4, y - 3 * w - 0.4], [0.6, y - 0.8]);
    oval(g, '#9b59f6', 0, y, 2.4, 1.3); circle(g, '#9b59f6', 2.4, y - 1.2, 1.7); poly(g, '#ffd23b', [2, y - 2.2], [2.2, y - 3], [2.6, y - 2.2]);
    eye(g, 2.8, y - 1.4); g.strokeStyle = '#9b59f6'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(-2.2, y + 0.2); g.quadraticCurveTo(-4, y + 1.6, -5, y + 0.4); g.stroke();
    poly(g,'#d2a6e6',[-1,y+.3],[.1,y-1.1],[1.4,y-.8],[1.4,y+1],[.1,y+1.3]);
    poly(g,'#e6bb65',[1.4,y-2],[1.4,y-3.3],[2,y-2.2]);poly(g,'#d3aa57',[2.6,y-2],[3,y-3],[3.2,y-2]);
    poly(g,'#ba86dd',[-1,y-.8],[-3.2,y-1.5-w*2],[-2.4,y-1],[0,y+.2]);
    line(g,'#8351b6',.6,[-.5,y+.7],[-.8,y+2],[.1,y+2]);line(g,'#8351b6',.6,[1,y+.5],[1.2,y+1.7],[2,y+1.7]);
    if (c.speed > 7) { const k = (c.t * 3) % 1; circle(g, '#ff9a2b', 4 + k * 3, y - 1 + k, 0.5 * (1 - k)); } // sprint sneezes
  },
  ghost: (g, c) => {
    const y = hover(c) * 1.4;
    g.save(); g.globalAlpha *= 0.8;
    g.fillStyle = '#f4f4ff'; g.beginPath(); g.arc(0, y - 1, 2.2, Math.PI, 0); g.lineTo(2.2, y + 2);
    for (let i = 0; i < 4; i++) g.lineTo(2.2 - (i + 0.5) * 1.1, y + 2 + ((i + Math.floor(c.t * 4)) % 2 ? -0.6 : 0));
    g.lineTo(-2.2, y + 2); g.closePath(); g.fill();
    g.restore(); eye(g, 0.4, y - 1.2); eye(g, 1.4, y - 1.2); oval(g, '#15151c', 0.9, y, 0.4, 0.5);
  },
  gull: (g, c) => {
    const y = hover(c), w = flap(c);
    oval(g, '#f8f8f0', 0, y, 2, 0.9); circle(g, '#f8f8f0', 1.8, y - 0.5, 0.8); poly(g, '#ffb020', [2.5, y - 0.6], [3.6, y - 0.3], [2.5, y - 0.1]); eye(g, 2, y - 0.7);
    line(g, '#c6ccd6', 0.8, [-0.6, y - 0.2], [-2, y - 2.2 * w], [-4, y - 1.4 * w]); poly(g, '#9a9aa8', [-2, y], [-3, y - 0.4], [-2.8, y + 0.6]);
  },
  drone: (g, c) => {
    const y = hover(c) * 0.6, s = Math.abs(Math.cos(c.t * 40)) * 1.6;
    rect(g, '#3a3f48', -2.4, y - 0.6, 4.8, 1.2); line(g, '#3a3f48', 0.4, [-2.2, y - 0.6], [-2.2, y - 1.4]); line(g, '#3a3f48', 0.4, [2.2, y - 0.6], [2.2, y - 1.4]);
    line(g, '#c6ccd6', 0.4, [-2.2 - s, y - 1.5], [-2.2 + s, y - 1.5]); line(g, '#c6ccd6', 0.4, [2.2 - s, y - 1.5], [2.2 + s, y - 1.5]);
    circle(g, Math.floor(c.t * 2) % 2 ? '#22e06b' : '#e8322b', 0, y + 0.9, 0.4); circle(g, c.color, 1.6, y, 0.3);
  },
  miniufo: (g, c) => {
    const y = hover(c);
    oval(g, '#bfefff99', 0, y - 1, 1.4, 1.2, 0, true); oval(g, '#9aa0aa', 0, y, 3, 0.9); circle(g, '#7dffb0', 0, y - 1.3, 0.5);
    for (let i = 0; i < 3; i++) circle(g, Math.floor(c.t * 5 + i) % 3 === 0 ? '#fff3a0' : '#5d636e', -1.6 + i * 1.6, y + 0.2, 0.3);
  },
};
/** Every drawable pet id (tests check the catalogue against it). */
export const PET_IDS = Object.keys(PETS);
