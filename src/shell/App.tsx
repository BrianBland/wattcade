import { useEffect, useRef, useState } from 'preact/hooks';
import type { Button, Profile, SessionRecord } from '../contracts';
import { games } from '../games/registry';
import { DebugOverlay } from '../debug/DebugOverlay';
import { loadFlag } from '../debug/flag';
import { Achievements } from './screens/Achievements';
import { ArcadeMenu } from './screens/ArcadeMenu';
import { Connect } from './screens/Connect';
import { GameHost } from './screens/GameHost';
import { ProfileEditor } from './screens/ProfileEditor';
import { ProfilePicker } from './screens/ProfilePicker';
import { Summary } from './screens/Summary';
import { Locker } from './screens/Locker';
import { RewardPick } from './screens/RewardPick';
import { HudLayer } from './hud/HudLayer';
import { WarmupStage } from './warmup/WarmupStage';
import { MediaPicker } from './media/MediaPicker';
import { Toasts, toast } from './components/Toasts';
import { FullscreenButton } from './components/FullscreenButton';
import { setMenuGate } from './menuInput';
import { handleChannelPress, loadDriveIn, setDriveInVisible } from './drivein/store';
import { formatDuration } from './format';
import { play as sfx, unlockAudio } from '../audio/sfx';
import {
  abandonSession, bindDebugInput, createProfile, creditRide, deleteProfile, finishSession, listProfiles, lobbyActiveSeconds, lobbyIsReal,
  lastProfileId, rememberProfile, restoreSavedSetup, saveProfile, stopLobby, takePendingRide, unlockMedia, WARMUP_CREDIT_S,
} from './services';
import type { MediaRun, Screen, SessionLike } from './types';

/** Menus fade away after this long without menu input, leaving the ride as a screensaver. */
export const SLEEP_S = 25;
const SLEEPY: ReadonlyArray<Screen['name']> = ['profiles', 'menu', 'achievements', 'summary', 'locker'];
const HUD_SCREENS: ReadonlyArray<Screen['name']> = ['menu', 'achievements', 'connect', 'summary', 'media', 'locker', 'pick'];
/** Buttons that count as using the menu (shifters are for riding, so they never wake it). */
const NAV = new Set<Button>(['up', 'down', 'left', 'right', 'a', 'b', 'y', 'z']);

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'connect' });
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profile, setProfileState] = useState<Profile | null>(null);
  const profileRef = useRef<Profile | null>(null);
  const setProfile = (p: Profile | null) => { profileRef.current = p; setProfileState(p); };
  const [draft, setDraft] = useState<Profile | null>(null);
  const [lobby, setLobby] = useState<SessionLike | null>(null);
  const [restartKey, setRestartKey] = useState(0);
  const [asleep, setAsleepState] = useState(false);
  const asleepRef = useRef(false);
  const setAsleep = (v: boolean) => { asleepRef.current = v; setAsleepState(v); };
  const lastActive = useRef(performance.now());
  const [lastId, setLastId] = useState<string | null>(null);
  const refresh = () => listProfiles().then(setProfiles);

  const applyCredit = (r: { profile: Profile }) => { if (profileRef.current?.id === r.profile.id) setProfile(r.profile); void refresh(); };
  const credit = async (rec: SessionRecord, label = 'Warm-up saved') => {
    const r = await creditRide(rec, profileRef.current);
    if (r) { applyCredit(r); toast(`${label}: ${formatDuration(rec.durationS)} · +${r.award.xpGained} XP`, 'good'); }
    return r;
  };

  useEffect(() => {
    void restoreSavedSetup();
    void refresh(); void lastProfileId().then(setLastId);
    const pending = takePendingRide();
    if (pending) void credit(pending, 'Saved your last ride');
    return bindDebugInput();
  }, []);

  // screensaver: fade the menus out when idle; the first tap / nav press only wakes them
  useEffect(() => {
    const touch = () => { lastActive.current = performance.now(); };
    const onAct = (e: Event) => {
      unlockAudio(); unlockMedia(); // iOS: audio can only start from a gesture
      if ((e.target as Element | null)?.closest?.('.hud, .drivein')) return; // riding controls and the channel bar don't count
      touch();
      if (asleepRef.current) { setAsleep(false); sfx('uiWake'); e.stopPropagation(); e.preventDefault(); }
    };
    window.addEventListener('pointerdown', onAct, true); window.addEventListener('keydown', onAct, true);
    setMenuGate((p) => {
      // Y / Z flip Drive-In channels without waking the menus
      if (handleChannelPress(p) && ![...p].some((b) => b !== 'y' && b !== 'z' && NAV.has(b))) return false;
      if (![...p].some((b) => NAV.has(b))) return true;
      touch();
      if (asleepRef.current) { setAsleep(false); sfx('uiWake'); return false; }
      return true;
    });
    return () => { window.removeEventListener('pointerdown', onAct, true); window.removeEventListener('keydown', onAct, true); setMenuGate(null); };
  }, []);
  useEffect(() => {
    lastActive.current = performance.now();
    if (!SLEEPY.includes(screen.name)) { setAsleep(false); return; }
    const id = setInterval(() => { if (!asleepRef.current && performance.now() - lastActive.current > SLEEP_S * 1000) setAsleep(true); }, 1000);
    return () => clearInterval(id);
  }, [screen.name]);

  const go = (s: Screen) => setScreen(s);
  /** A profile change from a screen (Locker equips, reward picks): already saved; refresh state + the picker list. */
  const updateProfile = (p: Profile) => { setProfile(p); void refresh(); };
  const edit = async (p: Profile | null) => {
    setDraft(p ?? await createProfile('')); go({ name: 'editor', profileId: p?.id ?? null });
  };
  const play = async (g: (typeof games)[number], media?: MediaRun) => {
    if (g.requires?.media?.length && !media) { go({ name: 'media', game: g }); return; } // music games pick songs first (the ride keeps going)
    const rec = stopLobby(); // credit the warm-up before the game session starts
    if (rec) await credit(rec);
    go({ name: 'game', game: g, media });
  };
  const endRide = async () => {
    if (!lobbyIsReal()) { toast('Demo ride: connect a trainer to save rides'); return; }
    const left = WARMUP_CREDIT_S - lobbyActiveSeconds();
    if (left > 0) { toast(`Pedal ${formatDuration(left)} more to save this ride`); return; }
    const rec = stopLobby(); if (!rec) return;
    const r = await creditRide(rec, profileRef.current);
    setRestartKey((k) => k + 1);
    if (r) { applyCredit(r); go({ name: 'summary', record: r.record, award: r.award }); }
  };
  const restartGame = async (g: (typeof games)[number], media?: MediaRun) => {
    const p = profileRef.current;
    if (p) { const r = await finishSession(p); setProfile(r.profile); void refresh(); toast(`Ride saved · +${r.award.xpGained} XP`, 'good'); }
    go({ name: 'game', game: g, run: Date.now(), media });
  };
  const quitGame = async () => {
    const p = profileRef.current;
    if (!p) return go({ name: 'menu' });
    const r = await finishSession(p);
    setProfile(r.profile); void refresh(); go({ name: 'summary', record: r.record, award: r.award });
  };

  let body;
  switch (screen.name) {
    case 'profiles':
      body = <ProfilePicker profiles={profiles} lastId={lastId} onPick={(p) => { setProfile(p); setLastId(p.id); void rememberProfile(p.id); go({ name: 'menu' }); }} onNew={() => edit(null)} onEdit={edit} />; break;
    case 'editor':
      body = draft && <ProfileEditor profile={draft} onCancel={async () => { if (!screen.profileId) await deleteProfile(draft.id); await refresh(); go({ name: 'profiles' }); }}
        onSave={async (p) => { await saveProfile(p); await refresh(); go({ name: 'profiles' }); }}
        onDelete={screen.profileId ? async (p) => { await deleteProfile(p.id); await refresh(); go({ name: 'profiles' }); } : undefined} />; break;
    case 'connect': body = <Connect onDone={() => go({ name: profile ? 'menu' : 'profiles' })} />; break;
    case 'menu': body = profile && <ArcadeMenu visible={!asleep} games={games} profile={profile} onPlay={(g) => void play(g)} onNav={(to) => go({ name: to })} onBack={() => go({ name: 'profiles' })} onEndRide={() => void endRide()} />; break;
    case 'achievements': body = profile && <Achievements profile={profile} onBack={() => go({ name: 'menu' })} />; break;
    case 'locker': body = profile && <Locker profile={profile} onProfile={updateProfile} onPick={() => go({ name: 'pick' })} onBack={() => go({ name: 'menu' })} />; break;
    case 'pick': body = profile && <RewardPick profile={profile} onProfile={updateProfile} onDone={() => go({ name: 'locker' })} />; break;
    case 'media': body = profile && <MediaPicker game={screen.game} profile={profile} onStart={(m) => void play(screen.game, m)} onBack={() => go({ name: 'menu' })} />; break;
    case 'game':
      body = profile && <GameHost key={screen.run ?? 0} game={screen.game} profile={profile} media={screen.media} onQuit={quitGame}
        onAbandon={() => { abandonSession(); go({ name: 'menu' }); }} onRestart={() => void restartGame(screen.game, screen.media)}
        onSave={(d) => { const cur = profileRef.current; if (!cur) return; const p = { ...cur, gameData: { ...cur.gameData, [screen.game.id]: d } }; setProfile(p); void saveProfile(p); }} />; break;
    case 'summary': body = <Summary record={screen.record} award={screen.award} xpAfter={profile?.xp ?? 0} ftp={profile?.ftp ?? 200} profile={profile} onDone={() => go({ name: screen.award.picks > 0 ? 'pick' : 'menu' })} />; break;
  }
  const inGame = screen.name === 'game';
  const driveInRider = screen.name === 'profiles' || screen.name === 'editor' ? null : profile;
  useEffect(() => loadDriveIn(driveInRider?.id ?? null), [driveInRider?.id]);
  useEffect(() => setDriveInVisible(screen.name === 'menu'), [screen.name]);
  const rider = screen.name === 'profiles' || screen.name === 'editor' ? null : profile;
  const hud = !inGame && !!rider && !!lobby && HUD_SCREENS.includes(screen.name);
  return (
    <>
      {!inGame && <WarmupStage profile={rider} hud={hud} restartKey={restartKey} driveInVisible={screen.name === 'menu'} onSession={setLobby} onRideEnded={(r) => void credit(r)} />}
      <div class={`screens${asleep ? ' asleep' : ''}${hud ? ' with-hud' : ''}`}>{body}</div>
      {hud && lobby && rider && (
        <div class="hud-host">
          <HudLayer session={lobby} profile={rider} paused={false} legendOn={loadFlag('wattcade.legend', true) && !asleep} fake={!!(lobby as { fakeBike?: unknown }).fakeBike}
            menu={() => ({ label: 'Open arcade menu', onClick: () => { lastActive.current = performance.now(); setAsleep(false); go({ name: 'menu' }); } })} />
        </div>
      )}
      {asleep && <div class="sleep-hint">Tap or press A for the menu</div>}
      <Toasts />
      <FullscreenButton />
      <DebugOverlay />
    </>
  );
}
