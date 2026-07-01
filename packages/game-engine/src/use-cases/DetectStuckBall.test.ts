import { test, expect, describe, beforeEach } from 'bun:test';
import { StuckBallDetector } from './DetectStuckBall';

// Position centrée par défaut (x = 0 → nudge vers +X).
const center = { x: 0 };

describe('StuckBallDetector', () => {
  let detector: StuckBallDetector;

  beforeEach(() => {
    detector = new StuckBallDetector();
  });

  test('returns null while the ball is moving (speed >= 0.02)', () => {
    expect(detector.update(0.5, center, 0.5)).toBeNull();
    // Même après un long dt, une balle rapide ne déclenche rien.
    expect(detector.update(0.02, center, 10)).toBeNull();
  });

  test('returns null when slow but timer not yet over 1.0s', () => {
    expect(detector.update(0.01, center, 0.5)).toBeNull();
    expect(detector.update(0.01, center, 0.4)).toBeNull(); // timer = 0.9
  });

  test('does not trigger exactly at timer === 1.0 (strict >)', () => {
    expect(detector.update(0.01, center, 1.0)).toBeNull(); // timer = 1.0, pas > 1.0
  });

  test('emits a nudge once the slow timer exceeds 1.0s', () => {
    const result = detector.update(0.01, center, 1.01);
    expect(result).toEqual({
      type: 'nudge',
      impulse: { x: 0.08, y: 0.02, z: 0.12 },
    });
  });

  test('nudge direction depends on ball X sign', () => {
    const right = detector.update(0.01, { x: 0.5 }, 1.01);
    expect(right!.impulse!.x).toBe(-0.08); // x > 0 → pousse vers -X

    const left = new StuckBallDetector().update(0.01, { x: -0.5 }, 1.01);
    expect(left!.impulse!.x).toBe(0.08); // x <= 0 → pousse vers +X
  });

  test('x === 0 nudges toward +X (boundary)', () => {
    const result = detector.update(0.01, { x: 0 }, 1.01);
    expect(result!.impulse!.x).toBe(0.08);
  });

  test('resets the timer between nudges (each nudge needs its own >1s)', () => {
    // 1er nudge
    expect(detector.update(0.01, center, 1.01)!.type).toBe('nudge');
    // Timer remis à zéro → un petit dt ne redéclenche pas.
    expect(detector.update(0.01, center, 0.5)).toBeNull();
    // 2e nudge après un nouveau dépassement.
    expect(detector.update(0.01, center, 0.6)!.type).toBe('nudge');
  });

  test('force_drain on the 3rd nudge', () => {
    expect(detector.update(0.01, center, 1.01)!.type).toBe('nudge'); // 1
    expect(detector.update(0.01, center, 1.01)!.type).toBe('nudge'); // 2
    const third = detector.update(0.01, center, 1.01); // 3
    expect(third).toEqual({ type: 'force_drain' });
    expect(third!.impulse).toBeUndefined();
  });

  test('nudge cycle restarts after a force_drain', () => {
    detector.update(0.01, center, 1.01); // nudge 1
    detector.update(0.01, center, 1.01); // nudge 2
    expect(detector.update(0.01, center, 1.01)!.type).toBe('force_drain'); // 3 → reset count
    // Compteur remis à zéro : on repart sur un nudge.
    expect(detector.update(0.01, center, 1.01)!.type).toBe('nudge');
  });

  test('a ball that actually drifts away resets timer and nudge count', () => {
    detector.update(0.01, center, 1.01); // nudge 1
    detector.update(0.01, center, 1.01); // nudge 2 (count = 2)
    // Vitesse élevée ET position qui s'éloigne réellement de l'ancre → la
    // balle s'est vraiment dégagée, pas juste un rebond sur place.
    detector.update(0.5, { x: 0.5, z: 0.5 }, 0.1);
    // count repart de 0 : il faut 3 nouveaux nudges avant force_drain.
    expect(detector.update(0.01, center, 1.01)!.type).toBe('nudge'); // 1
    expect(detector.update(0.01, center, 1.01)!.type).toBe('nudge'); // 2
    expect(detector.update(0.01, center, 1.01)!.type).toBe('force_drain');
  });

  test('a velocity spike WITHOUT real positional drift does not reset (stuck-in-pocket case)', () => {
    // Reproduit le bug : une balle coincée dans une poche peut rebondir
    // contre les parois (pic de vitesse instantané) sans jamais s'éloigner
    // réellement de l'endroit où elle est bloquée. Le minuteur doit continuer
    // à s'accumuler dans ce cas, sinon la balle ne se dégage jamais.
    detector.update(0.01, center, 0.5); // timer = 0.5, ancre posée en (0,0)
    detector.update(0.5, { x: 0.005, z: 0 }, 0.1); // rebond, mais dans STUCK_RADIUS → timer = 0.6
    // timer = 0.6 + 0.5 = 1.1 > 1.0 → le dégagement se déclenche malgré le
    // pic de vitesse intermédiaire.
    expect(detector.update(0.01, center, 0.5)!.type).toBe('nudge');
  });

  test('nudge strength escalates on repeated failed attempts', () => {
    const first = detector.update(0.01, center, 1.01);
    expect(first).toEqual({ type: 'nudge', impulse: { x: 0.08, y: 0.02, z: 0.12 } });
    const second = detector.update(0.01, center, 1.01);
    expect(second).toEqual({ type: 'nudge', impulse: { x: 0.14, y: 0.05, z: 0.2 } });
  });

  test('reset() clears timer and nudge count', () => {
    detector.update(0.01, center, 1.01); // nudge 1
    detector.update(0.01, center, 0.9); // timer = 0.9
    detector.reset();
    // Timer effacé : 0.9 + 0.2 = 1.1 n'aurait déclenché qu'avant reset.
    expect(detector.update(0.01, center, 0.2)).toBeNull(); // timer = 0.2
    // Et le compteur de nudge est aussi à zéro → prochain nudge n'est pas le force_drain.
    expect(detector.update(0.01, center, 1.0)!.type).toBe('nudge');
  });

  test('accumulates dt across multiple slow frames', () => {
    expect(detector.update(0.01, center, 0.4)).toBeNull(); // 0.4
    expect(detector.update(0.01, center, 0.4)).toBeNull(); // 0.8
    expect(detector.update(0.01, center, 0.3)!.type).toBe('nudge'); // 1.1 > 1.0
  });
});
