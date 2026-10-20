// @vitest-environment jsdom
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { GameModule, GameRenderer, Profile } from '../../contracts';
const mocks = vi.hoisted(() => ({
  session: { frame: vi.fn(), idle: vi.fn(() => new Set()), pause: vi.fn(), resume: vi.fn(), ctx: { bike: () => ({}) }, sim: { snapshot: () => ({}), isOver: () => false, inMenu: vi.fn(() => false), menuActions: vi.fn((): import('../../contracts').GameMenuAction[] => []), receive: vi.fn() } },
  raf: vi.fn(() => 1), panic: vi.fn(), system: null as null | ((action: string) => void), quit: vi.fn(), abandon: vi.fn(),
}));
vi.mock('../services', () => ({ startSession: () => mocks.session, previewAward: () => null, getFake: () => false, activeSession: () => null, mediaEngine: vi.fn(), onSystem: (fn: (action: string) => void) => { mocks.system = fn; return () => {}; }, debugActions: { panic: mocks.panic }, input: { attachKeyboard: () => () => {}, attachGamepad: () => () => {}, attachTouch: () => () => {}, state: () => ({}) } }));
vi.mock('../fakeKeysDom', () => ({ attachFakeKeys: () => () => {} }));
vi.mock('../hud/HudLayer', () => ({ HudLayer: () => null }));
vi.mock('./PauseMenu', () => ({ PauseMenu: ({ onQuit, quitLabel = 'Finish ride', extensions, onExtension }: { onQuit: () => void; quitLabel?: string; extensions: import('../../contracts').GameMenuAction[]; onExtension: (action: unknown) => void }) => h('div', {}, extensions.map(entry => h('button', { onClick: () => onExtension(entry.action) }, entry.label)), h('button', { onClick: onQuit }, quitLabel)) }));
vi.mock('../game/ResultBanner', () => ({ ResultBanner: () => null }));
vi.mock('../game/GameIntro', () => ({ GameIntro: ({onStart}: {onStart:()=>void}) => h('button',{onClick:onStart},'Start game'), IntroHelp: () => null }));
vi.mock('../components/Toasts', () => ({ toast: vi.fn() }));
vi.mock('../../debug/flag', () => ({ loadFlag: () => false, saveFlag: vi.fn() }));
vi.mock('../../audio/sfx', () => ({ duckAmbient: vi.fn(), play: vi.fn(), unlockAudio: vi.fn() }));
import { GameHost } from './GameHost';
import { HUD_LAYOUT_EVENT } from '../hud/insets';
let container: HTMLDivElement;
let resolveReady: () => void, rejectReady: (error: Error) => void;
let renderer: GameRenderer;
async function mount(id = 'towerdefense') {
  const ready = new Promise<void>((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
  renderer = {mount:vi.fn(),setInsets:vi.fn(),render:vi.fn(),unmount:vi.fn(),ready:()=>ready};
  const game = {id,title:'Dynamo Defense',loadRenderer:async()=>renderer} as unknown as GameModule;
  await act(async()=>{render(<GameHost game={game} profile={{level:1} as Profile} onQuit={mocks.quit} onAbandon={mocks.abandon} onRestart={()=>{}} onSave={()=>{}} />,container);});
}
beforeEach(()=>{
  vi.clearAllMocks(); mocks.session.sim.inMenu.mockReturnValue(false); mocks.session.sim.menuActions.mockReturnValue([]);
  vi.stubGlobal('requestAnimationFrame',mocks.raf); vi.stubGlobal('cancelAnimationFrame',vi.fn());
  vi.stubGlobal('ResizeObserver',class {observe(){} disconnect(){}});
  container=document.createElement('div');document.body.appendChild(container);
});
afterEach(async()=>{await act(async()=>render(null,container));container.remove();vi.unstubAllGlobals();});
describe('renderer loading gate',()=>{
  it('updates actual HUD shape when content or legend changes inside the same reserved band',async()=>{
    await mount();
    const surface = container.querySelector<HTMLElement>('.mount')!, probe = container.querySelector<HTMLElement>('.hud-probe')!;
    const hud = document.createElement('div'); hud.className='hud';
    const panel = document.createElement('div'); hud.append(panel); container.append(hud);
    Object.defineProperty(probe,'offsetHeight',{value:188});
    const rect = (y:number,h:number) => ({x:0,y,left:0,top:y,right:820,bottom:y+h,width:820,height:h,toJSON(){}});
    vi.spyOn(surface,'getBoundingClientRect').mockReturnValue(rect(0,1180));
    const panelBounds = vi.spyOn(panel,'getBoundingClientRect').mockReturnValue(rect(1075,101));
    window.dispatchEvent(new Event(HUD_LAYOUT_EVENT));
    expect(renderer.setInsets).toHaveBeenLastCalledWith({top:0,right:0,left:0,bottom:188,occlusions:[{x:0,y:1075,w:820,h:101}]});
    panelBounds.mockReturnValue(rect(992,184)); window.dispatchEvent(new Event(HUD_LAYOUT_EVENT));
    expect(renderer.setInsets).toHaveBeenLastCalledWith({top:0,right:0,left:0,bottom:188,occlusions:[{x:0,y:992,w:820,h:184}]});
  });
  for(const menu of [false,true])it(`holds ${menu?'the game menu':'the intro and countdown'} until renderer readiness`,async()=>{
    mocks.session.sim.inMenu.mockReturnValue(menu); await mount();
    expect(container.textContent).toContain('Preparing Dynamo Defense');
    expect(container.textContent).not.toContain('Start game');
    expect(mocks.session.frame).not.toHaveBeenCalled(); expect(mocks.session.idle).not.toHaveBeenCalled();
    expect(mocks.raf).not.toHaveBeenCalled(); expect(mocks.panic).toHaveBeenCalledWith(true);
    await act(async()=>resolveReady());
    expect(container.querySelector('.game-loading')).toBeNull();
    expect(renderer.render).toHaveBeenCalledOnce(); expect(mocks.raf).toHaveBeenCalledOnce();
    expect(mocks.session.idle).toHaveBeenCalledWith(0); // discard presses accumulated on the loading screen
    if(!menu)expect(container.textContent).toContain('Start game');
  });
  it('shows a recoverable error without starting the simulation when assets fail',async()=>{
    await mount(); await act(async()=>rejectReady(new Error('Texture unavailable')));
    expect(container.textContent).toContain('Texture unavailable');expect(container.textContent).toContain('Back');
    expect(container.textContent).not.toContain('Start game');expect(mocks.raf).not.toHaveBeenCalled();expect(mocks.session.frame).not.toHaveBeenCalled();
  });
  it('does not start a loop or render after leaving during loading',async()=>{
    await mount(); await act(async()=>render(null,container));await act(async()=>resolveReady());
    expect(renderer.unmount).toHaveBeenCalledOnce();expect(renderer.render).not.toHaveBeenCalled();expect(mocks.raf).not.toHaveBeenCalled();
  });
});


describe('pause menu exit', () => {
  async function readyToPlay(id: string) {
    await mount(id);
    await act(async () => resolveReady());
    await act(async () => container.querySelector<HTMLButtonElement>('button')!.click());
    let now = performance.now();
    for (let i = 0; i < 12; i++) {
      now += 250;
      await act(async () => {
        const calls = mocks.raf.mock.calls as unknown as [(time: number) => void][];
        calls[calls.length - 1][0](now);
      });
    }
  }
  it('finishes an ordinary game instead of sending a garage action', async () => {
    await readyToPlay('starfighter');
    await act(async () => mocks.system?.('pause'));
    expect(container.textContent).toContain('Finish ride');
    expect(container.textContent).not.toContain('Return to Garage');
    await act(async () => container.querySelector<HTMLButtonElement>('button:last-child')!.click());
    expect(mocks.panic).toHaveBeenLastCalledWith(true);
    expect(container.textContent).not.toContain('Finish ride');
  });
  it('adds game-supplied actions without replacing Finish ride, regardless of game ID', async () => {
    mocks.session.sim.menuActions.mockReturnValue([{ id: 'custom', label: 'Custom game action', action: { type: 'custom' } }]);
    await readyToPlay('starfighter');
    await act(async () => mocks.system?.('pause'));
    expect(container.textContent).toContain('Finish ride');
    const button = [...container.querySelectorAll('button')].find(button => button.textContent === 'Custom game action')!;
    expect(button).toBeDefined();
    await act(async () => button.click());
    expect(mocks.session.sim.receive).toHaveBeenCalledWith({ type: 'custom' });
    expect(mocks.session.resume).toHaveBeenCalled();
    expect(mocks.quit).not.toHaveBeenCalled();
    expect(mocks.abandon).not.toHaveBeenCalled();
  });
  it('exits from the garage after returning during play', async () => {
    await readyToPlay('towerdefense');
    mocks.session.sim.inMenu.mockReturnValue(true);
    await act(async () => mocks.system?.('pause'));
    expect(container.textContent).toContain('Exit game');
    await act(async () => container.querySelector<HTMLButtonElement>('button:last-child')!.click());
    expect(mocks.abandon).toHaveBeenCalledOnce();
  });
});
