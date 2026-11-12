// Production components, with an isolated comparison of selection colors.
import {render} from 'preact';
import {useState} from 'preact/hooks';
import {testProfile} from '../src/core/testProfile';
import {Locker} from '../src/shell/screens/Locker';
import {RewardPick} from '../src/shell/screens/RewardPick';
import '../src/styles/main.css';
import './accent-revision.css';

const q=new URLSearchParams(location.search);
document.documentElement.dataset.accent=q.get('accent')==='previous'?'previous':'revised';
function Study(){
 const [profile,setProfile]=useState(testProfile({name:'Mika',color:'#64e4c3',level:12,cosmetics:{picks:{},loadout:{}}}));
 return q.get('view')==='reward'?<RewardPick profile={profile} onProfile={setProfile} onDone={()=>{}}/>:<Locker profile={profile} onProfile={setProfile} onPick={()=>{}} onBack={()=>{}}/>;
}
render(<Study/>,document.getElementById('app')!);
(window as unknown as {__accentReady:boolean}).__accentReady=true;
