import { describe, expect, it } from 'vitest';
import { EDITOR_FIELDS, COLORS, activateField, adjustField } from './editorFields';
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
    expect(activateField(f('paddleInvertL'), p)!.settings.paddleInvertL).toBe(!p.settings.paddleInvertL);
  });
  it('leaves text to the keyboard', () => {
    expect(adjustField(f('name'), testProfile(), 1)).toBeNull();
    expect(activateField(f('name'), testProfile())).toBeNull();
  });
});
