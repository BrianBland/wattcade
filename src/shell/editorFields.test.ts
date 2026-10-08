import { describe, expect, it } from 'vitest';
import { EDITOR_FIELDS, editorFields, COLORS, activateField, adjustField } from './editorFields';
import { testProfile } from '../core';

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
