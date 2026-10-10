// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { mediaServerConfig, saveMediaServerConfig } from '../online/config';

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

it('defaults to three minutes and migrates shorter saved buffers to two minutes', () => {
  expect(mediaServerConfig().bufferS).toBe(180);
  for (const bufferS of [60, 90]) {
    localStorage.setItem('wattcade.media.server', JSON.stringify({ enabled: true, bufferS }));
    expect(mediaServerConfig()).toMatchObject({ enabled: true, bufferS: 120 });
  }
});

it('preserves supported preferences, bounds larger values and handles invalid saved buffers', () => {
  for (const bufferS of [120, 180, 240]) {
    saveMediaServerConfig({ enabled: true, url: '/media-resolver', token: 'tab-token', bufferS });
    expect(mediaServerConfig()).toMatchObject({ bufferS, token: 'tab-token' });
    expect(localStorage.getItem('wattcade.media.server')).not.toContain('tab-token');
  }
  for (const [saved, expected] of [[600, 240], ['invalid', 180], [0, 180]] as const) {
    localStorage.setItem('wattcade.media.server', JSON.stringify({ bufferS: saved }));
    expect(mediaServerConfig().bufferS).toBe(expected);
  }
});
