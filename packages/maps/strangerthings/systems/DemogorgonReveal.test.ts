import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import * as THREE from 'three';
import type { GameEvent } from '@pinball/game-engine';
import { getBossDefinition } from '../bosses';
import type { DemogorgonReveal as DemogorgonRevealType } from './DemogorgonReveal';

// No happy-dom in this package. DemogorgonReveal mounts a CameraBillboardSprite
// whose THREE.TextureLoader touches document/Image. Stub the minimum so the
// texture load fails gracefully (error path resolves to null) instead of
// throwing an unhandled ReferenceError between tests.
type G = {
  document?: { createElement: (t: string) => unknown; createElementNS: (ns: string, t: string) => unknown };
  Image?: unknown;
};
const g = globalThis as G;
if (typeof g.document === 'undefined') {
  const stubEl = () => {
    const listeners: Record<string, Array<() => void>> = {};
    return {
      width: 0,
      height: 0,
      style: {},
      setAttribute: () => {},
      removeAttribute: () => {},
      addEventListener: (type: string, cb: () => void) => {
        (listeners[type] ??= []).push(cb);
        // ImageLoader waits for load/error; simulate a failed decode so its
        // error path runs and resolves (loader catch → texture null).
        if (type === 'error') queueMicrotask(() => cb());
      },
      removeEventListener: () => {},
      getContext: () => ({
        createRadialGradient: () => ({ addColorStop: () => {} }),
        fillRect: () => {},
        drawImage: () => {},
        getImageData: () => ({ data: [] }),
        fillStyle: undefined,
      }),
      set src(_v: string) {},
    };
  };
  g.document = { createElement: stubEl, createElementNS: stubEl };
}
if (typeof g.Image === 'undefined') {
  g.Image = class {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_v: string) {
      queueMicrotask(() => this.onerror?.());
    }
  };
}

// Importe APRES le stub (le loader de texture est touché au mount).
const { DemogorgonReveal } = await import('./DemogorgonReveal');

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
  // Bug d'origine : bille drainée (gameState 'idle'), combat encore actif →
  // l'assist Eleven continuait d'émettre ASSIST (+100) toutes les ~4 s.
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
    reveal.update(REVEAL + 0.001); // → flicker, assist armé
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
