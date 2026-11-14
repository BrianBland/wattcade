// Pure: when the full controls card shows. Once per rider and game, again only if the game's controls or the
// rider's input (touch vs controller) changed since. Seen signatures live in `profile.settings.controlsSeen`.
import type { ControlHint, GameHud, Profile } from '../../contracts';

export type InputKind = 'touch' | 'controller';

/** The gameplay mapping a card should teach: the post-menu controls while a pre-game menu is open. */
export function playControls(hud: GameHud): ControlHint[] {
  return hud.playControls ?? hud.controls ?? [];
}

/** A short stable signature: which buttons do what (labels only; cooldowns and highlights don't count). */
export function controlsSignature(controls: readonly ControlHint[], input: InputKind): string {
  const parts = controls.map((c) => `${c.button}=${c.label}`).sort();
  let h = 2166136261;
  for (const ch of `${input}|${parts.join('|')}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return `${input[0]}${(h >>> 0).toString(36)}`;
}

export function needsControls(profile: Pick<Profile, 'settings'>, gameId: string, signature: string): boolean {
  return profile.settings?.controlsSeen?.[gameId] !== signature;
}

export function markControlsSeen<P extends Pick<Profile, 'settings'>>(profile: P, gameId: string, signature: string): P {
  const settings = profile.settings ?? ({} as Profile['settings']);
  return { ...profile, settings: { ...settings, controlsSeen: { ...settings.controlsSeen, [gameId]: signature } } };
}
