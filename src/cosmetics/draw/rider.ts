import type { RiderLook } from '../types';
import type { G } from './prims';
import { drawRider as drawClassic } from './classic/rider';
import { drawRider as drawRemastered, type RiderOpts } from './remastered/rider';
export { lensFor } from './remastered/rider';
export type { RiderOpts } from './remastered/rider';

export function drawRider(g: G, look: RiderLook, crank: number, wheelM: number, options: RiderOpts = {}) {
  (look.artMode === 'legacy' ? drawClassic : drawRemastered)(g, look, crank, wheelM, options);
}
