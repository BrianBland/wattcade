// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import { defaultProfile } from '../../progression';
import { editorFields } from '../editorFields';
import { deliverMenuPresses } from '../menuInput';
vi.mock('../components/RiderAvatar', () => ({ RiderAvatar: () => null }));
import { ProfileEditor } from './ProfileEditor';
let host: HTMLDivElement;
afterEach(async () => { if (host) await act(() => render(null, host)); });
const press = (key: 'down' | 'a' | 'b') => act(() => deliverMenuPresses(new Set([key])));
it('creates a named, colored rider without an Aim option and preserves stored aim behavior', async () => {
  host = document.createElement('div');
  const profile = defaultProfile(''); profile.name = ''; profile.settings.aimMode = 'axes';
  const onSave = vi.fn();
  await act(() => render(<ProfileEditor profile={profile} onSave={onSave} onCancel={() => {}} />, host));
  expect([...host.querySelectorAll('.field label')].map(el => el.textContent)).not.toContain('Aim');
  const name = host.querySelector<HTMLInputElement>('[aria-label="Rider name"]')!;
  await act(() => { name.value = '  Alex  '; name.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(() => host.querySelector<HTMLButtonElement>('[aria-label="Mint"]')!.click());
  await act(() => [...host.querySelectorAll<HTMLButtonElement>('.actions button')].find(b => b.textContent?.includes('Create rider'))!.click());
  expect(onSave).toHaveBeenCalledOnce();
  expect(onSave.mock.calls[0][0]).toMatchObject({ name: 'Alex', color: '#2de2a6', settings: { aimMode: 'axes' } });
});
it('reaches Save and the two-step Delete action after the shortened field list', async () => {
  host = document.createElement('div'); const profile = defaultProfile('Mika'), onSave = vi.fn(), onDelete = vi.fn();
  await act(() => render(<ProfileEditor profile={profile} onSave={onSave} onCancel={() => {}} onDelete={onDelete} />, host));
  for (let i = 0; i < editorFields(profile).length; i++) await press('down');
  await press('a'); expect(onSave).toHaveBeenCalledOnce();
  await press('down'); await press('a'); expect(onDelete).not.toHaveBeenCalled();
  expect(host.textContent).toContain('Really delete?');
  await press('a'); expect(onDelete).toHaveBeenCalledExactlyOnceWith(profile);
});
it('keeps controller cancellation available from the editor', async () => {
  host = document.createElement('div'); const onCancel = vi.fn();
  await act(() => render(<ProfileEditor profile={defaultProfile('')} onSave={() => {}} onCancel={onCancel} />, host));
  await press('b'); expect(onCancel).toHaveBeenCalledOnce();
});
