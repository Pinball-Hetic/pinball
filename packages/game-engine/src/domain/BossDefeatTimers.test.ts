import { test, expect, describe } from 'bun:test';
import { createBossDefeatTimers, type TimerScheduler } from './BossDefeatTimers';

interface FakeTimer {
  id: number;
  cb: () => void;
  delay: number;
  cleared: boolean;
  fired: boolean;
}

function fakeScheduler(): {
  scheduler: TimerScheduler;
  timers: FakeTimer[];
  pending: () => FakeTimer[];
  fireAll: () => void;
} {
  let nextId = 1;
  const timers: FakeTimer[] = [];
  const scheduler: TimerScheduler = {
    setTimeout(cb, delay) {
      const timer: FakeTimer = { id: nextId++, cb, delay, cleared: false, fired: false };
      timers.push(timer);
      return timer.id;
    },
    clearTimeout(id) {
      const timer = timers.find((t) => t.id === id);
      if (timer) timer.cleared = true;
    },
  };
  const pending = () => timers.filter((t) => !t.cleared && !t.fired);
  const fireAll = () => {
    for (const t of pending()) {
      t.fired = true;
      t.cb();
    }
  };
  return { scheduler, timers, pending, fireAll };
}

describe('createBossDefeatTimers', () => {
  test('schedule arms one timer with the given delay', () => {
    const f = fakeScheduler();
    const timers = createBossDefeatTimers(f.scheduler);
    timers.schedule('ganondorf', 400, () => {});
    expect(f.pending().length).toBe(1);
    expect(f.pending()[0].delay).toBe(400);
  });

  test('the scheduled callback runs when the timer fires', () => {
    const f = fakeScheduler();
    const timers = createBossDefeatTimers(f.scheduler);
    let ran = 0;
    timers.schedule('demogorgon', 200, () => {
      ran += 1;
    });
    f.fireAll();
    expect(ran).toBe(1);
  });

  test('re-scheduling the same boss cancels the previous timer (no stacking)', () => {
    const f = fakeScheduler();
    const timers = createBossDefeatTimers(f.scheduler);
    let ran = 0;
    timers.schedule('ganondorf', 400, () => {
      ran += 1;
    });
    timers.schedule('ganondorf', 400, () => {
      ran += 1;
    });
    timers.schedule('ganondorf', 400, () => {
      ran += 1;
    });
    expect(f.pending().length).toBe(1);
    f.fireAll();
    expect(ran).toBe(1);
  });

  test('distinct bosses keep independent timers', () => {
    const f = fakeScheduler();
    const timers = createBossDefeatTimers(f.scheduler);
    timers.schedule('ganondorf', 400, () => {});
    timers.schedule('darklink', 400, () => {});
    expect(f.pending().length).toBe(2);
  });

  test('clear cancels one boss timer; its callback never runs', () => {
    const f = fakeScheduler();
    const timers = createBossDefeatTimers(f.scheduler);
    let ran = 0;
    timers.schedule('ganondorf', 400, () => {
      ran += 1;
    });
    timers.clear('ganondorf');
    expect(f.pending().length).toBe(0);
    f.fireAll();
    expect(ran).toBe(0);
  });

  test('clearAll cancels every pending timer (reset/dispose safety)', () => {
    const f = fakeScheduler();
    const timers = createBossDefeatTimers(f.scheduler);
    let ran = 0;
    timers.schedule('ganondorf', 400, () => {
      ran += 1;
    });
    timers.schedule('darklink', 400, () => {
      ran += 1;
    });
    timers.clearAll();
    expect(f.pending().length).toBe(0);
    f.fireAll();
    expect(ran).toBe(0);
  });

  test('a fired timer no longer counts as pending and clearAll after it is a no-op', () => {
    const f = fakeScheduler();
    const timers = createBossDefeatTimers(f.scheduler);
    timers.schedule('ganondorf', 400, () => {});
    f.fireAll();
    // Callback deleted its own handle; clearAll must not touch the fired timer.
    timers.clearAll();
    expect(f.timers[0].cleared).toBe(false);
  });

  test('re-scheduling after firing arms a fresh timer', () => {
    const f = fakeScheduler();
    const timers = createBossDefeatTimers(f.scheduler);
    let ran = 0;
    timers.schedule('ganondorf', 400, () => {
      ran += 1;
    });
    f.fireAll();
    timers.schedule('ganondorf', 400, () => {
      ran += 1;
    });
    expect(f.pending().length).toBe(1);
    f.fireAll();
    expect(ran).toBe(2);
  });
});
