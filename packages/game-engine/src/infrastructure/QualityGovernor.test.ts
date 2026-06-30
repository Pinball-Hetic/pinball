import { test, expect, describe, mock, beforeEach, afterEach, spyOn } from 'bun:test';
import { QualityGovernor, type QualityTier } from './QualityGovernor';

// Constantes miroir du module (privées) pour piloter les seuils dans les tests.
const WINDOW = 60;
const DOWN_MS = 19;
const UP_MS = 12;
const _UP_HOLD_MS = 5000;
const _COOLDOWN_MS = 3000;

// Avance le gouverneur de `count` frames à un frame time constant.
function feed(g: QualityGovernor, ms: number, count: number): void {
  for (let i = 0; i < count; i++) g.frame(ms);
}

let logSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
  logSpy = spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
});

describe('QualityGovernor', () => {
  test('démarre au cran 0 (qualité max)', () => {
    const g = new QualityGovernor(() => {});
    expect(g.current()).toEqual({ dpr: 1.5, trailMax: 24, sporesOn: true });
  });

  test('ne change rien avant que la fenêtre soit pleine', () => {
    const onChange = mock<(t: QualityTier) => void>();
    const g = new QualityGovernor(onChange);
    // WINDOW-1 frames bien au-dessus du seuil de descente : pas assez de samples.
    feed(g, 100, WINDOW - 1);
    expect(onChange).not.toHaveBeenCalled();
    expect(g.current().dpr).toBe(1.5);
  });

  test('descend d’un cran quand la moyenne dépasse DOWN_MS', () => {
    const onChange = mock<(t: QualityTier) => void>();
    const g = new QualityGovernor(onChange);
    // Frame time assez grand pour que l'horloge cumulée dépasse le cooldown
    // initial (clock - lastChange=0 doit valoir >= COOLDOWN_MS).
    feed(g, 60, WINDOW); // clock = 3600 > 3000, avg=60 > DOWN_MS
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(g.current()).toEqual({ dpr: 1.25, trailMax: 24, sporesOn: true });
  });

  test('le cooldown initial bloque la descente tant que clock < COOLDOWN_MS', () => {
    const onChange = mock<(t: QualityTier) => void>();
    const g = new QualityGovernor(onChange);
    // WINDOW frames à 24ms : avg=24 > DOWN_MS mais clock=1440 < 3000 → bloqué.
    feed(g, DOWN_MS + 5, WINDOW);
    expect(onChange).not.toHaveBeenCalled();
    expect(g.current().dpr).toBe(1.5);
  });

  test('respecte le cooldown : pas de 2e descente immédiate après la 1ère', () => {
    const onChange = mock<(t: QualityTier) => void>();
    const g = new QualityGovernor(onChange);
    feed(g, 60, WINDOW); // 1ère descente, clock=3600
    expect(onChange).toHaveBeenCalledTimes(1);
    const before = g.current();
    // Petites frames lentes mais peu de temps cumulé → reste sous le cooldown.
    // 20 frames * 60ms = 1200ms < 3000ms après lastChange.
    feed(g, 60, 20);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(g.current()).toEqual(before);
  });

  test('descend de plusieurs crans une fois le cooldown écoulé', () => {
    const onChange = mock<(t: QualityTier) => void>();
    const g = new QualityGovernor(onChange);
    // Frame time énorme : chaque frame ajoute beaucoup d'horloge, on franchit
    // vite les cooldowns successifs.
    feed(g, 200, WINDOW); // 1ère descente, cran 1
    expect(g.current().dpr).toBe(1.25);
    feed(g, 200, 16); // +3200ms > COOLDOWN → 2e descente, cran 2
    expect(g.current().dpr).toBe(1.0);
    expect(g.current().sporesOn).toBe(true);
  });

  test('ne descend jamais sous le dernier cran', () => {
    const onChange = mock<(t: QualityTier) => void>();
    const g = new QualityGovernor(onChange);
    // Beaucoup de frames très lentes, largement de quoi épuiser les 4 crans.
    feed(g, 500, WINDOW + 4 * 30);
    const last = g.current();
    expect(last).toEqual({ dpr: 1.0, trailMax: 12, sporesOn: false });
    // Encore des frames lentes : reste au dernier cran, plus d'onChange.
    const calls = onChange.mock.calls.length;
    feed(g, 500, 30);
    expect(onChange.mock.calls.length).toBe(calls);
    expect(g.current()).toEqual(last);
  });

  test('ne remonte jamais au-dessus du cran 0', () => {
    const onChange = mock<(t: QualityTier) => void>();
    const g = new QualityGovernor(onChange);
    // Déjà au top : des frames rapides ne doivent rien faire.
    feed(g, UP_MS - 5, WINDOW + 200);
    expect(onChange).not.toHaveBeenCalled();
    expect(g.current().dpr).toBe(1.5);
  });

  test('remonte d’un cran après UP_HOLD_MS sous le seuil UP_MS', () => {
    const onChange = mock<(t: QualityTier) => void>();
    const g = new QualityGovernor(onChange);
    // Descente : frame time élevé.
    feed(g, 200, WINDOW);
    expect(g.current().dpr).toBe(1.25);
    onChange.mockClear();

    // Passe le cooldown SANS encore franchir UP_HOLD du goodSince.
    // Après la descente : clock = 60*200 = 12000, lastChange = goodSince = 12000.
    // Frames rapides : il faut COOLDOWN d'abord (goodSince suit clock pendant
    // cooldown), puis UP_HOLD au-dessus. On envoie largement de frames rapides.
    feed(g, UP_MS - 6, 2000); // beaucoup de temps cumulé sous le seuil
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(g.current().dpr).toBe(1.5); // remonté au cran 0
  });

  test('le minuteur de remontée ne court pas pendant le cooldown', () => {
    const onChange = mock<(t: QualityTier) => void>();
    const g = new QualityGovernor(onChange);
    feed(g, 200, WINDOW); // descente cran 1, clock=12000
    onChange.mockClear();

    // Frame time très petit pour rester DANS le cooldown un moment.
    // 5 frames * 1ms = 5ms : on est largement sous COOLDOWN_MS, goodSince=clock.
    feed(g, 1, 5);
    expect(onChange).not.toHaveBeenCalled();
    expect(g.current().dpr).toBe(1.25); // pas de remontée prématurée
  });

  test('une moyenne dans la zone neutre (UP_MS..DOWN_MS) ne change rien', () => {
    const onChange = mock<(t: QualityTier) => void>();
    const g = new QualityGovernor(onChange);
    feed(g, 200, WINDOW); // descend au cran 1
    onChange.mockClear();
    // 15ms : entre UP_MS (12) et DOWN_MS (19) → zone neutre.
    feed(g, 15, WINDOW + 100);
    expect(onChange).not.toHaveBeenCalled();
    expect(g.current().dpr).toBe(1.25);
  });

  test('le buffer circulaire ne garde que les WINDOW dernières frames', () => {
    const onChange = mock<(t: QualityTier) => void>();
    const g = new QualityGovernor(onChange);
    // Remplit avec des frames rapides (pas de descente, on est au top).
    feed(g, 1, WINDOW);
    expect(onChange).not.toHaveBeenCalled();
    // Une seule frame lente ne suffit pas à faire monter la moyenne au-dessus
    // de DOWN_MS (1 valeur lente diluée parmi 59 rapides).
    g.frame(1000);
    expect(onChange).not.toHaveBeenCalled();
    expect(g.current().dpr).toBe(1.5);
  });

  test('onChange reçoit bien le tier courant à chaque transition', () => {
    const received: QualityTier[] = [];
    const g = new QualityGovernor((t) => received.push(t));
    feed(g, 500, WINDOW); // cran 1 (window plein, clock=30000)
    // Après la 1ère descente lastChange=30000 ; il faut COOLDOWN(3000)/500=6
    // frames pour la 2e. 6 frames exactement → une seule descente de plus.
    feed(g, 500, 6); // cran 2
    expect(received).toEqual([
      { dpr: 1.25, trailMax: 24, sporesOn: true },
      { dpr: 1.0, trailMax: 24, sporesOn: true },
    ]);
  });
});
