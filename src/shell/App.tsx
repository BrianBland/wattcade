import { useEffect, useRef, useState } from 'preact/hooks';
import type { Button, Profile, SessionRecord } from '../contracts';
import { pickerGames } from '../games/registry';
import { DebugOverlay } from '../debug/DebugOverlay';
import { loadFlag } from '../debug/flag';
import { Achievements } from './screens/Achievements';
import { ArcadeMenu } from './screens/ArcadeMenu';
import type { EndRideStatus } from './screens/EndRideConfirm';
import { Connect } from './screens/Connect';
import { GameHost } from './screens/GameHost';
import { ProfileEditor } from './screens/ProfileEditor';
import { ProfilePicker } from './screens/ProfilePicker';
import { Summary } from './screens/Summary';
import { Locker } from './screens/Locker';
import { RewardPick } from './screens/RewardPick';
import { markControlsSeen } from './game/controlsSeen';
import { UnlockReveal } from './screens/UnlockReveal';
import { HudLayer } from './hud/HudLayer';
import { WarmupStage } from './warmup/WarmupStage';
import { entranceFor, type StageEntrance } from './warmup/entrance';
import { EntryChip } from './screens/EntryChip';
import { Delayed } from './components/Delayed';
import { MediaPicker } from './media/MediaPicker';
import { Toasts, toast } from './components/Toasts';
import { FullscreenButton } from './components/FullscreenButton';
import { setMenuGate } from './menuInput';
import { handleChannelPress, loadDriveIn, setDriveInVisible } from './drivein/store';
import { formatDuration } from './format';
import { play as sfx, unlockAudio } from '../audio/sfx';
import {
  abandonSession, bindDebugInput, createProfile, creditRide, deleteProfile, finishSession, listProfiles, lobbyActiveSeconds, lobbyIsReal,
  captureLobbyFrame, lastProfileId, saveSettings, rememberProfile, restoreSavedSetup, saveGameData, saveProfile, stopLobby, takePendingRide, unlockMedia, WARMUP_CREDIT_S,
} from './services';
import type { MediaRun, Screen, SessionLike } from './types';

/** Arcade picker list (games under construction included; their cards wear caution tape). */
const games = pickerGames;

/** Menus fade away after this long without menu input, leaving the ride as a screensaver. */
export const SLEEP_S = 25;
const SLEEPY: ReadonlyArray<Screen['name']> = ['profiles', 'menu', 'achievements', 'summary', 'locker'];
const HUD_SCREENS: ReadonlyArray<Screen['name']> = ['menu', 'entering', 'achievements', 'connect', 'summary', 'media', 'locker', 'pick'];
/** How long the summary waits after a game so the rider is seen riding back out of it first. */
const SUMMARY_DELAY_MS = 1200;
/** How long the exit portal / confetti stays requested (the renderer shuts it sooner as the rider rides on). */
const EXIT_CLEAR_MS = 6000;
/** After A (jump in), go in anyway if the road hasn't shown the rider going through by then. */
const JUMP_FALLBACK_MS = 1500;
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
  const [entrance, setEntrance] = useState<StageEntrance | null>(null);
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

  const screenRef = useRef(screen); screenRef.current = screen;
  const go = (s: Screen) => { screenRef.current = s; setScreen(s); };
  /** A profile change from a screen (Locker equips, reward picks): already saved; refresh state + the picker list. */
  const updateProfile = (p: Profile) => { setProfile(p); void refresh(); };
  const edit = async (p: Profile | null) => {
    setDraft(p ?? await createProfile('')); go({ name: 'editor', profileId: p?.id ?? null });
  };
  const play = async (g: (typeof games)[number], media?: MediaRun) => {
    if (g.requires?.media?.length && !media) { go({ name: 'media', game: g }); return; } // music games pick songs first (the ride keeps going)
    setEntrance(entranceFor(g, 'enter', profileRef.current)); // ride into the game's portal / gate on the road
    go({ name: 'entering', game: g, media });
  };
  /** The rider went through the entrance (or the lobby isn't running): leave for the game. */
  const entering = useRef(false);
  const enterGame = async (g: (typeof games)[number], media?: MediaRun) => {
    if (entering.current) return;
    entering.current = true;
    captureLobbyFrame(); // the game holds this picture (the flash) up while it loads
    const rec = stopLobby(); // credit the warm-up before the game session starts
    if (rec) await credit(rec);
    setEntrance(null);
    go({ name: 'game', game: g, media });
    entering.current = false;
  };
  /** Back on the road from a game: the rider rides out of its portal (or through confetti), then it clears. */
  const exitTimer = useRef(0);
  const rideOut = (g: (typeof games)[number]) => {
    setEntrance(entranceFor(g, 'exit', profileRef.current));
    clearTimeout(exitTimer.current);
    exitTimer.current = window.setTimeout(() => setEntrance((e) => (e?.kind === 'exit' ? null : e)), EXIT_CLEAR_MS);
  };
  const endRideStatus = (): EndRideStatus => {
    if (!lobbyIsReal()) return { kind: 'demo' };
    const activeS = lobbyActiveSeconds(), leftS = WARMUP_CREDIT_S - activeS;
    return leftS > 0 ? { kind: 'short', activeS, leftS } : { kind: 'save', activeS };
  };
  /** After an ended ride (and its summary / rewards), hand the bike back to the rider picker. */
  const rideEnded = useRef(false);
  const home = () => { const ended = rideEnded.current; rideEnded.current = false; go({ name: ended ? 'profiles' : 'menu' }); };
  /** Confirmed End ride: save it if it counts (real devices, >= WARMUP_CREDIT_S pedalling), then back to the rider picker. */
  const endRide = async () => {
    const rec = endRideStatus().kind === 'save' ? stopLobby() : null;
    const r = rec ? await creditRide(rec, profileRef.current) : null;
    if (r) { applyCredit(r); rideEnded.current = true; setRestartKey((k) => k + 1); go({ name: 'summary', record: r.record, award: r.award }); return; }
    go({ name: 'profiles' }); // a short or demo ride is discarded when the lobby restarts for the picker
  };
  const restartGame = async (g: (typeof games)[number], media?: MediaRun) => {
    const p = profileRef.current;
    if (p) { const r = await finishSession(p); setProfile(r.profile); void refresh(); toast(`Ride saved · +${r.award.xpGained} XP`, 'good'); }
    go({ name: 'game', game: g, run: Date.now(), media });
  };
  const quitGame = async (g: (typeof games)[number]) => {
    const p = profileRef.current;
    rideOut(g);
    if (!p) return go({ name: 'menu' });
    const r = await finishSession(p);
    setProfile(r.profile); void refresh(); go({ name: 'summary', record: r.record, award: r.award, delayMs: SUMMARY_DELAY_MS });
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
    case 'menu': body = profile && <ArcadeMenu visible={!asleep} games={games} profile={profile} onPlay={(g) => void play(g)} onNav={(to) => go({ name: to })} onEndRide={() => void endRide()} endRideStatus={endRideStatus} minRideS={WARMUP_CREDIT_S} />; break;
    case 'achievements': body = profile && <Achievements profile={profile} onBack={() => go({ name: 'menu' })} />; break;
    case 'locker': body = profile && <Locker profile={profile} onProfile={updateProfile} onPick={() => go({ name: 'pick' })} onBack={home} />; break;
    case 'pick': body = profile && <RewardPick profile={profile} onProfile={updateProfile} onDone={() => go({ name: 'locker' })} />; break;
    case 'entering': body = <EntryChip key={entrance?.key} game={screen.game} onJump={() => {
        setEntrance((e) => (e && e.kind === 'enter' ? { ...e, jump: true } : e));
        const g = screen.game, m = screen.media; // no road to ride (lobby not drawing yet): go straight in
        window.setTimeout(() => { if (screenRef.current.name === 'entering') void enterGame(g, m); }, JUMP_FALLBACK_MS);
      }}
      onCancel={() => { setEntrance(null); go({ name: 'menu' }); }} />; break;
    case 'media': body = profile && <MediaPicker game={screen.game} profile={profile} onStart={(m) => void play(screen.game, m)} onBack={() => go({ name: 'menu' })} />; break;
    case 'game':
      body = profile && <GameHost key={screen.run ?? 0} game={screen.game} profile={profile} media={screen.media} onQuit={() => void quitGame(screen.game)}
        onAbandon={() => { abandonSession(); rideOut(screen.game); go({ name: 'menu' }); }} onRestart={() => void restartGame(screen.game, screen.media)}
        onSave={(d) => { const cur = profileRef.current; if (!cur) return; setProfile({ ...cur, gameData: { ...cur.gameData, [screen.game.id]: d } }); void saveGameData(cur.id, screen.game.id, d); }}
        onControlsSeen={(sig) => { const cur = profileRef.current; if (!cur) return; const next = markControlsSeen(cur, screen.game.id, sig); setProfile(next); void saveSettings(cur.id, { controlsSeen: next.settings.controlsSeen }); }} />; break;
    case 'summary': body = <Delayed key={screen.record.startedAt} ms={screen.delayMs ?? 0}><Summary record={screen.record} award={screen.award} xpAfter={profile?.xp ?? 0} ftp={profile?.ftp ?? 200} profile={profile} onDone={() => screen.award.newItems.length ? go({name:'unlocks',award:screen.award}) : screen.award.picks > 0 ? go({ name: 'pick' }) : home()} /></Delayed>; break;
    case 'unlocks': body = profile && <UnlockReveal profile={profile} items={screen.award.newItems} onProfile={updateProfile} onDone={()=>screen.award.picks>0?go({name:'pick'}):home()}/>; break;
  }
  const inGame = screen.name === 'game';
  const driveInRider = screen.name === 'profiles' || screen.name === 'editor' ? null : profile;
  useEffect(() => loadDriveIn(driveInRider?.id ?? null), [driveInRider?.id]);
  useEffect(() => setDriveInVisible(screen.name === 'menu'), [screen.name]);
  const rider = screen.name === 'profiles' || screen.name === 'editor' ? null : profile;
  const hud = !inGame && !!rider && !!lobby && HUD_SCREENS.includes(screen.name);
  return (
    <>
      {!inGame && <WarmupStage profile={rider} profiles={profiles} hud={hud} restartKey={restartKey} driveInVisible={screen.name === 'menu'} onSession={setLobby} onRideEnded={(r) => void credit(r)}
        entrance={entrance} onEntered={() => { if (screen.name === 'entering') void enterGame(screen.game, screen.media); }} />}
      <div class={`screens${asleep ? ' asleep' : ''}${hud ? ' with-hud' : ''}`}>{body}</div>
      {hud && lobby && rider && (
        <div class="hud-host">
          <HudLayer session={lobby} profile={rider} paused={false} showNavigationLegend={asleep} fake={!!(lobby as { fakeBike?: unknown }).fakeBike}
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
