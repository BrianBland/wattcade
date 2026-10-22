// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { logExport } from './exportLog';
afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const click = (label: string) => [...document.querySelectorAll('button')].find(b => b.textContent === label)!.click();
it('leaves selectable log text visible even when Bluefy ignores the download', () => {
  vi.useFakeTimers();
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:log', revokeObjectURL: vi.fn() });
  const anchor = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { expect(this.isConnected).toBe(true); });
  document.body.append(logExport(() => 'native response\ngear 14', 'log.txt'));
  click('Download log');
  const text = document.querySelector('textarea')!;
  expect(text.hidden).toBe(false); expect(text.value).toContain('gear 14');
  expect(document.body.textContent).toContain('If no download appears');
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  vi.advanceTimersByTime(60000); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:log');
  anchor.mockRestore();
});
it('offers selected text when clipboard and sharing APIs are missing', () => {
  vi.stubGlobal('navigator', {});
  document.body.append(logExport(() => 'saved log', 'log.txt'));
  click('Copy log'); expect(document.querySelector('textarea')!.value).toBe('saved log');
  expect(document.body.textContent).toContain('Touch and hold');
  click('Share log'); expect(document.body.textContent).toContain('Sharing unavailable');
});
it('opens the file share sheet directly within the click handler', () => {
  const share = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { canShare: () => true, share });
  document.body.append(logExport(() => 'response bytes', 'log.txt'));
  click('Share log'); expect(share).toHaveBeenCalledOnce();
  expect(share.mock.calls[0][0].files[0].name).toBe('log.txt');
});
