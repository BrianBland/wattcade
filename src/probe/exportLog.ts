/** Bluefy may silently ignore blob downloads. Always expose selectable text too. */
export function logExport(getText: () => string, filename: string): HTMLElement {
  const box = document.createElement('section');
  const text = document.createElement('textarea');
  text.readOnly = true; text.hidden = true; text.setAttribute('aria-label', 'Log text');
  text.style.cssText = 'width:100%;height:220px;font:12px monospace';
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  function show() { text.value = getText(); text.hidden = false; text.focus(); text.select(); }
  function button(label: string, click: () => void) {
    const b = document.createElement('button'); b.textContent = label; b.onclick = click;
    b.style.cssText = 'padding:12px;margin:4px;font-size:16px'; box.append(b);
  }
  button('Copy log', () => {
    show();
    if (!navigator.clipboard?.writeText) { status.textContent = 'Log selected. Touch and hold the text to copy it.'; return; }
    void navigator.clipboard.writeText(text.value).then(() => { status.textContent = 'Log copied.'; }, () => {
      status.textContent = 'Clipboard unavailable. Touch and hold the selected text to copy it.';
    });
  });
  button('Share log', () => {
    show();
    if (!navigator.share) { status.textContent = 'Sharing unavailable. Copy the selected log instead.'; return; }
    const file = new File([text.value], filename, { type: 'text/plain' });
    const data: ShareData = navigator.canShare?.({ files: [file] })
      ? { files: [file], title: 'Wattcade Bluetooth log' }
      : { text: text.value, title: 'Wattcade Bluetooth log' };
    // Invoke synchronously in the tap handler so iOS retains user activation.
    void navigator.share(data).catch(() => { status.textContent = 'Share closed. The log is selected below for copying.'; });
  });
  button('Download log', () => {
    show();
    status.textContent = 'If no download appears, use Copy log or Share log, or copy the selected text below.';
    const url = URL.createObjectURL(new Blob([text.value], { type: 'text/plain' }));
    const a = document.createElement('a'); a.href = url; a.download = filename;
    box.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  });
  button('Show log', show);
  box.append(status, text); return box;
}
