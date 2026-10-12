import { line, poly, rect, type G, type P } from '../prims';
import { shade } from './prims';

export const SKIN = '#efa970';
const INK = '#18202f';
const mix = (a: P, b: P, u: number): P => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
const normal = (a: P, b: P): P => {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [-(b[1] - a[1]) / d, (b[0] - a[0]) / d];
};
const bisector = (a: P, b: P): P => {
  const x = a[0]+b[0], y = a[1]+b[1], d = Math.hypot(x,y) || 1;
  return [x/d,y/d];
};
const offset = (p: P, n: P, w: number): P => [p[0] + n[0] * w, p[1] + n[1] * w];

/** One continuous contour through a bent limb. Shading never outlines the joint. */
function contour(g: G, points: P[], color: string) {
  g.beginPath(); g.moveTo(...points[0]);
  for (const p of points.slice(1)) g.lineTo(...p);
  g.fillStyle = color; g.fill();
  // Leave the root open: shoulder and hip contours merge into the torso.
  g.strokeStyle = INK; g.lineWidth = .32; g.lineJoin = 'round'; g.stroke();
  g.clip();
}

export function drawLeg(g: G, hip: P, knee: P, foot: P, shorts: string, tights: string | null, near: boolean) {
  const n = normal(hip, knee), m = normal(knee, foot);
  const bend = bisector(n,m);
  const thigh = mix(hip, knee, .45), calf = mix(knee, foot, .38), ankle = mix(knee, foot, .9);
  const skin = near ? SKIN : '#ad704e';
  const base = tights ?? skin;
  g.save();
  contour(g, [offset(hip,n,1.85), offset(thigh,n,1.65), offset(knee,bend,1.4),
    offset(calf,m,1.05), offset(ankle,m,.5), offset(foot,m,.5), offset(foot,m,-.5),
    offset(ankle,m,-.5), offset(calf,m,-.8), offset(knee,bend,-1.3), offset(thigh,n,-1.5), offset(hip,n,-1.8)], base);
  // The quadriceps, kneecap and calf form broad lit planes, with no hinge seams.
  poly(g, shade(base,.76), offset(hip,n,-1.8), offset(thigh,n,-1.5), offset(knee,bend,-1.3),
    offset(calf,m,-.8), offset(foot,m,-.5), foot, calf, knee, thigh, hip);
  if (near) {
    poly(g, shade(base,1.23), offset(thigh,n,1.65), offset(knee,bend,1.4), knee, mix(hip,knee,.25));
    poly(g, shade(base,1.16), knee, offset(calf,m,1), offset(ankle,m,.5), ankle, mix(knee,foot,.65));
    poly(g, shade(base,.87), offset(knee,bend,-.5), mix(knee,foot,.2), offset(calf,m,-.55), calf);
  }
  const hem = mix(hip,knee,.58);
  poly(g, shorts, offset(hip,n,2.2), offset(thigh,n,1.85), offset(hem,n,1.5),
    offset(hem,n,-1.45), offset(thigh,n,-1.75), offset(hip,n,-2.2));
  poly(g, shade(shorts,near ? 1.16 : 1.05), offset(hip,n,1.5), offset(thigh,n,1.4),
    offset(hem,n,.8), mix(hip,knee,.53), hip);
  poly(g, shade(shorts,.72), offset(hip,n,-2), offset(hem,n,-1.45), offset(hem,n,-.6), hip);
  line(g, shade(shorts,.65), .22, offset(hem,n,-1.5), offset(hem,n,1.5));
  if (!tights) {
    const sock = mix(knee,foot,.67);
    poly(g, near ? '#f2efda' : '#a3aba6', offset(sock,m,1), offset(foot,m,.65), offset(foot,m,-.65), offset(sock,m,-1));
    poly(g, near ? '#c7d0c6' : '#75877f', sock, foot, offset(foot,m,-.65), offset(sock,m,-1));
    line(g, '#7b8b93', .2, offset(sock,m,-1), offset(sock,m,1));
  }
  g.restore();
  // A cycling shoe wraps the foot, with a separate sole and a small fastening.
  poly(g, INK, [foot[0]-.9,foot[1]-.75], [foot[0]+.45,foot[1]-.75],
    [foot[0]+1.7,foot[1]-.05], [foot[0]+1.85,foot[1]+.55], [foot[0]+1.45,foot[1]+.8], [foot[0]-1,foot[1]+.65]);
  poly(g, near ? '#364253' : '#26323d', [foot[0]-.7,foot[1]-.55], [foot[0]+.3,foot[1]-.55],
    [foot[0]+1.3,foot[1]+.1], [foot[0]-.55,foot[1]+.25]);
  line(g, '#919ea4', .22, [foot[0]-.75,foot[1]+.58], [foot[0]+1.5,foot[1]+.62]);
  line(g, '#657384', .25, [foot[0]-.1,foot[1]-.25], [foot[0]+.55,foot[1]]);
}

export function drawArm(g: G, shoulder: P, elbow: P, hand: P, jersey: string, near: boolean) {
  const n = normal(shoulder,elbow), m = normal(elbow,hand);
  const bend = bisector(n,m);
  const upper = mix(shoulder,elbow,.5), fore = mix(elbow,hand,.32), wrist = mix(elbow,hand,.86);
  const skin = near ? SKIN : '#b17c56';
  g.save();
  contour(g, [offset(shoulder,n,1.2), offset(upper,n,1.18), offset(elbow,bend,1.08),
    offset(fore,m,.92), offset(wrist,m,.5), offset(hand,m,.48), offset(hand,m,-.48),
    offset(wrist,m,-.5), offset(fore,m,-.75), offset(elbow,bend,-1), offset(upper,n,-1), offset(shoulder,n,-1.2)], skin);
  poly(g, shade(skin,.75), offset(shoulder,n,-1.2), offset(upper,n,-1), offset(elbow,bend,-1),
    offset(fore,m,-.75), offset(hand,m,-.48), hand, fore, elbow, upper, shoulder);
  if (near) {
    poly(g, '#ffd09a', offset(upper,n,1.18), offset(elbow,bend,1.08), elbow, upper);
    poly(g, '#ffc68b', elbow, offset(fore,m,.92), offset(wrist,m,.5), wrist, fore);
  }
  // The sleeve joins the torso and ends above the elbow, without a black shoulder joint.
  const cuff = mix(shoulder,elbow,.6);
  poly(g, jersey, offset(shoulder,n,1.55), offset(upper,n,1.4), offset(cuff,n,1.25),
    offset(cuff,n,-1.25), offset(shoulder,n,-1.55));
  poly(g, shade(jersey,1.2), offset(shoulder,n,1.5), offset(cuff,n,1.1), cuff, shoulder);
  poly(g, shade(jersey,.74), shoulder, cuff, offset(cuff,n,-1.25), offset(shoulder,n,-1.5));
  line(g, shade(jersey,.63), .24, offset(cuff,n,-1.25), offset(cuff,n,1.25));
  g.restore();
  poly(g, '#182131', [hand[0]-.95,hand[1]-.7], [hand[0]+.6,hand[1]-.65],
    [hand[0]+1,hand[1]-.1], [hand[0]+.7,hand[1]+.65], [hand[0]-.6,hand[1]+.7]);
  poly(g, '#435066', [hand[0]-.7,hand[1]-.5], [hand[0]+.4,hand[1]-.45], [hand[0]+.7,hand[1]-.05], [hand[0]-.3,hand[1]+.05]);
  rect(g, skin, hand[0]+.65,hand[1]+.1,.35,.75);
}

/** Upright gaze over a tucked neck: a continuous cheek and jaw, rather than a hinged head. */
export function drawFace(g: G) {
  poly(g, INK, [-1.9,-1.8], [1.35,-1.9], [1.6,-.6], [2.2,.05], [1.65,.4],
    [1.5,1.55], [.65,2.15], [-.4,1.95], [-1.55,.9], [-2.05,-.15]);
  poly(g, SKIN, [-1.5,-1.5], [1.05,-1.6], [1.2,-.5], [1.85,.1], [1.35,.35],
    [1.2,1.45], [.6,1.8], [-.35,1.65], [-1.35,.75]);
  poly(g, '#ffd09a', [-.1,-1.45], [1.05,-1.6], [1.2,-.5], [.6,.35], [-.05,.5]);
  poly(g, '#c18053', [-1.35,-.2], [-.55,.2], [.25,1.5], [.6,1.8], [-.35,1.65], [-1.35,.75]);
  poly(g, '#49362d', [-1.85,-1.65], [-.45,-1.6], [-.75,-.6], [-1.4,.45], [-1.95,-.05]);
  poly(g, '#f6bb83', [-1.2,-.6], [-.55,-.55], [-.6,.45], [-1,.65], [-1.35,.05]);
  rect(g, '#b7764e', -.95,-.3,.25,.5);
  line(g, '#48342d', .22, [.55,-.8], [1.1,-.75]);
  rect(g, INK, .9,-.65,.25,.4);
  rect(g, '#ffe0ad', 1.35,-.15,.25,.25);
  line(g, '#985f44', .2, [.9,1], [1.4,1.05]);
}
