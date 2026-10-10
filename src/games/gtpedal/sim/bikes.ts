export type BikeKind = 'city' | 'fixie' | 'bmx' | 'cargo' | 'tandem' | 'ebike' | 'scooter';
export interface BikeSpec { power: number; top: number; turn: number; air: number; heat: number; label: string }
export const BIKES: Record<BikeKind, BikeSpec> = {
  city: { power: 1, top: 1, turn: 1, air: 1, heat: 0, label: 'City bike' },
  fixie: { power: 1.15, top: 1.2, turn: 1.3, air: 0.9, heat: 0, label: 'Fixie' },
  bmx: { power: 0.95, top: 0.8, turn: 1.2, air: 1.5, heat: 0, label: 'BMX' },
  cargo: { power: 0.8, top: 0.8, turn: 0.7, air: 0.6, heat: 0, label: 'Cargo bike' },
  tandem: { power: 1.3, top: 1.1, turn: 0.6, air: 0.7, heat: 0, label: 'Tandem' },
  /** Razor kick scooter: pedal power = kick-push speed; low top speed, very tight turning, small hops, grinds fine; awful on grass / stairs */
  scooter: { power: 0.85, top: 0.6, turn: 1.8, air: 0.55, heat: 0, label: 'Razor scooter' },
  ebike: { power: 1.6, top: 1.3, turn: 1, air: 1, heat: 0.05, label: 'E-bike' },
};
export const isBikeKind = (k: string): k is BikeKind => k in BIKES;
