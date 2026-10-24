import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { disposeSet } from '../render/dispose';

it('releases outgoing set resources once, including instance buffers, while preserving the shared view', () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), root = new THREE.Group(), held = new THREE.Group();
  scene.add(root, camera); camera.add(held);
  const geometry = new THREE.BoxGeometry(), texture = new THREE.Texture();
  const material = new THREE.MeshBasicMaterial({ alphaMap: texture });
  const instances = new THREE.InstancedMesh(geometry, material, 2);
  root.add(instances); held.add(new THREE.Mesh(geometry, [material, material]));
  const retained = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  scene.add(retained);
  const spies = [geometry, texture, material, instances].map((o) => vi.spyOn(o, 'dispose'));
  const keep = vi.spyOn(retained.geometry, 'dispose');
  disposeSet(root, held);
  spies.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
  expect(keep).not.toHaveBeenCalled();
  expect(root.parent).toBeNull(); expect(held.parent).toBeNull();
  expect(camera.parent).toBe(scene); expect(retained.parent).toBe(scene);
});
