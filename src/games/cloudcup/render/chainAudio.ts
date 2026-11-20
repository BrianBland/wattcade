import { sfxGraph } from '../../../audio/sfx';

// Two links take up the slack, then the last ring lifts clear. Pan the short,
// inharmonic resonances from the attacking shoulder into the shared effects bus.
export function rattleChain(side: number) {
  const graph = sfxGraph();
  if (!graph) return;
  const { ctx, out } = graph;
  const pan = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
  if (pan) {
    pan.pan.value = side * 0.78;
    pan.connect(out);
  }
  const start = ctx.currentTime;
  let tails = 0;
  for (const [delay, pitch, amp] of [
    [0, 1210, 0.07],
    [0.062, 1640, 0.049],
    [0.214, 1370, 0.06],
  ]) {
    const when = start + delay;
    for (const ratio of [1, 1.73]) {
      const bell = ctx.createOscillator(),
        envelope = ctx.createGain();
      bell.type = 'triangle';
      bell.frequency.setValueAtTime(pitch * ratio, when);
      bell.frequency.exponentialRampToValueAtTime(pitch * ratio * 0.94, when + 0.07);
      envelope.gain.setValueAtTime(0.0001, when);
      envelope.gain.exponentialRampToValueAtTime(amp / ratio, when + 0.005);
      envelope.gain.exponentialRampToValueAtTime(0.0001, when + 0.107);
      bell.connect(envelope);
      envelope.connect(pan ?? out);
      tails++;
      bell.onended = () => {
        bell.disconnect();
        envelope.disconnect();
        if (--tails === 0) pan?.disconnect();
      };
      bell.start(when);
      bell.stop(when + 0.113);
    }
  }
}
