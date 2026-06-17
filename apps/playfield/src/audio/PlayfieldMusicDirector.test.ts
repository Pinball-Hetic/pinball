import { describe, expect, test, beforeEach } from "bun:test";
import type { BossDefinition } from "@pinball/game-engine";
import { PlayfieldMusicDirector } from "./PlayfieldMusicDirector";
import type { BossFightMusicController } from "./BossFightMusicController";
import type { EarlySoundController } from "./EarlySoundController";

const SPAWN_DG = "/maps/strangerthings/audio/spawnDG.mp3";
const VECNA_THEME = "/maps/strangerthings/audio/vecnaTheme.mp3";
const WIN_MUSIC = "/maps/strangerthings/audio/win-music.mp3";

function makeBossDef(
  over: Partial<BossDefinition> & Pick<BossDefinition, "id" | "colliderRole">,
): BossDefinition {
  return {
    target: { x: 0, y: 1, z: 0 },
    targetHits: 5,
    scoreTargetHit: 250,
    reveal: { scoreThreshold: 3000, scoreIncrement: 150, requiresAlternateWorld: false },
    hud: {
      label: "",
      victoryLabel: "",
      dmdLabel: "",
      requiresAlternateWorld: false,
      bottomClass: "",
      borderClass: "",
      subtitleClass: "",
      hitsClass: "",
      victoryClass: "",
      victoryClearMs: 1000,
    },
    unlocksPortal: false,
    unlocksReturnPortal: false,
    cameraCinematic: { zoomInDuration: 1, holdDuration: 1, zoomOutDuration: 1 },
    victoryCameraCinematic: { zoomInDuration: 1, holdDuration: 1, zoomOutDuration: 1 },
    targetMeshTheme: {
      ring: { color: 0, emissive: 0, emissiveIntensity: 1 },
      core: { color: 0, emissive: 0, emissiveIntensity: 1 },
      light: { color: 0, intensity: 1 },
    },
    targetPulse: {
      hitFlashDuration: 0.18,
      pulseSpeed: 2.5,
      pulseAmp: 0.18,
      hitBoost: 1.4,
      ringEmissiveBase: 1.6,
      coreEmissiveBase: 1.2,
      lightIntensityBase: 0.45,
      wobbleSpeed: 3,
      wobbleAmp: 0.08,
      hitScaleBoost: 0.25,
    },
    ...over,
  };
}

const DEMOGORGON = makeBossDef({
  id: "demogorgon",
  colliderRole: "demogorgon_target",
  revealSoundUrl: SPAWN_DG,
  keepMusicUntilBossReveal: "vecna",
});

const VECNA = makeBossDef({
  id: "vecna",
  colliderRole: "vecna_target",
  targetHits: 10,
  reveal: { scoreThreshold: 3000, scoreIncrement: 200, requiresAlternateWorld: true },
  revealSoundUrl: VECNA_THEME,
  latePhaseSoundUrl: WIN_MUSIC,
  latePhaseHitThreshold: 7,
  keepMusicUntilReturnPortal: true,
});

const BOSSES = [DEMOGORGON, VECNA];

class MockEarly implements Pick<
  EarlySoundController,
  | "stopInstant"
  | "clearHandoffBlock"
  | "resetForNewGame"
  | "release"
  | "engageSync"
  | "engage"
> {
  playing = false;
  handoffBlocked = false;
  readonly log: string[] = [];

  stopInstant(): void {
    this.log.push("stopInstant");
    this.playing = false;
    this.handoffBlocked = true;
  }

  clearHandoffBlock(): void {
    this.log.push("clearHandoffBlock");
    this.handoffBlocked = false;
  }

  resetForNewGame(): void {
    this.log.push("resetForNewGame");
    this.playing = false;
    this.handoffBlocked = false;
  }

  release(): void {
    this.log.push("release");
    this.playing = false;
  }

  engageSync(): void {
    if (this.handoffBlocked) return;
    this.log.push("engageSync");
    this.playing = true;
  }

  engage(): Promise<void> {
    if (this.handoffBlocked) return Promise.resolve();
    this.log.push("engage");
    this.playing = true;
    return Promise.resolve();
  }
}

class MockBoss implements Pick<
  BossFightMusicController,
  "isPlaying" | "start" | "stopInstant" | "getActiveUrl"
> {
  playing = false;
  activeUrl: string | null = null;
  readonly log: Array<{ op: "start" | "stop"; url?: string }> = [];

  getActiveUrl(): string | null {
    return this.activeUrl;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  start(url: string, volume: number): Promise<void> {
    void volume;
    if (this.activeUrl && this.activeUrl !== url) {
      this.stopInstant();
    }
    this.log.push({ op: "start", url });
    this.activeUrl = url;
    this.playing = true;
    return Promise.resolve();
  }

  stopInstant(): void {
    if (this.playing || this.activeUrl) {
      this.log.push({ op: "stop", url: this.activeUrl ?? undefined });
    }
    this.playing = false;
    this.activeUrl = null;
  }
}

function assertNoMusicOverlap(early: MockEarly, boss: MockBoss): void {
  expect(early.playing && boss.playing).toBe(false);
}

function makeDirector() {
  const early = new MockEarly();
  const boss = new MockBoss();
  const director = new PlayfieldMusicDirector(
    early as unknown as EarlySoundController,
    boss as unknown as BossFightMusicController,
  );
  director.setWantsEarly(true);
  return { director, early, boss };
}

describe("PlayfieldMusicDirector", () => {
  describe("exclusivité early ↔ boss", () => {
    test("BOSS_REVEAL coupe early et démarre une seule piste boss", () => {
      const { director, early, boss } = makeDirector();
      early.playing = true;

      director.onBossReveal(DEMOGORGON);

      expect(early.log).toContain("stopInstant");
      expect(boss.activeUrl).toBe(SPAWN_DG);
      expect(boss.playing).toBe(true);
      assertNoMusicOverlap(early, boss);

      director.setWantsEarly(true);
      early.playing = false;
      early.handoffBlocked = true;
      director.onBossFightEnd("demogorgon", BOSSES);
      // bridge — early ne reprend pas
      expect(early.log).not.toContain("engageSync");
      assertNoMusicOverlap(early, boss);
    });

    test("requestEarly ignoré tant que le boss joue", () => {
      const { director, early, boss } = makeDirector();
      director.onBossReveal(DEMOGORGON);
      early.log.length = 0;
      early.handoffBlocked = false;

      director.onDrain({ gameOver: false });

      expect(early.log).not.toContain("engage");
      expect(early.log).not.toContain("engageSync");
      expect(boss.playing).toBe(true);
    });
  });

  describe("pont DG → Vecna (spawnDG conservé)", () => {
    let director: PlayfieldMusicDirector;
    let early: MockEarly;
    let boss: MockBoss;

    beforeEach(() => {
      ({ director, early, boss } = makeDirector());
      director.onBossReveal(DEMOGORGON);
    });

    test("BOSS_FIGHT_END demogorgon garde spawnDG sans relancer early", () => {
      director.onBossFightEnd("demogorgon", BOSSES);

      const state = director.getDebugState();
      expect(state.musicBridgeActive).toBe(true);
      expect(state.bridgeUntilBossId).toBe("vecna");
      expect(boss.activeUrl).toBe(SPAWN_DG);
      expect(boss.playing).toBe(true);
      expect(early.log).not.toContain("engage");
      expect(early.log).not.toContain("clearHandoffBlock");
      assertNoMusicOverlap(early, boss);
    });

    test("perte de vie pendant le pont ne coupe pas spawnDG", () => {
      director.onBossFightEnd("demogorgon", BOSSES);
      early.log.length = 0;

      director.onDrain({ gameOver: false });

      expect(boss.activeUrl).toBe(SPAWN_DG);
      expect(boss.playing).toBe(true);
      expect(early.log).not.toContain("engage");
    });

    test("BOSS_REVEAL vecna remplace spawnDG sans superposition", () => {
      director.onBossFightEnd("demogorgon", BOSSES);
      const stopsBeforeVecna = boss.log.filter((e) => e.op === "stop").length;

      director.onBossReveal(VECNA);

      expect(director.getDebugState().musicBridgeActive).toBe(false);
      expect(boss.activeUrl).toBe(VECNA_THEME);
      expect(boss.log.some((e) => e.op === "start" && e.url === VECNA_THEME)).toBe(true);
      // changement de piste : stop de l'ancienne avant start de la nouvelle
      expect(boss.log.filter((e) => e.op === "stop").length).toBeGreaterThan(stopsBeforeVecna);
      assertNoMusicOverlap(early, boss);
    });
  });

  describe("phase tardive Vecna (7/10 coups)", () => {
    test("switch vers win-music une seule fois au 7e coup", () => {
      const { director, early, boss } = makeDirector();
      director.onBossReveal(VECNA);

      director.onBossTargetHit(VECNA, 6);
      expect(boss.activeUrl).toBe(VECNA_THEME);

      director.onBossTargetHit(VECNA, 7);
      expect(boss.activeUrl).toBe(WIN_MUSIC);

      director.onBossTargetHit(VECNA, 8);
      expect(boss.activeUrl).toBe(WIN_MUSIC);
      assertNoMusicOverlap(early, boss);
    });
  });

  describe("fin de partie et reset", () => {
    test("game over stoppe boss et bridge", () => {
      const { director, early, boss } = makeDirector();
      director.onBossReveal(DEMOGORGON);
      director.onBossFightEnd("demogorgon", BOSSES);

      director.onGameOverSting();

      expect(boss.playing).toBe(false);
      expect(director.getDebugState().musicBridgeActive).toBe(false);
      expect(early.log).toContain("release");
      assertNoMusicOverlap(early, boss);
    });

    test("reset relance early proprement", () => {
      const { director, early, boss } = makeDirector();
      director.onBossReveal(DEMOGORGON);
      director.onBossFightEnd("demogorgon", BOSSES);

      director.onResetGame();

      expect(boss.playing).toBe(false);
      expect(director.getDebugState().musicBridgeActive).toBe(false);
      expect(early.log).toContain("resetForNewGame");
      expect(early.log).toContain("engage");
      assertNoMusicOverlap(early, boss);
    });

    test("victoire d'un boss sans keepMusicUntilReturnPortal reprend early", () => {
      const noHoldBoss = makeBossDef({
        id: "nohold",
        colliderRole: "nohold_target",
        revealSoundUrl: VECNA_THEME,
      });
      const { director, early, boss } = makeDirector();
      director.onBossReveal(noHoldBoss);
      early.log.length = 0;
      early.handoffBlocked = false;

      director.onBossFightEnd("nohold", [noHoldBoss]);

      expect(boss.playing).toBe(false);
      expect(director.getDebugState().postVictoryMusicHeld).toBe(false);
      expect(early.log).toContain("clearHandoffBlock");
      expect(early.log).toContain("engage");
    });

    test("victoire boss keepMusicUntilReturnPortal conserve la piste (data-driven)", () => {
      const { director, early, boss } = makeDirector();
      director.onBossReveal(VECNA);
      director.onBossTargetHit(VECNA, 7);
      early.log.length = 0;

      director.onBossFightEnd("vecna", BOSSES);

      expect(boss.activeUrl).toBe(WIN_MUSIC);
      expect(boss.playing).toBe(true);
      expect(director.getDebugState().postVictoryMusicHeld).toBe(true);
      expect(early.log).not.toContain("engage");
    });

    test("RETURN_PORTAL_TRANSITION_END stoppe win-music et reprend early", () => {
      const { director, early, boss } = makeDirector();
      director.onBossReveal(VECNA);
      director.onBossTargetHit(VECNA, 7);
      director.onBossFightEnd("vecna", BOSSES);
      early.log.length = 0;
      early.handoffBlocked = false;

      director.onReturnPortalTransitionEnd();

      expect(boss.playing).toBe(false);
      expect(director.getDebugState().postVictoryMusicHeld).toBe(false);
      expect(early.log).toContain("engage");
    });
  });

  describe("BOSS_FIGHT_END sans pont", () => {
    test("boss sans keepMusicUntilBossReveal stoppe la musique", () => {
      const solo = makeBossDef({
        id: "solo",
        colliderRole: "solo_target",
        revealSoundUrl: SPAWN_DG,
      });
      const { director, early, boss } = makeDirector();
      director.onBossReveal(solo);
      early.log.length = 0;
      early.handoffBlocked = false;

      director.onBossFightEnd("solo", [solo]);

      expect(boss.playing).toBe(false);
      expect(director.getDebugState().musicBridgeActive).toBe(false);
      expect(early.log).toContain("engage");
    });
  });
});
