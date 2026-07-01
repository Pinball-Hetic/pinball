import { test, expect } from "bun:test";
import {
  createOutroInactivityTimer,
  OUTRO_IDLE_TIMEOUT_MS,
  type OutroInactivitySchedule,
} from "./outroInactivityTimer";

// Scheduler simulé : capture le dernier callback armé + son délai, permet de
// « faire avancer le temps » en le déclenchant manuellement.
function fakeSchedule() {
  let nextId = 1;
  const pending = new Map<number, { fn: () => void; ms: number }>();
  const schedule: OutroInactivitySchedule = {
    setTimeout: (fn, ms) => {
      const id = nextId++;
      pending.set(id, { fn, ms });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout: (handle) => {
      pending.delete(handle as unknown as number);
    },
  };
  return {
    schedule,
    pendingCount: () => pending.size,
    lastDelay: () => [...pending.values()].at(-1)?.ms,
    fireAll: () => {
      for (const { fn } of [...pending.values()]) fn();
      pending.clear();
    },
  };
}

test("arm déclenche onTimeout après le délai par défaut (20s)", () => {
  const f = fakeSchedule();
  let fired = 0;
  const timer = createOutroInactivityTimer(() => fired++, f.schedule);

  timer.arm();
  expect(timer.isArmed()).toBe(true);
  expect(f.lastDelay()).toBe(OUTRO_IDLE_TIMEOUT_MS);

  f.fireAll();
  expect(fired).toBe(1);
  expect(timer.isArmed()).toBe(false);
});

test("cancel (interaction) empêche onTimeout", () => {
  const f = fakeSchedule();
  let fired = 0;
  const timer = createOutroInactivityTimer(() => fired++, f.schedule);

  timer.arm();
  timer.cancel();
  expect(timer.isArmed()).toBe(false);
  expect(f.pendingCount()).toBe(0);

  f.fireAll();
  expect(fired).toBe(0);
});

test("arm répété relance le compte à rebours (un seul timer en vol)", () => {
  const f = fakeSchedule();
  let fired = 0;
  const timer = createOutroInactivityTimer(() => fired++, f.schedule);

  timer.arm();
  timer.arm();
  timer.arm();
  expect(f.pendingCount()).toBe(1);

  f.fireAll();
  expect(fired).toBe(1);
});

test("délai personnalisable", () => {
  const f = fakeSchedule();
  const timer = createOutroInactivityTimer(() => {}, f.schedule, 5_000);
  timer.arm();
  expect(f.lastDelay()).toBe(5_000);
});

test("cancel est idempotent (double cancel ne casse pas)", () => {
  const f = fakeSchedule();
  const timer = createOutroInactivityTimer(() => {}, f.schedule);
  timer.arm();
  timer.cancel();
  timer.cancel();
  expect(timer.isArmed()).toBe(false);
});
