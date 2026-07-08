import { test, expect, describe } from 'bun:test';
import { WalkFightPhaseMachine } from '../../src/infrastructure/WalkFightPhaseMachine';

// Verbatim Vecna config (fight flicker 0.26/0.12, victory 0.65, 5 hits).
function makeMachine() {
  return new WalkFightPhaseMachine({
    victoryDuration: 0.65,
    fightFlickerShade: 0.26,
    fightFlickerFlashMix: 0.12,
    targetHits: 5,
  });
}

const NOT_COMPLETE = { walkPathComplete: false, settleComplete: false };

describe('WalkFightPhaseMachine — initial state', () => {
  test('starts idle, gameplay not frozen', () => {
    const m = makeMachine();
    expect(m.getPhase()).toBe('idle');
    expect(m.isGameplayFrozen()).toBe(false);
  });

  test('idle tick stays idle and emits stop', () => {
    const m = makeMachine();
    const d = m.tick(0.016, NOT_COMPLETE);
    expect(d.phase).toBe('idle');
    expect(d.strobe).toEqual({ kind: 'stop' });
  });
});

describe('onReveal', () => {
  test('idle → walk, freezes gameplay', () => {
    const m = makeMachine();
    expect(m.onReveal()).toBe(true);
    expect(m.getPhase()).toBe('walk');
    expect(m.isGameplayFrozen()).toBe(true);
  });

  test('ignored when not idle', () => {
    const m = makeMachine();
    m.onReveal();
    expect(m.onReveal()).toBe(false);
    expect(m.getPhase()).toBe('walk');
  });
});

describe('walk → settle → fight transitions (gated by visual booleans)', () => {
  test('walk holds while path incomplete, strobe stop', () => {
    const m = makeMachine();
    m.onReveal();
    const d = m.tick(0.016, NOT_COMPLETE);
    expect(d.phase).toBe('walk');
    expect(d.strobe).toEqual({ kind: 'stop' });
    expect(d.enteredSettle).toBe(false);
  });

  test('walk → settle when walkPathComplete', () => {
    const m = makeMachine();
    m.onReveal();
    const d = m.tick(0.016, { walkPathComplete: true, settleComplete: false });
    expect(d.phase).toBe('settle');
    expect(d.enteredSettle).toBe(true);
    expect(d.strobe).toEqual({ kind: 'stop' });
    expect(m.isGameplayFrozen()).toBe(true);
  });

  test('settle holds while not complete', () => {
    const m = makeMachine();
    m.onReveal();
    m.tick(0.016, { walkPathComplete: true, settleComplete: false });
    const d = m.tick(0.016, NOT_COMPLETE);
    expect(d.phase).toBe('settle');
    expect(d.enteredFight).toBe(false);
  });

  test('settle → fight when settleComplete; gameplay unfreezes', () => {
    const m = makeMachine();
    m.onReveal();
    m.tick(0.016, { walkPathComplete: true, settleComplete: false });
    const d = m.tick(0.016, { walkPathComplete: false, settleComplete: true });
    expect(d.phase).toBe('fight');
    expect(d.enteredFight).toBe(true);
    expect(d.strobe).toEqual({ kind: 'stop' });
    expect(m.isGameplayFrozen()).toBe(false);
  });
});

describe('fight phase strobe', () => {
  test('emits fightFlicker with config shade/flashMix every frame', () => {
    const m = makeMachine();
    m.onReveal();
    m.tick(0.016, { walkPathComplete: true, settleComplete: false });
    m.tick(0.016, { walkPathComplete: false, settleComplete: true });
    const d = m.tick(0.016, NOT_COMPLETE);
    expect(d.phase).toBe('fight');
    expect(d.strobe).toEqual({ kind: 'fightFlicker', shade: 0.26, flashMix: 0.12 });
  });
});

describe('onHit', () => {
  function toFight(m: WalkFightPhaseMachine) {
    m.onReveal();
    m.tick(0.016, { walkPathComplete: true, settleComplete: false });
    m.tick(0.016, { walkPathComplete: false, settleComplete: true });
  }

  test('hit below threshold accepted, no victory', () => {
    const m = makeMachine();
    toFight(m);
    expect(m.onHit(4)).toEqual({ accepted: true, victory: false });
    expect(m.getPhase()).toBe('fight');
  });

  test('hit reaching threshold → victory', () => {
    const m = makeMachine();
    toFight(m);
    expect(m.onHit(5)).toEqual({ accepted: true, victory: true });
    expect(m.getPhase()).toBe('victory');
  });

  test('hit outside fight phase rejected', () => {
    const m = makeMachine();
    expect(m.onHit(5)).toEqual({ accepted: false, victory: false });
    m.onReveal(); // walk
    expect(m.onHit(5)).toEqual({ accepted: false, victory: false });
    expect(m.getPhase()).toBe('walk');
  });
});

describe('victory phase: strobe mix decays to 0, finishes at duration', () => {
  function toVictory(m: WalkFightPhaseMachine) {
    m.onReveal();
    m.tick(0.016, { walkPathComplete: true, settleComplete: false });
    m.tick(0.016, { walkPathComplete: false, settleComplete: true });
    m.onHit(5);
  }

  test('mix = max(0, 1 - elapsed/0.65); not finished mid-way', () => {
    const m = makeMachine();
    toVictory(m);
    const d = m.tick(0.325, NOT_COMPLETE); // elapsed 0.325 → mix 0.5
    expect(d.phase).toBe('victory');
    expect(d.strobe).toEqual({ kind: 'apply', on: false, fullMap: false, mix: 0.5 });
    expect(d.finishedVictory).toBe(false);
  });

  test('finishes when elapsed >= 0.65, mix clamped to 0', () => {
    const m = makeMachine();
    toVictory(m);
    const d = m.tick(0.65, NOT_COMPLETE);
    expect(d.phase).toBe('victory');
    expect(d.finishedVictory).toBe(true);
    expect(d.strobe).toEqual({ kind: 'apply', on: false, fullMap: false, mix: 0 });
  });
});

describe('reset', () => {
  test('returns to idle from any phase', () => {
    const m = makeMachine();
    m.onReveal();
    m.reset();
    expect(m.getPhase()).toBe('idle');
    expect(m.getElapsed()).toBe(0);
  });
});

describe('DarkLink config variant (0.22/0.10)', () => {
  test('fight flicker uses DarkLink scalars', () => {
    const m = new WalkFightPhaseMachine({
      victoryDuration: 0.65,
      fightFlickerShade: 0.22,
      fightFlickerFlashMix: 0.1,
      targetHits: 10,
    });
    m.onReveal();
    m.tick(0.016, { walkPathComplete: true, settleComplete: false });
    m.tick(0.016, { walkPathComplete: false, settleComplete: true });
    const d = m.tick(0.016, NOT_COMPLETE);
    expect(d.strobe).toEqual({ kind: 'fightFlicker', shade: 0.22, flashMix: 0.1 });
  });

  test('threshold is 10 for DarkLink', () => {
    const m = new WalkFightPhaseMachine({
      victoryDuration: 0.65,
      fightFlickerShade: 0.22,
      fightFlickerFlashMix: 0.1,
      targetHits: 10,
    });
    m.onReveal();
    m.tick(0.016, { walkPathComplete: true, settleComplete: false });
    m.tick(0.016, { walkPathComplete: false, settleComplete: true });
    expect(m.onHit(9).victory).toBe(false);
    expect(m.onHit(10).victory).toBe(true);
  });
});
