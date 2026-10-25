// Seaside post-processing: one scene render into a (possibly low-res) target, a small bloom chain, then a single
// composite pass doing ink outlines, colour grade, posterize + ordered dither, and the "dream" effects that grow over
// the story (halation, vignette, hue drift, chromatic fringing, wobble). Tone mapping happens here, not in the renderer.
import * as THREE from 'three';

export interface PostParams {
  /** Render-target downscale (1 = native, 3 = chunky pixels upscaled with nearest). */ pixel: number;
  /** Ink outline strength 0..1 (depth silhouettes + creases), and tint. */ outline: number; ink: THREE.Color;
  /** Colour grade 0..1: split-tone (cool shadows, warm highlights), gentle S-curve. */ grade: number;
  /** Pastel lift 0..1: raise blacks, soften saturation (morning haze). */ pastel: number;
  /** Saturation multiplier. */ saturation: number;
  /** Posterize levels per channel (0 = off) and ordered dither 0..1. */ posterize: number; dither: number;
  /** Bloom strength and threshold; halation tints the glow warm. */ bloom: number; threshold: number; halation: number;
  /** 0 = mundane … 1 = fever dream: vignette, hue drift, chromatic fringing, screen wobble. */ dream: number;
  /** Heat shimmer 0..1: the edges of the screen waver (over the lava). */ shimmer: number;
}
export const POST_DEFAULTS: PostParams = {
  pixel: 1, outline: 0, ink: new THREE.Color(0x1b2a3a), grade: 0, pastel: 0, saturation: 1, posterize: 0, dither: 0,
  bloom: 0, threshold: 0.8, halation: 0, dream: 0, shimmer: 0,
};

const FS_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

export class PostFX {
  p: PostParams = { ...POST_DEFAULTS };
  private rt!: THREE.WebGLRenderTarget;
  private bA!: THREE.WebGLRenderTarget; private bB!: THREE.WebGLRenderTarget;
  private quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  private scene = new THREE.Scene(); private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private bright: THREE.ShaderMaterial; private blur: THREE.ShaderMaterial; private comp: THREE.ShaderMaterial;
  private size = { w: 0, h: 0, pixel: 0 };

  constructor(private renderer: THREE.WebGLRenderer, private w: number, private h: number) {
    this.quad.frustumCulled = false; this.scene.add(this.quad);
    this.bright = new THREE.ShaderMaterial({
      uniforms: { tScene: { value: null }, uThr: { value: 0.8 } }, vertexShader: FS_VERT, depthTest: false, depthWrite: false,
      fragmentShader: `uniform sampler2D tScene; uniform float uThr; varying vec2 vUv;
        void main(){ vec3 c = texture2D(tScene, vUv).rgb; float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(uThr, uThr + 0.35, l), 1.0); }`,
    });
    this.blur = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } }, vertexShader: FS_VERT, depthTest: false, depthWrite: false,
      fragmentShader: `uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
        void main(){ vec3 c = texture2D(tSrc, vUv).rgb * 0.227;
          c += (texture2D(tSrc, vUv + uDir * 1.385).rgb + texture2D(tSrc, vUv - uDir * 1.385).rgb) * 0.316;
          c += (texture2D(tSrc, vUv + uDir * 3.231).rgb + texture2D(tSrc, vUv - uDir * 3.231).rgb) * 0.070;
          gl_FragColor = vec4(c, 1.0); }`,
    });
    this.comp = new THREE.ShaderMaterial({
      toneMapped: false, depthTest: false, depthWrite: false, vertexShader: FS_VERT,
      uniforms: {
        tScene: { value: null }, tDepth: { value: null }, tBloom: { value: null }, uTexel: { value: new THREE.Vector2() }, uRes: { value: new THREE.Vector2() },
        uNear: { value: 0.03 }, uFar: { value: 12000 }, uPixel: { value: 1 }, uTime: { value: 0 },
        uOutline: { value: 0 }, uInk: { value: new THREE.Color() }, uGrade: { value: 0 }, uPastel: { value: 0 }, uSat: { value: 1 },
        uPost: { value: 0 }, uDither: { value: 0 }, uBloom: { value: 0 }, uHal: { value: 0 }, uDream: { value: 0 }, uShim: { value: 0 },
      },
      fragmentShader: `
        uniform sampler2D tScene, tDepth, tBloom; uniform vec2 uTexel, uRes; uniform float uNear, uFar, uPixel, uTime;
        uniform float uOutline, uGrade, uPastel, uSat, uPost, uDither, uBloom, uHal, uDream, uShim; uniform vec3 uInk;
        varying vec2 vUv;
        float lin(float d){ return uNear * uFar / (uFar - d * (uFar - uNear)); }
        float D(vec2 uv){ return lin(texture2D(tDepth, uv).r); }
        vec3 neutral(vec3 c){ // Khronos PBR Neutral tone mapping
          const float s = 0.8 - 0.04, ds = 0.15; float x = min(c.r, min(c.g, c.b)); float off = x < 0.08 ? x - 6.25 * x * x : 0.04; c -= off;
          float pk = max(c.r, max(c.g, c.b)); if (pk < s) return c; float d = 1.0 - s; float np = 1.0 - d * d / (pk + d - s); c *= np / pk;
          float g = 1.0 - 1.0 / (ds * (pk - np) + 1.0); return mix(c, np * vec3(1.0), g); }
        vec3 hueRot(vec3 c, float a){ const vec3 k = vec3(0.57735); float ca = cos(a); return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca); }
        float bayer(vec2 p){ int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0)); int i = x + y * 4;
          int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5); return (float(m[i]) + 0.5) / 16.0 - 0.5; }
        void main(){
          float dr = uDream * uDream;
          vec2 uv = vUv;
          if (uPixel > 1.0) uv = (floor(uv / uTexel) + 0.5) * uTexel; // snap to the low-res pixel grid: crisp 1-pixel ink
          // fever: the screen breathes and ripples
          uv += vec2(sin(uv.y * 9.0 + uTime * 1.3), cos(uv.x * 7.0 - uTime * 1.1)) * 0.006 * dr;
          // heat shimmer: the edges of the screen waver, the middle stays readable
          if (uShim > 0.0) { float ed = smoothstep(0.22, 0.5, max(abs(uv.x - 0.5), abs(uv.y - 0.5) * 0.9));
            uv += vec2(sin(uv.y * 58.0 + uTime * 5.0) + 0.5 * sin(uv.y * 23.0 - uTime * 3.1), cos(uv.x * 47.0 - uTime * 4.3)) * 0.003 * uShim * ed; }
          vec2 cc = uv - 0.5;
          // chromatic fringing toward the edges
          float ab = 0.006 * dr * dot(cc, cc) * 4.0;
          vec3 col = vec3(texture2D(tScene, uv + cc * ab).r, texture2D(tScene, uv).g, texture2D(tScene, uv - cc * ab).b);
          // ink outlines: silhouettes (relative depth jumps) + creases (depth second derivative), one low-res pixel wide
          if (uOutline > 0.0) {
            float d = D(uv), dl = D(uv - vec2(uTexel.x, 0.0)), dr2 = D(uv + vec2(uTexel.x, 0.0)), du = D(uv + vec2(0.0, uTexel.y)), dd = D(uv - vec2(0.0, uTexel.y));
            float near = min(d, min(min(dl, dr2), min(du, dd)));
            // a jump beyond the surface's own slope (flat ground seen at a grazing angle steps a lot per pixel, evenly)
            float sil = max(max(d - dl, d - dr2) - 0.5 * abs(dr2 - dl), max(d - du, d - dd) - 0.5 * abs(du - dd)) / near;
            float id = 1.0 / d; // 1/depth is linear across a plane in screen space, so its 2nd difference is ~0 except at creases
            float crease = (abs(1.0 / dl + 1.0 / dr2 - 2.0 * id) + abs(1.0 / du + 1.0 / dd - 2.0 * id)) / id;
            float e = clamp(smoothstep(0.035, 0.08, sil) + smoothstep(0.03, 0.09, crease) * 0.6, 0.0, 1.0);
            e *= 1.0 - smoothstep(600.0, 2500.0, near); // fade lines into the haze
            col = mix(col, col * 0.25 + uInk * 0.12, e * uOutline);
          }
          vec3 bl = texture2D(tBloom, uv).rgb;
          col += bl * uBloom * mix(vec3(1.0), vec3(1.25, 0.9, 0.7), uHal);
          col = neutral(col);
          // grade: split tone + gentle S-curve; pastel morning lift; dream hue drift
          float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col = mix(col, col + mix(vec3(-0.008, 0.0, 0.022), vec3(0.035, 0.018, -0.02), smoothstep(0.15, 0.75, l)), uGrade);
          col = mix(col, clamp((col - l) * 1.12 + l + 0.015, 0.0, 1.0), uGrade); // saturation-ish contrast without darkening
          col = mix(col, mix(vec3(l), col, uSat), 1.0);
          col = mix(col, col * 0.86 + vec3(0.11, 0.09, 0.12), uPastel);
          col = hueRot(col, sin(uTime * 0.37 + uv.x * 2.0) * 0.5 * dr);
          col = mix(col, mix(vec3(l), col, 1.35), dr);
          // vignette, warmer and heavier as the dream deepens
          float vg = smoothstep(0.85, 0.25, length(cc * vec2(1.0, 0.8)));
          col *= mix(1.0, vg, 0.6 * smoothstep(0.1, 1.0, uDream));
          col = clamp(col, 0.0, 1.0);
          // posterize + ordered dither in display space, on the (low-res) pixel grid
          vec3 s = pow(col, vec3(1.0 / 2.2));
          if (uPost > 0.0) s = floor(s * uPost + 0.5 + bayer(floor(gl_FragCoord.xy / uPixel)) * uDither) / uPost;
          gl_FragColor = vec4(pow(clamp(s, 0.0, 1.0), vec3(2.2)), 1.0);
          #include <colorspace_fragment>
        }`,
    });
  }

  /** Output size in drawing-buffer pixels. */
  setSize(w: number, h: number) { this.w = w; this.h = h; }

  dispose() {
    this.rt?.dispose(); this.bA?.dispose(); this.bB?.dispose();
    this.bright.dispose(); this.blur.dispose(); this.comp.dispose(); this.quad.geometry.dispose();
  }

  private ensure() {
    const px = Math.max(1, this.p.pixel), w = Math.round(this.w / px), h = Math.round(this.h / px);
    if (this.size.w === w && this.size.h === h) return;
    this.rt?.dispose(); this.bA?.dispose(); this.bB?.dispose();
    const filt = px > 1 ? THREE.NearestFilter : THREE.LinearFilter;
    this.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: filt, magFilter: filt, samples: 0 });
    this.rt.depthTexture = new THREE.DepthTexture(w, h, THREE.FloatType);
    const bw = Math.max(1, Math.round(this.w / 6)), bh = Math.max(1, Math.round(this.h / 6));
    this.bA = new THREE.WebGLRenderTarget(bw, bh, { type: THREE.HalfFloatType });
    this.bB = new THREE.WebGLRenderTarget(bw, bh, { type: THREE.HalfFloatType });
    this.size = { w, h, pixel: px };
  }

  private pass(mat: THREE.Material, target: THREE.WebGLRenderTarget | null) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.cam);
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, time: number) {
    this.ensure();
    const r = this.renderer, p = this.p;
    r.setRenderTarget(this.rt);
    r.render(scene, camera);
    if (p.bloom > 0) {
      this.bright.uniforms.tScene.value = this.rt.texture; this.bright.uniforms.uThr.value = p.threshold;
      this.pass(this.bright, this.bA);
      for (let i = 0; i < 2; i++) {
        this.blur.uniforms.tSrc.value = this.bA.texture; this.blur.uniforms.uDir.value.set((1 + i) / this.bA.width, 0); this.pass(this.blur, this.bB);
        this.blur.uniforms.tSrc.value = this.bB.texture; this.blur.uniforms.uDir.value.set(0, (1 + i) / this.bA.height); this.pass(this.blur, this.bA);
      }
    }
    const u = this.comp.uniforms;
    u.tScene.value = this.rt.texture; u.tDepth.value = this.rt.depthTexture; u.tBloom.value = this.bA.texture;
    u.uTexel.value.set(1 / this.size.w, 1 / this.size.h); u.uRes.value.set(this.w, this.h);
    u.uNear.value = camera.near; u.uFar.value = camera.far; u.uPixel.value = this.size.pixel; u.uTime.value = time;
    u.uOutline.value = p.outline; u.uInk.value.copy(p.ink); u.uGrade.value = p.grade; u.uPastel.value = p.pastel; u.uSat.value = p.saturation;
    u.uPost.value = p.posterize; u.uDither.value = p.dither; u.uBloom.value = p.bloom; u.uHal.value = p.halation; u.uDream.value = p.dream; u.uShim.value = p.shimmer;
    this.pass(this.comp, null);
  }
}
