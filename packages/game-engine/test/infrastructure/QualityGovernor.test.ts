import { test, expect, describe, mock, beforeEach, afterEach, spyOn } from 'bun:test';
import { QualityGovernor, type QualityTier } from '../../src/infrastructure/QualityGovernor';

// Module constants mirrored (private) to drive the thresholds in tests.
const WINDOW = 60;
const DOWN_MS = 19;
const UP_MS = 12;
const _UP_HOLD_MS = 5000;
const _COOLDOWN_MS = 3000;

// Advance the governor by `count` frames at a constant frame time.
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
    // WINDOW-1 frames well above the down threshold: not enough samples.
    feed(g, 100, WINDOW - 1);
    expect(onChange).not.toHaveBeenCalled();
    expect(g.current().dpr).toBe(1.5);
  });

  test('descend d’un cran quand la moyenne dépasse DOWN_MS', () => {
    const onChange = mock<(t: QualityTier) => void>();
    const g = new QualityGovernor(onChange);
    // Frame time large enough that the accumulated clock passes the initial
    // cooldown (clock - lastChange=0 must be >= COOLDOWN_MS).
    feed(g, 60, WINDOW); // clock = 3600 > 3000, avg=60 > DOWN_MS
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(g.current()).toEqual({ dpr: 1.25, trailMax: 24, sporesOn: true });
  });

  test('le cooldown initial bloque la descente tant que clock < COOLDOWN_MS', () => {
    const onChange = mock<(t: QualityTier) => void>();
    const g = new QualityGovernor(onChange);
    // WINDOW frames at 24ms: avg=24 > DOWN_MS but clock=1440 < 3000 → blocked.
    feed(g, DOWN_MS + 5, WINDOW);
    expect(onChange).not.toHaveBeenCalled();
    expect(g.current().dpr).toBe(1.5);
  });

  test('respecte le cooldown : pas de 2e descente immédiate après la 1ère', () => {
    const onChange = mock<(t: QualityTier) => void>();
    const g = new QualityGovernor(onChange);
    feed(g, 60, WINDOW); // 1st downgrade, clock=3600
    expect(onChange).toHaveBeenCalledTimes(1);
    const before = g.current();
    // Small slow frames but little accumulated time → stays under the cooldown.
    // 20 frames * 60ms = 1200ms < 3000ms after lastChange.
    feed(g, 60, 20);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(g.current()).toEqual(before);
  });

  test('descend de plusieurs crans une fois le cooldown écoulé', () => {
    const onChange = mock<(t: QualityTier) => void>();
    const g = new QualityGovernor(onChange);
    // Huge frame time: each frame adds a lot of clock, so we cross successive
    // cooldowns quickly.
    feed(g, 200, WINDOW); // 1st downgrade, tier 1
    expect(g.current().dpr).toBe(1.25);
    feed(g, 200, 16); // +3200ms > COOLDOWN → 2nd downgrade, tier 2
    expect(g.current().dpr).toBe(1.0);
    expect(g.current().sporesOn).toBe(true);
  });

  test('ne descend jamais sous le dernier cran', () => {
    const onChange = mock<(t: QualityTier) => void>();
    const g = new QualityGovernor(onChange);
    // Many very slow frames, plenty to exhaust all 6 tiers.
    feed(g, 500, WINDOW + 6 * 30);
    const last = g.current();
    expect(last).toEqual({ dpr: 0.7, trailMax: 8, sporesOn: false });
    // More slow frames: stays at the last tier, no more onChange.
    const calls = onChange.mock.calls.length;
    feed(g, 500, 30);
    expect(onChange.mock.calls.length).toBe(calls);
    expect(g.current()).toEqual(last);
  });

  test('ne remonte jamais au-dessus du cran 0', () => {
    const onChange = mock<(t: QualityTier) => void>();
    const g = new QualityGovernor(onChange);
    // Already at the top: fast frames must do nothing.
    feed(g, UP_MS - 5, WINDOW + 200);
    expect(onChange).not.toHaveBeenCalled();
    expect(g.current().dpr).toBe(1.5);
  });

  test('remonte d’un cran après UP_HOLD_MS sous le seuil UP_MS', () => {
    const onChange = mock<(t: QualityTier) => void>();
    const g = new QualityGovernor(onChange);
    // Downgrade: high frame time.
    feed(g, 200, WINDOW);
    expect(g.current().dpr).toBe(1.25);
    onChange.mockClear();

    // Pass the cooldown WITHOUT yet crossing UP_HOLD from goodSince.
    // After the downgrade: clock = 60*200 = 12000, lastChange = goodSince = 12000.
    // Fast frames: need COOLDOWN first (goodSince tracks clock during cooldown),
    // then UP_HOLD above it. We send plenty of fast frames.
    feed(g, UP_MS - 6, 2000); // lots of accumulated time under the threshold
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(g.current().dpr).toBe(1.5); // upgraded back to tier 0
  });

  test('le minuteur de remontée ne court pas pendant le cooldown', () => {
    const onChange = mock<(t: QualityTier) => void>();
    const g = new QualityGovernor(onChange);
    feed(g, 200, WINDOW); // downgrade tier 1, clock=12000
    onChange.mockClear();

    // Very small frame time to stay INSIDE the cooldown for a while.
    // 5 frames * 1ms = 5ms: well under COOLDOWN_MS, goodSince=clock.
    feed(g, 1, 5);
    expect(onChange).not.toHaveBeenCalled();
    expect(g.current().dpr).toBe(1.25); // no premature upgrade
  });

  test('une moyenne dans la zone neutre (UP_MS..DOWN_MS) ne change rien', () => {
    const onChange = mock<(t: QualityTier) => void>();
    const g = new QualityGovernor(onChange);
    feed(g, 200, WINDOW); // downgrade to tier 1
    onChange.mockClear();
    // 15ms: between UP_MS (12) and DOWN_MS (19) → neutral zone.
    feed(g, 15, WINDOW + 100);
    expect(onChange).not.toHaveBeenCalled();
    expect(g.current().dpr).toBe(1.25);
  });

  test('le buffer circulaire ne garde que les WINDOW dernières frames', () => {
    const onChange = mock<(t: QualityTier) => void>();
    const g = new QualityGovernor(onChange);
    // Fill with fast frames (no downgrade, we're at the top).
    feed(g, 1, WINDOW);
    expect(onChange).not.toHaveBeenCalled();
    // A single slow frame isn't enough to push the average above DOWN_MS
    // (1 slow value diluted among 59 fast ones).
    g.frame(1000);
    expect(onChange).not.toHaveBeenCalled();
    expect(g.current().dpr).toBe(1.5);
  });

  test('onChange reçoit bien le tier courant à chaque transition', () => {
    const received: QualityTier[] = [];
    const g = new QualityGovernor((t) => received.push(t));
    feed(g, 500, WINDOW); // tier 1 (window full, clock=30000)
    // After the 1st downgrade lastChange=30000; the 2nd needs COOLDOWN(3000)/500=6
    // frames. Exactly 6 frames → one more downgrade.
    feed(g, 500, 6); // tier 2
    expect(received).toEqual([
      { dpr: 1.25, trailMax: 24, sporesOn: true },
      { dpr: 1.0, trailMax: 24, sporesOn: true },
    ]);
  });
});
