// Registre de timers de "défaite de boss" partagé entre les modules de map
// (ST, Zelda). À la défaite, le module ralentit le temps (setTimeScale) puis
// programme un setTimeout pour le restaurer + jouer la cinématique. Sans suivi,
// ces timers fuient : ils se déclenchent après un reset/dispose (restaurant le
// timescale d'une partie terminée) et s'empilent si le même boss re-déclenche.
//
// Ce registre : un seul timer par bossId (le nouveau annule le précédent) et
// annulation groupée au reset/dispose. Le planificateur est injectable pour
// rester testable sans DOM ; il défaut sur `window`.

export interface TimerScheduler {
  setTimeout(handler: () => void, timeout: number): number;
  clearTimeout(handle: number): void;
}

export interface BossDefeatTimers {
  // Programme (ou remplace) le timer de défaite d'un boss. `delayMs` conserve
  // le délai historique par map (200 ms ST, 400 ms Zelda).
  schedule(bossId: string, delayMs: number, run: () => void): void;
  // Annule le timer d'un boss précis (no-op si aucun).
  clear(bossId: string): void;
  // Annule tous les timers en attente (reset/dispose).
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
    // Un seul timer par boss : annule l'éventuel précédent avant d'en armer un
    // nouveau (pas d'empilement si BOSS_TARGET_HIT re-déclenche au seuil).
    clear(bossId);
    handles[bossId] = scheduler.setTimeout(() => {
      delete handles[bossId];
      run();
    }, delayMs);
  }

  return { schedule, clear, clearAll };
}
