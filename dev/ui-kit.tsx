import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { UI, UiRoot, UiButton, UiPanel, UiReadout, UiProgress, UiTabs, UiListRow, UiTooltip, UiMessage, UiField, UiStepper, UiChoice, UiToggle } from '../src/ui';
import { drawPanel, drawButton, drawProgress, drawReadout, drawListRow, drawTab, drawTooltip } from '../src/ui/canvas';
import './ui-kit.css';
function CanvasPreview() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const draw = () => {
      const w = c.clientWidth,
        dpr = Math.min(2, devicePixelRatio || 1),
        wide = w > 520,
        h = wide ? 580 : 760;
      c.style.height = `${h}px`;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      const g = c.getContext('2d')!;
      g.scale(dpr, dpr);
      const pad = 16,
        col = wide ? (w - 48) / 2 : w - 32;
      drawPanel(g, {
        x: 0,
        y: 0,
        w,
        h
      });
      const examples = [['Primary', {
        primary: true
      }], ['Quiet', {}], ['Focused', {
        focused: true
      }], ['Selected', {
        selected: true
      }], ['Disabled', {
        disabled: true
      }], ['Pressed', {
        pressed: true
      }]] as const;
      examples.forEach(([label, state], i) => drawButton(g, {
        x: pad + (wide ? i % 2 * (col + 16) : 0),
        y: pad + Math.floor(i / (wide ? 2 : 1)) * 60,
        w: col,
        h: 44
      }, label, state));
      let y = pad + (wide ? 3 : 6) * 60 + 16;
      drawReadout(g, {
        x: pad,
        y,
        w: 180,
        h: 52
      }, 'Ride time', '20:00');
      drawProgress(g, {
        x: pad,
        y: y + 64,
        w: w - 32,
        h: 4
      }, .65);
      y += 96;
      drawListRow(g, {
        x: pad,
        y,
        w: w - 32,
        h: 48
      }, 'Upgrade', 'Ready', {
        selected: true
      });
      y += 64;
      drawTab(g, {
        x: pad,
        y,
        w: 140,
        h: 44
      }, 'Overview', {
        selected: true
      });
      drawTab(g, {
        x: pad + 144,
        y,
        w: Math.max(0, w - 176),
        h: 44
      }, 'Progress');
      y += 64;
      drawTooltip(g, {
        x: pad,
        y,
        w: w - 32,
        h: 44
      }, 'Hold a steady effort to recharge.');
    };
    const ro = new ResizeObserver(draw);
    ro.observe(c);
    draw();
    return () => ro.disconnect();
  }, []);
  return <canvas ref={ref} class="canvas-preview" role="img" aria-label="Canvas versions of the same flat buttons, readouts, progress, lists, tabs and tooltips" />;
}
function Gallery() {
  const [value, setValue] = useState(65),
    [tab, setTab] = useState('overview'),
    [on, setOn] = useState(true),
    [choice, setChoice] = useState('auto'),
    [selected, setSelected] = useState('first'),
    [clicks, setClicks] = useState(0);
  return <UiRoot><header class="guide-header"><div class="eyebrow">WATTCADE / SHARED UI</div><h1>One visual language.</h1><p>Flat surfaces, readable type and pixel accents. The same tokens power DOM and Canvas widgets.</p><a href="/docs/UI_STYLE_GUIDE.md">Read the implementation guide</a></header>
 <section class="palette" aria-label="UI colors">{Object.entries(UI.color).slice(0, 10).map(([name, color]) => <div><i style={{
          background: color
        }} /><span>{name}</span><small>{color}</small></div>)}</section>
 <div class="guide-columns"><section><div class="eyebrow">DOM / INTERACTIVE</div><h2>Components and states</h2><UiPanel><h3>Buttons</h3><div class="widget-row"><UiButton variant="primary" onClick={() => setClicks(n => n + 1)}>Primary</UiButton><UiButton onClick={() => setClicks(n => n + 1)}>Quiet</UiButton><UiButton focused>Focused</UiButton><UiButton selected>Selected</UiButton><UiButton disabled>Disabled</UiButton><UiButton busy>Loading</UiButton><UiButton variant="danger">Delete</UiButton><UiTooltip label="Button help">Use a mint primary for the next action. Keep secondary actions quiet.</UiTooltip></div><p class="muted" role="status">{clicks} primary or quiet actions</p></UiPanel>
 <UiPanel><h3>Readouts and progress</h3><div class="widget-row"><UiReadout label="Ride time" value="20:00" /><UiReadout label="Energy" value="211 kJ" /></div><UiProgress value={value / 100} label="Boost recharge" /><p class="muted">Boost · {value === 100 ? 'Ready' : `${value}% charged`}</p><UiField label="Progress"><UiStepper value={value} min={0} max={100} step={5} onChange={setValue} unit="%" /></UiField></UiPanel>
 <UiPanel><h3>Tabs and lists</h3><UiTabs label="Example view" items={[{
            value: 'overview',
            label: 'Overview'
          }, {
            value: 'progress',
            label: 'Progress'
          }, {
            value: 'locked',
            label: 'Locked',
            disabled: true
          }]} value={tab} onChange={setTab} /><p class="muted">{tab === 'overview' ? 'Your ride at a glance.' : 'Your next milestone is within reach.'}</p>{['first', 'second'].map((id, i) => <UiListRow selected={selected === id} onClick={() => setSelected(id)}>Upgrade {i + 1}<span>{selected === id ? 'Selected' : 'Available'}</span></UiListRow>)}</UiPanel>
 <UiPanel><h3>Fields</h3><UiField label="Control layout"><UiChoice value={choice} onChange={setChoice} options={[{
              value: 'auto',
              label: 'Auto'
            }, {
              value: 'touch',
              label: 'Touch'
            }, {
              value: 'controller',
              label: 'Controller'
            }]} /></UiField><UiField label="Sound"><UiToggle on={on} onChange={setOn} /></UiField></UiPanel>
 <UiPanel><h3>Empty, loading and error states</h3><div class="message-examples"><UiMessage title="Your queue is empty" tone="empty">Add music to build your next ride.</UiMessage><UiMessage title="Preparing your ride" busy>Keep pedaling while the scene loads.</UiMessage><UiMessage title="Could not load the scene" tone="error" action={<UiButton>Try again</UiButton>}>Your saved rider is still available.</UiMessage></div></UiPanel>
 </section><section><div class="eyebrow">CANVAS / SAME TOKENS</div><h2>Renderer primitives</h2><CanvasPreview /><UiPanel><h3>Adoption rules</h3><p>Draw in CSS pixels, respect the measured HUD insets, and keep touch actions at least 44 × 44 pixels.</p><p>Games own input, selection and accessibility. The widget library draws their current state. Read-only indicators can be compact.</p><p>Keep game art distinctive. Use these widgets for menus and information around it.</p><a href="/docs/UI_STYLE_GUIDE.md">API and integration examples</a></UiPanel></section></div>
 </UiRoot>;
}
render(<Gallery />, document.getElementById('app')!);
(window as any).__uiKitReady = true;
