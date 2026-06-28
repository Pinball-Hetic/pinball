import { test, expect, describe, beforeEach } from 'bun:test';
import { Plunger, type PlungerState } from './Plunger';

let plunger: Plunger;

beforeEach(() => {
  plunger = new Plunger();
});

describe('Plunger initial state', () => {
  test('starts idle, not charging, with no start time', () => {
    const state = plunger.getState();
    expect(state.isCharging).toBe(false);
    expect(state.chargeStartTime).toBeNull();
  });
});

describe('startCharge', () => {
  test('marks charging and records the start time', () => {
    plunger.startCharge(1000);
    const state = plunger.getState();
    expect(state.isCharging).toBe(true);
    expect(state.chargeStartTime).toBe(1000);
  });

  test('records a zero timestamp faithfully (not treated as null)', () => {
    plunger.startCharge(0);
    expect(plunger.getState().chargeStartTime).toBe(0);
    expect(plunger.getState().isCharging).toBe(true);
  });

  test('a second startCharge overwrites the previous start time', () => {
    plunger.startCharge(1000);
    plunger.startCharge(2500);
    expect(plunger.getState().chargeStartTime).toBe(2500);
    expect(plunger.getState().isCharging).toBe(true);
  });
});

describe('release', () => {
  test('returns a snapshot of the charging state before resetting', () => {
    plunger.startCharge(1234);
    const snapshot = plunger.release();
    expect(snapshot.isCharging).toBe(true);
    expect(snapshot.chargeStartTime).toBe(1234);
  });

  test('resets the internal state to idle after release', () => {
    plunger.startCharge(1234);
    plunger.release();
    const state = plunger.getState();
    expect(state.isCharging).toBe(false);
    expect(state.chargeStartTime).toBeNull();
  });

  test('releasing while idle returns an idle snapshot', () => {
    const snapshot = plunger.release();
    expect(snapshot.isCharging).toBe(false);
    expect(snapshot.chargeStartTime).toBeNull();
  });

  test('the returned snapshot is decoupled from later state changes', () => {
    plunger.startCharge(500);
    const snapshot: PlungerState = plunger.release();
    plunger.startCharge(999);
    // Le snapshot ne doit pas refléter la nouvelle charge.
    expect(snapshot.chargeStartTime).toBe(500);
    expect(plunger.getState().chargeStartTime).toBe(999);
  });

  test('full charge → release → charge cycle behaves consistently', () => {
    plunger.startCharge(10);
    expect(plunger.release().chargeStartTime).toBe(10);
    plunger.startCharge(20);
    expect(plunger.release().chargeStartTime).toBe(20);
    expect(plunger.getState().isCharging).toBe(false);
  });
});

describe('state isolation between instances', () => {
  test('two plungers do not share state', () => {
    const a = new Plunger();
    const b = new Plunger();
    a.startCharge(100);
    expect(b.getState().isCharging).toBe(false);
    expect(a.getState().isCharging).toBe(true);
  });
});
