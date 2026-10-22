// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { expect, it, vi } from 'vitest';
import type { ControlHint, GameModule, Profile } from '../../contracts';
import { GameIntro } from './GameIntro';

it('installs Escape handling before the newly opened guide can resume the underlying game', () => {
  const host=document.createElement('div');document.body.append(host);
  const back=vi.fn(),underlyingPause=vi.fn();
  window.addEventListener('keydown',underlyingPause);
  const controls:ControlHint[]=[
    {button:'left',label:'Left'},{button:'right',label:'Right'},{button:'up',label:'Up'},{button:'down',label:'Down'},
    {button:'a',label:'Strike'},{button:'b',label:'Ward'},{button:'y',label:'Rally'},{button:'z',label:'Potion'},
    {button:'paddles',label:'Steer'},{button:'shiftersL',label:'Dart left'},{button:'shiftersR',label:'Dart right'},
  ];
  try{
    act(()=>{
      render(<GameIntro game={{title:'Test ride',blurb:'Ride.',id:'test'} as GameModule} profile={{gameData:{}} as Profile} hud={{controls}} mode="help" count={null} onStart={()=>{}} onBack={back}/>,host);
      // No frame/effect wait: users can close help immediately after it appears.
      window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    });
    expect(back).toHaveBeenCalledOnce();expect(underlyingPause).not.toHaveBeenCalled();
    expect(host.querySelectorAll('.legend-binding')).toHaveLength(controls.length);
  }finally{act(()=>render(null,host));window.removeEventListener('keydown',underlyingPause);host.remove();}
});
