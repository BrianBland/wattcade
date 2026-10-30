/** Start a bounded batch together; consume in order without unhandled later rejections.
 * The caller owns cancellation and limits the batch size to the resolver's two slots.
 */
export function orderedLoads<T>(loads: Array<() => Promise<T>>): Array<() => Promise<T>> {
  return loads.map(load => {
    const pending = new Promise<T>(resolve => resolve(load())).then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error }));
    return async () => { const result = await pending; if (!result.ok) throw result.error; return result.value; };
  });
}
