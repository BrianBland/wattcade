export type FakeAdjust = { k: 'cadence' | 'power' | 'hr'; delta: number };
const MAP: Record<string, FakeAdjust> = {
  KeyW: { k: 'cadence', delta: 5 }, KeyS: { k: 'cadence', delta: -5 },
  KeyE: { k: 'power', delta: 10 }, KeyD: { k: 'power', delta: -10 },
  KeyR: { k: 'hr', delta: 5 }, KeyF: { k: 'hr', delta: -5 },
};
export function fakeKeyAdjust(code: string): FakeAdjust | null { return MAP[code] ?? null; }
