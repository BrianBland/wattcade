import { describe, expect, it } from 'vitest';
import { EDITOR_FIELDS, editorFields, COLORS, activateField, adjustField } from './editorFields';
import { testProfile } from '../core';
import { updatePowerProfile } from '../progression/powerProfile';

const f = (id: string) => EDITOR_FIELDS.find((x) => x.id === id)!;

describe('editor fields', () => {
  it('steps and clamps numbers', () => {
    const p = { ...testProfile(), ftp: 598 };
    expect(adjustField(f('ftp'), p, 1)!.ftp).toBe(600);
    expect(adjustField(f('weightKg'), { ...p, weightKg: 75 }, -1)!.weightKg).toBe(74.5);
  });
  it('cycles choices and colours both ways, toggles bools', () => {
    const p = { ...testProfile(), color: COLORS[0] };
    expect(adjustField(f('color'), p, -1)!.color).toBe(COLORS[COLORS.length - 1]);
    const z = adjustField(f('zoneSource'), { ...p, settings: { ...p.settings, zoneSource: 'hr' } }, 1)!;
    expect(z.settings.zoneSource).toBe('auto');
  });
  it('leaves text to the keyboard', () => {
    expect(adjustField(f('name'), testProfile(), 1)).toBeNull();
    expect(activateField(f('name'), testProfile())).toBeNull();
  });
});


describe('player units', () => {
  it('defaults to imperial and puts units before weight', () => {
    const fields = editorFields(testProfile());
    expect(fields.findIndex((f) => f.id === 'units')).toBeLessThan(fields.findIndex((f) => f.id === 'weightKg'));
    const weight = fields.find((f) => f.id === 'weightKg')!;
    if (weight.kind !== 'num') throw new Error('Expected numeric weight');
    expect(weight.unit).toBe('lb');
    expect(weight.get(testProfile())).toBeCloseTo(165.3467, 3);
    expect(weight.set(testProfile(), 165).weightKg).toBeCloseTo(74.84274105);
    expect(weight.set(testProfile(), 1000).weightKg).toBe(200);
    expect(adjustField(weight, testProfile(), 1)!.weightKg).toBeCloseTo(166.3 * 0.45359237);
  });
  it('switches units without changing weight and resolves metric controls', () => {
    const p = testProfile();
    const metric = activateField(f('units'), p)!;
    expect(metric.settings.units).toBe('metric');
    expect(metric.weightKg).toBe(p.weightKg);
    expect(adjustField(editorFields(metric).find((f) => f.id === 'weightKg')!, metric, -1)!.weightKg).toBe(74.5);
    expect(activateField(f('units'), metric)!.settings.units).toBe('imperial');
    expect(p.settings.units).toBeUndefined();
  });
});

it('keeps the general debug stats flag off by default and toggles only the selected player', () => {
  const a = testProfile(), b = testProfile(), field = f('debugStats');
  expect(field.kind).toBe('bool');
  if (field.kind !== 'bool') throw new Error('missing toggle');
  expect(field.get(a)).toBe(false);
  const enabled = activateField(field, a)!;
  expect(enabled.settings.debugStats).toBe(true);
  expect(field.get(a)).toBe(false); expect(field.get(b)).toBe(false);
  expect(adjustField(field, enabled, -1)!.settings.debugStats).toBe(false);
});

it('the FTP row shows the power profile estimate once a hard 20 min is on record', () => {
    const p = { ...testProfile(), ftp: 250 };
    expect(editorFields(p).find((x) => x.id === 'ftp')).not.toHaveProperty('hint');
    const watts = Array(1250).fill(280);
    const rec = { id: 'r', profileId: p.id, gameId: 'warmup', startedAt: 1, durationS: watts.length, events: [], gameSummary: {},
      samples: watts.map((power, i) => ({ t: i + 1, power, cadence: 90, hr: null, grade: null, mode: 'sim' as const })),
      stats: { avgPower: 280, maxPower: 280, kj: 0, avgHr: null, zoneSeconds: [0, 0, 0, 0, 0], sprints: 0 } };
    const withPower = { ...p, power: updatePowerProfile(undefined, rec).power };
  expect((editorFields(withPower).find((x) => x.id === 'ftp') as { hint?: string }).hint).toContain('266 W');
});
