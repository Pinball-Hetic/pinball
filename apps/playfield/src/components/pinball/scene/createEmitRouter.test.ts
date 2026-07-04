import { describe, expect, it } from "bun:test";
import * as THREE from "three";
import type {
  BallDiagnostics,
  BossDefinition,
  BottomOutBall,
  DrainBall,
  CollisionEventProcessor,
  GameEvent,
  MapLayout,
  MapModule,
  ScreenShake,
  ShooterLaneGate,
} from "@pinball/game-engine";
import type { GameState } from "@/hooks/useGameState";
import type { PlayfieldCameraRig } from "./PlayfieldCameraRig";
import type { DmdOrchestrator } from "@/hooks/useDmdOrchestrator";
import { createEmitRouter, type EmitRouterDeps } from "./createEmitRouter";

// Spies keyed on the exact methods the router calls. Cast via `unknown` to the
// real interface types — no `any`, and only the touched surface is stubbed.
function makeDeps(overrides?: {
  gameState?: GameState;
  bosses?: BossDefinition[];
  dropTargets?: MapLayout["dropTargets"];
  root?: THREE.Object3D | null;
  persistence?: "until_game_over" | "until_drain";
}) {
  const calls = {
    baseEmit: [] as GameEvent[],
    onPreDrain: [] as number[],
    onGameEvent: [] as GameEvent[],
    tryAllBossReveals: 0,
    resetAllBossFights: 0,
    resetScoreBaselines: 0,
    resetPortalTrigger: 0,
    directorPlay: [] as string[],
    directorPlayVictory: [] as string[],
    restoreBoss: 0,
    screenShake: [] as number[],
    diagEvents: [] as string[],
    diagResets: [] as string[],
    pushCinematic: [] as string[],
    bottomOutResetLatch: 0,
    drainResetLatch: 0,
    laneOpen: 0,
    releaseAlternateWorld: 0,
  };

  const collisionProcessor = {
    tryAllBossReveals: () => { calls.tryAllBossReveals++; },
    resetAllBossFights: () => { calls.resetAllBossFights++; },
    resetScoreBaselines: () => { calls.resetScoreBaselines++; },
    resetPortalTrigger: () => { calls.resetPortalTrigger++; },
  } as unknown as CollisionEventProcessor;

  const cameraRig = {
    restoreBoss: () => { calls.restoreBoss++; },
    director: {
      play: (id: string) => { calls.directorPlay.push(id); },
      playVictory: (id: string) => { calls.directorPlayVictory.push(id); },
    },
  } as unknown as PlayfieldCameraRig;

  const dmd = {
    pushCinematic: (clip: string) => { calls.pushCinematic.push(clip); },
  } as unknown as DmdOrchestrator;

  const screenShake = {
    add: (n: number) => { calls.screenShake.push(n); },
  } as unknown as ScreenShake;

  const diag = {
    noteEvent: (t: string) => { calls.diagEvents.push(t); },
    noteReset: (t: string) => { calls.diagResets.push(t); },
  } as unknown as BallDiagnostics;

  const shooterLaneGate = {
    open: () => { calls.laneOpen++; },
  } as unknown as ShooterLaneGate;

  const bottomOutBallUC = {
    resetLatch: () => { calls.bottomOutResetLatch++; },
  } as unknown as BottomOutBall;

  const drainBallUC = {
    resetLatch: () => { calls.drainResetLatch++; },
  } as unknown as DrainBall;

  const mapModule = {
    onPreDrain: (lives: number) => { calls.onPreDrain.push(lives); },
    onGameEvent: (e: GameEvent) => { calls.onGameEvent.push(e); },
  } as unknown as MapModule;

  const mapLayout = {
    dropTargets: overrides?.dropTargets ?? [],
  } as unknown as MapLayout;

  const deps: EmitRouterDeps = {
    baseEmit: (e) => { calls.baseEmit.push(e); },
    mapModule,
    getCollisionProcessor: () => collisionProcessor,
    cameraRig,
    dmd,
    screenShake,
    diag,
    getShooterLaneGate: () => shooterLaneGate,
    getPlayfieldRoot: () => overrides?.root ?? null,
    mapLayout,
    mapBosses: overrides?.bosses ?? [],
    getBottomOutBallUC: () => bottomOutBallUC,
    getDrainBallUC: () => drainBallUC,
    releaseAlternateWorld: () => { calls.releaseAlternateWorld++; },
    livesRef: { current: 3 },
    gameStateRef: { current: overrides?.gameState ?? "playing" },
    scoreRef: { current: 1000 },
    ALTERNATE_WORLD_PERSISTENCE: overrides?.persistence ?? "until_game_over",
  };

  return { emit: createEmitRouter(deps), calls };
}

function bossFixture(id: string, targetHits: number): BossDefinition {
  return { id, targetHits } as unknown as BossDefinition;
}

describe("createEmitRouter — routing verbatim", () => {
  it("always forwards to baseEmit, mapModule.onGameEvent, and diag.noteEvent", () => {
    const { emit, calls } = makeDeps();
    const ev: GameEvent = { type: "BALL_LAUNCHED" };
    emit(ev);
    expect(calls.baseEmit).toEqual([ev]);
    expect(calls.onGameEvent).toEqual([ev]);
    expect(calls.diagEvents).toEqual(["BALL_LAUNCHED"]);
  });

  it("calls onPreDrain BEFORE baseEmit on DRAIN/BOTTOM_OUT with pre-decrement lives", () => {
    const { emit, calls } = makeDeps();
    emit({ type: "DRAIN" });
    expect(calls.onPreDrain).toEqual([3]);
    emit({ type: "BOTTOM_OUT" });
    expect(calls.onPreDrain).toEqual([3, 3]);
  });

  it("triggers boss reveals only for scoring events while playing", () => {
    const playing = makeDeps({ gameState: "playing" });
    playing.emit({ type: "BUMPER_HIT", bumperIndex: 0, scoreIncrement: 10 });
    expect(playing.calls.tryAllBossReveals).toBe(1);

    const over = makeDeps({ gameState: "game_over" });
    over.emit({ type: "BUMPER_HIT", bumperIndex: 0, scoreIncrement: 10 });
    expect(over.calls.tryAllBossReveals).toBe(0);

    const noScore = makeDeps({ gameState: "playing" });
    noScore.emit({ type: "DROP_TARGET_RESET" });
    expect(noScore.calls.tryAllBossReveals).toBe(0);
  });
});

describe("createEmitRouter — screen shake per event", () => {
  it("maps each juice event to its verbatim amount", () => {
    const cases: Array<[GameEvent, number]> = [
      [{ type: "BUMPER_HIT", bumperIndex: 0, scoreIncrement: 1 }, 0.25],
      [{ type: "SLINGSHOT_HIT", side: "left", scoreIncrement: 1 }, 0.2],
      [{ type: "DROP_TARGET_HIT", targetId: "drop_a", scoreIncrement: 1 }, 0.35],
      [{ type: "DROP_TARGET_COMPLETE", side: "left", scoreIncrement: 1 }, 0.6],
      [{ type: "BOSS_TARGET_HIT", bossId: "b", hitCount: 1, scoreIncrement: 1 }, 0.5],
    ];
    for (const [ev, amount] of cases) {
      const { emit, calls } = makeDeps();
      emit(ev);
      expect(calls.screenShake).toEqual([amount]);
    }
  });

  it("does not shake for non-juice events", () => {
    const { emit, calls } = makeDeps();
    emit({ type: "BALL_LAUNCHED" });
    expect(calls.screenShake).toEqual([]);
  });
});

describe("createEmitRouter — boss camera", () => {
  it("plays reveal cinematic on BOSS_REVEAL", () => {
    const { emit, calls } = makeDeps();
    emit({ type: "BOSS_REVEAL", bossId: "demogorgon", scoreIncrement: 0 });
    expect(calls.directorPlay).toEqual(["demogorgon"]);
  });

  it("plays victory only when hitCount reaches the boss targetHits", () => {
    const bosses = [bossFixture("vecna", 3)];
    const below = makeDeps({ bosses });
    below.emit({ type: "BOSS_TARGET_HIT", bossId: "vecna", hitCount: 2, scoreIncrement: 1 });
    expect(below.calls.directorPlayVictory).toEqual([]);

    const met = makeDeps({ bosses });
    met.emit({ type: "BOSS_TARGET_HIT", bossId: "vecna", hitCount: 3, scoreIncrement: 1 });
    expect(met.calls.directorPlayVictory).toEqual(["vecna"]);
  });

  it("restores boss camera on DRAIN, RETURN_PORTAL_TRANSITION_END, WORLD_CYCLE_COMPLETE", () => {
    const drain = makeDeps();
    drain.emit({ type: "DRAIN" });
    expect(drain.calls.restoreBoss).toBe(1);

    const rpte = makeDeps();
    rpte.emit({ type: "RETURN_PORTAL_TRANSITION_END" });
    expect(rpte.calls.restoreBoss).toBe(1);

    const wcc = makeDeps();
    wcc.emit({ type: "WORLD_CYCLE_COMPLETE" });
    expect(wcc.calls.restoreBoss).toBe(1);
  });
});

describe("createEmitRouter — portal cinematics", () => {
  it("pushes portal_swallow on PORTAL_ENTER and RETURN_PORTAL_ENTER", () => {
    const a = makeDeps();
    a.emit({ type: "PORTAL_ENTER", scoreIncrement: 0 });
    expect(a.calls.pushCinematic).toEqual(["portal_swallow"]);

    const b = makeDeps();
    b.emit({ type: "RETURN_PORTAL_ENTER", scoreIncrement: 0 });
    expect(b.calls.pushCinematic).toEqual(["portal_swallow"]);
  });
});

describe("createEmitRouter — drop target mesh visibility", () => {
  function rootWithTargets(names: string[]): THREE.Object3D {
    const root = new THREE.Object3D();
    for (const name of names) {
      const m = new THREE.Object3D();
      m.name = name;
      root.add(m);
    }
    return root;
  }

  it("hides the matching target mesh on DROP_TARGET_HIT (drop_ → target_)", () => {
    const root = rootWithTargets(["target_left_1", "target_left_2"]);
    const { emit } = makeDeps({ root });
    emit({ type: "DROP_TARGET_HIT", targetId: "drop_left_1", scoreIncrement: 1 });
    expect(root.getObjectByName("target_left_1")!.visible).toBe(false);
    expect(root.getObjectByName("target_left_2")!.visible).toBe(true);
  });

  it("re-shows all drop target meshes on DROP_TARGET_COMPLETE", () => {
    const root = rootWithTargets(["target_left_1", "target_left_2"]);
    root.getObjectByName("target_left_1")!.visible = false;
    root.getObjectByName("target_left_2")!.visible = false;
    const dropTargets = [
      { id: "drop_left_1" },
      { id: "drop_left_2" },
    ] as unknown as MapLayout["dropTargets"];
    const { emit } = makeDeps({ root, dropTargets });
    emit({ type: "DROP_TARGET_COMPLETE", side: "left", scoreIncrement: 1 });
    expect(root.getObjectByName("target_left_1")!.visible).toBe(true);
    expect(root.getObjectByName("target_left_2")!.visible).toBe(true);
  });

  it("re-shows all drop target meshes on DROP_TARGET_RESET", () => {
    const root = rootWithTargets(["target_r_1"]);
    root.getObjectByName("target_r_1")!.visible = false;
    const dropTargets = [{ id: "drop_r_1" }] as unknown as MapLayout["dropTargets"];
    const { emit } = makeDeps({ root, dropTargets });
    emit({ type: "DROP_TARGET_RESET" });
    expect(root.getObjectByName("target_r_1")!.visible).toBe(true);
  });
});

describe("createEmitRouter — BALL_LAUNCHED side effects", () => {
  it("resets portal trigger + bottom-out latch + drain latch and notes launch", () => {
    const { emit, calls } = makeDeps();
    emit({ type: "BALL_LAUNCHED" });
    expect(calls.resetPortalTrigger).toBe(1);
    expect(calls.bottomOutResetLatch).toBe(1);
    expect(calls.drainResetLatch).toBe(1);
    expect(calls.diagResets).toContain("launch");
  });
});

describe("createEmitRouter — alternate world release + lane gate on drain", () => {
  it("opens the shooter lane gate on DRAIN and BOTTOM_OUT", () => {
    const drain = makeDeps();
    drain.emit({ type: "DRAIN" });
    expect(drain.calls.laneOpen).toBe(1);

    const bottom = makeDeps();
    bottom.emit({ type: "BOTTOM_OUT" });
    expect(bottom.calls.laneOpen).toBe(1);
  });

  it("resets boss fights + baselines only when draining at game_over", () => {
    const over = makeDeps({ gameState: "game_over" });
    over.emit({ type: "DRAIN" });
    expect(over.calls.resetAllBossFights).toBe(1);
    expect(over.calls.resetScoreBaselines).toBe(1);
    expect(over.calls.releaseAlternateWorld).toBe(1);

    const playing = makeDeps({ gameState: "playing" });
    playing.emit({ type: "DRAIN" });
    expect(playing.calls.resetAllBossFights).toBe(0);
    expect(playing.calls.releaseAlternateWorld).toBe(0);
  });

  it("releases alternate world on any drain when persistence is until_drain", () => {
    const { emit, calls } = makeDeps({ gameState: "playing", persistence: "until_drain" });
    emit({ type: "DRAIN" });
    expect(calls.releaseAlternateWorld).toBe(1);
  });
});

describe("createEmitRouter — diagnostics reset causes", () => {
  it("notes drain and bottom_out reset causes", () => {
    const drain = makeDeps();
    drain.emit({ type: "DRAIN" });
    expect(drain.calls.diagResets).toContain("drain");

    const bottom = makeDeps();
    bottom.emit({ type: "BOTTOM_OUT" });
    expect(bottom.calls.diagResets).toContain("bottom_out");
  });
});
