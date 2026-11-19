import * as T from 'three';
import { LAP, world } from '../sim/track';
import { pads } from '../sim/race';

export function buildYard(scene: T.Scene, roadMap: T.Texture, props: T.Texture[], anisotropy: number) {
  roadMap.colorSpace = T.SRGBColorSpace;
  roadMap.wrapT = T.RepeatWrapping;
  roadMap.anisotropy = Math.min(8, anisotropy);
  const pos: number[] = [],
    uv: number[] = [],
    index: number[] = [];
  for (let i = 0; i <= 540; i++) {
    for (const side of [-1.32, 1.32]) {
      const p = world(i * 2, side);
      pos.push(p.x, p.y, p.z);
      uv.push(side < 0 ? 0 : 1, i / 10);
    }
    if (i < 540) {
      const a = 2 * i;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  const deck = new T.Mesh(geometry, new T.MeshStandardMaterial({ map: roadMap, roughness: 0.93 }));
  deck.receiveShadow = true;
  scene.add(deck);
  const blocks: { matrix: T.Matrix4; color: T.Color }[] = [];
  const scratch = new T.Object3D();
  function block(
    at: number,
    side: number,
    lift: number,
    w: number,
    h: number,
    l: number,
    color: string,
    tilt = 0,
  ) {
    const p = world(at, side, lift);
    scratch.position.set(p.x, p.y, p.z);
    scratch.rotation.order = 'YXZ';
    scratch.rotation.set(0, -p.yaw, p.bank + tilt, 'YXZ');
    scratch.scale.set(w, h, l);
    scratch.updateMatrix();
    blocks.push({ matrix: scratch.matrix.clone(), color: new T.Color(color) });
  }
  // The deck is a dismantled freight viaduct. Repeated edge lamps and sleepers
  // give a reliable speed reference even where a bend hides the skyline.
  for (let at = 0; at < LAP; at += 4) {
    for (const side of [-1, 1]) {
      block(at, side * 1.34, -0.1, 0.32, 0.4, 4.45, at % 12 === 0 ? '#b07844' : '#504047');
      if (at % 8 === 0) {
        block(at, side * 1.34, 0.123, 0.12, 0.025, 2.5, '#ffce78');
        block(at, side * 1.43, -1, 0.2, 2.8, 0.21, '#534653', side * -0.13);
      }
    }
  }
  function sign(label: string) {
    const c = document.createElement('canvas');
    c.width = 768;
    c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#211e29';
    g.fillRect(0, 0, 768, 128);
    g.fillStyle = '#e5a743';
    g.fillRect(0, 4, 768, 8);
    g.fillRect(0, 116, 768, 8);
    g.font = 'italic 900 77px sans-serif';
    g.fillStyle = '#fff0c8';
    g.textAlign = 'center';
    g.fillText(label, 384, 91, 710);
    const map = new T.CanvasTexture(c);
    map.colorSpace = T.SRGBColorSpace;
    return new T.MeshBasicMaterial({ map, side: T.DoubleSide });
  }
  const sectors = [
    [40, 'MAGNET MILE'],
    [290, 'THE CRUSHER'],
    [610, 'BONEYARD'],
    [915, 'LAST CHANCE'],
  ] as const;
  for (const [at, name] of sectors) {
    for (let n = 0; n < 3; n++) {
      const d = at + n * 8;
      for (const side of [-1, 1]) {
        block(d, side * 1.62, 2.1, 0.64, 5.8, 0.64, '#654839', side * -0.12);
        block(d, side * 1.62, 1, 0.78, 0.34, 0.82, '#ffd371');
        block(d, side * 1.32, 4.6, 0.45, 3.15, 0.47, '#957053', side * -0.82);
      }
      for (const side of [-1, 1]) {
        block(d, side * 0.97, 5.3, 0.38, 0.15, 1.1, '#ffe39e');
        for (let k = 0; k < 3; k++)
          block(d, side * (0.28 + k * 0.4), 5.91, 0.12, 0.72, 0.1, '#252936', side * (k % 2 ? 0.8 : -0.8));
      }
      block(d, 0, 5.77, 14.9, 0.5, 0.69, '#66464a');
      block(d, 0, 5.48, 8, 0.055, 0.16, '#fbd384');
    }
    const p = world(at - 0.6, 0, 5.88),
      panel = new T.Mesh(new T.PlaneGeometry(7.5, 1.14), sign(name));
    panel.position.set(p.x, p.y, p.z);
    panel.rotation.set(0, -p.yaw, p.bank, 'YXZ');
    scene.add(panel);
  }
  for (let at = 0; at < LAP; at += 18) {
    if (Math.abs(Math.sin(at * 0.027)) > 0.66) {
      const side = Math.sin(at * 0.027) > 0 ? -1 : 1;
      block(at, side * 1.54, 0.81, 0.15, 1.6, 0.18, '#4c3840');
      for (let j = 0; j < 2; j++)
        block(at, side * 1.54 + (j - 0.5) * 0.1, 1.47, 0.17, 0.6, 0.14, '#f7ae43', side * 0.69);
    }
  }
  for (const pad of pads) {
    for (let j = 0; j < 4; j++) {
      for (const d of [-1, 1]) {
        const p = world(pad.at - j * 1.15, pad.x + d * 0.13, 0.08);
        scratch.position.set(p.x, p.y, p.z);
        scratch.rotation.set(0, -p.yaw + d * 0.62, p.bank, 'YXZ');
        scratch.scale.set(0.32, 0.075, 1.6);
        scratch.updateMatrix();
        blocks.push({ matrix: scratch.matrix.clone(), color: new T.Color('#88fff0') });
      }
    }
  }
  const beams = new T.InstancedMesh(
    new T.BoxGeometry(),
    new T.MeshStandardMaterial({ roughness: 0.85 }),
    blocks.length,
  );
  blocks.forEach((b, i) => {
    beams.setMatrixAt(i, b.matrix);
    beams.setColorAt(i, b.color);
  });
  beams.castShadow = true;
  beams.receiveShadow = true;
  scene.add(beams);
  // Painted salvage is placed at fixed track coordinates. The nearer heaps
  // sweep past the camera; taller landmarks stay visible through the turn.
  props.forEach((tex, type) => {
    tex.colorSpace = T.SRGBColorSpace;
    const mat = new T.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.3, depthWrite: true });
    for (let i = 0; i < 23; i++) {
      const at = (i * 47 + type * 16) % LAP,
        side = (i + type) % 2 ? 1 : -1;
      const p = world(at, side * (2.8 + ((i * 7 + type) % 6) * 0.68), -2.8);
      const prop = new T.Sprite(mat);
      prop.center.set(0.5, 0);
      const height = [5.8, 10, 14][type] * (0.82 + (i % 3) * 0.17);
      prop.scale.set(
        (height * (tex.image as HTMLImageElement).width) / (tex.image as HTMLImageElement).height,
        height,
        1,
      );
      prop.position.set(p.x, p.y, p.z);
      scene.add(prop);
    }
  });
  // Two counter-rotating breaker drums hang over the entrance to the crusher.
  // Their teeth catch the sun and cast moving shadows across the apex.
  const machines: T.Group[] = [];
  for (const side of [-1, 1]) {
    const p = world(302, side * 1.45, 3.2);
    const motor = new T.Group();
    motor.position.set(p.x, p.y, p.z);
    motor.rotation.y = -p.yaw;
    const wheel = new T.Group();
    motor.add(wheel);
    const steel = new T.MeshStandardMaterial({ color: '#655359', roughness: 0.72, metalness: 0.34 });
    const safety = new T.MeshStandardMaterial({ color: '#dba652', roughness: 0.68, metalness: 0.23 });
    const drum = new T.Mesh(new T.CylinderGeometry(2.4, 2.4, 1.18, 18), steel);
    drum.rotation.x = Math.PI / 2;
    wheel.add(drum);
    for (let j = 0; j < 12; j++) {
      const angle = (j * Math.PI) / 6;
      const tooth = new T.Mesh(new T.BoxGeometry(0.67, 0.76, 1.27), j % 3 ? safety : steel);
      tooth.position.set(2.53 * Math.sin(angle), 2.53 * Math.cos(angle), 0);
      tooth.rotation.z = -angle + 0.22;
      tooth.castShadow = true;
      wheel.add(tooth);
    }
    const hub = new T.Mesh(new T.CylinderGeometry(0.81, 0.81, 1.42, 8), safety);
    hub.rotation.x = Math.PI / 2;
    wheel.add(hub);
    scene.add(motor);
    machines.push(wheel);
  }
  return (time: number) => {
    machines[0].rotation.z = time * 0.76;
    machines[1].rotation.z = -time * 0.76;
  };
}
