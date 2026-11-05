// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { achievementToast, toast, Toasts } from './Toasts';
let host: HTMLDivElement;
beforeEach(async () => { vi.useFakeTimers(); host=document.createElement('div'); await act(() => render(<Toasts/>,host)); });
afterEach(async () => { await act(() => render(null,host)); vi.useRealTimers(); });
it('shows the unlocked goal and bonus, then expires without dismissing newer messages', async () => {
 await act(() => achievementToast('Kilojoule Club','Ride a total of 2,500 kJ.',50));
 expect(host.querySelector('.achievement-toast')?.textContent).toContain('Kilojoule Club');
 expect(host.textContent).toContain('Ride a total of 2,500 kJ.'); expect(host.textContent).toContain('50 XP');
 await act(() => { vi.advanceTimersByTime(3000); });
 await act(() => toast('Trainer reconnected'));
 await act(() => { vi.advanceTimersByTime(3000); });
 expect(host.querySelector('.achievement-toast')).toBeNull(); expect(host.textContent).toContain('Trainer reconnected');
 await act(() => { vi.advanceTimersByTime(1500); }); expect(host.querySelector('.toast')).toBeNull();
});
it('keeps at most three notices and releases their timers when unmounted', async () => {
 await act(() => { for(const name of ['First','Second','Third','Fourth']) toast(name); });
 expect([...host.querySelectorAll('.toast')].map(el=>el.textContent)).toEqual(['Second','Third','Fourth']);
 await act(() => render(null,host)); expect(vi.getTimerCount()).toBe(0);
});
