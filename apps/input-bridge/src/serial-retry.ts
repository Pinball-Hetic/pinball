// Politique PURE de retry/reopen du device série, séparée de l'IO réelle (stty
// + createReadStream). Le device est ouvert via le port `openDevice` injecté :
// soit il échoue tout de suite (device absent → on reprogramme une tentative),
// soit il s'ouvre et appellera `reopen` plus tard (stream error/close). Dans les
// deux cas, on reprogramme la prochaine tentative via le port `schedule`
// injecté, après `RETRY_DELAY_MS`. Testable avec un faux openDevice/schedule.

export const RETRY_DELAY_MS = 3000;

// Résultat d'une tentative d'ouverture du device.
// - 'failed' : ouverture impossible maintenant (device absent / pas énuméré).
// - 'opened' : device ouvert ; une reconnexion future passera par `reopen`.
export type OpenOutcome = 'failed' | 'opened';

export interface SerialRetryPorts {
  // Tente d'ouvrir le device. Reçoit `reopen` à rappeler si le device s'ouvre
  // puis tombe (error/close). Retourne l'issue immédiate de la tentative.
  openDevice(reopen: () => void): OpenOutcome;
  // Reprogramme `run` après `delayMs` (setTimeout en prod).
  schedule(run: () => void, delayMs: number): void;
}

// Boucle de (ré)ouverture infinie, à délai fixe — comportement identique à
// l'ancien `openSerial` : retry illimité, 3 s entre chaque tentative, aussi bien
// après un échec d'ouverture qu'après une chute du stream.
export function runWithRetry(ports: SerialRetryPorts): void {
  const attempt = (): void => {
    const reopen = (): void => ports.schedule(attempt, RETRY_DELAY_MS);
    const outcome = ports.openDevice(reopen);
    if (outcome === 'failed') ports.schedule(attempt, RETRY_DELAY_MS);
  };
  attempt();
}
