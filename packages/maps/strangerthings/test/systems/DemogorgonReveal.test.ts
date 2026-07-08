import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import * as THREE from 'three';
import type { GameEvent } from '@pinball/game-engine';
import { getBossDefinition } from '../../bosses';
import type { DemogorgonReveal as DemogorgonRevealType } from '../../systems/DemogorgonReveal';
import { installDomStub } from '../../systems/testDomStub';

// DemogorgonReveal mounts a CameraBillboardSprite whose THREE.TextureLoader
// touches document/Image. Install the stub before importing the SUT.
installDomStub();

// Import AFTER the stub (the texture loader is touched at mount).
const { DemogorgonReveal } = await import('../../systems/DemogorgonReveal');

const BLACKOUT = 0.12;
const REVEAL = 0.5;

const REVEAL_EVENT: GameEvent = { type: 'BOSS_REVEAL', bossId: 'demogorgon' };

type Internals = {
  machine: { getPhase: () => string };
  targetRingMat: THREE.MeshStandardMaterial | null;
  targetCoreMat: THREE.MeshStandardMaterial | null;
  targetLight: THREE.PointLight | null;
};

function asInternals(reveal: DemogorgonRevealType): Internals {
  return reveal as unknown as Internals;
}

// Drive blackout → reveal → flicker so BOSS_TARGET_HIT is accepted, then dirty
// the target materials by ticking a frame of the victory animation.
function driveToDirtyVictoryMaterials(reveal: DemogorgonRevealType): void {
  reveal.onGameEvent(REVEAL_EVENT); // idle → blackout
  reveal.update(BLACKOUT + 0.001); // blackout → reveal
  reveal.update(REVEAL + 0.001); // reveal → flicker
  const targetHits = getBossDefinition('demogorgon').targetHits;
  reveal.onGameEvent({ type: 'BOSS_TARGET_HIT', bossId: 'demogorgon', hitCount: targetHits }); // → victory
  reveal.update(0.05); // updateVictoryAnim mutates ring/core/light off their base values
}

describe('DemogorgonReveal resetTargetMaterials (regression)', () => {
  let reveal: DemogorgonRevealType;
  let root: THREE.Group;
  let scene: THREE.Scene;
  let camera: THREE.Camera;

  beforeEach(() => {
    reveal = new DemogorgonReveal();
    root = new THREE.Group();
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera();
    reveal.setup({ root, scene, camera, garlandLights: null, bumperVisuals: null });
  });

  afterEach(() => {
    reveal.dispose();
  });

  test('reset restores materials to the boss definition theme (not stale hardcoded values)', () => {
    const theme = getBossDefinition('demogorgon').targetMeshTheme;
    driveToDirtyVictoryMaterials(reveal);

    reveal.endFight(); // → resetAtmosphere → resetTargetMaterials

    const { targetRingMat, targetCoreMat, targetLight } = asInternals(reveal);
    expect(targetRingMat?.emissive.getHex()).toBe(theme.ring.emissive);
    expect(targetRingMat?.emissiveIntensity).toBe(theme.ring.emissiveIntensity);
    expect(targetRingMat?.color.getHex()).toBe(theme.ring.color);
    expect(targetCoreMat?.emissive.getHex()).toBe(theme.core.emissive);
    expect(targetCoreMat?.emissiveIntensity).toBe(theme.core.emissiveIntensity);
    expect(targetCoreMat?.color.getHex()).toBe(theme.core.color);
    expect(targetLight?.color.getHex()).toBe(theme.light.color);
    expect(targetLight?.intensity).toBe(theme.light.intensity);
  });

  test('reset re-derives from the definition — tracks it if the theme changes', () => {
    // Divergence guard: a hardcoded reset would ignore this mutation and go
    // stale. Reading from getBossDefinition keeps them in lock-step.
    const ring = getBossDefinition('demogorgon').targetMeshTheme.ring;
    const originalEmissive = ring.emissive;
    const originalColor = ring.color;
    ring.emissive = 0x123456;
    ring.color = 0x654321;

    try {
      driveToDirtyVictoryMaterials(reveal);
      reveal.endFight();

      const { targetRingMat } = asInternals(reveal);
      expect(targetRingMat?.emissive.getHex()).toBe(0x123456);
      expect(targetRingMat?.color.getHex()).toBe(0x654321);
    } finally {
      ring.emissive = originalEmissive;
      ring.color = originalColor;
    }
  });
});

describe('DemogorgonReveal assist gate hors playing (regression score gratuit)', () => {
  // Original bug: ball drained (gameState 'idle'), fight still active →
  // the Eleven assist kept emitting ASSIST (+100) every ~4 s.
  function makeReveal(isPlaying: () => boolean) {
    const reveal = new DemogorgonReveal();
    const emitted: GameEvent[] = [];
    reveal.setup({
      root: new THREE.Group(),
      scene: new THREE.Scene(),
      camera: new THREE.PerspectiveCamera(),
      garlandLights: null,
      bumperVisuals: null,
      isPlaying,
    });
    reveal.setEmit((e) => emitted.push(e));
    reveal.onGameEvent(REVEAL_EVENT);
    reveal.update(BLACKOUT + 0.001);
    reveal.update(REVEAL + 0.001); // → flicker, assist armed
    return { reveal, emitted };
  }

  test("n'émet aucun ASSIST quand isPlaying() est false", () => {
    const { reveal, emitted } = makeReveal(() => false);
    for (let i = 0; i < 100; i++) reveal.update(0.1); // 10 s hors playing
    expect(emitted.filter((e) => e.type === 'ASSIST')).toHaveLength(0);
    reveal.dispose();
  });

  test('émet ASSIST normalement quand isPlaying() est true', () => {
    const { reveal, emitted } = makeReveal(() => true);
    reveal.update(0.6); // > ELEVEN_ASSIST_FIRST (0.55)
    expect(emitted.filter((e) => e.type === 'ASSIST')).toHaveLength(1);
    reveal.dispose();
  });
});
