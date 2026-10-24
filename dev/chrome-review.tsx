// Working chrome review: production components over a real game renderer.
import { h, render } from 'preact';
import './hud-live';
import { defaultProfile, xpForLevel } from '../src/progression';
import type { SessionRecord } from '../src/contracts';
import { games } from '../src/games/registry';
import { Summary } from '../src/shell/screens/Summary';
import { Achievements } from '../src/shell/screens/Achievements';
import { ArcadeMenu } from '../src/shell/screens/ArcadeMenu';
import { MediaPicker } from '../src/shell/media/MediaPicker';
import { ResultBanner } from '../src/shell/game/ResultBanner';
import { GameIntro } from '../src/shell/game/GameIntro';
import { UiMessage, UiButton } from '../src/ui';
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
const record:SessionRecord={id:'review',profileId:profiles[0].id,gameId:'warmup',startedAt:Date.now()-1200000,durationS:1200,events:[],stats:{avgPower:176,maxPower:342,kj:211,avgHr:138,zoneSeconds:[60,720,300,90,30],sprints:4},gameSummary:{distanceKm:8.4,climbM:106},samples:Array.from({length:120},(_,i)=>({t:i*10,power:140+60*Math.sin(i*.15)+i*.4,hr:125+i*.2,cadence:85,grade:0,mode:'erg' as const}))};
const award={xpGained:280,levelBefore:11,levelAfter:12,newAchievements:[{id:'first_ride',name:'First ride'}],newItems:[],picks:1};

if(view==='connect'){
 const status=getDeviceStatus();status.trainer.connected=true;status.trainer.detail='KICKR CORE';
 if(q.get('state')==='busy'){status.hr.busy=true;status.hr.detail='Looking for your watch';}
 if(q.get('state')==='error'){status.hr.error='Could not connect. Try selecting your watch again.';}
 render(<Connect onDone={()=>toast('Setup ready')}/>,root);
}else if(view==='riders')render(<ProfilePicker profiles={profiles} lastId={profiles[0].id} onPick={p=>toast(`Ready to ride, ${p.name}`)} onNew={on} onEdit={on}/>,root);
else if(view==='new-rider'||view==='edit-rider')render(<ProfileEditor profile={view==='new-rider'?{...defaultProfile(''),name:''}:profiles[0]} onSave={p=>toast(`Saved rider: ${p.name}`)} onCancel={()=>toast('Changes canceled')} onDelete={view==='edit-rider'?()=>toast('Rider deleted'):undefined}/>,root);
else if(view==='summary')render(<Summary record={record} award={award} xpAfter={profiles[0].xp} ftp={200} profile={profiles[0]} onDone={()=>toast('Continue to rewards')}/>,root);
else if(view==='achievements')render(<Achievements profile={{...profiles[0],achievements:['first_ride'],lifetime:{...profiles[0].lifetime,kj:1800,seconds:14400,sessions:8,sprints:16}}} onBack={()=>toast('Back to arcade')}/>,root);
else if(view==='arcade')render(<ArcadeMenu games={games} profile={profiles[0]} onPlay={g=>toast(`Play ${g.title}`)} onNav={to=>toast(`Open ${to}`)} onBack={()=>toast('Switch rider')} onEndRide={()=>toast('Finish warm-up')}/>,root);
else if(view==='media')render(<MediaPicker game={games[0]} profile={profiles[0]} onStart={()=>toast('Start music ride')} onBack={()=>toast('Back to arcade')}/>,root);
else if(view==='result')render(<ResultBanner profile={profiles[0]} over={false} durationS={1200} summary={{distanceKm:8.4,climbM:106}} xp={280} onContinue={()=>toast('Open ride summary')}/>,root);
else if(view==='controls')render(<GameIntro game={games[0]} hud={{targetZone:{min:2,max:3},controls:[{button:'left',label:'Move left'},{button:'right',label:'Move right'},{button:'a',label:'Boost'},{button:'b',label:'Brake'}]}} profile={profiles[0]} mode="pre" count={null} onStart={()=>toast('Start ride')} onBack={()=>toast('Back to arcade')}/>,root);
else if(view==='loading'||view==='error')render(<div class="game-loading chrome-ui"><UiMessage busy={view==='loading'} tone={view==='error'?'error':'info'} title={view==='error'?'Could not start the ride':'Preparing your ride'} action={<UiButton onClick={()=>toast('Back to arcade')}>Back</UiButton>}>{view==='error'?'The scene could not be loaded. Try again from the arcade.':'Your ride starts when the scene is ready.'}</UiMessage></div>,root);
else if(view==='pause')render(<PauseMenu layout="auto" onLayout={on} onResume={on} onQuit={on} onHelp={on} onRestart={on} onHistory={on} onExtension={on}/>,root);
else {root.style.pointerEvents='none';setTimeout(()=>achievementToast('Kilojoule Club','Ride a total of 2,500 kJ.',50),200);}

(window as any).__chromeReview={ready:true,view,achievement:()=>achievementToast('Kilojoule Club','Ride a total of 2,500 kJ.',50)};
