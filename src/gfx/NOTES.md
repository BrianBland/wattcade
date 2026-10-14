# gfx: shared 3D renderer setup

CONTRACT-REQUESTs: none.

- `renderer.ts`: `createGfx({ antialias?, alpha?, blend?, onReady? })` -> `{ renderer: WebGPURenderer, ready, backend() }`.
  WebGPU where the browser has it (iPadOS 26 WebKit, desktop Chrome), else three's WebGL2 backend. `renderer.init()` is
  async: `render()` is a no-op until `ready`, so games just guard their own post-render work (e.g. snapshots) on `gfx.ready`.
  - `?gfx=webgl` forces the WebGL2 backend (sticky in localStorage `wattcade.gfx`); `?gfx=auto` clears it. Use it to A/B fps.
  - `blend: 'srgb'` (default) sets `outputColorSpace = Linear` and encodes sRGB at the end of every node material's shader
    and then mixes scene fog against the sRGB fog colour, the same order as WebGLRenderer (a one-time
    `NodeMaterial.prototype.setupOutput` patch, only for flagged renderers, only when drawing to the canvas). Stock node
    materials blend and fog in linear, which made smoke/beams heavier and the far sea foggier. Also skips the half-float
    output buffer + output pass (+50% fps in SwiftShader). Use `blend: 'linear'` for renderers that post-process through `RenderPipeline`.
- `points.ts`: `PointCloud` (a `Sprite` with `count` + `PointsNodeMaterial`), because WebGPU draws `THREE.Points` at 1 px.
  Write into `cloud.attributes.position` / `.color` (3 or 4 comps) and set `needsUpdate` as before; the attributes are
  swapped for `InstancedInterleavedBuffer`s over the same arrays (a plain `InterleavedBuffer` steps per vertex, not per point).
- `tsl.ts`: `raw(c)` = show a colour as-is, like a GLSL ShaderMaterial without `colorspace_fragment` did.
- `stats.ts` (no three import, safe for the shell bundle): backend + fps for the debug overlay's Derived panel (`3D` row).

## Porting a game (checklist)
- `import * as THREE from 'three/webgpu'` where node materials are needed (same core classes as `'three'`).
- `ShaderMaterial` -> `Mesh*NodeMaterial` with `colorNode`/`positionNode` built from `three/tsl`; `onBeforeCompile` -> the
  same nodes on the matching node material. Node materials default to `fog: true` (ShaderMaterial defaulted to false).
  Raw-GLSL colours (no colorspace chunk) need `raw()`; patched built-ins (Phong/Lambert onBeforeCompile) don't.
- `DynamicDrawUsage` means "re-upload the whole buffer every frame" on WebGPURenderer (WebGLRenderer treated it as a hint).
  Use it only for buffers rewritten every frame; Lighthouse's flower/grass matrices were costing 365 KB/frame.
- `THREE.Points` -> `PointCloud`. `EffectComposer` passes -> `RenderPipeline` + TSL passes (`three/addons/tsl/display/*`).

## Measured (Lighthouse, 1024x768, z2 min 20, Radeon 8060S, uncapped; ms = CPU in render())
- Port as first landed: WebGLRenderer 0.77 ms vs WebGPU 1.18 ms. After removing per-frame waste (static upload usage,
  one scene-graph update per frame, merged clouds, hidden empty fog banks, shadow map every other frame): WebGPU 0.86 ms,
  WebGL2 backend 0.93 ms; WebGLRenderer with the same fixes 0.69 ms. The rest is three's per-draw overhead (~3 us/draw).
- Static `BundleGroup`s (terrain/scenery/buildings) measured 0.73-0.77 ms, but they freeze material changes (window
  colours at dusk) and need `needsUpdate` on every building change, so they're not used yet.
- Renderer chunk grows ~0.8 MB (237 kB gzip) for three/webgpu; the shell bundle is unchanged.
