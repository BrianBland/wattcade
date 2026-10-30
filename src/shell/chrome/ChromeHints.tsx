import { useEffect, useState } from 'preact/hooks';
import { hasConnectedController, subscribeDevices } from '../services';
import { KeyHints } from '../components/ui';

/** Physical labels belong to a connected controller, not a touch screen. */
export function ChromeHints({ hints }: { hints: Array<[string, string]> }) {
  const [connected, setConnected] = useState(hasConnectedController);
  useEffect(() => {
    const update = () => setConnected(hasConnectedController());
    const off = subscribeDevices(update);
    window.addEventListener('gamepadconnected', update); window.addEventListener('gamepaddisconnected', update);
    update();
    return () => { off(); window.removeEventListener('gamepadconnected', update); window.removeEventListener('gamepaddisconnected', update); };
  }, []);
  return connected ? <KeyHints hints={hints} /> : null;
}
