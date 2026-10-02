import { useEffect, useState } from 'preact/hooks';
import type { Profile } from '../contracts';
import { games } from '../games/registry';
import { DebugOverlay } from '../debug/DebugOverlay';
import { Achievements } from './screens/Achievements';
import { ArcadeMenu } from './screens/ArcadeMenu';
import { Connect } from './screens/Connect';
import { GameHost } from './screens/GameHost';
import { ProfileEditor } from './screens/ProfileEditor';
import { ProfilePicker } from './screens/ProfilePicker';
import { Summary } from './screens/Summary';
import { bindDebugInput, createProfile, deleteProfile, finishSession, listProfiles, rememberProfile, saveProfile } from './services';
import type { Screen } from './types';

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'profiles' });
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [draft, setDraft] = useState<Profile | null>(null);
  const refresh = () => listProfiles().then(setProfiles);
  useEffect(() => { void refresh(); return bindDebugInput(); }, []);

  const go = (s: Screen) => setScreen(s);
  const edit = async (p: Profile | null) => {
    setDraft(p ?? await createProfile('')); go({ name: 'editor', profileId: p?.id ?? null });
  };
  const quitGame = async () => {
    if (!profile) return go({ name: 'menu' });
    const r = await finishSession(profile);
    setProfile(r.profile); void refresh(); go({ name: 'summary', record: r.record, award: r.award });
  };

  let body;
  switch (screen.name) {
    case 'profiles':
      body = <ProfilePicker profiles={profiles} onPick={(p) => { setProfile(p); void rememberProfile(p.id); go({ name: 'connect' }); }} onNew={() => edit(null)} onEdit={edit} />; break;
    case 'editor':
      body = draft && <ProfileEditor profile={draft} onCancel={async () => { if (!screen.profileId) await deleteProfile(draft.id); await refresh(); go({ name: 'profiles' }); }}
        onSave={async (p) => { await saveProfile(p); await refresh(); go({ name: 'profiles' }); }}
        onDelete={screen.profileId ? async (p) => { await deleteProfile(p.id); await refresh(); go({ name: 'profiles' }); } : undefined} />; break;
    case 'connect': body = <Connect onDone={() => go({ name: 'menu' })} />; break;
    case 'menu': body = profile && <ArcadeMenu games={games} profile={profile} onPlay={(g) => go({ name: 'game', game: g })} onNav={(to) => go({ name: to })} onBack={() => go({ name: 'profiles' })} />; break;
    case 'achievements': body = profile && <Achievements profile={profile} onBack={() => go({ name: 'menu' })} />; break;
    case 'game':
      body = profile && <GameHost game={screen.game} profile={profile} onQuit={quitGame}
        onSave={(d) => { const p = { ...profile, gameData: { ...profile.gameData, [screen.game.id]: d } }; setProfile(p); void saveProfile(p); }} />; break;
    case 'summary': body = <Summary record={screen.record} award={screen.award} onDone={() => go({ name: 'menu' })} />; break;
  }
  return <>{body}<DebugOverlay /></>;
}
