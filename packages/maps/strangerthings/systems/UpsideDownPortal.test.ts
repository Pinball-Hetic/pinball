import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { UpsideDownPortal } from './UpsideDownPortal';
import { RETURN_PORTAL_REVEAL_DELAY_S } from './UpsideDownConstants';

// Le state machine d'ouverture (`opening` / `revealing`) partage `revealT`.
// On vérifie ici que `update(dt)` n'avance `revealT` qu'UNE fois par frame,
// dans la bonne phase — sans passer par `setup()` (qui exige un canvas WebGL
// via GlowSprite, indisponible sous bun:test). On câble donc directement les
// champs privés pilotés par le state machine ; `update()` est null-safe sur
// `world` (pas de sensor), les matériaux et les particules.
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
    // Garde de régression : avant le fix, les deux branches `if` avançaient
    // `revealT` du même frame (2·dt). Le `else if` les rend mutuellement
    // exclusives → un seul avancement.
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
  // Défense en profondeur du fix module : un boss vaincu route à la fois par
  // `notifyBossDefeated` PUIS `onGameEvent` (avant fix). `tryOpenForBoss` doit
  // rester idempotent — une seule ouverture, jamais deux.
  type OpeningState = { opening: boolean; revealing: boolean; revealed: boolean };

  function opening(portal: UpsideDownPortal): OpeningState {
    return portal as unknown as OpeningState;
  }

  test('notifyBossDefeated then onGameEvent for same defeat opens once, après le délai', () => {
    const portal = new UpsideDownPortal();
    (portal as unknown as { portalGroup: THREE.Group }).portalGroup =
      new THREE.Group();

    // vecna : unlocksReturnPortal, requiert alternateWorldActive.
    // Reveal différé : rien ne s'ouvre au coup fatal (bille collée au boss).
    portal.notifyBossDefeated('vecna', true);
    expect(opening(portal).revealing).toBe(false);
    expect(opening(portal).revealed).toBe(false);

    // Second chemin d'ouverture (le bug) : ne doit ni ouvrir ni relancer le délai.
    portal.onGameEvent({ type: 'BOSS_TARGET_HIT', bossId: 'vecna', hitCount: 10 });
    expect(opening(portal).revealed).toBe(false);

    // Écoule le délai frame par frame → une seule ouverture.
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
