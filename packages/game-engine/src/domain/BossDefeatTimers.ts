export interface TimerScheduler {
  setTimeout(handler: () => void, timeout: number): number;
  clearTimeout(handle: number): void;
}

export interface BossDefeatTimers {
  schedule(bossId: string, delayMs: number, run: () => void): void;
  clear(bossId: string): void;
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
    // One timer per boss: cancel any previous one so re-triggers don't stack.
    clear(bossId);
    handles[bossId] = scheduler.setTimeout(() => {
      delete handles[bossId];
      run();
    }, delayMs);
  }

  return { schedule, clear, clearAll };
}
