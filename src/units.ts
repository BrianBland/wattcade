import type { Profile, UnitSystem } from './contracts';

export const LB_PER_KG = 1 / 0.45359237;
export const MI_PER_KM = 1 / 1.609344;
export const FT_PER_M = 1 / 0.3048;
export function unitsFor(p?: Pick<Profile, 'settings'> | null): UnitSystem {
  return p?.settings?.units === 'metric' ? 'metric' : 'imperial';
}
export function formatDistance(km: number, units: UnitSystem, digits = 2): string {
  return `${(units === 'metric' ? km : km * MI_PER_KM).toFixed(digits)} ${units === 'metric' ? 'km' : 'mi'}`;
}
export function formatElevation(m: number, units: UnitSystem): string {
  return `${Math.round(units === 'metric' ? m : m * FT_PER_M)} ${units === 'metric' ? 'm' : 'ft'}`;
}
export function formatSpeed(kph: number, units: UnitSystem): string {
  return `${(units === 'metric' ? kph : kph * MI_PER_KM).toFixed(1)} ${units === 'metric' ? 'km/h' : 'mph'}`;
}
export function formatUpcoming(m: number, units: UnitSystem): string {
  const large = units === 'metric' ? m >= 1000 : m >= 1609.344;
  return large ? formatDistance(m / 1000, units, 1) : `${Math.round((units === 'metric' ? m : m * FT_PER_M) / 10) * 10} ${units === 'metric' ? 'm' : 'ft'}`;
}
/** Convert measurements in achievement descriptions and progress labels. */
export function measurementText(text: string, units: UnitSystem): string {
  if (units === 'metric') return text;
  return text.replace(/([\d,.]+(?:\/[\d,.]+)?) (km|m)\b/g, (_, values: string, unit: string) =>
    values.split('/').map((v) => (Number(v.replaceAll(',', '')) * (unit === 'km' ? MI_PER_KM : FT_PER_M)).toLocaleString('en-US', { maximumFractionDigits: unit === 'km' ? 1 : 0 })).join('/') + (unit === 'km' ? ' mi' : ' ft'));
}
