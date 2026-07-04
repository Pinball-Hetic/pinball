// Registry of boss-defeat timers shared by map modules (ST, Zelda). On defeat,
// the module slows time (setTimeScale) then schedules a setTimeout to restore
// it + play the cinematic. Untracked, these timers leak: they fire after a
// reset/dispose (restoring the timescale of a finished game) and stack when
// the same boss re-triggers.
//
// This registry keeps one timer per bossId (a new one cancels the previous)
// and cancels everything on reset/dispose. The scheduler is injectable so
// tests run without a DOM; defaults to `window`.

export interface TimerScheduler {
  setTimeout(handler: () => void, timeout: number): number;
  clearTimeout(handle: number): void;
}

export interface BossDefeatTimers {
  // Schedules (or replaces) a boss defeat timer. `delayMs` preserves the
  // per-map historical delay (200 ms ST, 400 ms Zelda).
  schedule(bossId: string, delayMs: number, run: () => void): void;
  // Cancels one boss timer (no-op if none).
  clear(bossId: string): void;
  // Cancels all pending timers (reset/dispose).
  clearAll(): void;
}

const defaultScheduler: TimerScheduler = {
  setTimeout: (handler, timeout) => window.setTimeout(handler, timeout),
  clearTimeout: (handle) => window.clearTimeout(handle),
};

export function createBossDefeatTimers(
  scheduler: TimerScheduler = defaultScheduler,
): BossDefeatTimers {
  const handles: Record<string, number> = {};

  function clear(bossId: string): void {
    const handle = handles[bossId];
    if (handle !== undefined) {
      scheduler.clearTimeout(handle);
      delete handles[bossId];
    }
  }

  function clearAll(): void {
    for (const bossId of Object.keys(handles)) clear(bossId);
  }

  function schedule(bossId: string, delayMs: number, run: () => void): void {
    // One timer per boss: cancel any previous one before arming a new one
    // (no stacking when BOSS_TARGET_HIT re-triggers at the threshold).
    clear(bossId);
    handles[bossId] = scheduler.setTimeout(() => {
      delete handles[bossId];
      run();
    }, delayMs);
  }

  return { schedule, clear, clearAll };
}
