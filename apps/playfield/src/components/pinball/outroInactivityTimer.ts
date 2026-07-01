// Auto-exit de l'écran outro/QR (fin de partie) : après OUTRO_IDLE_TIMEOUT_MS
// sans interaction (bouton/plunge), on rejoue le même chemin que le replay/reset
// pour libérer la borne. Toute interaction relance (ou annule) le compte à rebours.
//
// Logique PURE + testable : les primitives de timing sont injectées (setTimeout/
// clearTimeout compatibles window.*) → tests avec un scheduler simulé.

export const OUTRO_IDLE_TIMEOUT_MS = 20_000;

// Timer navigateur (window.setTimeout renvoie un number). Évite le type Node
// `Timeout` qui fuite via @types/node.
type TimeoutHandle = number;

export interface OutroInactivitySchedule {
  setTimeout: (fn: () => void, ms: number) => TimeoutHandle;
  clearTimeout: (handle: TimeoutHandle) => void;
}

export interface OutroInactivityTimer {
  /** Démarre (ou redémarre) le compte à rebours d'inactivité. */
  arm: () => void;
  /** Interaction détectée : annule tout compte à rebours en cours. */
  cancel: () => void;
  /** true si un compte à rebours est armé. */
  isArmed: () => boolean;
}

export function createOutroInactivityTimer(
  onTimeout: () => void,
  schedule: OutroInactivitySchedule,
  timeoutMs: number = OUTRO_IDLE_TIMEOUT_MS,
): OutroInactivityTimer {
  let handle: TimeoutHandle | null = null;

  const cancel = () => {
    if (handle === null) return;
    schedule.clearTimeout(handle);
    handle = null;
  };

  const arm = () => {
    cancel();
    handle = schedule.setTimeout(() => {
      handle = null;
      onTimeout();
    }, timeoutMs);
  };

  return {
    arm,
    cancel,
    isArmed: () => handle !== null,
  };
}
