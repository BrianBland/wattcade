// @vitest-environment jsdom
import { render } from 'preact';
import { expect, it } from 'vitest';
import type { BikeState } from '../../contracts';
import { ZoneWidget } from './ZoneWidget';

const bike = { power3s: 210, ftpFraction: .84, hr5s: 145, cadence3s: 80 } as BikeState;

it('identifies the active metric, target band and position independently of color', () => {
  const el = document.createElement('div');
  render(<ZoneWidget bike={bike} ftp={250} view={{ source: 'hr', pos: { zone: 3, within: .5, pos: .5 } }} target={{ min: 2, max: 3 }} bars={[]} />, el);
  expect(el.querySelector('.zw-source')?.textContent).toContain('Heart rate');
  expect(el.querySelector('.zw-position')?.textContent).toContain('Target Z2–3');
  expect(el.querySelector('.zw-position')?.textContent).toContain('In target');
  expect(el.querySelectorAll('.outside')).toHaveLength(3);
  expect(el.querySelector('.zw-bar')?.getAttribute('aria-label')).toContain('Target Z2–3');
});

it('shows power and cadence guidance together without placing gear controls among metrics', () => {
  const el = document.createElement('div');
  render(<ZoneWidget bike={bike} ftp={250} view={{ source: 'power', pos: { zone: 3, within: .5, pos: .5 } }} target={{ min: 4, max: 5, source: 'power', label: 'Sprint' }} cadenceTarget={{ min: 90, max: 110, label: 'Spin faster' }} trail={<button>Gear +</button>} bars={[]} />, el);
  expect(el.querySelector('.zw-source')?.textContent).toContain('Power');
  expect(el.querySelector('.zw-position')?.textContent).toContain('Below target');
  expect(el.querySelector('.zw-label')?.textContent).toContain('225+ W');
  expect(el.querySelector('.zw-cad-guide')?.textContent).toContain('Raise · 90–110 rpm');
  expect(el.querySelector('.zw-controls button')?.textContent).toBe('Gear +');
});

it('does not imply a current HR zone while the sensor is missing', () => {
  const el = document.createElement('div');
  render(<ZoneWidget bike={{ ...bike, hr5s: null }} ftp={250} view={{ source: 'hr', pos: { zone: 1, within: 0, pos: 0 } }} target={{ min: 2, max: 3 }} bars={[]} />, el);
  expect(el.textContent).toContain('Waiting for HR');
  expect(el.querySelector('.zw-marker')).toBeNull();
});
