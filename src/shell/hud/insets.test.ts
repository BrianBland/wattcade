// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { readHudInsets } from './insets';

afterEach(() => document.body.replaceChildren());
const bounds = (el: HTMLElement, x: number, y: number, w: number, h: number) => {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON() {} });
};

it('keeps conservative edge insets and supplies clipped HUD bounds relative to the surface', () => {
  const surface = document.createElement('div'), probe = document.createElement('div'), hud = document.createElement('div');
  hud.className = 'hud'; hud.innerHTML = '<div></div><div></div><div></div>';
  document.body.append(surface, probe, hud);
  Object.defineProperty(probe, 'offsetHeight', { value: 188 });
  bounds(surface, 10, 20, 820, 1180);
  bounds(hud.children[0] as HTMLElement, 0, 1012, 100, 188);
  bounds(hud.children[1] as HTMLElement, 110, 1095, 620, 105);
  bounds(hud.children[2] as HTMLElement, 900, 1012, 100, 188); // outside this surface
  expect(readHudInsets(surface, probe)).toEqual({ top: 0, left: 0, right: 0, bottom: 188, occlusions: [
    { x: 0, y: 992, w: 90, h: 188 }, { x: 100, y: 1075, w: 620, h: 105 },
  ] });
});

it('uses the rectangular fallback before the HUD mounts or when the warmup HUD is hidden', () => {
  const surface = document.createElement('div'), probe = document.createElement('div');
  Object.defineProperty(probe, 'offsetHeight', { value: 168, configurable: true });
  expect(readHudInsets(surface, probe)).toEqual({ top: 0, left: 0, right: 0, bottom: 168 });
  Object.defineProperty(probe, 'offsetHeight', { value: 0 });
  expect(readHudInsets(surface, probe)).toEqual({ top: 0, left: 0, right: 0, bottom: 0 });
});

it('reserves the whole opaque compact ribbon including its border and bottom padding', () => {
  const surface=document.createElement('div'),probe=document.createElement('div'),hud=document.createElement('div');
  hud.className='hud hud-ribbon';hud.innerHTML='<div></div><div></div>';document.body.append(surface,probe,hud);
  Object.defineProperty(probe,'offsetHeight',{value:88});bounds(surface,0,0,1180,820);bounds(hud,0,732,1180,88);
  bounds(hud.children[0] as HTMLElement,8,734,1164,50);bounds(hud.children[1] as HTMLElement,8,784,1164,32);
  expect(readHudInsets(surface,probe).occlusions).toEqual([{x:0,y:732,w:1180,h:88}]);
});

it('includes floating status/touch bounds in the conservative envelope but excludes history and help', () => {
  const surface=document.createElement('div'),probe=document.createElement('div'),host=document.createElement('div');
  host.className='ride-hud';host.innerHTML='<div class="hud hud-ribbon" data-hud-occlusion></div><div data-hud-occlusion></div><section class="hud-peek"></section>';document.body.append(surface,probe,host);
  Object.defineProperty(probe,'offsetHeight',{value:59});bounds(surface,0,0,1180,820);
  bounds(host.children[0] as HTMLElement,0,761,1180,59);bounds(host.children[1] as HTMLElement,400,725,380,28);bounds(host.children[2] as HTMLElement,300,200,500,400);
  expect(readHudInsets(surface,probe)).toEqual({top:0,right:0,left:0,bottom:95,occlusions:[{x:0,y:761,w:1180,h:59},{x:400,y:725,w:380,h:28}]});
  bounds(host.children[1] as HTMLElement,0,0,0,0);
  expect(readHudInsets(surface,probe).bottom).toBe(59);
});
