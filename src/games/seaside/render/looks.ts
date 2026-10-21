// Look presets: per-material switches (bevel, cool light) + post-processing. The "dream" dial follows the story:
// mundane-but-faintly-dreamy in the Morning, stranger by Midday, a fever dream by Evening.
import * as THREE from 'three';
import { LOOK } from '../voxel/three';
import type { PostParams } from './post';

export interface LookPreset { label: string; bevel: number; cool: number; post: Partial<PostParams> | null }

export const LOOKS: Record<string, LookPreset> = {
  raw: { label: 'A · raw boxes', bevel: 0, cool: 0, post: null },
  crafted: { label: 'B · bevelled cubes + cool shadows', bevel: 1, cool: 1, post: null },
  illustrated: { label: 'C · + ink outlines + split-tone grade', bevel: 1, cool: 1, post: { outline: 0.9, grade: 0.9 } },
  pixel: { label: 'D · chunky pixels (⅓ res) + dither', bevel: 0.8, cool: 1, post: { pixel: 3, outline: 0.9, grade: 0.9, posterize: 18, dither: 0.9 } },
  morning: { label: 'E · Morning: mundane, faintly dreamy', bevel: 1, cool: 1, post: { outline: 0.55, grade: 0.8, pastel: 0.3, saturation: 0.95, bloom: 0.35, threshold: 0.92, halation: 0.6, dream: 0.18 } },
  midday: { label: 'F · Midday: stranger', bevel: 1, cool: 1, post: { outline: 0.8, ink: new THREE.Color(0x3a1d4a), grade: 1, pastel: 0.15, saturation: 1.15, bloom: 0.6, threshold: 0.8, halation: 0.8, dream: 0.55 } },
  // per-scene grades for the later-story stills
  belly: { label: 'Belly (Midday)', bevel: 1, cool: 0.6, post: { outline: 0.7, ink: new THREE.Color(0x3a0a2a), grade: 0.8, saturation: 1.1, bloom: 0.9, threshold: 0.95, halation: 0.5, dream: 0.4 } },
  jungle: { label: 'Monkey mouth (Midday)', bevel: 1, cool: 1, post: { outline: 0.8, ink: new THREE.Color(0x1f2a12), grade: 0.9, pastel: 0.1, saturation: 1.1, bloom: 0.45, threshold: 0.85, halation: 0.6, dream: 0.45 } },
  lava: { label: 'Obsidian bridge (Evening)', bevel: 1, cool: 0.7, post: { outline: 0.9, ink: new THREE.Color(0x2a0606), grade: 1, saturation: 1.2, bloom: 1.25, threshold: 0.85, halation: 1, dream: 0.75 } },
  reentry: { label: 'Re-entry (Evening)', bevel: 1, cool: 0.5, post: { outline: 0.8, ink: new THREE.Color(0x3a0a1a), grade: 1, saturation: 1.2, bloom: 1.1, threshold: 0.9, halation: 1, dream: 0.9 } },
  fever: { label: 'G · Evening: fever dream', bevel: 1, cool: 1, post: { outline: 1, ink: new THREE.Color(0x5a0f3a), grade: 1, saturation: 1.3, bloom: 1.2, threshold: 0.5, halation: 1, dream: 1, posterize: 24, dither: 0.5 } },
};

export function applyLook(name: string, detail?: number): LookPreset {
  const l = LOOKS[name] ?? LOOKS.raw;
  LOOK.bevel.value = l.bevel; LOOK.cool.value = l.cool; LOOK.detail.value = detail ?? (l.bevel > 0 ? 1 : 0);
  return l;
}
