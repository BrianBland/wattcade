// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { expect, it } from 'vitest';
import { MediaServerConnection } from './MediaServerConnection';

it('restores edited connection fields after closing and reopening the app', () => {
  localStorage.clear(); sessionStorage.clear();
  const el = document.createElement('div');
  const input = (label: string) => el.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;
  const edit = (label: string, value: string) => act(() => {
    input(label).value = value;
    input(label).dispatchEvent(new Event('input', { bubbles: true }));
  });
  try {
    act(() => render(<MediaServerConnection />, el));
    edit('Media server URL', 'https://media.example.com');
    edit('Media server token', 'test-token');
    act(() => {
      const checkbox = el.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
      checkbox.checked = true; checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    });
    act(() => {
      const select = el.querySelector<HTMLSelectElement>('select')!;
      select.value = '240'; select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    act(() => render(null, el));
    sessionStorage.clear();
    act(() => render(<MediaServerConnection />, el));
    expect(input('Media server URL').value).toBe('https://media.example.com');
    expect(input('Media server token').value).toBe('test-token');
    expect(el.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
    expect(el.querySelector<HTMLSelectElement>('select')!.value).toBe('240');
  } finally {
    act(() => render(null, el));
    localStorage.clear(); sessionStorage.clear();
  }
});
