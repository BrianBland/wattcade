/** Integer-grid icons: a small pixel accent, with readable system type alongside. */
export function PixelIcon({ kind }: { kind: 'trainer' | 'controller' | 'hr' | 'trophy' | 'rider' }) {
  const paths = {
    trainer: 'M12 1h7l-5 8h6L9 23H5l5-10H4Z',
    controller: 'M5 5h14v3h3v11h-6v-3H8v3H2V8h3Zm2 4v2H5v2h2v2h2v-2h2v-2H9V9Zm10 1v3h3v-3Zm-3 3v3h3v-3Z',
    hr: 'M3 4h6v3h6V4h6v3h3v7h-3v3h-3v3h-3v3H9v-3H6v-3H3v-3H0V7h3Z',
    trophy: 'M6 2h12v3h5v8h-3v3h-5v3h4v3H5v-3h4v-3H4v-3H1V5h5Zm-2 6v3h2V8Zm14 0v3h2V8Z',
    rider: 'M9 2h6v3h3v6h-3v3H9v-3H6V5h3ZM6 15h12v3h3v5H3v-5h3Z',
  };
  return <svg class="pixel-icon" viewBox="0 0 24 24" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d={paths[kind]} /></svg>;
}
