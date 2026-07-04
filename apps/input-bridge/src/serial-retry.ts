// Serial device retry/reopen policy, separated from the real IO (stty +
// createReadStream). The device opens via the injected `openDevice` port:
// either it fails right away (device absent → schedule a new attempt), or it
// opens and will call `reopen` later (stream error/close). Either way the next
// attempt is scheduled via the injected `schedule` port after
// `RETRY_DELAY_MS`. Testable with a fake openDevice/schedule.

export const RETRY_DELAY_MS = 3000;

// Outcome of a device open attempt.
// - 'failed': cannot open right now (device absent / not enumerated).
// - 'opened': device open; a future reconnection will go through `reopen`.
export type OpenOutcome = 'failed' | 'opened';

export interface SerialRetryPorts {
  // Attempts to open the device. Receives `reopen` to call back if the device
  // opens then drops (error/close). Returns the attempt's immediate outcome.
  openDevice(reopen: () => void): OpenOutcome;
  // Reschedules `run` after `delayMs` (setTimeout in production).
  schedule(run: () => void, delayMs: number): void;
}

// Infinite (re)open loop at fixed delay: unlimited retries, 3 s between
// attempts, both after an open failure and after a stream drop.
export function runWithRetry(ports: SerialRetryPorts): void {
  const attempt = (): void => {
    const reopen = (): void => ports.schedule(attempt, RETRY_DELAY_MS);
    const outcome = ports.openDevice(reopen);
    if (outcome === 'failed') ports.schedule(attempt, RETRY_DELAY_MS);
  };
  attempt();
}
