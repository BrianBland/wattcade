import { expect, it } from 'vitest';
import { actionIndicators } from './ActionIndicators';
import { legendRows } from './ControlLegend';

it('requires cooldown or explicit trigger data and keeps charge distinct from availability', () => {
  const items = actionIndicators([
    { button: 'a', label: 'Build', active: true },
    { button: 'left', label: 'Target' },
    { button: 'b', label: 'Ward', active: false, cooldown: { fill: 1, ready: true } },
    { button: 'y', label: 'Rally', cooldown: { fill: .4, ready: false } },
    { button: 'z', label: 'Rail (hold = all)', indicator: { label: 'Rail 1/3' }, cooldown: { fill: .2, ready: true } },
    { button: 'up', label: 'Sprint boost (hold)', indicator: { status: 'Hold ↑', ready: true } },
  ]);
  expect(items.map(i => [i.name, i.status])).toEqual([['Ward', 'Unavailable'], ['Rally', 'Charging'], ['Rail 1/3', 'Ready'], ['Sprint boost (hold)', 'Hold ↑']]);
  expect(items[2].fill).toBe(.2);
});
it('can explicitly suppress duplicated indicators and sanitize progress', () => {
  expect(actionIndicators([{ button: 'a', label: 'Duplicate', indicator: false, cooldown: { fill: 1, ready: true } }])).toEqual([]);
  expect(actionIndicators([{ button: 'b', label: 'Ward', cooldown: { fill: NaN, ready: false } }])[0].fill).toBe(0);
});
it('keeps help in stable physical order regardless of readiness, retaining spatial overrides', () => {
  expect(legendRows([{button:'z',label:'Rail',active:true},{button:'y',label:'Rally'},{button:'b',label:'Ward'},{button:'a',label:'Strike'}]).map(r=>r.label)).toEqual(['Strike','Ward','Rally','Rail']);
  expect(legendRows([{button:'a',label:'Right',displayOrder:1},{button:'z',label:'Left',displayOrder:0}]).map(r=>r.label)).toEqual(['Left','Right']);
});
