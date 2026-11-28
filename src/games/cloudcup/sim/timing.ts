import { LAP } from './track';

export type RaceRecord = { time: number; lap: number; splits: number[] };
export type PursuitRecord = { flags: number; seconds: number };
export type RallySave = {
  bestPlace?: number;
  records?: Record<string, RaceRecord>;
  pursuits?: Record<string, PursuitRecord>;
};

export function timingSheet() {
  return {
    lapStart: 0,
    checkpoints: [] as number[],
    fastest: 0,
    fastestSplits: [] as number[],
    lastLap: 0,
    sector: 0,
    reading: 0,
    delta: null as number | null,
    visibleUntil: 0,
  };
}

// Compare cumulative splits from one complete lap. Combining three best sectors
// from unrelated laps would set a reference time the rider has never achieved.
export function crossTiming(
  sheet: ReturnType<typeof timingSheet>,
  record: RaceRecord | undefined,
  from: number,
  to: number,
  tickEnd: number,
  dt: number,
) {
  const distance = LAP / 3,
    sectorIndex = Math.floor(to / distance);
  if (sectorIndex === Math.floor(from / distance)) return;
  const time = tickEnd - dt + (dt * (sectorIndex * distance - from)) / (to - from);
  sheet.sector = ((sectorIndex - 1) % 3) + 1;
  sheet.reading = time - sheet.lapStart;
  sheet.checkpoints.push(sheet.reading);
  const reference =
    record?.lap && (!sheet.fastest || record.lap < sheet.fastest) ? record.splits : sheet.fastestSplits;
  const prior = reference?.[sheet.sector - 1];
  sheet.delta = prior === undefined ? null : sheet.reading - prior;
  sheet.visibleUntil = time + 4;
  if (sheet.sector === 3) {
    sheet.lastLap = sheet.reading;
    if (!sheet.fastest || sheet.lastLap < sheet.fastest) {
      sheet.fastest = sheet.lastLap;
      sheet.fastestSplits = sheet.checkpoints;
    }
    sheet.checkpoints = [];
    sheet.lapStart = time;
  }
}

export function lapTime(seconds: number) {
  const tenths = Math.round(seconds * 10);
  return (
    Math.floor(tenths / 600) +
    ':' +
    String(Math.floor(tenths / 10) % 60).padStart(2, '0') +
    '.' +
    (tenths % 10)
  );
}
