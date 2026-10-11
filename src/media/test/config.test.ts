// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mediaServerConfig, saveMediaServerConfig } from '../online/config';

const KEY = 'wattcade.media.server';
const config = { enabled: true, url: 'https://media.example.com', token: 'test-token', bufferS: 240 };
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });

it('restores every setting after the browser session ends', () => {
  saveMediaServerConfig(config);
  sessionStorage.clear();
  expect(mediaServerConfig()).toEqual(config);
});

it('migrates an existing tab token along with the saved settings', () => {
  const { token, ...settings } = config;
  localStorage.setItem(KEY, JSON.stringify(settings));
  sessionStorage.setItem(`${KEY}.token`, token);
  expect(mediaServerConfig()).toEqual(config);
  sessionStorage.clear();
  expect(mediaServerConfig()).toEqual(config);
});

it('remembers an explicitly cleared token instead of restoring a stale tab token', () => {
  saveMediaServerConfig({ ...config, token: '' });
  sessionStorage.setItem(`${KEY}.token`, 'stale-token');
  expect(mediaServerConfig()).toEqual({ ...config, token: '' });
});

it('preserves persistent settings when session storage is unavailable', () => {
  saveMediaServerConfig(config);
  const getItem = Storage.prototype.getItem;
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key: string) {
    if (this === sessionStorage) throw new Error('Unavailable');
    return getItem.call(this, key);
  });
  expect(mediaServerConfig()).toEqual(config);
  const { token, ...settings } = config;
  localStorage.setItem(KEY, JSON.stringify(settings));
  expect(mediaServerConfig()).toEqual({ ...settings, token: '' });
});

it('does not silently report a successful save when persistent storage fails', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage full'); });
  expect(() => saveMediaServerConfig(config)).toThrow('Storage full');
});
