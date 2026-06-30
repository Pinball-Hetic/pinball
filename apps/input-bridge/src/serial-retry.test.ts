import { test, expect, describe } from 'bun:test';
import { runWithRetry, RETRY_DELAY_MS, type OpenOutcome } from './serial-retry';

interface Scheduled {
  run: () => void;
  delayMs: number;
}

// Faux ordonnanceur déterministe : capture les setTimeout au lieu de les exécuter.
// `drain()` rejoue la file en l'ordre FIFO une fois (les nouvelles entrées
// programmées pendant le drain seront rejouées au drain suivant).
function fakeScheduler() {
  const queue: Scheduled[] = [];
  return {
    queue,
    schedule: (run: () => void, delayMs: number) => queue.push({ run, delayMs }),
    drain() {
      const batch = queue.splice(0, queue.length);
      for (const s of batch) s.run();
    },
  };
}

describe('runWithRetry — politique pure de retry/reopen', () => {
  test('ouverture réussie immédiate → une seule tentative, rien de reprogrammé', () => {
    const sched = fakeScheduler();
    let opens = 0;
    runWithRetry({
      openDevice: () => {
        opens++;
        return 'opened';
      },
      schedule: sched.schedule,
    });
    expect(opens).toBe(1);
    expect(sched.queue).toEqual([]);
  });

  test('échec d’ouverture → reprogramme une tentative à RETRY_DELAY_MS', () => {
    const sched = fakeScheduler();
    runWithRetry({
      openDevice: () => 'failed',
      schedule: sched.schedule,
    });
    expect(sched.queue.length).toBe(1);
    expect(sched.queue[0]!.delayMs).toBe(RETRY_DELAY_MS);
  });

  test('échecs répétés → retry illimité, un seul programmé à la fois', () => {
    const sched = fakeScheduler();
    let opens = 0;
    runWithRetry({
      openDevice: () => {
        opens++;
        return 'failed';
      },
      schedule: sched.schedule,
    });
    expect(opens).toBe(1);
    // chaque drain rejoue exactement une tentative qui reprogramme la suivante
    for (let i = 2; i <= 5; i++) {
      expect(sched.queue.length).toBe(1);
      sched.drain();
      expect(opens).toBe(i);
    }
  });

  test('échec puis succès → s’arrête après l’ouverture réussie', () => {
    const sched = fakeScheduler();
    const outcomes: OpenOutcome[] = ['failed', 'failed', 'opened'];
    let i = 0;
    runWithRetry({
      openDevice: () => outcomes[i++]!,
      schedule: sched.schedule,
    });
    // 1er échec programmé
    expect(sched.queue.length).toBe(1);
    sched.drain(); // 2e échec
    expect(sched.queue.length).toBe(1);
    sched.drain(); // succès
    expect(sched.queue).toEqual([]);
    expect(i).toBe(3);
  });

  test('device ouvert puis chute (reopen) → reprogramme à RETRY_DELAY_MS', () => {
    const sched = fakeScheduler();
    let reopenCb: (() => void) | null = null;
    let opens = 0;
    runWithRetry({
      openDevice: (reopen) => {
        opens++;
        reopenCb = reopen;
        return 'opened';
      },
      schedule: sched.schedule,
    });
    expect(opens).toBe(1);
    expect(sched.queue).toEqual([]); // rien tant que le stream tient
    // simulate stream error/close
    reopenCb!();
    expect(sched.queue.length).toBe(1);
    expect(sched.queue[0]!.delayMs).toBe(RETRY_DELAY_MS);
    sched.drain(); // ré-ouverture
    expect(opens).toBe(2);
  });

  test('reopen n’est pas rappelé deux fois ne reprogramme qu’une fois par appel', () => {
    const sched = fakeScheduler();
    let reopenCb: (() => void) | null = null;
    runWithRetry({
      openDevice: (reopen) => {
        reopenCb = reopen;
        return 'opened';
      },
      schedule: sched.schedule,
    });
    reopenCb!();
    reopenCb!();
    expect(sched.queue.length).toBe(2);
  });
});
