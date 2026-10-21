export interface Point { x: number; y: number }
export const LIGHT_BUDGET = 32;
export function boundedLights<T>(lights: T[], budget = LIGHT_BUDGET): T[] { return lights.slice(0, Math.max(0, Math.floor(budget))); }
