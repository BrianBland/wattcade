// Small TSL helpers shared by the 3D games.
import { sRGBTransferEOTF } from 'three/tsl';
import type { Node } from 'three/webgpu';

/**
 * Show a colour as-is on screen, like a GLSL ShaderMaterial without `colorspace_fragment` did on WebGLRenderer.
 * Node materials convert their output from linear to sRGB, so decode first to cancel that out.
 */
export const raw = (c: Node<'vec3'> | Node<'color'>) => sRGBTransferEOTF(c) as Node<'vec3'>;
