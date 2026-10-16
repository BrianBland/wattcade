import { describe, it, expect } from 'vitest';
import { setVoice, stopVoices, voiceCount, duckVoices } from '../../../audio/voices';
import { dynamoMix, flameRoar, gatlingHz, growl, humHz, railHz, strokePulse, type DynamoIn } from '../render/dynamoSound';

const base: DynamoIn = {
  active: true, cadence: 90, ftpFraction: 0.7, crankRevs: 0, overdrive: false, weapon: 'gatling', gatlingFiring: 0,
  flaming: false, flamePower: 0, railCharging: false, railProgress: 0, railFull: false,
};

describe('dynamo sound mapping', () => {
  it('hum pitch follows cadence and jumps an octave in Overdrive', () => {
    expect(humHz(0, false)).toBe(40);
    expect(humHz(90, false)).toBeCloseTo(89.5);
    expect(humHz(90, true)).toBeCloseTo(179);
    expect(humHz(60, false)).toBeLessThan(humHz(100, false));
  });
  it('each pedal stroke swells the hum, twice per crank rev', () => {
    expect(strokePulse(0)).toBeCloseTo(1);
    expect(strokePulse(0.5)).toBeCloseTo(1);
    expect(strokePulse(0.4)).toBeLessThan(0.01);
  });
  it('the load growl wakes above 55% FTP and saturates by 130%', () => {
    expect(growl(0.5)).toBe(0);
    expect(growl(0.9)).toBeGreaterThan(0.4);
    expect(growl(1.4)).toBe(1);
  });
  it('gatling whine, flame roar and rail whine rise with cadence, watts and charge', () => {
    expect(gatlingHz(100)).toBeGreaterThan(gatlingHz(70));
    expect(flameRoar(1.2).freq).toBeGreaterThan(flameRoar(0.4).freq);
    expect(flameRoar(1.2).gain).toBeGreaterThan(flameRoar(0.2).gain);
    expect(railHz(0.9)).toBeGreaterThan(railHz(0.1));
  });
  it('weapon layers only sound for the wave weapon, and everything is silent when inactive', () => {
    const gat = dynamoMix({ ...base, gatlingFiring: 3 });
    expect(gat.gatling.gain).toBeGreaterThan(0);
    expect(gat.flame.gain).toBe(0);
    const fl = dynamoMix({ ...base, weapon: 'flame', flaming: true, flamePower: 1 });
    expect(fl.gatling.gain).toBe(0);
    expect(fl.flame.gain).toBeGreaterThan(0);
    expect(dynamoMix({ ...base, railCharging: true, railProgress: 0.5 }).rail.gain).toBeGreaterThan(0);
    expect(dynamoMix({ ...base, railCharging: true, railFull: true }).rail.gain).toBe(0);
    for (const v of Object.values(dynamoMix({ ...base, active: false, flaming: true, flamePower: 1, gatlingFiring: 3 }))) expect(v.gain).toBe(0);
  });
  it('stays within a small voice budget', () => {
    expect(Object.keys(dynamoMix(base)).length).toBeLessThanOrEqual(12);
  });
});

describe('voices without WebAudio (Node)', () => {
  it('is a safe no-op', () => {
    expect(setVoice('t-x', { wave: 'sine', freq: 100, gain: 0.1 })).toBe(false);
    expect(() => duckVoices(0.5)).not.toThrow();
    expect(() => stopVoices('t-')).not.toThrow();
    expect(voiceCount()).toBe(0);
  });
});
