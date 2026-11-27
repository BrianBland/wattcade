import * as T from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LAP, WIDTH, type Course } from '../sim/track';
import { salvage } from '../sim/deck';
import { stations, forkCycle, stripCentre, stripHalfWidth, liveEdge, stormWidth } from '../sim/stormglass';

// Fixed castings are batched by finish, including the components of each moving arm.
function casting(parent: T.Object3D) {
  const parts = new Map<T.Material, T.BufferGeometry[]>();
  const pose = new T.Object3D();
  function add(
    mat: T.Material,
    g: T.BufferGeometry,
    x: number,
    y: number,
    z: number,
    rx = 0,
    ry = 0,
    rz = 0,
  ) {
    pose.position.set(x, y, z);
    pose.rotation.set(rx, ry, rz);
    pose.updateMatrix();
    const flat = g.index ? g.toNonIndexed() : g;
    if (flat !== g) g.dispose();
    flat.applyMatrix4(pose.matrix);
    if (!parts.has(mat)) parts.set(mat, []);
    parts.get(mat)!.push(flat);
  }
  function rod(mat: T.Material, a: T.Vector3, b: T.Vector3, r: number) {
    const g = new T.CylinderGeometry(r, r, a.distanceTo(b), 6);
    g.applyQuaternion(
      new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize()),
    );
    const p = a.clone().lerp(b, 0.5);
    add(mat, g, p.x, p.y, p.z);
  }
  function finish() {
    for (const [mat, list] of parts) {
      const mesh = new T.Mesh(mergeGeometries(list)!, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      list.forEach((g) => g.dispose());
    }
    parts.clear();
  }
  return { add, rod, finish };
}
const v = (x: number, y: number, z: number) => new T.Vector3(x, y, z);
function frame(course: Course, at: number, x = 0, y = 0) {
  const p = course.world(at, x, y),
    g = new T.Group();
  g.position.set(p.x, p.y, p.z);
  g.rotation.set(0, -p.yaw, p.bank, 'YXZ');
  return g;
}
function ribbon(
  course: Course,
  start: number,
  end: number,
  left: (d: number) => number,
  right: (d: number) => number,
  lift: number,
  mat: T.Material,
) {
  const pts: number[] = [],
    uv: number[] = [],
    indices: number[] = [];
  const count = Math.ceil((end - start) / 1.5);
  for (let i = 0; i <= count; i++) {
    const d = start + ((end - start) * i) / count;
    for (const [side, x] of [left(d), right(d)].entries()) {
      const p = course.world(d, x, lift);
      pts.push(p.x, p.y, p.z);
      uv.push(side, d);
    }
    if (i < count) {
      const n = i * 2;
      indices.push(n, n + 1, n + 3, n, n + 3, n + 2);
    }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(pts, 3));
  geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new T.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

// The sky reflection is strongest when the road is seen at a grazing angle.
// Glazed panels, matte splices and the edge conductor have separate responses.
function glassDeck(sky: T.Texture) {
  const mat = new T.MeshStandardMaterial({ color: '#71898e', roughness: 0.43, metalness: 0.24 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.stormSky = { value: sky };
    shader.vertexShader =
      'varying vec2 panelUv; varying vec3 deckWorld;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n panelUv=uv; deckWorld=(modelMatrix*vec4(transformed,1.)).xyz;',
      );
    shader.fragmentShader =
      'varying vec2 panelUv; varying vec3 deckWorld; uniform sampler2D stormSky;\n' +
      shader.fragmentShader
        .replace(
          '#include <color_fragment>',
          `
      #include <color_fragment>
      float edge=abs(panelUv.x-.5)*2.;
      float section=fract(panelUv.y/6.);
      float join=min(section,1.-section);
      float seam=1.-smoothstep(.004,.013+fwidth(section)*.5,join);
      float plate=floor(panelUv.y/6.);
      float variation=fract(sin(plate*71.753)*4375.6);
      vec3 enamel=mix(vec3(.031,.065,.092),vec3(.075,.112,.128),variation);
      diffuseColor.rgb=mix(enamel,vec3(.012,.029,.035),seam);
      // Stagger the glass panes and run copper buses under each shoulder.
      float lateral=fract(panelUv.x*4.+mod(plate,2.)*.5);
      float joint=1.-smoothstep(.004,.012+fwidth(panelUv.x)*3.,min(lateral,1.-lateral));
      diffuseColor.rgb*=1.-.44*joint;
      float bus=1.-smoothstep(.002,.012+fwidth(edge),abs(edge-.795));
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.21,.104,.066),bus*.85);
      float trim=smoothstep(.976,.984,edge);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.16,.22,.22),trim);
    `,
        )
        .replace(
          '#include <opaque_fragment>',
          `
      vec3 ray=reflect(normalize(deckWorld-cameraPosition),normalize(inverseTransformDirection(normal,viewMatrix)));
      vec2 skyUV=vec2(atan(ray.z,-ray.x)/(2.*PI),.5+asin(clamp(ray.y,-1.,1.))/PI);
      float fres=pow(1.-clamp(dot(normal,normalize(vViewPosition)),0.,1.),2.);
      outgoingLight+=texture2D(stormSky,skyUV).rgb*(.16+.70*fres)*(1.-seam*.78)*(1.-trim*.65);
      float edgeBand=1.-smoothstep(.003,.011+fwidth(edge),abs(edge-.94));
      float bandD=sin(panelUv.y*.010)+.27*sin(panelUv.y*.038);
      vec3 spectral=mix(vec3(.14,.69,.74),vec3(.65,.32,.56),smoothstep(-.7,.7,bandD));
      float dash=1.-smoothstep(.19,.25,abs(fract(panelUv.y/9.)-.5));
      float edgeLamp=1.-smoothstep(.005,.021+fwidth(edge),abs(edge-.867));
      outgoingLight+=spectral*(1.15*edgeBand + .10*pow(edge,5.) + .88*edgeLamp*dash);
      float coilLight=0.;
      for(int ring=0;ring<4;ring++){
        float distanceToLamp=panelUv.y-(460.+float(ring)*12.);
        coilLight+=exp(-.090*distanceToLamp*distanceToLamp);
      }
      outgoingLight+=vec3(.12,.35,.31)*coilLight*(.18+.80*edge*edge);

      #include <opaque_fragment>
    `,
        );
  };
  return mat;
}
export function buildCauseway(root: T.Object3D, course: Course, sky: T.Texture) {
  const alloy = new T.MeshStandardMaterial({ color: '#56737a', roughness: 0.52, metalness: 0.48 });
  const steel = new T.MeshStandardMaterial({ color: '#293946', roughness: 0.75, metalness: 0.26 });
  const copper = new T.MeshStandardMaterial({ color: '#c68355', roughness: 0.48, metalness: 0.36 });
  const porcelain = new T.MeshStandardMaterial({ color: '#97c9bf', roughness: 0.36, metalness: 0.12 });
  const amber = new T.MeshBasicMaterial({ color: '#ffd094' }),
    mint = new T.MeshBasicMaterial({ color: '#a6f8e4' });
  const box = (w: number, h: number, l: number) => new T.BoxGeometry(w, h, l);
  const cylinder = (r: number, b: number, h: number, n = 16) => new T.CylinderGeometry(r, b, h, n);
  const deck = ribbon(course, 0, LAP, (d) => -stormWidth(d), stormWidth, 0, glassDeck(sky));
  root.add(deck);
  // A shallow bank of haze blends the flooded works into the painted horizon.
  const floodLevel = -24;
  const water = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { panorama: { value: sky }, tide: { value: 0 } },
    vertexShader: `varying vec3 pos;
    void main(){ pos=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(pos,1.); }`,
    fragmentShader: `varying vec3 pos; uniform sampler2D panorama; uniform float tide;
    void main(){
      vec3 view=normalize(pos-cameraPosition);
      float swell=sin(pos.x*.29+pos.z*.12+tide*.8);
      float ripple=sin(pos.z*.56-pos.x*.21+tide*1.3+swell);
      vec3 ray=reflect(view,normalize(vec3(.024*swell,1.,.035*ripple)));
      vec3 sky=texture2D(panorama,vec2(.5+.39*ray.x,.42+.39*ray.y)).rgb;
      float fog=1.-smoothstep(80.,270.,length(pos-cameraPosition));
      gl_FragColor=vec4(mix(vec3(.042,.074,.12),sky,.48)+.010*ripple,.87*fog);
      #include <colorspace_fragment>
    }`,
  });
  const flood = new T.Mesh(new T.PlaneGeometry(900, 900), water);
  flood.rotation.x = -Math.PI / 2;
  flood.position.set(136, floodLevel, 0);
  flood.renderOrder = -1;
  root.add(flood);
  const girders = casting(root);
  const wpos = (d: number, x: number, h: number) => {
    const p = course.world(d, x, h);
    return v(p.x, p.y, p.z);
  };
  for (let d = 0; d < LAP; d += 12) {
    for (const side of [-1, 1]) {
      const a = side * stormWidth(d),
        b = side * stormWidth(d + 12);
      girders.rod(alloy, wpos(d, a, -0.25), wpos(d + 12, b, -0.25), 0.17);
      girders.rod(steel, wpos(d, a, -1.75), wpos(d + 12, b, -1.75), 0.16);
      girders.rod(copper, wpos(d, a, -1.75), wpos(d + 12, b, -0.25), 0.09);
      if (d % 48 === 0 && Math.min(d, LAP - d) > 28) {
        const foot = wpos(d, a, -1.7);
        girders.rod(steel, foot, v(foot.x + side * 2, floodLevel - 3, foot.z), 0.42);
      }
    }
    girders.rod(steel, wpos(d, -stormWidth(d), -0.38), wpos(d, stormWidth(d), -0.38), 0.22);
  }
  // Split-ring storm crowns anchor the two eyes of the figure eight. The
  // missing segment leaves a recognizable silhouette even in the far mist.
  const signals: T.MeshBasicMaterial[] = [];
  for (const [x, z, top] of [
    [62, 0, 48],
    [216, 0, 72],
  ]) {
    const centre = v(x, top, z),
      foot = v(x, -45, z);
    for (const side of [-1, 1]) {
      girders.rod(steel, foot.clone().add(v(side * 8, 0, 0)), centre.clone().add(v(side * 3, 0, 0)), 1.22);
      for (let y = -35; y < top - 8; y += 9)
        girders.rod(alloy, v(x - side * 4, y, z), v(x + side * 4, y + 9, z), 0.35);
    }
    const signal = mint.clone();
    signals.push(signal);
    for (let ring = 0; ring < 3; ring++) {
      const radius = 10.5 - ring * 1.7;
      const tor = new T.TorusGeometry(radius, ring === 0 ? 0.85 : 0.27, 8, 55, Math.PI * 1.72);
      girders.add(ring === 1 ? signal : ring === 2 ? copper : alloy, tor, x, top + 8, z, -0.34, 0.27, 0.48);
    }
    girders.rod(copper, centre.clone().add(v(0, -14, 0)), centre.clone().add(v(0, 18, 0)), 0.33);
    for (let i = 0; i < 8; i++) girders.add(porcelain, cylinder(2.9, 2.2, 0.54), x, top - 11 + i * 1.1, z);
  }
  // A dismantled induction coil frames the lower crossing. Its open ribs
  // reveal the high span through the gaps as the rider descends.
  for (let i = 0; i < 4; i++) {
    const d = 460 + i * 12,
      hoop = frame(course, d);
    hoop.updateMatrix();
    girders.rod(steel, v(-10, -1, 0).applyMatrix4(hoop.matrix), v(10, -1, 0).applyMatrix4(hoop.matrix), 0.45);
    const cast = (material: T.Material, radius: number, tube: number, depth: number) => {
      const g = new T.TorusGeometry(radius, tube, 8, 42, Math.PI);
      g.translate(0, -0.8, depth);
      g.applyMatrix4(hoop.matrix);
      girders.add(material, g, 0, 0, 0);
    };
    cast(steel, 10.05, 0.63, -0.46);
    cast(copper, 9.85, 0.39, 0.46);
    cast(mint, 9.38, 0.12, 0.5);
    for (let tooth = 0; tooth <= 8; tooth++) {
      const a = (tooth * Math.PI) / 8;
      const shoe = new T.BoxGeometry(0.46, 0.86, 1.43);
      shoe.rotateZ(a);
      shoe.translate(9.85 * Math.cos(a), -0.8 + 9.85 * Math.sin(a), 0);
      shoe.applyMatrix4(hoop.matrix);
      girders.add(alloy, shoe, 0, 0, 0);
    }
  }
  girders.finish();

  const forkRigs = stations.map((station) => {
    const mount = frame(course, station.at);
    root.add(mount);
    const sign = station.side,
      width = stormWidth(station.at);
    const base = (width + 0.58 + (station.exhibit ? 1.62 : 0)) * WIDTH;
    const baseParts = casting(mount);
    // A cantilever takes the receiver load back into the bridge. At the first
    // machine it also carries the little isolated test bed off the shoulder.
    baseParts.add(
      steel,
      box(base - width * WIDTH + 2, 0.55, 3.5),
      (sign * (base + width * WIDTH)) / 2,
      -1.6,
      0,
    );
    if (station.exhibit) {
      const padX = sign * (stripCentre + 1.62);
      root.add(
        ribbon(
          course,
          station.at - 11,
          station.at + 2,
          () => padX - 0.54,
          () => padX + 0.54,
          0,
          steel,
        ),
      );
    }
    for (const z of [-1.12, 1.12]) {
      baseParts.rod(steel, v(sign * (base + 1.4), -16, z), v(sign * base, 4.4, z), 0.43);
      baseParts.rod(alloy, v(sign * (base - 1.5), -8, z), v(sign * base, 4.4, z), 0.24);
    }
    baseParts.add(copper, cylinder(1.15, 1.15, 2.9), sign * base, 4.48, 0, Math.PI / 2);
    for (let i = 0; i < 6; i++)
      baseParts.add(porcelain, cylinder(0.97, 0.68, 0.32), sign * (base + 1.28), i * 0.62 + 0.6, 0);
    if (!station.exhibit) {
      for (const offset of [-stripHalfWidth, stripHalfWidth]) {
        const line = sign * (stripCentre + offset);
        const busbar = ribbon(
          course,
          station.at - 11,
          station.at + 2,
          () => line - 0.009,
          () => line + 0.009,
          0.058,
          copper,
        );
        root.add(busbar);
      }
    }
    baseParts.finish();
    const arm = new T.Group();
    arm.position.set(sign * base, 4.48, 0);
    mount.add(arm);
    const metal = casting(arm);
    // Riveted hollow jib and split contact shoes, visible against the sky.
    for (const z of [-0.71, 0.71]) {
      metal.rod(copper, v(0, 0.65, z), v(-sign * 6.1, 0.3, z), 0.21);
      metal.rod(alloy, v(0, -0.54, z), v(-sign * 6.1, -0.28, z), 0.17);
      for (let j = 0; j < 5; j++)
        metal.rod(alloy, v(-sign * j * 1.18, -0.45, z), v(-sign * (j + 1) * 1.18, 0.4, z), 0.085);
      metal.add(steel, box(0.94, 1.02, 0.42), -sign * 5.8, -0.15, z);
      metal.add(amber, box(0.82, 0.21, 0.47), -sign * 5.8, -0.72, z);
    }
    metal.add(alloy, box(0.56, 0.56, 2.1), -sign * 5.8, 0.23, 0);
    metal.finish();
    const centre = station.exhibit ? stripCentre + 1.62 : stripCentre;
    const patch = new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      uniforms: { warning: { value: 0 }, down: { value: 0 } },
      vertexShader: `varying vec2 st;void main(){st=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec2 st;uniform float warning;uniform float down;
        void main(){float x=abs(st.x-.5)*2.;float bars=1.-smoothstep(.20,.32,abs(fract(st.y*.37+x*.44)-.5));
        float ends=smoothstep(0.,.10,st.x)*(1.-smoothstep(.9,1.,st.x));
        vec3 tint=mix(vec3(.15,.74,.77),vec3(1.,.33,.064),warning);
        gl_FragColor=vec4(tint,(.20+bars*.42+down*.24)*ends);
        #include <colorspace_fragment>
        }`,
    });
    const outer = sign * (width + (station.exhibit ? 1.62 : 0)),
      inner = sign * (liveEdge + (station.exhibit ? 1.62 : 0));
    const footprint = ribbon(
      course,
      station.at - 11,
      station.at + 2,
      () => Math.min(inner, outer),
      () => Math.max(inner, outer),
      0.043,
      patch,
    );
    root.add(footprint);
    // The electrical curtain lands on the grounded busbar. Its broad footprint
    // and lowering jib remain legible with sound muted or colors desaturated.
    const discharge = new T.MeshBasicMaterial({ color: '#fce7a3', transparent: true, depthWrite: false });
    const arcGroup = new T.Group();
    mount.add(arcGroup);
    for (const z of [-0.81, 0.81]) {
      const arc = casting(arcGroup);
      for (let j = 0; j < 5; j++) {
        const p = (i: number) =>
          v(
            sign * (centre * WIDTH + 0.31 * Math.sin(i * 3 + z)),
            0.12 + i * 0.46,
            z + 0.15 * Math.sin(i * 2.4),
          );
        arc.rod(discharge, p(j), p(j + 1), 0.064);
      }
      arc.finish();
    }
    return { station, arm, arcGroup, patch, discharge };
  });
  // Only the nearest receiver needs a real dynamic light. Every receiver has
  // its own emissive ceramic and deck footprint visible at distance.
  const bounce = new T.PointLight('#ff9752', 0, 27, 2);
  root.add(bounce);
  const cells = salvage.map((site) => {
    const node = frame(course, site.at, site.x, 1);
    root.add(node);
    const fuse = casting(node);
    fuse.add(copper, cylinder(0.24, 0.24, 1.22), 0, 0, 0);
    for (let i = -2; i <= 2; i++)
      fuse.add(i === 0 ? mint : porcelain, cylinder(0.49, 0.35, 0.11), 0, i * 0.19, 0);
    fuse.finish();
    return node;
  });
  const chargedColor = new T.Color('#fff1ac');
  let lastCharge = 0,
    firedAt = -100;
  return (time: number, at: number, state: { doubleCharge: number }) => {
    if (state.doubleCharge > lastCharge) firedAt = time;
    if (state.doubleCharge < lastCharge || time < firedAt) firedAt = -100;
    lastCharge = state.doubleCharge;
    signals.forEach((m, i) => {
      const t = time - firedAt - i * 0.72;
      const pulse = t < 0 ? 0 : Math.min(1, t * 6) * Math.max(0, 1 - t / 7);
      m.color.set('#8dd6c9').lerp(chargedColor, pulse);
    });
    water.uniforms.tide.value = time;
    let nearest = Infinity;
    for (const { station, arm, arcGroup, patch, discharge } of forkRigs) {
      const cycle = forkCycle(station, time);
      arm.rotation.z = station.side * (-0.82 + cycle.down * 1.29);
      patch.uniforms.warning.value = cycle.warning;
      patch.uniforms.down.value = cycle.down;
      arcGroup.visible = cycle.live;
      discharge.opacity = 0.7 + 0.23 * cycle.down;
      const gap = Math.abs(((at - station.at + LAP * 1.5) % LAP) - LAP * 0.5);
      if (gap < nearest) {
        nearest = gap;
        const p = course.world(station.at, station.side * (stripCentre + (station.exhibit ? 1.62 : 0)), 2.4);
        bounce.position.set(p.x, p.y, p.z);
        bounce.intensity = 22 + cycle.warning * 60 + cycle.down * 120;
        bounce.color.set(cycle.warning > 0.4 ? '#ffa75b' : '#68dbc9');
      }
    }
    cells.forEach((node, i) => {
      node.visible = at % LAP < salvage[i].at;
      node.rotation.z = 0.15 * Math.sin(time * 2.3 + i);
    });
  };
}
