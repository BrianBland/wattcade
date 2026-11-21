// Keep the pose from the start of each physics step, including catch-up steps
// between display frames. Each bike owns its previous pose by value.
export type BikePose = { at: number; x: number; lean: number; lift: number };
export function bikePose({ at, x, lean, lift }: BikePose): BikePose {
  return { at, x, lean, lift };
}

// Exact critically damped response over a tick with a constant target roll.
// Keeping angular velocity lets the chassis ease through a paddle reversal.
export function bankBike(bike: { lean: number; rollRate: number }, target: number, dt: number) {
  const frequency = 18;
  const offset = bike.lean - target;
  const travel = (bike.rollRate + frequency * offset) * dt;
  const decay = Math.exp(-frequency * dt);
  bike.lean = target + (offset + travel) * decay;
  bike.rollRate = (bike.rollRate - frequency * travel) * decay;
}
