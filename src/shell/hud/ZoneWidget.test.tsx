// @vitest-environment jsdom
import { render } from 'preact';
import { expect, it } from 'vitest';
import type { BikeState, TrainerCommand } from '../../contracts';
import { ZoneWidget } from './ZoneWidget';

const bike = { power3s: 210, ftpFraction: .84, hr5s: 145, cadence3s: 80, activeSeconds: 754, gear: 8 } as BikeState;

it('shows commanded trainer targets instead of an inactive gear, without confusing target and actual power', () => {
  const el = document.createElement('div');
  const connected = { ...bike, connected: { trainer: true, fake: false, controller: false, hr: true } };
  const show = (command: TrainerCommand | null, b = connected, gears = false) => render(<ZoneWidget bike={b} ftp={250} view={{ source: 'power', pos: { zone: 3, within: .5, pos: .5 } }} command={command} gears={gears} bars={[]} />, el);
  for (const [command, label] of [
    [{ mode: 'erg', watts: 173 }, 'ERG 173 W'],
    [{ mode: 'resistance', levelPct: 37.4 }, 'RES 37%'],
    [{ mode: 'sim', gradePct: -2.6 }, 'SIM -2.6%'],
    [{ mode: 'sim', gradePct: 4.3 }, 'SIM +4.3%'],
    [{ mode: 'none' }, 'Idle'],
    [null, 'Idle'],
  ] as Array<[TrainerCommand | null, string]>) {
    show(command);
    expect(el.querySelector('.zw-trainer')?.textContent).toBe(label);
    expect(el.querySelector('.zw-gear')).toBeNull();
    expect(el.querySelector('[aria-label="210 watts"]')).not.toBeNull();
  }
  show({ mode: 'erg', watts: 173 }, { ...connected, connected: { ...connected.connected, trainer: false } });
  expect(el.querySelector('.zw-trainer')?.textContent).toBe('Offline');
  show({ mode: 'erg', watts: 173 }, connected, true);
  expect(el.querySelector('.zw-trainer')).toBeNull();
  expect(el.querySelector('[aria-label="Gear 8"]')).not.toBeNull();
  render(null, el);
});

it('identifies the active metric, target band and position independently of color', () => {
  const el = document.createElement('div');
  render(<ZoneWidget bike={bike} ftp={250} view={{ source: 'hr', pos: { zone: 3, within: .5, pos: .5 } }} target={{ min: 2, max: 3 }} bars={[]} />, el);
  expect(el.querySelector('.zw-icon')?.getAttribute('aria-label')).toContain('Heart rate');
  expect(el.textContent).not.toContain('Target Z2–3');
  expect(el.querySelector('.zw-icon')?.getAttribute('aria-label')).toContain('In target');
  expect(el.textContent).not.toContain('Heart rate');
  expect(el.textContent).not.toContain('In target');
  expect(el.querySelector('.zw-meter strong')).toBeNull();
  expect(el.querySelectorAll('.outside')).toHaveLength(3);
  expect(el.querySelector('.zw-bar')?.getAttribute('aria-label')).toContain('Target Z2–3');
});

it('shows power and cadence guidance together without placing gear controls among metrics', () => {
  const el = document.createElement('div');
  render(<ZoneWidget bike={bike} ftp={250} view={{ source: 'power', pos: { zone: 3, within: .5, pos: .5 } }} target={{ min: 4, max: 5, source: 'power', label: 'Sprint' }} cadenceTarget={{ min: 90, max: 110, label: 'Spin faster' }} gears bars={[]} />, el);
  expect(el.querySelector('.zw-icon')?.getAttribute('aria-label')).toContain('Power');
  expect(el.querySelector('.zw-icon')?.getAttribute('aria-label')).toContain('Below target');
  expect(el.querySelector('.zw-icon')?.classList.contains('off-target')).toBe(true);
  expect(el.querySelector('.zw-icon path')?.getAttribute('d')).toContain('M13 2');
  expect(el.querySelector('.zw-label')?.textContent).toContain('225+ W');
  expect(el.querySelector('[aria-label="210 watts"]')).not.toBeNull();
  expect(el.querySelector('[aria-label="145 beats per minute"]')).not.toBeNull();
  expect(el.querySelector('[aria-label="80 revolutions per minute"]')).not.toBeNull();
  expect(el.querySelector('.zw-cad-guide')?.textContent).toContain('↑ 90–110');
  expect(el.querySelector('.zw-nums [aria-label="Gear 8"]')).not.toBeNull();
  expect(el.querySelector('.zw-nums [aria-label="Ride time 12:34"]')).not.toBeNull();
  expect(el.querySelectorAll('button')).toHaveLength(0);
});

it('does not imply a current HR zone while the sensor is missing', () => {
  const el = document.createElement('div');
  render(<ZoneWidget bike={{ ...bike, hr5s: null }} ftp={250} view={{ source: 'hr', pos: { zone: 1, within: 0, pos: 0 } }} target={{ min: 2, max: 3 }} bars={[]} />, el);
  expect(el.querySelector('.zw-icon')?.getAttribute('aria-label')).toContain('Waiting for HR');
  expect(el.querySelector('.zw-marker')).toBeNull();
});

it('replaces the cadence unit with directional target guidance without hiding the current cadence', () => {
  const el = document.createElement('div');
  const show = (rpm: number, target?: { min: number; max: number }) => render(<ZoneWidget bike={{ ...bike, cadence3s: rpm }} ftp={250} view={{ source: 'power', pos: { zone: 3, within: .5, pos: .5 } }} cadenceTarget={target} bars={[]} />, el);
  show(88);
  expect(el.querySelector('.zw-cad .zw-unit')?.textContent).toBe('rpm');
  for (const [rpm, text, status] of [[88, '↑ 90–100', 'low'], [90, '90–100', 'ok'], [100, '90–100', 'ok'], [101, '↓ 90–100', 'high']] as const) {
    show(rpm, { min: 90, max: 100 });
    expect(el.querySelector('.zw-cad .zw-unit')).toBeNull();
    expect(el.querySelector('.zw-cad b')?.textContent).toBe(String(rpm));
    expect(el.querySelector('.zw-cad-guide')?.textContent).toBe(text);
    expect(el.querySelector('.zw-cad')?.classList.contains(status)).toBe(true);
  }
  show(88);
  expect(el.querySelector('.zw-cad-guide')).toBeNull();
  expect(el.querySelector('.zw-cad .zw-unit')?.textContent).toBe('rpm');
});
