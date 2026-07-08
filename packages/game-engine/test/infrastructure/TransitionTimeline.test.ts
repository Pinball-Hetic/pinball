import { test, expect, describe } from 'bun:test';
import { TransitionTimeline, tremorOffset } from '../../src/infrastructure/TransitionTimeline';
import type { TransitionTimelineConfig } from '../../src/infrastructure/TransitionTimeline';
import { easeIn, easeOut, strobeOn } from '../../src/infrastructure/CinematicEasing';

// Stranger Things-shaped config (reveal + hold present).
const ST_CONFIG: TransitionTimelineConfig = {
  blackout: 0.4,
  reveal: 0.6,
  hold: 0.3,
  restore: 0.55,
  tremor: 0.5,
  strobeHz: 6,
  hasReveal: true,
};

// Zelda-shaped config (no reveal/hold).
const ZELDA_CONFIG: TransitionTimelineConfig = {
  blackout: 0.45,
  reveal: 0,
  hold: 0,
  restore: 0.55,
  tremor: 0.55,
  strobeHz: 6,
  hasReveal: false,
};

function st() {
  return new TransitionTimeline(ST_CONFIG);
}

describe('TransitionTimeline — idle', () => {
  test('starts idle and tick on idle is inert', () => {
    const tl = st();
    expect(tl.getPhase()).toBe('idle');
    const d = tl.tick(0.1);
    expect(d.phase).toBe('idle');
    expect(d.active).toBe(true);
    expect(tl.getElapsed()).toBe(0);
  });

  test('begin moves idle → blackout and is idempotent against re-entry', () => {
    const tl = st();
    expect(tl.begin()).toBe(true);
    expect(tl.getPhase()).toBe('blackout');
    expect(tl.begin()).toBe(false);
  });

  test('reset returns to idle', () => {
    const tl = st();
    tl.begin();
    tl.tick(0.1);
    tl.reset();
    expect(tl.getPhase()).toBe('idle');
    expect(tl.getElapsed()).toBe(0);
  });
});

describe('TransitionTimeline — Stranger Things full sequence', () => {
  test('blackoutMix follows easeOut(min(1, elapsed/blackout)) and on = strobeOn', () => {
    const tl = st();
    tl.begin();
    const dt = 0.1;
    const d = tl.tick(dt);
    expect(d.phase).toBe('blackout');
    expect(d.blackoutMix).toBeCloseTo(easeOut(Math.min(1, dt / ST_CONFIG.blackout)), 12);
    expect(d.on).toBe(strobeOn(dt, ST_CONFIG.strobeHz));
    expect(d.enteredReveal).toBe(false);
  });

  test('blackout → reveal fires enteredReveal at threshold (hasReveal)', () => {
    const tl = st();
    tl.begin();
    tl.tick(0.2);
    const d = tl.tick(0.2); // elapsed 0.4 >= blackout 0.4
    expect(d.phase).toBe('blackout');
    expect(d.enteredReveal).toBe(true);
    expect(d.enteredRestore).toBe(false);
    expect(tl.getPhase()).toBe('reveal');
    expect(tl.getElapsed()).toBe(0);
  });

  test('reveal exposes revealT and fires enteredHold at threshold', () => {
    const tl = st();
    tl.begin();
    tl.tick(0.4); // -> reveal
    const mid = tl.tick(0.3);
    expect(mid.phase).toBe('reveal');
    expect(mid.revealT).toBeCloseTo(Math.min(1, 0.3 / ST_CONFIG.reveal), 12);
    expect(mid.enteredHold).toBe(false);
    const end = tl.tick(0.3); // elapsed 0.6 >= reveal 0.6
    expect(end.phase).toBe('reveal');
    expect(end.enteredHold).toBe(true);
    expect(tl.getPhase()).toBe('hold');
  });

  test('hold holds until duration then enters restore', () => {
    const tl = st();
    tl.begin();
    tl.tick(0.4); // reveal
    tl.tick(0.6); // hold
    const mid = tl.tick(0.1);
    expect(mid.phase).toBe('hold');
    expect(tl.getPhase()).toBe('hold');
    tl.tick(0.2); // elapsed 0.3 >= hold 0.3
    expect(tl.getPhase()).toBe('restore');
    expect(tl.getElapsed()).toBe(0);
  });

  test('restore darkMix = 1 - easeIn(...) and fires enteredTremor when darkMix <= 0', () => {
    const tl = st();
    tl.begin();
    tl.tick(0.4); // reveal
    tl.tick(0.6); // hold
    tl.tick(0.3); // restore
    const mid = tl.tick(0.2);
    expect(mid.phase).toBe('restore');
    expect(mid.darkMix).toBeCloseTo(1 - easeIn(Math.min(1, 0.2 / ST_CONFIG.restore)), 12);
    expect(mid.enteredTremor).toBe(false);
    const end = tl.tick(0.55); // elapsed >= restore -> darkMix 0
    expect(end.phase).toBe('restore');
    expect(end.darkMix).toBe(0);
    expect(end.enteredTremor).toBe(true);
    expect(tl.getPhase()).toBe('tremor');
    expect(tl.getElapsed()).toBe(0);
  });

  test('tremor is inactive and finishes at tremor duration', () => {
    const tl = st();
    tl.begin();
    tl.tick(0.4);
    tl.tick(0.6);
    tl.tick(0.3);
    tl.tick(0.55); // -> tremor
    const mid = tl.tick(0.2);
    expect(mid.phase).toBe('tremor');
    expect(mid.active).toBe(false);
    expect(mid.finished).toBe(false);
    const end = tl.tick(0.3); // elapsed 0.5 >= tremor 0.5
    expect(end.phase).toBe('tremor');
    expect(end.finished).toBe(true);
  });
});

describe('TransitionTimeline — Zelda (no reveal/hold)', () => {
  test('blackout goes straight to restore (enteredRestore, not enteredReveal)', () => {
    const tl = new TransitionTimeline(ZELDA_CONFIG);
    tl.begin();
    tl.tick(0.2);
    const d = tl.tick(0.3); // elapsed 0.5 >= blackout 0.45
    expect(d.phase).toBe('blackout');
    expect(d.enteredRestore).toBe(true);
    expect(d.enteredReveal).toBe(false);
    expect(tl.getPhase()).toBe('restore');
  });

  test('restore → tremor → finished mirror the ST path', () => {
    const tl = new TransitionTimeline(ZELDA_CONFIG);
    tl.begin();
    tl.tick(0.45); // -> restore
    const enter = tl.tick(0.6); // darkMix 0
    expect(enter.enteredTremor).toBe(true);
    expect(tl.getPhase()).toBe('tremor');
    const end = tl.tick(0.6); // >= tremor 0.55
    expect(end.finished).toBe(true);
  });
});

describe('tremorOffset', () => {
  test('zero at t=0', () => {
    const o = tremorOffset(0, 0.45, 0.0032);
    expect(o.camX).toBe(0);
    expect(o.camY).toBeCloseTo(Math.sin(0.8) * 0, 12);
    expect(o.camZ).toBeCloseTo(0, 12);
    expect(o.rootRotX).toBe(0);
    expect(o.rootRotZ).toBeCloseTo(0, 12);
  });

  test('ST verbatim maths (rampDuration 0.45, amp 0.0032)', () => {
    const t = 0.2;
    const ramp = Math.min(1, t / 0.45);
    const amp = 0.0032 * ramp;
    const o = tremorOffset(t, 0.45, 0.0032);
    expect(o.camX).toBeCloseTo(Math.sin(t * 41) * amp, 12);
    expect(o.camY).toBeCloseTo(Math.sin(t * 53 + 0.8) * amp, 12);
    expect(o.camZ).toBeCloseTo(Math.sin(t * 37 + 1.6) * amp, 12);
    expect(o.rootRotX).toBeCloseTo(Math.sin(t * 44) * amp * 0.4, 12);
    expect(o.rootRotZ).toBeCloseTo(Math.sin(t * 39 + 1.1) * amp * 0.5, 12);
  });

  test('Zelda verbatim maths (rampDuration 0.3, amp 0.003)', () => {
    const t = 0.15;
    const ramp = Math.min(1, t / 0.3);
    const amp = 0.003 * ramp;
    const o = tremorOffset(t, 0.3, 0.003);
    expect(o.camX).toBeCloseTo(Math.sin(t * 41) * amp, 12);
    expect(o.rootRotZ).toBeCloseTo(Math.sin(t * 39 + 1.1) * amp * 0.5, 12);
  });

  test('ramp clamps to 1 past the ramp duration', () => {
    const t = 1.0;
    const amp = 0.0032; // ramp clamped to 1
    const o = tremorOffset(t, 0.45, 0.0032);
    expect(o.camX).toBeCloseTo(Math.sin(t * 41) * amp, 12);
  });
});
