// Shared 3D renderer setup: three's WebGPURenderer (WebGPU where the browser has it, its WebGL2 backend otherwise).
// Materials must be built-in or node (TSL) materials: GLSL ShaderMaterial / onBeforeCompile don't run on it.
import { LinearSRGBColorSpace, NodeMaterial, WebGPURenderer, type Fog, type FogExp2, type Node, type NodeBuilder, type Scene } from 'three/webgpu';
import { densityFogFactor, mix, rangeFogFactor, reference, renderGroup, sRGBTransferOETF, vec4 } from 'three/tsl';
import { noteBackend, noteFrame, type GfxBackend } from './stats';

export type { GfxBackend };

export type GfxPref = 'auto' | 'webgl';

const PREF_KEY = 'wattcade.gfx';

/** `?gfx=webgl` (or localStorage `wattcade.gfx` = `webgl`) forces the WebGL2 backend, e.g. to compare fps. `?gfx=auto` clears it. */
export function gfxPref(): GfxPref {
  try {
    const q = new URLSearchParams(location.search).get('gfx');
    if (q === 'webgl' || q === 'auto') localStorage.setItem(PREF_KEY, q);
    return localStorage.getItem(PREF_KEY) === 'webgl' ? 'webgl' : 'auto';
  } catch { return 'auto'; }
}

const SHADER_SRGB = Symbol('wattcade.shaderSRGB');
let patched = false;
type FogNodes = { color: Node<'vec3'>; factor: Node<'float'> };
const fogs = new WeakMap<Fog | FogExp2, FogNodes>();
/** Update once per render, not per object (the typings lack setGroup). */
const perRender = <T>(n: T): T => (n as unknown as { setGroup(g: unknown): T }).setGroup(renderGroup);
function fogNodes(f: Fog | FogExp2): FogNodes {
  let n = fogs.get(f);
  if (!n) {
    const color = sRGBTransferOETF(perRender(reference('color', 'color', f))) as Node<'vec3'>;
    const factor = ((f as FogExp2).isFogExp2
      ? densityFogFactor(perRender(reference('density', 'float', f)))
      : rangeFogFactor(perRender(reference('near', 'float', f)), perRender(reference('far', 'float', f)))) as Node<'float'>;
    n = { color, factor }; fogs.set(f, n);
  }
  return n;
}
/**
 * WebGPURenderer normally draws into a linear half-float buffer and converts to sRGB in a final pass, so translucent
 * smoke, glows and beams blend in linear space and fog mixes in linear, and both look heavier than on WebGLRenderer.
 * For renderers flagged with SHADER_SRGB we skip that buffer (one less full-screen pass, which matters on the iPad) and
 * end every material's shader the way WebGLRenderer did: encode sRGB, then mix fog against the sRGB fog colour.
 * Render targets (shadow maps, post-processing inputs) keep the stock linear path.
 */
function patchShaderSRGB() {
  if (patched) return; patched = true;
  type Proto = { setupOutput(b: NodeBuilder, o: Node<'vec4'>): Node<'vec4'>; setupPremultipliedAlpha(b: NodeBuilder, o: Node<'vec4'>): Node<'vec4'> };
  const proto = NodeMaterial.prototype as unknown as Proto;
  const base = proto.setupOutput;
  proto.setupOutput = function (this: Proto & { fog: boolean; premultipliedAlpha: boolean }, builder: NodeBuilder, out: Node<'vec4'>) {
    const r = builder.renderer as WebGPURenderer & { [SHADER_SRGB]?: boolean };
    if (!r[SHADER_SRGB] || r.getRenderTarget() !== null) return base.call(this, builder, out);
    let o: Node<'vec4'> = vec4(sRGBTransferOETF(out.rgb) as Node<'vec3'>, out.a);
    const f = this.fog ? (builder as NodeBuilder & { scene?: Scene }).scene?.fog : null;
    if (f) { const n = fogNodes(f); o = vec4(mix(o.rgb, n.color, n.factor) as Node<'vec3'>, o.a); }
    if (this.premultipliedAlpha) o = this.setupPremultipliedAlpha(builder, o);
    return o;
  };
}

export interface Gfx {
  renderer: WebGPURenderer;
  /** True once the backend is initialised; render() is a no-op before then. */
  readonly ready: boolean;
  backend(): GfxBackend;
}

/**
 * Create the renderer and start its async init. Callers render through `renderer.render()` only when `gfx.ready`.
 * `alpha` defaults to false (opaque canvas); pass true for games that composite DOM behind the 3D view.
 * `blend: 'srgb'` (default) blends on the canvas like WebGLRenderer did; use 'linear' for games that render through
 * post-processing (RenderPipeline), which needs the linear output path.
 */
export function createGfx(opts: { antialias?: boolean; alpha?: boolean; blend?: 'srgb' | 'linear'; onReady?: (g: Gfx) => void } = {}): Gfx {
  const renderer = new WebGPURenderer({
    antialias: opts.antialias ?? true, alpha: opts.alpha ?? false, powerPreference: 'high-performance',
    forceWebGL: gfxPref() === 'webgl',
  });
  if ((opts.blend ?? 'srgb') === 'srgb') {
    patchShaderSRGB();
    (renderer as WebGPURenderer & { [SHADER_SRGB]?: boolean })[SHADER_SRGB] = true;
    renderer.outputColorSpace = LinearSRGBColorSpace; // no output pass: the shaders encode
  }
  let ready = false;
  const backend = (): GfxBackend => (!ready ? 'pending' : (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl2');
  const gfx: Gfx = { renderer, get ready() { return ready; }, backend };
  // count frames for the overlay without touching each game's render loop
  // shadow maps call render() from inside render(), so only the outermost call is a frame
  const render = renderer.render.bind(renderer);
  let depth = 0;
  renderer.render = ((scene, camera) => {
    if (!ready) return;
    if (depth > 0) return render(scene, camera);
    noteFrame(performance.now() / 1000);
    // Update world matrices once; otherwise the shadow pass's nested render() walks the whole scene graph again.
    const auto = scene.matrixWorldAutoUpdate;
    if (auto) { scene.updateMatrixWorld(); scene.matrixWorldAutoUpdate = false; }
    depth++;
    try { return render(scene, camera); } finally { depth--; scene.matrixWorldAutoUpdate = auto; }
  }) as typeof renderer.render;
  let disposed = false;
  const dispose = renderer.dispose.bind(renderer);
  renderer.dispose = () => { disposed = true; ready = false; noteBackend('pending'); return dispose(); };
  void renderer.init().then(() => {
    if (disposed) return; // unmounted while the adapter was still coming up
    ready = true; noteBackend(backend());
    opts.onReady?.(gfx);
  }).catch((e) => console.error('[gfx] renderer init failed', e));
  return gfx;
}
