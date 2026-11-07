// @ts-nocheck
/* Penrose Pedals engine: The hand-built teaching levels.
 * Installed into the shared engine scope in order (see ./index.ts); names come in from $scope and go back out to it. */
import * as T from 'three';

export function install($scope) {
const { B, CY, L3, Road, TAU, TEX, TEXS, THEMES, UNIT, UP, V, archGeo, at, backdrop, basic, clamp, cloudLayer, drift, faucetLift, filletPath, hull2, inHull, lollipop, lollipopLen, mix, mixPal, onFace, peelSwitch, powerOf, ribbon, rider, setTri, sp, sprite, tone, tri, trimRoad, turntable, turtle } = $scope;

const HAND_LEVELS = [
  { id: 'turntable', name: 'The turntable switch', th: () => THEMES[0],
    hint: 'The wheel laps the loop. Clutch the turntable (<b>Y</b>) and pedal while the wheel is away from it: it swings a quarter turn and clicks into place, sending the next lap out onto the pier. The pier\'s end lines up on screen with the road far below, and that is enough.',
    build(L) {
      const th = L.th, g = L.g;
      B(g, -1.2, -.6, -2.4, 10.2, 4.6, -.5, tri(sp(th, 0))); B(g, -.6, 0, -3, 9.6, 4, -2.4, tri(mixPal(sp(th, 0), tone(th.ink), .12)));
      for (let i = 0; i < 5; i++) onFace(g, 'y', 4.6, .6 + i * 2, -2.1, archGeo(.5, 1.1), basic(th.win.l, { opacity: .7 }));
      const loop = L.road(filletPath([[6, 0, 0], [9, 0, 0], [9, 4, 0], [0, 4, 0], [0, 0, 0], [3, 0, 0]], 1)); L.props.loop = loop;
      const pier = L.road(L3([3, -3, 0], [3, -5, 0], UP)); B(g, 2.5, -5, -3.4, 3.5, -3.6, -.5, tri(sp(th, 1)));
      const low = L.road(L3([0, -8, -3], [0, -12.5, -3], UP), { goal: true }); B(g, -.5, -12.5, -6.4, .5, -11.5, -3.5, tri(sp(th, 1))); B(g, -.5, -9.2, -5.6, .5, -8.4, -3.5, tri(sp(th, 1)));
      // a dusk tower behind the loop
      B(g, -3.4, -1.6, -3, -1.6, .2, 4.4, tri(sp(th, 0))); const dome = new T.Mesh(new T.SphereGeometry(.85, 20, 12, 0, TAU, 0, Math.PI / 2), tri(th.mech)); at(g, dome, -2.5, -.7, 4.4);
      for (let k = 0; k < 3; k++) onFace(g, 'y', .2, -2.5, .2 + k * 1.3, archGeo(.36, .8), basic(th.win.r));
      const t1 = turntable(L, { key: 'y', name: 'Turntable', pivot: [3, 0, 0], len: 3, open: -90 }); L.props.t1 = t1;
      L.view.updaters.push(() => { const a = t1.ang; L.props.ang = a; L.say(`turntable ${Math.round(-a)}°${a <= -89.5 ? ' · open to the pier' : a >= -.5 ? ' · closing the loop' : ''}`); });
    },
    spawn: L => ({ road: L.props.loop, s: 7.5, dir: 1 }),
    solve(L, W, R) { const m = L.machines[0], far = W.road === L.props.loop && W.s > 2 && W.s < L.props.loop.L - 3.5;
      R.cad = 78; m.set(far && L.props.ang > -89.5); },
    center: [3.5, -1.5, .4], pts: [[-1.2, -.6, 0], [10.2, 4.6, 0], [-3.4, -1.6, 5.4], [0, -12.5, -3], [3, -5.2, 0], [10.2, 4.6, -3], [0, -12.5, -6.4], [-3.4, .2, -3]],
    decor(L) { cloudLayer(L.view, L.th, '#FFFFFF', 4, .75, .55, .95, .2); drift(L.view, TEX.petal, '#FFB9A3', 12, .15, { vx: .3, vy: -.18, spin: 1.4 }); } },

  { id: 'lift', name: 'Cul-de-sac lift', th: () => THEMES[1],
    hint: 'The garden loop runs out onto the lift deck, turns round in a cul-de-sac and comes back. While the wheel is on the deck, clutch the faucet (<b>A</b>) and hold 85 rpm: the water lifts the deck to the second floor and it clicks into place, so the wheel comes back out up there. Lift it while the wheel is on the ground and the loop has a hole in it.',
    build(L) {
      const th = L.th, g = L.g;
      B(g, -4.4, -1.4, -1.6, 3.05, 3.4, -.5, tri(th.turf)); B(g, -4.1, -1.1, -3, 2.8, 3.1, -1.6, tri(sp(th, 0)));
      const ground = L.road(lollipop(3, 1, 180, 0, 1, 2), { pal: tone('#E9D7AE') }); L.props.ground = ground;
      const lift = faucetLift(L, { key: 'a', name: 'Faucet', J: [3, 1, 0], heading: 0, step: 1.8, pal: tone('#F3E6C4'), postPal: th.leaf, pipePal: th.leaf }); L.props.lift = lift; L.props.deck = lift.deck;
      // second floor: out of the cul-de-sac, round a bend, and a pier whose end lines up with the far road on screen
      const f2 = L.road(turtle(3, 1, 180, 3.6).fwd(.6).arc(1, 90).fwd(2.6).pts); B(g, 1.0, -2.4, -2.2, 1.8, -1.6, 3.1, tri(sp(th, 0)));
      const far = L.road(L3([-2.2, -6.2, 0], [-2.2, -10.7, 0], UP), { goal: true, pal: tone('#E9D7AE') }); B(g, -2.8, -10.8, -1.6, -1.6, -6, -.5, tri(th.turf)); B(g, -2.6, -10.6, -2.6, -1.8, -6.2, -1.6, tri(sp(th, 0)));
      // trees
      for (const [x, y, s] of [[-3.6, -1, 1], [-3.8, 2.6, .8]]) { CY(g, x, y, .1 * s, -.5, .6 * s, tri(tone('#9B7046')), 8); const c = new T.Mesh(new T.IcosahedronGeometry(.6 * s, 0), tri(th.leaf)); at(g, c, x, y, .6 * s + .5 * s); }
      L.view.updaters.push(() => { const z = lift.z; L.props.z = z; L.say(`deck ${z.toFixed(2)} m${z === 3.6 ? ' · second floor' : z === 0 ? ' · ground' : [1.8, 5.4].includes(z) ? ' · wrong floor' : ''}`); });
    },
    spawn: L => ({ road: L.props.ground, s: 4, dir: 1 }),
    solve(L, W, R) { const m = L.machines[0], d = L.props.deck, prog = W.road === d ? (W.dir > 0 ? W.s : d.L - W.s) : 99;
      if (prog < 2.5 && L.props.z < 3.6) { m.set(true); R.cad = 85; } else if (L.props.z === 3.6 || W.road !== d) { m.set(false); R.cad = 72; } },
    center: [1.2, -2, 1.6], pts: [[-4.4, -1.4, 0], [7.6, 2.4, 0], [7.6, 2.4, 6.7], [8, 1, 7.4], [-2.2, -10.8, 0], [-4.1, 3.1, -3], [7.5, -.4, -2.6], [-2.6, -10.6, -2.6]],
    decor(L) { cloudLayer(L.view, L.th, '#FFFFFF', 4, .8, .6, .95, .2); drift(L.view, TEX.petal, '#FFB5CE', 10, .14, { vx: .25, vy: -.15, spin: 1.2 }); } },

  { id: 'seesaw', name: 'Spring see-saw', th: () => THEMES[3],
    hint: 'The see-saw rests tipped one way, so the wheel crosses up to the spiral. While it spirals down, clutch the spring (<b>Y</b>) and push: around 80 rpm in gear 4 (or more gear) winds it and tips the beam the other way. Keep pushing until the wheel is across, or the spring unwinds and the beam tips back.',
    build(L) {
      const th = L.th, g = L.g, a = Math.asin(1 / 2.5), X = 2.5 * Math.cos(a);
      const pivot = new T.Group(); pivot.position.copy(V(0, 0, 1)); g.add(pivot); const beamMat = tri(th.idle, { fresh: true, side: true });
      const beam = L.road(L3([-2.5, 0, 0], [2.5, 0, 0], UP), { g: pivot, mat: beamMat, th: .35 }); L.props.beam = beam;
      B(g, -.4, .55, -3.2, .4, 1.15, 1.25, tri(sp(th, 2))); CY(g, 0, .3, .14, .85, 1.15, tri(th.mech), 12).rotation.x = Math.PI / 2;
      const start = L.road(L3([-7.5, 0, 0], [-X, 0, 0], UP)); L.props.start = start; B(g, -7.8, -.6, -3, -6.4, .6, -.5, tri(sp(th, 0)));
      const t = turtle(X, 0, 0, 2); t.grade = -2 / lollipopLen(1, 1.2); const spiral = L.road(t.fwd(1).teardrop(1.2).fwd(1).pts, { pal: sp(th, 1) }); L.props.spiral = spiral;
      const cx = X + 1 + 1.2 * 1.732; CY(g, cx, 0, .5, -3.2, 1.2, tri(sp(th, 2)), 6); const gem = new T.Mesh(new T.OctahedronGeometry(.45, 0), tri(th.mech)); at(g, gem, cx, 0, 1.9); L.view.updaters.push(tt => gem.rotation.y = tt);
      const upper = L.road(L3([-X, 0, 2], [-4.6, 0, 2], UP), { pal: sp(th, 2) }); L.props.upper = upper; for (const y of [-1.05, .65]) B(g, -4.4, y, -3, -3.8, y + .4, 1.25, tri(sp(th, 2))); B(g, -4.4, -1.05, 1.25, -3.8, 1.05, 1.55, tri(sp(th, 2)));
      const goal = L.road(L3([-6.6, -2, 0], [-10.5, -2, 0], UP), { goal: true, pal: sp(th, 0) }); B(g, -10.6, -2.6, -2.4, -8.6, -1.4, -.5, tri(sp(th, 1)));
      let c = 0;
      L.machine({ key: 'y', name: 'Spring', size: .7, place: h => { h.position.copy(V(0, 1.15, .7)); h.rotation.x = Math.PI / 2; g.add(h); },
        tick(dt, drive) {
          const hold = 90 + 150 * c, P = powerOf(rider.cad, rider.gear, .2 + 1.3 * c);
          if (drive > 0) c += (P - hold) * .006 * dt; else c -= .3 * dt; c = clamp(c, 0, 1);
          const k = clamp((c - .1) / .8, 0, 1), sm = k * k * (3 - 2 * k); pivot.rotation.z = a * (1 - 2 * sm);
          setTri(beamMat, mixPal(th.idle, th.mech, sm)); L.props.c = c;
          L.say(`spring ${Math.round(c * 100)}% · needs ${Math.round(hold)} W${sm >= 1 ? ' · tipped toward the upper road' : sm <= 0 ? ' · resting' : ''}`);
          return drive > 0 ? .2 + 1.3 * c : 0;
        } });
    },
    spawn: L => ({ road: L.props.start, s: .6, dir: 1 }),
    solve(L, W, R) { const m = L.machines[0], on = W.road === L.props.spiral || (W.road === L.props.beam && L.props.c > .5);
      m.set(on); R.cad = on ? 88 : 70; },
    center: [-1.5, -.6, .4], pts: [[-7.8, -.6, 0], [7.5, 1.2, 0], [-10.6, -2.6, 0], [0, 1, 2.6], [6.3, 0, 2.6], [-7.8, .6, -3], [6, 0, -3.2], [-10.6, -1.4, -2.4]], pad: 1.1,
    decor(L) { drift(L.view, TEX.diamond, '#FFF39B', 14, .14, { vx: .05, vy: .12, twinkle: 1.6, add: true, opacity: .75 }); cloudLayer(L.view, L.th, '#FFD6F0', 3, .3, .6, .95, .15); } },

  { id: 'lamps', name: 'Lamps on, lamps off', th: () => THEMES[4],
    hint: 'The wheel shuttles between two cul-de-sacs. Light lamp one (<b>Y</b>, about 85 rpm) and the next time round, a road of light opens off the far bend. Then switch to lamp two (<b>B</b>) for the second light bridge, and let it go dark again before the last gap: that gap only holds while you cannot see it.',
    build(L) {
      const th = L.th, g = L.g, X = 9.732;
      const main = L.road(L3([0, 0, 0], [6, 0, 0], UP)); L.props.main = main;
      const west = L.road(lollipop(0, 0, 180, 0)), east = L.road(lollipop(6, 0, 0, 0)); L.props.east = east;
      B(g, -3.4, -1.4, -2.6, 9.9, 1.4, -.5, tri(sp(th, 0))); B(g, -3, -1, -3.4, 9.5, 1, -2.6, tri(mixPal(th.stone, tone(th.ink), .2)));
      const lit = (b) => ({ t: mix('#2A2D55', '#FFF2C4', b), l: mix('#22264A', '#FFD979', b), r: mix('#1C1F40', '#FFC24A', b) });
      const lightMat = tri(lit(0), { fresh: true, opacity: .5, side: true }), light2Mat = tri(lit(0), { fresh: true, opacity: .5, side: true });
      const lampY = { b: 0 }, lampB = { b: 0 }; L.props.lampY = lampY; L.props.lampB = lampB;
      const lightA = L.road(L3([X, 0, 0], [X, -3, 0], UP), { mat: lightMat, th: .12, noLane: true, solid: () => lampY.b > .45, goneText: 'The light faded under the wheel' }); L.props.lightA = lightA;
      east.forks.push({ s: 1 + Math.PI / 3 + 150 * Math.PI / 180, dir: 1, to: lightA, toK: 0, when: () => lampY.b > .6, text: 'Took the road of light' });
      const b1 = L.road(L3([X, -3, 0], [X, -4.5, 0], UP)); L.props.b1 = b1;
      const b2 = L.road(L3([X, -5.5, 0], [X, -9, 0], UP)); L.props.b2 = b2;
      const c = L.road(L3([X, -10, 0], [X, -12.6, 0], UP), { goal: true });
      const light2 = L.road(L3([X, -4.5, 0], [X, -5.5, 0], UP), { mat: light2Mat, th: .12, noLane: true, solid: () => lampB.b > .45, goneText: 'Lamp two was too dim' }); L.props.light2 = light2;
      b2.gaps.push({ k: 1, to: c, toK: 0, when: () => lampB.b < .3, text: 'Crossed the dark gap unseen' }); b2.edgeText = 'Lamp two lit the gap, so it was real';
            const darkMat = tri(sp(th, 1), { fresh: true, opacity: .99 }), dark = B(g, X - .5, -10, -.5, X + .5, -9, 0, darkMat);
      B(g, X - .7, -12.8, -2.4, X + .7, -2.8, -.5, tri(mixPal(th.stone, tone(th.ink), .2)));
      B(g, X - .5, -10, -2.4, X + .5, -9, -.5, tri(tone('#0B0D24')));   // the hole, only visible once lit
      // two lamp posts behind the road, each with a cone of light and a lantern bloom at its foot
      const lamp = (y, st, key, name, rad = 1.7) => {
        B(g, 7.6, y - .5, -2.4, 8.6, y + .5, -.5, tri(sp(th, 0))); CY(g, 8.1, y, .08, -.5, 3, tri(tone('#2A2D55')), 8); B(g, 8.05, y - .05, 2.95, X, y + .05, 3.05, tri(tone('#2A2D55')));
        const bulb = new T.Mesh(new T.SphereGeometry(.17, 14, 10), basic('#3A3D66')); at(g, bulb, X, y, 2.8);
        const halo = sprite(TEX.glow, 2.6, 2.6, th.glow, { opacity: 0, add: true }); at(g, halo, X, y, 2.8);
        const cg = new T.ConeGeometry(rad, 3, 32, 1, true); cg.translate(0, -1.5, 0); const cone = new T.Mesh(cg, basic(th.glow, { opacity: 0, add: true, side: true })); at(g, cone, X, y, 2.8);
        L.machine({ key, name, size: .5, place: h => { h.position.copy(V(8.1, y, -.5)); g.add(h); },
          tick(dt, drive) { const tgt = drive > 0 ? clamp((rider.cad - 40) / 50, 0, 1) : 0; st.b += (tgt - st.b) * Math.min(1, dt * (drive > 0 ? 2.5 : 1.3));
            bulb.material.color.set(mix('#3A3D66', th.glow, st.b)); halo.material.opacity = st.b * .9; cone.material.opacity = st.b * .14; return drive > 0 ? .1 + .35 * st.b : 0; } });
      };
      lamp(-1.5, lampY, 'y', 'Lamp one'); lamp(-7.3, lampB, 'b', 'Lamp two', 2.8);
      L.view.updaters.push(() => { setTri(lightMat, lit(lampY.b)); lightMat.uniforms.opacity.value = .92 * lampY.b; setTri(light2Mat, lit(lampB.b)); light2Mat.uniforms.opacity.value = .92 * lampB.b;
        for (const r of [lightA, light2]) for (const m of r.vis || []) m.visible = r.mat.uniforms.opacity.value > .02;
        darkMat.uniforms.opacity.value = clamp(1 - lampB.b * 2.2, 0, 1); dark.visible = darkMat.uniforms.opacity.value > .01;
        L.say(`lamp one ${Math.round(lampY.b * 100)}% · lamp two ${Math.round(lampB.b * 100)}%`); });
      // windows in the base and a moon
      for (let i = 0; i < 6; i++) onFace(g, 'y', 1.4, -2.6 + i * 2, -2, archGeo(.36, .8), basic(th.glow, { opacity: .5 + .4 * (i % 2) }));
    },
    spawn: L => ({ road: L.props.main, s: 1, dir: 1 }),
    solve(L, W, R) { const [Y, Bm] = L.machines, r = W.road, P = L.props;
      R.cad = 86;
      if (r === P.lightA) { Y.set(true); Bm.set(true); } else if (r === P.b1 || r === P.light2) { Y.set(false); Bm.set(true); } else if (r === P.b2) { Y.set(false); Bm.set(false); } else { Y.set(true); Bm.set(false); } },
    center: [4.8, -5, .2], pts: [[-3.4, -1.4, 0], [9.9, 1.4, 0], [9.7, -12.8, 0], [8.1, -1.5, 3.2], [8.1, -7.4, 3.2], [-3, 1, -3.4], [9.7, -12.8, -2.4], [-3.4, -1.4, -2.6]],
    decor(L) { drift(L.view, TEX.dot, '#FFE69A', 16, .07, { vx: .1, vy: .08, twinkle: 2, add: true, opacity: .9 }); const [l, r, b, t] = L.view.screenBox(); const moon = backdrop(L.view, TEX.glow, 3, 3, r - 2.2, t - 2, -100, '#FFF4D0', .9); } },
  { id: 'longway', name: 'The long way round', th: () => THEMES[0], cruise: [78, 92],
    hint: 'A longer ride with two pulses and one long climb between them. The wheel laps the loop round the dome tower. Swing the turntable (<b>Y</b>) while the wheel is away from it, and the next lap runs down the pier, which meets the far road on screen. The far road zigzags up behind the clock tower, and every pass has a gap in it that the tower hides, so the wheel rides straight across. At the top, hold 85 rpm with the faucet (<b>A</b>) while the wheel is on the lift deck. Miss the lift and the wheel rides all the way back down for another go. Hold the pace band (78–92 rpm) on the long stretches; the lane lights up while you are in it.',
    build(L) {
      const th = L.th, g = L.g, postMat = tri(sp(th, 1));
      // the loop: a flat holding lap round a little dome tower; no coil, the zigzag is this level's long stretch
      const loop = L.road(filletPath([[4, 0, 0], [8, 0, 0], [8, 4, 0], [-2, 4, 0], [-2, 0, 0], [1, 0, 0]], 1.2)); L.props.loop = loop;
      { const x = -.2, y = 2.2;
        CY(g, x, y, .75, -2.2, 1.2, tri(sp(th, 2)), 28); CY(g, x, y, .95, 1.2, 1.45, tri(sp(th, 0)), 28); CY(g, x, y, .95, -2.4, -2.2, tri(sp(th, 0)), 28);
        const dome = new T.Mesh(new T.SphereGeometry(.68, 22, 12, 0, TAU, 0, Math.PI / 2), tri(th.mech)); at(g, dome, x, y, 1.45);
        for (let k = 0; k < 2; k++) onFace(g, 'y', y + .76, x - .25 + k * .5, -.6 + k * .9, archGeo(.22, .5), basic(th.win.r));
        const ring = new T.Mesh(new T.TorusGeometry(.85, .05, 6, 40), basic('#FFD15C', { opacity: .9 })); ring.rotation.x = Math.PI / 2; at(g, ring, x, y, 2.4); L.view.updaters.push(t => { ring.position.y = 2.4 + .2 * Math.sin(t * 1.1); }); }
      for (const [x, y] of [[7.4, 0], [8, 2], [7.4, 4], [3, 4], [-1.4, 4], [-2, 1.4], [-1.2, 0]]) CY(g, x, y, .14, -2.2, -.25, postMat, 10);
      L.props.t1 = turntable(L, { key: 'y', name: 'Turntable', pivot: [1, 0, 0], len: 3, open: -90 });
      L.road(L3([1, -3, 0], [1, -5, 0], UP)); CY(g, 1, -4.2, .16, -2.2, -.25, postMat, 10);
      // the far road: it meets the pier only on screen, then zigzags up behind the clock tower; each pass has a gap the tower hides
      const t = turtle(-2, -8, -90, -3), cut = () => { const p = t.pts; t.pts = []; t.add(); return p; }, gaps = [];
      t.fwd(1.5).arc(1.5, 45).gr(1 / 9.2).fwd(4);
      const r1 = L.road(cut(), { pal: sp(th, 1) }); t.fwd(1.2); gaps.push([t.x, t.y, t.z]); cut();
      t.fwd(4).gr(0).arc(1, -180).gr(1 / 9.2).fwd(4); const r2 = L.road(cut(), { pal: sp(th, 1) }); t.fwd(1.2); gaps.push([t.x, t.y, t.z]); cut();
      t.fwd(4).gr(0).arc(1, 180).gr(1 / 9.2).fwd(4); const r3 = L.road(cut(), { pal: sp(th, 1) }); t.fwd(1.2); gaps.push([t.x, t.y, t.z]); cut();
      t.fwd(4); const r4 = L.road(cut(), { pal: sp(th, 1) }); const J = [t.x, t.y, t.z];
      // the clock tower stands in front of the middle of the zigzag
      const k = Math.SQRT1_2, mid = gaps[0], cx = mid[0] - .6 * k + 3.1 * k, cy = mid[1] + .6 * k + 3.1 * k, hw = 1.3;
      const g3 = gaps[2], u = (x, y, z) => (2 * z - x - y) / Math.sqrt(6), zt = (Math.sqrt(6) * (u(g3[0] - .6 * k, g3[1] + .6 * k, g3[2]) + 1.5) + cx + cy - 2 * hw) / 2;
      const towerC = [[cx - hw, cy - hw], [cx + hw, cy - hw], [cx - hw, cy + hw], [cx + hw, cy + hw]].flatMap(([x, y]) => [[x, y, -8.4], [x, y, zt]]);
      B(g, cx - hw, cy - hw, -8.4, cx + hw, cy + hw, zt, tri(sp(th, 0))); B(g, cx - hw - .15, cy - hw - .15, zt, cx + hw + .15, cy + hw + .15, zt + .3, tri(sp(th, 2)));
      const roof = new T.Mesh(new T.ConeGeometry(1.25, 1.6, 4), tri(th.mech)); roof.rotation.y = Math.PI / 4; at(g, roof, cx, cy, zt + 1.1);
      const face = new T.Mesh(new T.CircleGeometry(.62, 40), basic('#FFF4EC')); face.position.copy(V(cx + hw + .015, cy, zt - 1)); face.rotation.y = Math.PI / 2; g.add(face);
      const hand = new T.Mesh(UNIT, basic(th.ink)); hand.scale.set(.05, .5, .05); const hp = new T.Group(); hp.position.copy(V(cx + hw + .03, cy, zt - 1)); hp.rotation.y = Math.PI / 2; hand.position.y = .22; hp.add(hand); g.add(hp); L.view.updaters.push(tt => { hp.rotation.z = -tt * .5; });
      for (let i = 0; i < 4; i++) onFace(g, 'y', cy + hw, cx - .6 + (i % 2) * 1.2, zt - 3.2 - Math.floor(i / 2) * 2.4, archGeo(.36, .8), basic(th.win.r));
      for (let i = 0; i < 3; i++) onFace(g, 'x', cx + hw, cy - .5 + (i % 2), zt - 3.2 - i * 2.2, archGeo(.36, .8), basic(th.win.l, { opacity: .8 }));
      const hidden = p => { const h = hull2(towerC.map(c => L.v2(V(...c)))), q = V(...p), dq = q.clone().applyMatrix4(L.view.camera.matrixWorldInverse).z, dt = V(cx, cy, zt / 2).applyMatrix4(L.view.camera.matrixWorldInverse).z; return inHull(h, L.v2(q), .25) && dt > dq; };
      [[r1, r2], [r2, r3], [r3, r4]].forEach(([a, b]) => { const pa = a.S[a.S.length - 1].p, pb = b.S[0].p, ends = [[pa.x, pa.z, pa.y], [pb.x, pb.z, pb.y]], ok = () => ends.every(hidden);
        a.gaps.push({ k: 1, to: b, toK: 0, when: ok, text: 'Behind the tower, so the gap is hidden' }); b.gaps.push({ k: 0, to: a, toK: 1, when: ok, text: 'Behind the tower, so the gap is hidden' }); });
      for (const r of [r1, r2, r3, r4]) for (const sAt of [1.2, r.L - 1.2]) { if (r.L < 3) continue; const f = r.S.find((q, i) => r.cum[i] >= sAt).p; CY(g, f.x, f.z, .14, -8.2, f.y - .5, postMat, 10); }
      L.props.lift = faucetLift(L, { key: 'a', name: 'Faucet', J, heading: -45, step: 1.8, pal: sp(th, 1) });
      L.road(turtle(J[0], J[1], 135, J[2] + 3.6).fwd(.6).arc(1.5, 90).fwd(3).pts, { goal: true, pal: sp(th, 2) });
      { const e = L.roads[L.roads.length - 1].S.at(-1).p; CY(g, e.x, e.z, .4, -8.4, e.y - .55, tri(sp(th, 0)), 18); }
      L.props.tower = { cx, cy, zt, hidden };
      L.view.updaters.push(() => { const t1 = L.props.t1, lf = L.props.lift; L.say(`turntable ${Math.round(-t1.ang)}° · deck ${lf.z === 0 ? 'on the road' : lf.z === 3.6 ? 'second floor' : lf.z.toFixed(1) + ' m'}`); });
    },
    spawn: L => ({ road: L.props.loop, s: 1, dir: 1 }),
    solve(L, W, R) { R.cad = 85; const t1 = L.props.t1, lf = L.props.lift, lp = L.props.loop, far = W.road === lp && W.s > 2 && W.s < lp.L - 4;
      t1.m.set(far && t1.ang > -89.5); lf.m.set(W.road === lf.deck && lf.z < 3.6); },
    center: [2, -8, -1], pts: [[-2.6, 4.6, -2.4], [8.6, -.6, -2.4], [-.2, 2.2, 3.2], [-2, -8, -8.4], [5.6, -19, -8.4], [-5, -16, -8.4]], pad: .8,
    decor(L) { cloudLayer(L.view, L.th, '#FFFFFF', 5, .75, .5, .95, .2); drift(L.view, TEX.petal, '#FFB9A3', 14, .15, { vx: .3, vy: -.18, spin: 1.4 }); } },

  { id: 'mobius', name: 'Möbius', th: () => THEMES[5], cruise: [78, 92],
    hint: 'A Möbius loop built from straights: each of the two side straights is one long quarter twist, so the wheel rides one lap on top of the strip and the next lap underneath it. Where the near straight meets its corner, a drawbridge stands raised, ready to carry the road straight on to the goal tower. Crank it down (<b>Y</b>). The wheel only rides onto it on a lap on top; underneath, it passes below the bridge and comes round again. Hold the pace band on the long laps.',
    build(L) {
      const th = L.th, g = L.g, Z = 2.4, half = .06, a = 4, rc = 1.8, sl = 2 * (a - rc), tw = sl, w = 1.15, sm = u => u * u * (3 - 2 * u);
      // centre line: a rounded square, straights along x = a (S1), y = a (S2), x = -a (S3), y = -a (S4)
      const tt = turtle(a, -(a - rc), 90, Z); for (let k = 0; k < 4; k++) tt.fwd(sl).arc(rc, 90); const C = tt.pts, cum = [0];
      for (let i = 1; i < C.length; i++) cum.push(cum[i - 1] + Math.hypot(C[i].p[0] - C[i - 1].p[0], C[i].p[1] - C[i - 1].p[1]));
      const seg = sl + rc * Math.PI / 2, L1 = cum[cum.length - 1];
      // twist: a quarter turn along the whole of S2 and another along the whole of S4; flat on S1, S3 and the corners
      const psiAt = s => { const t2 = seg + sl / 2, t4 = 3 * seg + sl / 2, q = (c, s) => sm(clamp((s - c + tw / 2) / tw, 0, 1)); return Math.PI / 2 * (q(t2, s) + q(t4, s)); };
      const frame = (i, extra) => { const A = C[Math.max(0, i - 1)].p, Bp = C[Math.min(C.length - 1, i + 1)].p, dx = Bp[0] - A[0], dy = Bp[1] - A[1], l = Math.hypot(dx, dy), d = [dx / l, dy / l];
        const psi = psiAt(cum[i]) + extra, s0 = [d[1], -d[0]], n = [Math.sin(psi) * s0[0], Math.sin(psi) * s0[1], Math.cos(psi)]; return n; };
      const lap = extra => C.map((q, i) => { const n = frame(i, extra); return { p: [q.p[0] + half * n[0], q.p[1] + half * n[1], q.p[2] + half * n[2]], n }; });
      const l1 = lap(0), l2 = lap(Math.PI);
      const ring = L.road(l1.concat(l2.slice(1)), { closed: true, noDeck: true, laneMat: tri(tone(th.ink), { side: true }) }); L.props.ring = ring; L.props.L1 = L1; L.props.seg = seg;
      const one = new Road(l1);
      g.add(ribbon(one, w, 2 * half, tri(th.mech, { side: true })));
      const railMat = tri(th.mechDark, { side: true }), inkLane = tri(tone(th.ink), { side: true });
      // the outer rail stops where the drawbridge carries the straight on, so nothing crosses the way out
      const sF = sl, peel = 1.6;
      g.add(ribbon(one, .12, .16, railMat, { x0: -.56, lift: .02 }));
      for (const [a0, a1] of [[0, sF - .3], [sF + peel, L1]]) g.add(ribbon(trimRoad(one, a0, a1), .12, .16, railMat, { x0: .56, lift: .02 }));
      // hub with the crank, and posts under the strip's lower edge
      CY(g, 0, 0, 1.1, -3.4, Z + .4, tri(sp(th, 0)), 28); CY(g, 0, 0, 1.4, -3.6, -3.4, tri(th.mechDark), 28);
      for (const sAt of [seg + .2 + sl, 2 * seg + sl / 2, 3 * seg - rc * .8, 4 * seg - rc * Math.PI / 4]) {
        const i = cum.findIndex(c => c >= sAt), n = frame(i, 0), q = C[i].p, d = [C[i + 1].p[0] - q[0], C[i + 1].p[1] - q[1]], l = Math.hypot(...d), s0 = [d[1] / l, -d[0] / l];
        const psi = psiAt(cum[i]), sd = [Math.cos(psi) * s0[0], Math.cos(psi) * s0[1], -Math.sin(psi)]; const e1 = q.map((v, k) => v + sd[k] * w / 2), e2 = q.map((v, k) => v - sd[k] * w / 2);
        const lo = Math.abs(e1[2] - e2[2]) < .05 ? (Math.hypot(e1[0], e1[1]) > Math.hypot(e2[0], e2[1]) ? e1 : e2) : (e1[2] < e2[2] ? e1 : e2);
        CY(g, lo[0], lo[1], .1, -3.4, lo[2] - .02, tri(th.mechDark), 10); CY(g, lo[0], lo[1], .3, -3.6, -3.4, tri(th.mechDark), 16); }
      // the way out: a drawbridge hinged at its far end carries the near straight straight on past the corner, to the goal road and its tower
      const top = Z + half - .004, Hn = [a, a - rc + 2.4, top], hg = new T.Group(); hg.position.copy(V(...Hn)); g.add(hg);
      const leafMat = tri(th.idle, { fresh: true, side: true }), wayLane = inkLane;
      const leaf = L.road(L3([0, -2.4, 0], [0, 0, 0], UP), { g: hg, mat: leafMat, th: 2 * half + .06, w, laneMat: wayLane }); L.props.leaf = leaf;
      const exit = L.road(L3(Hn, [a, Hn[1] + 4.2, top], UP), { goal: true, mat: tri(th.mech, { side: true }), th: .3, w, laneMat: wayLane });
      for (const x0 of [.56, -.56]) g.add(ribbon(exit, .12, .16, railMat, { x0, lift: .02 }));
      CY(g, a, Hn[1] + 3.7, .55, -3.4, top - .31, tri(sp(th, 0)), 18); CY(g, a, Hn[1] + 3.7, .72, -3.6, -3.3, tri(th.mechDark), 18);
      CY(g, a, Hn[1] + .3, .1, -3.4, top - .3, tri(th.mechDark), 10); CY(g, a, Hn[1] + .3, .3, -3.6, -3.4, tri(th.mechDark), 16);
      { const pin = new T.Mesh(new T.CylinderGeometry(.08, .08, w + .3, 12), tri(th.mechDark)); pin.position.copy(V(a, Hn[1], top - .2)); pin.rotation.z = Math.PI / 2; g.add(pin); }
      const hatch = { ang: 90, sweep: -1 }; L.props.hatch = hatch;
      ring.forks.push({ s: sF, dir: 1, to: leaf, toK: 0, when: () => hatch.ang < 1, text: 'On top, and the bridge is down, so the road runs straight on' });
      // the crank stands on its own post outside the ring, beside the bridge, so its badge sits in open sky
      const cp = [a + 2.4, Hn[1] - 1.2, top - .2]; CY(g, cp[0], cp[1], .12, -3.4, cp[2] + .1, tri(th.mechDark), 12); CY(g, cp[0], cp[1], .3, -3.6, -3.4, tri(th.mechDark), 16);
      hatch.m = L.machine({ key: 'y', name: 'Drawbridge', size: .6, place: h => { h.position.copy(V(cp[0], cp[1], cp[2] + .14)); g.add(h); },
        tick(dt, drive) {
          if (drive > 0) { hatch.ang += hatch.sweep * drive * 30; if (hatch.ang <= 0 || hatch.ang >= 90) { hatch.ang = clamp(hatch.ang, 0, 90); hatch.sweep *= -1; } }
          else { const tgt = hatch.ang > 45 ? 90 : 0; hatch.ang += clamp(tgt - hatch.ang, -60 * dt, 60 * dt); }
          hg.rotation.x = hatch.ang / 90 * 1.1; const dn = clamp(1 - hatch.ang / 30, 0, 1); setTri(leafMat, mixPal(th.idle, th.mech, clamp(Math.max(this.bloom.e, dn), 0, 1)));
          const W = L.W, side = W.road === ring ? (W.s < L1 ? 'wheel on top' : 'wheel underneath') : '';
          L.say(`bridge ${hatch.ang < 1 ? 'down' : hatch.ang > 89 ? 'raised' : Math.round(90 - hatch.ang) + '°'}${side ? ' · ' + side : ''}`);
          const off = Math.min(hatch.ang, 90 - hatch.ang); return drive > 0 ? .25 + .7 * Math.exp(-((off / 7) ** 2)) : 0;
        } });
    },
    spawn: L => ({ road: L.props.ring, s: L.props.seg + .6, dir: 1 }),
    solve(L, W, R) { R.cad = 85; L.props.hatch.m.set(L.props.hatch.ang > .5); },
    center: [1, 2, 0], pts: [[-5, -5, 2.4], [5, 5, 2.4], [-5, 5, 2.4], [5, -5, 2.4], [-5, 5, -3.6], [5, -5, -3.6], [0, 0, 4], [4.6, 9.4, 2.5], [4.6, 9.4, -3.6], [6.8, 3, 2.4]], pad: 1,
    decor(L) { const [l, r, b, t] = L.view.screenBox(); const g1 = backdrop(L.view, TEXS.bigGear, 10, 10, l + 3, b + (t - b) * .7, -110, '#C08A3A', .14); L.view.updaters.push(tt => g1.material.rotation = tt * .05);
      drift(L.view, TEX.dot, '#FFE7B0', 16, .06, { vx: .08, vy: .1, spin: 0, twinkle: 1.2, add: true, opacity: .8 }); } },
  { id: 'keys', name: 'Two keys', th: () => THEMES[2], cruise: [78, 92],
    hint: 'The wheel shuttles along the harbour road between two cul-de-sacs. One key waits at the end of the south spur and the other at the top of the north zigzag, where a gate opens only for a wheel carrying both. Crank the south points (<b>Y</b>) down and the next eastbound pass peels off south; crank the north points (<b>A</b>) down and the next westbound pass peels off north. Each spur brings the wheel back onto the harbour road heading the other way. Go north first and the gate stays shut, so it is all the way back down, out south and up again.',
    build(L) {
      const th = L.th, g = L.g, postMat = tri(sp(th, 1)), keys = { s: false, n: false }; L.props.keys = keys;
      // the harbour road: a straight shuttle with a cul-de-sac at each end, safe to lap forever
      const line = L.road(L3([-6, 0, 0], [6, 0, 0], UP)); L.road(turtle(6, 0, 0, 0).fwd(.4).teardrop(1.1).fwd(.4).pts); L.road(turtle(-6, 0, 180, 0).fwd(.4).teardrop(1.1).fwd(.4).pts);
      for (const x of [-7.4, -4, 4, 7.4]) CY(g, x, 0, .14, -2.4, -.25, postMat, 10);
      L.props.line = line;
      // houses along the harbour, clear of both spurs
      for (const [x0, y0, x1, y1, z1] of [[3.6, -3.6, 5.8, -1.8, 1.6], [-8.6, -3.6, -6.6, -2, 1.1]]) { B(g, x0, y0, -2.4, x1, y1, z1, tri(sp(th, 0)));
        const roof = new T.Mesh(new T.ConeGeometry(1, .8, 4), tri(th.roof)); roof.scale.set((x1 - x0) * .78, 1, (y1 - y0) * .78); roof.rotation.y = Math.PI / 4; at(g, roof, (x0 + x1) / 2, (y0 + y1) / 2, z1 + .4);
        for (let i = 0; i < 2; i++) onFace(g, 'y', y1, x0 + (i + .5) * (x1 - x0) / 2, z1 - 1, archGeo(.26, .6), basic(th.blue.l)); }
      // south points: eastbound at x = -3.5, peeling right; the spur runs out to a cul-de-sac with the first key
      const SP = peelSwitch(L, { line, s: 2.5, dir: 1, side: -1, key: 'y', name: 'South points', text: 'Peeled off south' });
      const ts = turtle(...SP.end.slice(0, 2), SP.end[3], SP.end[2]); ts.fwd(2.5).arc(2, -45).fwd(2.5);
      const south = L.road(ts.pts), sEnd = [ts.x, ts.y, ts.z], sd = turtle(sEnd[0], sEnd[1], -90, sEnd[2]).teardrop(1.1), sDrop = L.road(sd.pts);
      { const f = south.at(south.L * .5).p; CY(g, f.x, f.z, .14, -2.4, f.y - .25, postMat, 10); } CY(g, sEnd[0], sEnd[1] - 1.9, .5, -2.6, sEnd[2] - .3, tri(sp(th, 0)), 24);
      // north points: westbound at x = 3.5, peeling right; the spur zigzags up to a cul-de-sac with the second key
      const NP = peelSwitch(L, { line, s: 9.5, dir: -1, side: -1, key: 'a', name: 'North points', text: 'Peeled off north' });
      const tn = turtle(...NP.end.slice(0, 2), NP.end[3], NP.end[2]); tn.fwd(1.2).arc(1.5, -45).fwd(1.5).arc(1.2, -90).gr(1 / 8).fwd(4).gr(0).arc(1.2, 180).gr(1 / 8).fwd(4).gr(0).arc(1.2, -180).gr(1 / 8).fwd(4).gr(0);
      const north = L.road(tn.pts), nEnd = [tn.x, tn.y, tn.z], nd = turtle(nEnd[0], nEnd[1], 0, nEnd[2]).teardrop(1.1), nDrop = L.road(nd.pts);
      for (let sAt = 3; sAt < north.L - 1; sAt += 3.4) { const f = north.at(sAt).p; CY(g, f.x, f.z, .14, -2.4, f.y - .25, postMat, 10); }
      CY(g, nEnd[0] + 1.9, nEnd[1], .5, -2.6, nEnd[2] - .3, tri(sp(th, 0)), 24);
      // the gate: on the way back from the key, a branch peels north off the top pass to the goal
      const sG = north.L - 1.6, fg = north.at(sG), gh = Math.atan2(fg.d.z, fg.d.x) * 180 / Math.PI + 180;
      const tg = turtle(fg.p.x, fg.p.z, gh, fg.p.y).arc(2.5, -45).fwd(3.5), goal = L.road(tg.pts, { goal: true, pal: sp(th, 2) });
      north.forks.push({ s: sG, dir: -1, to: goal, toK: 0, when: () => keys.s && keys.n, text: 'Both keys, so the gate opened' });
      { const e = goal.S.at(-1).p; CY(g, e.x, e.z, .45, -2.6, e.y - .3, tri(sp(th, 0)), 20); }
      const gq = goal.at(2.4), gd = gq.d, gn = new T.Vector3(-gd.z, 0, gd.x).normalize(), gateMat = tri(th.mech, { fresh: true });
      for (const k of [-.78, .78]) { const q = gq.p.clone().addScaledVector(gn, k); CY(g, q.x, q.z, .1, q.y - .3, q.y + .75, tri(th.mechDark || th.idle), 10); }
      const gate = new T.Group(); gate.position.copy(gq.p).addScaledVector(gn, -.78); gate.position.y += .6; gate.lookAt(gate.position.clone().add(gn)); g.add(gate);
      const bar = new T.Mesh(UNIT, gateMat); bar.scale.set(.12, .12, 1.6); bar.position.z = .8; bar.userData.gate = true; gate.add(bar);
      const lock = new T.Mesh(new T.TorusGeometry(.16, .05, 8, 20), gateMat); lock.position.z = .78; lock.userData.gate = true; gate.add(lock);
      // keys: a bow, a shaft and two teeth, spinning over the far end of each cul-de-sac
      const sFar = (60 + 150) * Math.PI / 180 * 1.1;
      const mkKey = (road, id) => { const f = road.at(sFar).p, k = new T.Group(), m = basic(th.goal);
        const bow = new T.Mesh(new T.TorusGeometry(.2, .06, 8, 24), m); bow.position.y = .32; k.add(bow);
        const sh = new T.Mesh(UNIT, m); sh.scale.set(.07, .5, .07); k.add(sh);
        for (const [y, w] of [[-.16, .16], [-.04, .12]]) { const tooth = new T.Mesh(UNIT, m); tooth.scale.set(w, .06, .06); tooth.position.set(w / 2, y, 0); k.add(tooth); }
        k.add(sprite(TEX.glow, 1.4, 1.4, th.goal, { opacity: .45, add: true }));
        k.position.copy(f); g.add(k); return { k, p: f.clone(), id, got: 0 }; };
      const K = [mkKey(sDrop, 's'), mkKey(nDrop, 'n')];
      L.view.updaters.push((tt, dt) => {
        for (const q of K) { q.k.rotation.y = tt * 1.6; q.k.position.y = q.p.y + .8 + .1 * Math.sin(tt * 2 + (q.id === 'n' ? 1 : 0));
          if (!keys[q.id] && L.wheel.position.distanceTo(q.p) < .7) { keys[q.id] = true; L.flash(`Picked up a key (${+keys.s + +keys.n} of 2)`); }
          if (keys[q.id]) { q.got = Math.min(1, q.got + dt * 2.5); q.k.scale.setScalar(Math.max(.001, 1 - q.got)); q.k.position.y += q.got * 1.5; } }
        const open = keys.s && keys.n; gate.rotation.z += clamp((open ? -Math.PI / 2 : 0) - gate.rotation.z, -2 * dt, 2 * dt);
        setTri(gateMat, open ? tone(th.goal) : th.mech);
        const pt = st => st.ang < 1 ? 'down' : st.ang > 89 ? 'up' : '…';
        L.say(`keys ${+keys.s + +keys.n} of 2 · gate ${open ? 'open' : 'shut'} · south points ${pt(SP)} · north points ${pt(NP)}`); });
      L.props.SP = SP; L.props.NP = NP; L.props.zones = { s: [SP.leaf, south, sDrop], n: [NP.leaf, north, nDrop, goal] };
    },
    spawn: L => ({ road: L.props.line, s: 1, dir: 1 }),
    solve(L, W, R) { R.cad = 85; const { SP, NP, keys, zones } = L.props, wp = L.wheel.position;
      const wantN = !keys.n || keys.s, wantS = keys.n && !keys.s;
      const drive = (P, z, want) => !z.includes(W.road) && wp.distanceTo(P.at) > 2.5 && (want ? P.ang > .5 : P.ang < 89.5);
      SP.m.set(drive(SP, zones.s, wantS)); NP.m.set(drive(NP, zones.n, wantN)); },
    center: [0, 2, 0], pts: [[-8.6, -3.6, -2.4], [7.6, 1, -2.4]], pad: .8,
    decor(L) { cloudLayer(L.view, L.th, '#FFFFFF', 4, .75, .55, .95, .2); } }
];

/* ================= turntable studies: one machine, many branches ================= */
// crossDisc: a flush disc carrying two opposing quarter curves between four ports (west, north, east, south).
// State 0 joins W-N and E-S; a quarter turn joins N-E and S-W. One crank, four roads, every pairing reachable in two turns.

Object.assign($scope, { HAND_LEVELS });
}
