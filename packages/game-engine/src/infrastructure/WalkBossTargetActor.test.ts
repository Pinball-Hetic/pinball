import { describe, it, expect } from 'bun:test';
import * as THREE from 'three';
import {
  WalkBossTargetActor,
  type WalkBossActions,
  type WalkBossTargetActorConfig,
} from './WalkBossTargetActor';
import { surfaceYAtZ } from '../domain/PlayfieldGeometry';
import { walkBossPulse, walkBossScale } from './WalkBossPulse';

function trackClip(name: string, times: number[]): THREE.AnimationClip {
  const track = new THREE.NumberKeyframeTrack('.foo', times, times.map(() => 0));
  return new THREE.AnimationClip(name, -1, [track]);
}

function noopResolver(mixer: THREE.AnimationMixer): Omit<WalkBossActions, 'mixer'> {
  return {
    walkAction: mixer.clipAction(trackClip('walk', [0, 1])),
    fightIdleAction: mixer.clipAction(trackClip('idle', [0, 1])),
    hitAction: mixer.clipAction(trackClip('hit', [0, 0.2])),
    finisherAction: mixer.clipAction(trackClip('fin', [0, 0.5])),
  };
}

function makeConfig(overrides: Partial<WalkBossTargetActorConfig> = {}): WalkBossTargetActorConfig {
  return {
    logTag: 'Test',
    modelUrl: 'about:blank', // loadAsync rejects, caught internally
    spawn: { x: 0, z: -0.3 },
    target: { x: 0.1, z: 0.05 },
    footLift: 0.02,
    modelHeight: 0.2,
    floorClearance: 0.006,
    fitFrames: 8,
    yaw: 0,
    walkDuration: 2,
    settleFacing: 0.35,
    walkFadeOut: 0.2,
    emissive: { color: 0x775588, intensity: 0.72 },
    glow: { color: 0xbb88ff, distance: 0.62, decay: 2, y: 0.08, intensityBase: 0.72 },
    hitScaleBoost: 0.12,
    fightIdleMode: 'reuse-walk-frozen',
    resolveClips: noopResolver,
    ...overrides,
  };
}

function mount(actor: WalkBossTargetActor): THREE.Group {
  const parent = new THREE.Group();
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 1, 1);
  actor.mount(parent, camera);
  return parent;
}

describe('WalkBossTargetActor mount/dispose', () => {
  it('mounts an anchor + glow light and detaches on dispose', () => {
    const actor = new WalkBossTargetActor(makeConfig());
    const parent = mount(actor);
    // anchor holds a rig + glow light; parent holds the anchor
    expect(parent.children.length).toBe(1);
    const anchor = parent.children[0] as THREE.Group;
    const hasLight = anchor.children.some((c) => c instanceof THREE.PointLight);
    expect(hasLight).toBe(true);
    actor.dispose();
    expect(parent.children.length).toBe(0);
  });

  it('applies the configured glow color/distance', () => {
    const actor = new WalkBossTargetActor(makeConfig());
    const parent = mount(actor);
    const anchor = parent.children[0] as THREE.Group;
    const light = anchor.children.find((c): c is THREE.PointLight => c instanceof THREE.PointLight)!;
    expect(light.color.getHex()).toBe(0xbb88ff);
    expect(light.distance).toBeCloseTo(0.62, 12);
    expect(light.position.y).toBeCloseTo(0.08, 12);
    expect(light.intensity).toBe(0);
  });
});

describe('WalkBossTargetActor path placement', () => {
  it('setPathProgress(0) places the anchor at spawn on the tilted surface', () => {
    const cfg = makeConfig();
    const actor = new WalkBossTargetActor(cfg);
    const parent = mount(actor);
    const anchor = parent.children[0] as THREE.Group;
    actor.setPathProgress(0);
    expect(anchor.position.x).toBeCloseTo(cfg.spawn.x, 12);
    expect(anchor.position.z).toBeCloseTo(cfg.spawn.z, 12);
    expect(anchor.position.y).toBeCloseTo(surfaceYAtZ(cfg.spawn.z) + cfg.footLift, 12);
  });

  it('setPathProgress(1) places the anchor at the target', () => {
    const cfg = makeConfig();
    const actor = new WalkBossTargetActor(cfg);
    const parent = mount(actor);
    const anchor = parent.children[0] as THREE.Group;
    actor.setPathProgress(1);
    expect(anchor.position.x).toBeCloseTo(cfg.target.x, 12);
    expect(anchor.position.z).toBeCloseTo(cfg.target.z, 12);
  });

  it('clamps path progress into [0,1]', () => {
    const cfg = makeConfig();
    const actor = new WalkBossTargetActor(cfg);
    const parent = mount(actor);
    const anchor = parent.children[0] as THREE.Group;
    actor.setPathProgress(5);
    expect(anchor.position.x).toBeCloseTo(cfg.target.x, 12);
  });
});

describe('WalkBossTargetActor show/hide', () => {
  it('show makes the anchor visible, hide resets it', () => {
    const actor = new WalkBossTargetActor(makeConfig());
    const parent = mount(actor);
    const anchor = parent.children[0] as THREE.Group;
    actor.show();
    expect(anchor.visible).toBe(true);
    actor.hide();
    expect(anchor.visible).toBe(false);
    expect(anchor.scale.x).toBe(1);
    expect(anchor.rotation.z).toBe(0);
  });

  it('update is a no-op while hidden (no scale change)', () => {
    const actor = new WalkBossTargetActor(makeConfig());
    const parent = mount(actor);
    const anchor = parent.children[0] as THREE.Group;
    anchor.scale.setScalar(3);
    actor.update(0.1); // not visible
    expect(anchor.scale.x).toBe(3);
  });
});

describe('WalkBossTargetActor walk + settle lifecycle', () => {
  it('walks along the path over walkDuration and reports completion', () => {
    const cfg = makeConfig();
    const actor = new WalkBossTargetActor(cfg);
    const parent = mount(actor);
    const anchor = parent.children[0] as THREE.Group;
    actor.beginReveal();
    actor.show();
    actor.playWalk();
    expect(actor.isWalkPathComplete()).toBe(false);
    for (let i = 0; i < 40; i++) actor.update(0.06); // 2.4s > 2s
    expect(actor.isWalkPathComplete()).toBe(true);
    expect(anchor.position.x).toBeCloseTo(cfg.target.x, 6);
  });

  it('startSettle then updateSettle eventually completes', () => {
    const actor = new WalkBossTargetActor(makeConfig());
    mount(actor);
    actor.show();
    actor.playWalk();
    actor.startSettle();
    let done = false;
    for (let i = 0; i < 20 && !done; i++) done = actor.updateSettle(0.05);
    expect(done).toBe(true);
  });

  it('startSettle is ignored when not walking', () => {
    const actor = new WalkBossTargetActor(makeConfig());
    mount(actor);
    actor.show();
    // not walking -> settle immediately reports complete
    expect(actor.updateSettle(0.05)).toBe(true);
  });
});

describe('WalkBossTargetActor glow + scale pulse', () => {
  it('drives glow intensity and anchor scale from the walk-boss pulse', () => {
    const cfg = makeConfig();
    const actor = new WalkBossTargetActor(cfg);
    const parent = mount(actor);
    const anchor = parent.children[0] as THREE.Group;
    const light = anchor.children.find((c): c is THREE.PointLight => c instanceof THREE.PointLight)!;
    actor.show();
    actor.update(0.05);
    expect(light.intensity).toBeCloseTo(cfg.glow.intensityBase * walkBossPulse(0.05, 0), 6);
    expect(anchor.scale.x).toBeCloseTo(walkBossScale(0, cfg.hitScaleBoost), 6);
  });
});

// NOTE: playHit / playFinisher / enterFightIdle need a resolved mixer, which is
// only wired in the private loadModel→attachModel path (a real GLB load). That
// IO path is not exercised in a headless test (loadAsync rejects on about:blank),
// so we test the state-machine + fight-idle-mode behaviour by attaching the
// actor's mixer via the SAME clip-resolution contract the actor uses internally.
// This mirrors what attachModel does verbatim: build mixer, resolve actions,
// register the finished listener.
function attachTestModel(
  actor: WalkBossTargetActor,
  fightIdleMode: 'reuse-walk-frozen' | 'loop-idle',
  withFinisher = true,
): Omit<WalkBossActions, 'mixer'> {
  const mixer = new THREE.AnimationMixer(new THREE.Object3D());
  const walkAction = mixer.clipAction(trackClip('walk', [0, 1]));
  const fightIdleAction = mixer.clipAction(trackClip('idle', [0, 1]));
  const hitAction = mixer.clipAction(trackClip('hit', [0, 0.2]));
  const finisherAction = withFinisher ? mixer.clipAction(trackClip('fin', [0, 0.5])) : null;
  if (fightIdleMode === 'reuse-walk-frozen') {
    fightIdleAction.setLoop(THREE.LoopOnce, 1);
    fightIdleAction.clampWhenFinished = true;
  }
  const actions = { walkAction, fightIdleAction, hitAction, finisherAction };
  // Cast to reach the private wiring used by the real attachModel path.
  (actor as unknown as { mixer: THREE.AnimationMixer }).mixer = mixer;
  (actor as unknown as { walkAction: THREE.AnimationAction }).walkAction = walkAction;
  (actor as unknown as { fightIdleAction: THREE.AnimationAction }).fightIdleAction = fightIdleAction;
  (actor as unknown as { hitAction: THREE.AnimationAction }).hitAction = hitAction;
  (actor as unknown as { finisherAction: THREE.AnimationAction | null }).finisherAction = finisherAction;
  return actions;
}

describe('WalkBossTargetActor fight-idle modes', () => {
  it('reuse-walk-frozen freezes the fight idle action (paused)', () => {
    const actor = new WalkBossTargetActor(makeConfig({ fightIdleMode: 'reuse-walk-frozen' }));
    mount(actor);
    const actions = attachTestModel(actor, 'reuse-walk-frozen');
    actor.show();
    actor.playWalk();
    actor.startSettle();
    for (let i = 0; i < 20; i++) actor.updateSettle(0.05);
    expect(actions.fightIdleAction!.paused).toBe(true);
  });

  it('loop-idle keeps the fight idle action running (not paused)', () => {
    const actor = new WalkBossTargetActor(makeConfig({ fightIdleMode: 'loop-idle' }));
    mount(actor);
    const actions = attachTestModel(actor, 'loop-idle');
    actor.show();
    actor.playWalk();
    actor.startSettle();
    for (let i = 0; i < 20; i++) actor.updateSettle(0.05);
    expect(actions.fightIdleAction!.paused).toBe(false);
    expect(actions.fightIdleAction!.isRunning()).toBe(true);
  });
});

describe('WalkBossTargetActor hit + finisher', () => {
  it('playHit crossfades hit from the fight idle', () => {
    const actor = new WalkBossTargetActor(makeConfig({ fightIdleMode: 'loop-idle' }));
    mount(actor);
    const actions = attachTestModel(actor, 'loop-idle');
    actor.show();
    actor.playHit();
    expect(actions.hitAction!.isRunning()).toBe(true);
  });

  it('playFinisher plays the finisher action', () => {
    const actor = new WalkBossTargetActor(makeConfig({ fightIdleMode: 'loop-idle' }));
    mount(actor);
    const actions = attachTestModel(actor, 'loop-idle');
    actor.show();
    actor.playFinisher();
    expect(actions.finisherAction!.isRunning()).toBe(true);
  });

  it('playFinisher falls back to fight idle when no finisher action', () => {
    const actor = new WalkBossTargetActor(makeConfig({ fightIdleMode: 'loop-idle' }));
    mount(actor);
    const actions = attachTestModel(actor, 'loop-idle', false);
    actor.show();
    actor.playFinisher();
    expect(actions.fightIdleAction!.isRunning()).toBe(true);
  });
});
