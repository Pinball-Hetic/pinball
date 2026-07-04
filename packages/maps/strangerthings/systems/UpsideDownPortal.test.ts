import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { UpsideDownPortal } from './UpsideDownPortal';
import { RETURN_PORTAL_REVEAL_DELAY_S } from './UpsideDownConstants';

// The opening state machine (`opening` / `revealing`) shares `revealT`.
// We verify that `update(dt)` advances `revealT` only ONCE per frame, in the
// right phase — without going through `setup()` (which requires a WebGL
// canvas via GlowSprite, unavailable under bun:test). So we wire the private
// state-machine fields directly; `update()` is null-safe on `world`
// (no sensor), materials and particles.
type PortalInternals = {
  revealT: number;
  opening: boolean;
  revealing: boolean;
  revealed: boolean;
  portalGroup: THREE.Group | null;
};

function primePortal(state: Partial<PortalInternals>): {
  portal: UpsideDownPortal;
  internals: PortalInternals;
} {
  const portal = new UpsideDownPortal();
  const internals = portal as unknown as PortalInternals;
  internals.portalGroup = new THREE.Group();
  Object.assign(internals, state);
  return { portal, internals };
}

describe('UpsideDownPortal.update revealT advance', () => {
  test('revealing phase advances revealT by exactly dt per frame', () => {
    const { portal, internals } = primePortal({
      revealing: true,
      revealed: true,
      revealT: 0,
    });

    const dt = 0.016;
    portal.update(dt);
    expect(internals.revealT).toBeCloseTo(dt, 9);
  });

  test('opening phase advances revealT by exactly dt per frame', () => {
    const { portal, internals } = primePortal({
      opening: true,
      revealed: false,
      revealT: 0,
    });

    const dt = 0.016;
    portal.update(dt);
    expect(internals.revealT).toBeCloseTo(dt, 9);
  });

  test('does not double-advance revealT when opening and revealing coincide', () => {
    // Regression guard: before the fix, both `if` branches advanced
    // `revealT` in the same frame (2·dt). The `else if` makes them mutually
    // exclusive → a single advance.
    const { portal, internals } = primePortal({
      opening: true,
      revealing: true,
      revealed: false,
      revealT: 0,
    });

    const dt = 0.02;
    portal.update(dt);
    expect(internals.revealT).toBeCloseTo(dt, 9);
  });
});

describe('UpsideDownPortal open idempotency', () => {
  // Defense in depth for the module fix: a defeated boss routes through
  // both `notifyBossDefeated` THEN `onGameEvent` (pre-fix). `tryOpenForBoss`
  // must stay idempotent — one opening, never two.
  type OpeningState = { opening: boolean; revealing: boolean; revealed: boolean };

  function opening(portal: UpsideDownPortal): OpeningState {
    return portal as unknown as OpeningState;
  }

  test('notifyBossDefeated then onGameEvent for same defeat opens once, après le délai', () => {
    const portal = new UpsideDownPortal();
    (portal as unknown as { portalGroup: THREE.Group }).portalGroup =
      new THREE.Group();

    // vecna: unlocksReturnPortal, requires alternateWorldActive.
    // Deferred reveal: nothing opens on the fatal hit (ball stuck to the boss).
    portal.notifyBossDefeated('vecna', true);
    expect(opening(portal).revealing).toBe(false);
    expect(opening(portal).revealed).toBe(false);

    // Second opening path (the bug): must neither open nor restart the delay.
    portal.onGameEvent({ type: 'BOSS_TARGET_HIT', bossId: 'vecna', hitCount: 10 });
    expect(opening(portal).revealed).toBe(false);

    // Run down the delay frame by frame → a single opening.
    for (let t = 0; t <= RETURN_PORTAL_REVEAL_DELAY_S; t += 0.1) portal.update(0.1);
    const afterDelay = { ...opening(portal) };
    expect(afterDelay.revealed).toBe(true);

    portal.onGameEvent({ type: 'BOSS_TARGET_HIT', bossId: 'vecna', hitCount: 10 });
    expect(opening(portal)).toEqual(afterDelay);
  });

  test('quitter le monde alternatif pendant le délai annule le reveal retour', () => {
    const portal = new UpsideDownPortal();
    (portal as unknown as { portalGroup: THREE.Group }).portalGroup =
      new THREE.Group();

    portal.notifyBossDefeated('vecna', true);
    portal.setUpsideDownActive(false);
    for (let t = 0; t <= RETURN_PORTAL_REVEAL_DELAY_S; t += 0.1) portal.update(0.1);
    expect(opening(portal).revealed).toBe(false);
    expect(opening(portal).revealing).toBe(false);
  });
});
