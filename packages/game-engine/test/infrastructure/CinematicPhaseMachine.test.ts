import { describe, expect, test } from 'bun:test';
import { CinematicPhaseMachine, type CinematicPhaseConfig } from '../../src/infrastructure/CinematicPhaseMachine';
import { easeInOut, easeOut } from '../../src/infrastructure/CinematicEasing';

const CONFIG: CinematicPhaseConfig = {
  zoomInDuration: 2,
  holdDuration: 0.2,
  zoomOutDuration: 0.4,
};

describe('idle', () => {
  test('starts idle and stays idle on tick with zero blend', () => {
    const m = new CinematicPhaseMachine();
    expect(m.getPhase()).toBe('idle');
    expect(m.isActive()).toBe(false);
    const d = m.tick(0.5, CONFIG);
    expect(d.phase).toBe('idle');
    expect(d.blend).toEqual({ lookAtT: 0, distanceT: 0, dirT: 0 });
    expect(d.done).toBe(false);
    expect(m.getPhase()).toBe('idle');
  });
});

describe('start → zoomIn', () => {
  test('start enters zoomIn / active', () => {
    const m = new CinematicPhaseMachine();
    m.start();
    expect(m.getPhase()).toBe('zoomIn');
    expect(m.isActive()).toBe(true);
  });

  test('eased blend equals easeInOut(elapsed/zoomInDuration) by default', () => {
    const m = new CinematicPhaseMachine();
    m.start();
    const d = m.tick(0.5, CONFIG);
    expect(d.phase).toBe('zoomIn');
    const e = easeInOut(0.5 / 2);
    expect(d.blend.lookAtT).toBeCloseTo(e, 12);
    expect(d.blend.distanceT).toBeCloseTo(e, 12);
    expect(d.blend.dirT).toBeCloseTo(e, 12);
    expect(d.done).toBe(false);
  });

  test('linear panEasing yields blend = t', () => {
    const m = new CinematicPhaseMachine();
    m.start();
    const d = m.tick(0.5, { ...CONFIG, panEasing: 'linear' });
    expect(d.blend.lookAtT).toBeCloseTo(0.25, 12);
    expect(d.blend.distanceT).toBeCloseTo(0.25, 12);
    expect(d.blend.dirT).toBeCloseTo(0.25, 12);
  });

  test('t clamps at 1 and transitions to hold; transition tick still reports zoomIn blend=1', () => {
    const m = new CinematicPhaseMachine();
    m.start();
    const d = m.tick(5, CONFIG); // overshoot zoomInDuration
    expect(d.phase).toBe('zoomIn');
    expect(d.blend.lookAtT).toBe(1);
    expect(d.blend.distanceT).toBe(1);
    expect(d.blend.dirT).toBe(1);
    expect(d.done).toBe(false);
    expect(m.getPhase()).toBe('hold');
  });
});

describe('hold', () => {
  function toHold(): CinematicPhaseMachine {
    const m = new CinematicPhaseMachine();
    m.start();
    m.tick(2, CONFIG); // exactly zoomInDuration → hold (elapsed reset)
    return m;
  }

  test('hold blend is fully boss-locked (all 1)', () => {
    const m = toHold();
    const d = m.tick(0.1, CONFIG); // below holdDuration
    expect(d.phase).toBe('hold');
    expect(d.blend).toEqual({ lookAtT: 1, distanceT: 1, dirT: 1 });
    expect(d.done).toBe(false);
    expect(m.getPhase()).toBe('hold');
  });

  test('transitions to zoomOut at elapsed >= holdDuration; transition tick still reports hold', () => {
    const m = toHold();
    const d = m.tick(0.2, CONFIG); // == holdDuration
    expect(d.phase).toBe('hold');
    expect(d.blend).toEqual({ lookAtT: 1, distanceT: 1, dirT: 1 });
    expect(d.done).toBe(false);
    expect(m.getPhase()).toBe('zoomOut');
  });
});

describe('zoomOut', () => {
  function toZoomOut(): CinematicPhaseMachine {
    const m = new CinematicPhaseMachine();
    m.start();
    m.tick(2, CONFIG); // → hold
    m.tick(0.2, CONFIG); // → zoomOut (elapsed reset)
    return m;
  }

  test('lookAt/distance blend = easeOut(t); dirT = 1 - easeOut(t)', () => {
    const m = toZoomOut();
    const dt = 0.2; // half of zoomOutDuration
    const d = m.tick(dt, CONFIG);
    expect(d.phase).toBe('zoomOut');
    const e = easeOut(dt / CONFIG.zoomOutDuration);
    expect(d.blend.lookAtT).toBeCloseTo(e, 12);
    expect(d.blend.distanceT).toBeCloseTo(e, 12);
    expect(d.blend.dirT).toBeCloseTo(1 - e, 12);
    expect(d.done).toBe(false);
    expect(m.getPhase()).toBe('zoomOut');
  });

  test('t clamps at 1, done flagged, returns to idle', () => {
    const m = toZoomOut();
    const d = m.tick(5, CONFIG); // overshoot
    expect(d.phase).toBe('zoomOut');
    expect(d.blend.lookAtT).toBe(1); // easeOut(1)
    expect(d.blend.distanceT).toBe(1);
    expect(d.blend.dirT).toBe(0); // 1 - easeOut(1)
    expect(d.done).toBe(true);
    expect(m.getPhase()).toBe('idle');
    expect(m.isActive()).toBe(false);
  });
});

describe('full sequence + reset', () => {
  test('idle → zoomIn → hold → zoomOut → idle over many ticks', () => {
    const m = new CinematicPhaseMachine();
    m.start();
    const phases: string[] = [];
    for (let i = 0; i < 40; i += 1) {
      phases.push(m.tick(0.1, CONFIG).phase);
    }
    expect(phases[0]).toBe('zoomIn');
    expect(phases).toContain('hold');
    expect(phases).toContain('zoomOut');
    expect(m.getPhase()).toBe('idle');
  });

  test('reset from any phase returns to idle', () => {
    const m = new CinematicPhaseMachine();
    m.start();
    m.tick(0.5, CONFIG);
    m.reset();
    expect(m.getPhase()).toBe('idle');
    expect(m.isActive()).toBe(false);
    const d = m.tick(0.1, CONFIG);
    expect(d.phase).toBe('idle');
  });
});
