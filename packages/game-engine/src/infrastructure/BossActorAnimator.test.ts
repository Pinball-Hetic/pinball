import { describe, it, expect } from 'bun:test';
import * as THREE from 'three';
import {
  BossActorAnimator,
  bossActorPulse,
  bossActorScale,
} from './BossActorAnimator';

describe('bossActorPulse', () => {
  it('is the base curve when not flashing', () => {
    const t = 1.3;
    const expected = 0.82 + Math.sin(t * 2.5) * 0.12;
    expect(bossActorPulse(t, 0)).toBeCloseTo(expected, 12);
  });

  it('boosts by 1.4x while hit-flashing', () => {
    const t = 0.7;
    const base = 0.82 + Math.sin(t * 2.5) * 0.12;
    expect(bossActorPulse(t, 0.1)).toBeCloseTo(base * 1.4, 12);
  });

  it('does not boost at exactly zero flash', () => {
    expect(bossActorPulse(0, 0)).toBeCloseTo(0.82, 12);
  });
});

describe('bossActorScale', () => {
  it('is 1 with no flash', () => {
    expect(bossActorScale(0)).toBe(1);
  });

  it('peaks at 1.2 at full flash duration', () => {
    expect(bossActorScale(0.18)).toBeCloseTo(1.2, 12);
  });

  it('lerps linearly mid-flash', () => {
    expect(bossActorScale(0.09)).toBeCloseTo(1.1, 12);
  });
});

const GLOW = { color: 0xff5533, distance: 0.38, decay: 2, y: 0.03 } as const;

function makeMixer(): THREE.AnimationMixer {
  const root = new THREE.Object3D();
  return new THREE.AnimationMixer(root);
}

function trackClip(name: string, times: number[]): THREE.AnimationClip {
  const track = new THREE.NumberKeyframeTrack(
    '.foo',
    times,
    times.map(() => 0),
  );
  return new THREE.AnimationClip(name, -1, [track]);
}

function makeActions(mixer: THREE.AnimationMixer) {
  return {
    mixer,
    idleAction: mixer.clipAction(trackClip('idle', [0, 1])),
    hitAction: mixer.clipAction(trackClip('hit', [0, 0.2])),
    victoryAction: mixer.clipAction(trackClip('victory', [0, 0.5])),
  };
}

describe('BossActorAnimator glow light', () => {
  it('createGlowLight uses the injected config', () => {
    const a = new BossActorAnimator(GLOW);
    const light = a.createGlowLight();
    expect(light).toBeInstanceOf(THREE.PointLight);
    expect(light.color.getHex()).toBe(0xff5533);
    expect(light.intensity).toBe(0);
    expect(light.distance).toBeCloseTo(0.38, 12);
    expect(light.position.y).toBeCloseTo(0.03, 12);
  });

  it('show attaches the glow to the anchor once (idempotent)', () => {
    const a = new BossActorAnimator(GLOW);
    const light = a.createGlowLight();
    const anchor = new THREE.Group();
    a.show(anchor);
    a.show(anchor);
    expect(anchor.children.filter((c) => c === light).length).toBe(1);
  });

  it('hide detaches the glow and zeroes its intensity', () => {
    const a = new BossActorAnimator(GLOW);
    const light = a.createGlowLight();
    const anchor = new THREE.Group();
    a.show(anchor);
    a.hide(anchor);
    expect(light.parent).toBeNull();
    expect(light.intensity).toBe(0);
  });
});

describe('BossActorAnimator anim state machine', () => {
  it('playHit only fires when idle+hit actions exist', () => {
    const a = new BossActorAnimator(GLOW);
    const mixer = makeMixer();
    a.setActions({ mixer, idleAction: null, hitAction: null, victoryAction: null });
    // no actions -> no throw, no running action
    expect(() => a.playHit()).not.toThrow();
  });

  it('playHit crossfades hit from idle and plays it', () => {
    const a = new BossActorAnimator(GLOW);
    const mixer = makeMixer();
    const actions = makeActions(mixer);
    a.setActions(actions);
    a.playHit();
    expect(actions.hitAction.isRunning()).toBe(true);
  });

  it('playVictory falls back to idle when no victory action', () => {
    const a = new BossActorAnimator(GLOW);
    const mixer = makeMixer();
    const idleAction = mixer.clipAction(trackClip('idle', [0, 1]));
    a.setActions({ mixer, idleAction, hitAction: null, victoryAction: null });
    a.playVictory();
    expect(idleAction.isRunning()).toBe(true);
  });

  it('playVictory plays the victory action', () => {
    const a = new BossActorAnimator(GLOW);
    const mixer = makeMixer();
    const actions = makeActions(mixer);
    a.setActions(actions);
    a.playVictory();
    expect(actions.victoryAction.isRunning()).toBe(true);
  });

  it('primeActions filters out null actions', () => {
    const a = new BossActorAnimator(GLOW);
    const mixer = makeMixer();
    const idleAction = mixer.clipAction(trackClip('idle', [0, 1]));
    a.setActions({ mixer, idleAction, hitAction: null, victoryAction: null });
    expect(a.primeActions()).toEqual([idleAction]);
  });
});

describe('BossActorAnimator update', () => {
  it('drives glow intensity and anchor scale from the pulse', () => {
    const a = new BossActorAnimator(GLOW);
    const light = a.createGlowLight();
    const mixer = makeMixer();
    a.setActions(makeActions(mixer));
    const anchor = new THREE.Group();
    a.show(anchor);
    a.update(0.05, anchor);
    expect(light.intensity).toBeCloseTo(0.42 * bossActorPulse(0.05, 0), 6);
    expect(anchor.scale.x).toBeCloseTo(bossActorScale(0), 6);
  });

  it('decays the hit flash over time and scales while flashing', () => {
    const a = new BossActorAnimator(GLOW);
    a.createGlowLight();
    const mixer = makeMixer();
    a.setActions(makeActions(mixer));
    const anchor = new THREE.Group();
    a.show(anchor);
    a.playHit();
    a.update(0.05, anchor); // hitFlash 0.18 -> 0.13
    expect(anchor.scale.x).toBeGreaterThan(1);
  });
});

// ── Régression : la pose de victoire ne doit pas contaminer le combat suivant ──
// `victoryAction` tourne en LoopOnce + clampWhenFinished : une fois finie, elle
// se fige sur sa dernière frame au lieu de s'arrêter — son poids reste dans le
// blend. Avant le fix, hide()/playIdle() ne l'arrêtaient jamais explicitement,
// donc le 2e combat démarrait avec la pose de victoire gelée mélangée à l'idle
// (Ganondorf bloqué dans une pose bizarre au lieu de repartir en idle propre).
function makeRotZClip(name: string, endValue: number): THREE.AnimationClip {
  const track = new THREE.NumberKeyframeTrack('.rotation[z]', [0, 1], [0, endValue]);
  return new THREE.AnimationClip(name, 1, [track]);
}

function step(mixer: THREE.AnimationMixer, seconds: number, dt = 1 / 60): void {
  let t = 0;
  while (t < seconds) {
    mixer.update(dt);
    t += dt;
  }
}

function setupVictoryLeakRig() {
  const root = new THREE.Object3D();
  const mixer = new THREE.AnimationMixer(root);
  const idleAction = mixer.clipAction(makeRotZClip('idle', 0.1));
  idleAction.setLoop(THREE.LoopRepeat, Infinity);
  const victoryAction = mixer.clipAction(makeRotZClip('victory', 2.0));
  victoryAction.setLoop(THREE.LoopOnce, 1);
  victoryAction.clampWhenFinished = true;

  const animator = new BossActorAnimator(GLOW);
  animator.setActions({ mixer, idleAction, hitAction: null, victoryAction });

  return { root, mixer, idleAction, victoryAction, animator };
}

describe('BossActorAnimator — victory pose does not leak into the next fight', () => {
  it('playIdle() after a finished victory produces a clean idle pose, not a blend', () => {
    const { root, mixer, animator } = setupVictoryLeakRig();

    animator.playIdle();
    step(mixer, 0.5);

    animator.playVictory();
    step(mixer, 3); // well past the 1s victory clip → finished & clamped

    // End of fight / game reset.
    animator.hide(root);
    // Next game: boss revealed again → show() → playIdle().
    animator.playIdle();
    step(mixer, 0.2); // let the 0.12s idle fade-in complete
    step(mixer, 0.25); // sample a clean quarter-second into the idle ramp

    // A contaminated blend (pre-fix behaviour) lands around rotZ ≈ 1.0+
    // (averaging idle's ~0.05 with victory's frozen 2.0). A clean idle pose
    // stays within the idle clip's own range [0, 0.1].
    expect(root.rotation.z).toBeGreaterThanOrEqual(0);
    expect(root.rotation.z).toBeLessThan(0.1);
  });
});

describe('BossActorAnimator reset', () => {
  it('reset(false) keeps the light disposable later but clears state', () => {
    const a = new BossActorAnimator(GLOW);
    a.createGlowLight();
    const mixer = makeMixer();
    a.setActions(makeActions(mixer));
    a.reset(false);
    expect(a.currentMixer).toBeNull();
    expect(a.idle).toBeNull();
    expect(a.primeActions()).toEqual([]);
  });

  it('reset(true) detaches the glow light', () => {
    const a = new BossActorAnimator(GLOW);
    const light = a.createGlowLight();
    const anchor = new THREE.Group();
    a.show(anchor);
    a.reset(true);
    expect(light.parent).toBeNull();
  });
});
