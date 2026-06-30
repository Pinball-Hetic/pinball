import { test, expect, describe } from 'bun:test';
import { BlackoutFightPhaseMachine } from './BlackoutFightPhaseMachine';
import { easeOut, easeIn, strobeOn } from './CinematicEasing';

const BLACKOUT = 0.12;
const REVEAL = 0.5;
const RESTORE = 0.3;
const VICTORY = 0.65;
const STROBE_HZ_INTRO = 4;
const FIGHT_FLICKER_HZ = 3;

const FIGHT_SHADE = 0.36;
const FIGHT_SHADE_BREATHE = 0.04;
const FIGHT_SHADE_SPEED = 1.4;
const FIGHT_FLINKER_DIP = 0.07;
const FIGHT_FLICKER_LIFT = 0.04;

const ELEVEN_ASSIST_ANIM = 0.85;
const ELEVEN_ASSIST_FIRST = 0.55;
const ASSIST_INTERVAL = 3.2;
const ASSIST_SCORE = 100;

function demogorgon() {
  return new BlackoutFightPhaseMachine(
    {
      blackout: BLACKOUT,
      reveal: REVEAL,
      restore: RESTORE,
      victory: VICTORY,
      strobeHzIntro: STROBE_HZ_INTRO,
      fightFlickerHz: FIGHT_FLICKER_HZ,
      targetHits: 10,
    },
    {
      base: FIGHT_SHADE,
      breatheAmp: FIGHT_SHADE_BREATHE,
      breatheSpeed: FIGHT_SHADE_SPEED,
      dip: FIGHT_FLINKER_DIP,
      lift: FIGHT_FLICKER_LIFT,
      clampMin: 0.18,
      clampMax: 0.52,
    },
    {
      first: ELEVEN_ASSIST_FIRST,
      interval: ASSIST_INTERVAL,
      anim: ELEVEN_ASSIST_ANIM,
      scoreIncrement: ASSIST_SCORE,
    },
  );
}

function ganondorf() {
  return new BlackoutFightPhaseMachine(
    {
      blackout: BLACKOUT,
      reveal: REVEAL,
      restore: RESTORE,
      victory: VICTORY,
      strobeHzIntro: STROBE_HZ_INTRO,
      fightFlickerHz: FIGHT_FLICKER_HZ,
      targetHits: 5,
    },
    { base: 0, breatheAmp: 0, breatheSpeed: 0, dip: 0, lift: 0, clampMin: 0, clampMax: 0 },
    null,
  );
}

describe('initial / idle', () => {
  test('starts idle; idle tick advances pulseT only and stays idle', () => {
    const m = demogorgon();
    expect(m.getPhase()).toBe('idle');
    const d = m.tick(0.016);
    expect(d.phase).toBe('idle');
    expect(d.darkMix).toBe(1);
    expect(d.assist).toBeNull();
  });
});

describe('onReveal → blackout', () => {
  test('idle → blackout, resets clocks', () => {
    const m = demogorgon();
    expect(m.onReveal()).toBe(true);
    expect(m.getPhase()).toBe('blackout');
  });

  test('ignored when not idle', () => {
    const m = demogorgon();
    m.onReveal();
    expect(m.onReveal()).toBe(false);
  });
});

describe('blackout phase scalars (verbatim)', () => {
  test('blackoutMix = easeOut(elapsed/BLACKOUT); on = strobeOn(strobeT, 4)', () => {
    const m = demogorgon();
    m.onReveal();
    const dt = 0.06; // half of blackout
    const d = m.tick(dt);
    expect(d.phase).toBe('blackout');
    expect(d.blackoutMix).toBeCloseTo(easeOut(Math.min(1, dt / BLACKOUT)), 10);
    expect(d.on).toBe(strobeOn(dt, STROBE_HZ_INTRO));
    expect(d.enteredReveal).toBe(false);
  });

  test('blackout → reveal at elapsed >= BLACKOUT, enteredReveal flagged', () => {
    const m = demogorgon();
    m.onReveal();
    const d = m.tick(BLACKOUT);
    expect(d.phase).toBe('blackout');
    expect(d.enteredReveal).toBe(true);
    expect(d.blackoutMix).toBeCloseTo(easeOut(1), 10); // = 1
  });
});

describe('reveal phase scalars', () => {
  function toReveal() {
    const m = demogorgon();
    m.onReveal();
    m.tick(BLACKOUT); // → reveal (elapsed reset to 0)
    return m;
  }

  test('revealT = min(1, elapsed/REVEAL); holds before REVEAL', () => {
    const m = toReveal();
    const dt = 0.25; // half of reveal
    const d = m.tick(dt);
    expect(d.phase).toBe('reveal');
    expect(d.revealT).toBeCloseTo(dt / REVEAL, 10);
    expect(d.enteredFlicker).toBe(false);
  });

  test('reveal → flicker at elapsed >= REVEAL', () => {
    const m = toReveal();
    const d = m.tick(REVEAL);
    expect(d.phase).toBe('reveal');
    expect(d.enteredFlicker).toBe(true);
    expect(d.revealT).toBe(1);
  });
});

describe('flicker phase scalars (verbatim shade maths)', () => {
  // Drive to the start of flicker, tracking pulseT/strobeT.
  function toFlicker() {
    const m = demogorgon();
    m.onReveal();
    m.tick(BLACKOUT); // blackout→reveal: pulseT=0.12, strobeT reset 0 then +0.12=0.12, elapsed reset
    m.tick(REVEAL); // reveal→flicker: pulseT=0.62, strobeT=0.62, elapsed reset
    return m;
  }

  test('flickerShade matches clamp(base + breathe + (blink?-lift:dip))', () => {
    const m = toFlicker();
    const dt = 0.05;
    // pulseT after this tick: 0.62 + 0.05 = 0.67 ; strobeT: 0.62 + 0.05 = 0.67
    const pulseT = 0.62 + dt;
    const strobeT = 0.62 + dt;
    const breathe = Math.sin(pulseT * FIGHT_SHADE_SPEED) * FIGHT_SHADE_BREATHE;
    const blink = strobeOn(strobeT, FIGHT_FLICKER_HZ);
    const expectedShade = clampLocal(
      FIGHT_SHADE + breathe + (blink ? -FIGHT_FLICKER_LIFT : FIGHT_FLINKER_DIP),
      0.18,
      0.52,
    );
    const d = m.tick(dt);
    expect(d.phase).toBe('flicker');
    expect(d.flickerShade).toBeCloseTo(expectedShade, 10);
    expect(d.flickerBlink).toBe(blink);
  });
});

describe('eleven assist (Demogorgon only)', () => {
  test('first assist fires after ELEVEN_ASSIST_FIRST seconds in flicker', () => {
    const m = demogorgon();
    m.onReveal();
    m.tick(BLACKOUT);
    m.tick(REVEAL); // now in flicker, assistNextIn reset to 0.55
    // tick less than 0.55 → no fire
    let d = m.tick(0.5);
    expect(d.assistFired).toBe(false);
    expect(d.assist).toBeNull();
    // tick that crosses 0.55 → fires + emits an animation frame same tick
    d = m.tick(0.1);
    expect(d.assistFired).toBe(true);
    expect(d.assist).not.toBeNull();
    expect(d.assist?.active).toBe(true);
  });

  test('assist envelope scalars are verbatim', () => {
    const m = demogorgon();
    m.onReveal();
    m.tick(BLACKOUT);
    m.tick(REVEAL);
    m.tick(0.55); // fires assist; elevenAssistT advanced by 0 then... see below
    // After the firing tick, elevenAssistT == dt-of-that-tick? No: trigger sets
    // elevenAssistT internally to 0, then updateElevenAssist adds the same dt.
    const dt = 0.2;
    const d = m.tick(dt);
    const assist = d.assist;
    expect(assist).not.toBeNull();
    if (!assist) return;
    const t = Math.min(1, assist.elapsed / ELEVEN_ASSIST_ANIM);
    expect(assist.t).toBeCloseTo(t, 10);
    expect(assist.rise).toBeCloseTo(easeOut(t), 10);
    expect(assist.fade).toBeCloseTo(easeIn(t), 10);
    expect(assist.alpha).toBeCloseTo(t < 0.18 ? easeOut(t) / 0.18 : 1 - easeIn(t), 10);
    expect(assist.burst).toBeCloseTo(1 - easeIn(t) * 0.85, 10);
  });

  test('assist finishes when t >= 1 (assistFinished flagged)', () => {
    const m = demogorgon();
    m.onReveal();
    m.tick(BLACKOUT);
    m.tick(REVEAL);
    m.tick(0.55); // fire
    const d = m.tick(ELEVEN_ASSIST_ANIM + 0.01); // overshoot anim duration
    expect(d.assist?.t).toBe(1);
    expect(d.assistFinished).toBe(true);
  });

  test('Ganondorf has no assist sub-machine', () => {
    const m = ganondorf();
    m.onReveal();
    m.tick(BLACKOUT);
    m.tick(REVEAL);
    const d = m.tick(2.0);
    expect(d.assistFired).toBe(false);
    expect(d.assist).toBeNull();
  });
});

describe('Ganondorf flicker shade is flat 0', () => {
  test('all-zero flicker config yields shade 0', () => {
    const m = ganondorf();
    m.onReveal();
    m.tick(BLACKOUT);
    m.tick(REVEAL);
    const d = m.tick(0.05);
    expect(d.phase).toBe('flicker');
    expect(d.flickerShade).toBe(0);
  });
});

describe('onHit gating + victory', () => {
  function toFlicker(m: BlackoutFightPhaseMachine) {
    m.onReveal();
    m.tick(BLACKOUT);
    m.tick(REVEAL);
  }

  test('hit rejected in idle/restore/victory; accepted in blackout/reveal/flicker', () => {
    const m = demogorgon();
    expect(m.onHit(10).accepted).toBe(false); // idle
    m.onReveal();
    expect(m.onHit(1).accepted).toBe(true); // blackout
  });

  test('threshold reached → victory', () => {
    const m = demogorgon();
    toFlicker(m);
    expect(m.onHit(9)).toEqual({ accepted: true, victory: false });
    expect(m.onHit(10)).toEqual({ accepted: true, victory: true });
    expect(m.getPhase()).toBe('victory');
    expect(m.isVictory()).toBe(true);
  });
});

describe('victory → restore → reset', () => {
  function toVictory(m: BlackoutFightPhaseMachine) {
    m.onReveal();
    m.tick(BLACKOUT);
    m.tick(REVEAL);
    m.onHit(10);
  }

  test('victoryT = min(1, elapsed/VICTORY); finishes at duration → restore', () => {
    const m = demogorgon();
    toVictory(m);
    let d = m.tick(0.325); // half
    expect(d.phase).toBe('victory');
    expect(d.victoryT).toBeCloseTo(0.5, 10);
    expect(d.finishedVictory).toBe(false);
    d = m.tick(0.325); // reaches 0.65
    expect(d.phase).toBe('victory');
    expect(d.victoryT).toBe(1);
    expect(d.finishedVictory).toBe(true);
    expect(m.getPhase()).toBe('restore');
  });

  test('restore darkMix = 1 - easeIn(elapsed/RESTORE); finishes when darkMix <= 0', () => {
    const m = demogorgon();
    toVictory(m);
    m.tick(0.65); // → restore
    const dt = 0.15; // half of restore
    const d = m.tick(dt);
    expect(d.phase).toBe('restore');
    expect(d.darkMix).toBeCloseTo(1 - easeIn(dt / RESTORE), 10);
    expect(d.finishedRestore).toBe(false);
  });

  test('restore finishes at full duration (darkMix = 0)', () => {
    const m = demogorgon();
    toVictory(m);
    m.tick(0.65); // → restore
    const d = m.tick(RESTORE);
    expect(d.phase).toBe('restore');
    expect(d.finishedRestore).toBe(true);
    expect(d.darkMix).toBeCloseTo(0, 10);
  });
});

describe('reset', () => {
  test('returns to idle and clears assist', () => {
    const m = demogorgon();
    m.onReveal();
    m.tick(BLACKOUT);
    m.tick(REVEAL);
    m.tick(0.6); // assist active
    m.reset();
    expect(m.getPhase()).toBe('idle');
    const d = m.tick(0.016);
    expect(d.phase).toBe('idle');
    expect(d.assist).toBeNull();
  });
});

function clampLocal(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
