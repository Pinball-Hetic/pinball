export const RETRY_DELAY_MS = 3000;

export type OpenOutcome = 'failed' | 'opened';

export interface SerialRetryPorts {
  openDevice(reopen: () => void): OpenOutcome;
  schedule(run: () => void, delayMs: number): void;
}

export function runWithRetry(ports: SerialRetryPorts): void {
  const attempt = (): void => {
    const reopen = (): void => ports.schedule(attempt, RETRY_DELAY_MS);
    const outcome = ports.openDevice(reopen);
    if (outcome === 'failed') ports.schedule(attempt, RETRY_DELAY_MS);
  };
  attempt();
}
