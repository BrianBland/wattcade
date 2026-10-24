// Working chrome review: production components over a real game renderer.
import { h, render } from 'preact';
import './hud-live';
import { defaultProfile, xpForLevel } from '../src/progression';
import { Connect } from '../src/shell/screens/Connect';
import { ProfileEditor } from '../src/shell/screens/ProfileEditor';
import { ProfilePicker } from '../src/shell/screens/ProfilePicker';
import { PauseMenu } from '../src/shell/screens/PauseMenu';
import { achievementToast, toast, Toasts } from '../src/shell/components/Toasts';
import { getDeviceStatus } from '../src/shell/services';
import '../src/styles/main.css';

const q = new URLSearchParams(location.search), view = q.get('view') ?? 'connect';
const profiles = [['Mika','#64e4c3',12],['Jules','#e8bb68',7],['Rowan','#9daee5',3]].map(([name,color,level],i) => ({ ...defaultProfile(String(name)), id:`review-${i}`, color:String(color), level:Number(level), xp:xpForLevel(Number(level))+80, lastPlayed:{warmup:Date.now()-86400000*(i+1)}, cosmetics:{picks:{},loadout:{}} }));
const root=document.createElement('div');root.className='screens with-hud';root.style.zIndex='40';document.querySelector('#app')!.append(root);
const notice=document.createElement('div');document.body.append(notice);render(<Toasts/>,notice);
const on=()=>{};
if(view==='connect'){
 const status=getDeviceStatus();status.trainer.connected=true;status.trainer.detail='KICKR CORE';
 if(q.get('state')==='busy'){status.hr.busy=true;status.hr.detail='Looking for your watch';}
 if(q.get('state')==='error'){status.hr.error='Could not connect. Try selecting your watch again.';}
 render(<Connect onDone={()=>toast('Setup ready')}/>,root);
}else if(view==='riders')render(<ProfilePicker profiles={profiles} lastId={profiles[0].id} onPick={p=>toast(`Ready to ride, ${p.name}`)} onNew={on} onEdit={on}/>,root);
else if(view==='new-rider'||view==='edit-rider')render(<ProfileEditor profile={view==='new-rider'?{...defaultProfile(''),name:''}:profiles[0]} onSave={p=>toast(`Saved rider: ${p.name}`)} onCancel={()=>toast('Changes canceled')} onDelete={view==='edit-rider'?()=>toast('Rider deleted'):undefined}/>,root);
else if(view==='pause')render(<PauseMenu layout="auto" onLayout={on} onResume={on} onQuit={on} onHelp={on} onRestart={on} onHistory={on} onExtension={on}/>,root);
else {root.style.pointerEvents='none';setTimeout(()=>achievementToast('Kilojoule Club','Ride a total of 2,500 kJ.',50),200);}

(window as any).__chromeReview={ready:true,view,achievement:()=>achievementToast('Kilojoule Club','Ride a total of 2,500 kJ.',50)};
