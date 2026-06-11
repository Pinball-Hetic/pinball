import { useState, useRef, useCallback, useEffect } from "react";
import {
  INITIAL_LIVES,
  DEMOGORGON_TARGET_HITS,
  BUMPER_POSITIONS,
  DEMOGORGON_TARGET,
  PORTAL_UPSIDE_DOWN,
  UPSIDE_DOWN_HINT_MS,
} from "@pinball/game-engine";
import type { GameEvent, GameEventListener } from "@pinball/game-engine";
import type { GameStats } from "@pinball/shared-types";
import { handlePinballSoundEvent, playGameOverSound } from "../audio/pinballAudio";
import { playfieldToScreenPercent, jitterScreenPoint } from "../utils/playfieldScreen";

export type GameState = "idle" | "playing" | "game_over";

export type ScorePop = {
  id: number;
  amount: number;
  x: number;
  y: number;
  tone: "bumper" | "target";
};

export type DemogorgonHud = {
  active: boolean;
  hits: number;
  victory: boolean;
  elevenFlash: boolean;
};

export interface ScoringCallbacks {
  onScoreEvent?: (info: {
    event: GameEvent;
    finalPoints: number;
    previousCombo: number;
    newCombo: number;
    previousMultiplier: number;
    newMultiplier: number;
  }) => void;
  onLifeLost?: (livesRemaining: number) => void;
  onGameOver?: (finalScore: number, stats: GameStats) => void;
  onGameStart?: () => void;
  onIdleReset?: () => void;
  onAtmosphereChange?: (upsideDownActive: boolean) => void;
  onMilestone?: (threshold: number) => void;
  onHeticLetter?: (letterIndex: number) => void; // 1-4
  onHeticComplete?: () => void;
  onFeverEnd?: () => void;
}

const COMBO_DECAY_MS = 2000;
const MULTIPLIER_THRESHOLDS = [5, 10, 20, 40] as const;

const MILESTONES = [5_000, 15_000, 30_000];
const MILESTONE_REPEAT_EVERY = 25_000; // au-delà de 50k

// Plus haut seuil de {5k,15k,30k,50k,75k,100k,…} franchi entre prev et next.
function nextMilestone(prev: number, next: number, passed: Set<number>): number | null {
  let crossed: number | null = null;
  for (const m of MILESTONES) {
    if (m > prev && m <= next && !passed.has(m)) crossed = m;
  }
  // Répétition tous les 25k au-delà de 50k.
  let m = 50_000;
  while (m <= next) {
    if (m > prev && !passed.has(m)) crossed = m;
    m += MILESTONE_REPEAT_EVERY;
  }
  return crossed;
}

function computeMultiplier(combo: number): number {
  if (combo < MULTIPLIER_THRESHOLDS[0]) return 1;
  if (combo < MULTIPLIER_THRESHOLDS[1]) return 2;
  if (combo < MULTIPLIER_THRESHOLDS[2]) return 3;
  if (combo < MULTIPLIER_THRESHOLDS[3]) return 4;
  return 5;
}

function generatePlayerName(): string {
  const n = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
  return `PLAYER${n}`;
}

const initialDemogorgonHud = (): DemogorgonHud => ({
  active: false,
  hits: 0,
  victory: false,
  elevenFlash: false,
});

export function useGameState(callbacks?: ScoringCallbacks) {
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(INITIAL_LIVES);
  const [gameState, setGameState] = useState<GameState>("idle");
  const [combo, setCombo] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [player, setPlayer] = useState<string>(() => generatePlayerName());
  const [demogorgonHud, setDemogorgonHud] = useState<DemogorgonHud>(initialDemogorgonHud);
  const [scorePops, setScorePops] = useState<ScorePop[]>([]);
  const [upsideDownActive, setUpsideDownActive] = useState(false);
  const [upsideDownHint, setUpsideDownHint] = useState(false);
  const [hetic, setHetic] = useState(0);
  const [fever, setFever] = useState(false);

  const heticRef = useRef(0);
  const milestonesPassedRef = useRef<Set<number>>(new Set());
  const feverUntilRef = useRef(0);
  const scoreRef = useRef(0);
  const livesRef = useRef(INITIAL_LIVES);
  const gameStateRef = useRef<GameState>("idle");
  const comboRef = useRef(0);
  const multiplierRef = useRef(1);
  const lastEventTimeRef = useRef(0);
  const playerRef = useRef(player);
  const victoryTimerRef = useRef<number | null>(null);
  const elevenTimerRef = useRef<number | null>(null);
  const scorePopIdRef = useRef(0);
  const scorePopTimersRef = useRef<Map<number, number>>(new Map());
  const upsideDownHintTimerRef = useRef<number | null>(null);

  // Compteurs de stats de partie (reset dans resetGame, lus au game over)
  const maxComboRef = useRef(0);
  const maxMultiplierRef = useRef(1);
  const demogorgonsRef = useRef(0);
  const portalsRef = useRef(0);
  const gameStartRef = useRef(0);

  // Sync ref to state when player change
  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  useEffect(() => {
    const tick = window.setInterval(() => {
      if (
        comboRef.current > 0 &&
        performance.now() - lastEventTimeRef.current > COMBO_DECAY_MS
      ) {
        comboRef.current = 0;
        multiplierRef.current = 1;
        setCombo(0);
        setMultiplier(1);
      }
      // Expiration du fever
      if (feverUntilRef.current && performance.now() > feverUntilRef.current) {
        feverUntilRef.current = 0;
        setFever(false);
        callbacks?.onFeverEnd?.();
      }
    }, 250);
    return () => window.clearInterval(tick);
  }, [callbacks]);

  const isFeverActive = () => performance.now() < feverUntilRef.current;

  const startFever = (durationMs: number) => {
    feverUntilRef.current = performance.now() + durationMs;
    setFever(true);
  };

  const clearScorePops = useCallback(() => {
    for (const timer of scorePopTimersRef.current.values()) {
      window.clearTimeout(timer);
    }
    scorePopTimersRef.current.clear();
    setScorePops([]);
  }, []);

  const pushScorePop = useCallback((pop: Omit<ScorePop, "id">) => {
    const id = scorePopIdRef.current + 1;
    scorePopIdRef.current = id;
    setScorePops((prev) => [...prev, { ...pop, id }]);
    const timer = window.setTimeout(() => {
      scorePopTimersRef.current.delete(id);
      setScorePops((prev) => prev.filter((entry) => entry.id !== id));
    }, 900);
    scorePopTimersRef.current.set(id, timer);
  }, []);

  const clearUpsideDownHint = useCallback(() => {
    if (upsideDownHintTimerRef.current !== null) {
      window.clearTimeout(upsideDownHintTimerRef.current);
      upsideDownHintTimerRef.current = null;
    }
    setUpsideDownHint(false);
  }, []);

  const clearUpsideDownSession = useCallback(() => {
    clearUpsideDownHint();
    callbacks?.onAtmosphereChange?.(false);
    setUpsideDownActive(false);
  }, [clearUpsideDownHint, callbacks]);

  const clearDemogorgonHud = useCallback(() => {
    if (victoryTimerRef.current !== null) {
      window.clearTimeout(victoryTimerRef.current);
      victoryTimerRef.current = null;
    }
    if (elevenTimerRef.current !== null) {
      window.clearTimeout(elevenTimerRef.current);
      elevenTimerRef.current = null;
    }
    setDemogorgonHud(initialDemogorgonHud());
  }, []);

  const updateGameState = (state: GameState) => {
    gameStateRef.current = state;
    setGameState(state);
  };

  const applyComboEvent = (now: number): { prevCombo: number; prevMult: number } => {
    const prevCombo = comboRef.current;
    const prevMult = multiplierRef.current;
    const isDecayed = prevCombo === 0 || now - lastEventTimeRef.current > COMBO_DECAY_MS;
    const nextCombo = isDecayed ? 1 : prevCombo + 1;
    const nextMult = computeMultiplier(nextCombo);
    comboRef.current = nextCombo;
    multiplierRef.current = nextMult;
    lastEventTimeRef.current = now;
    setCombo(nextCombo);
    if (nextMult !== prevMult) setMultiplier(nextMult);
    return { prevCombo, prevMult };
  };

  const handleDrain = (hideBall: () => void) => {
    const newLives = livesRef.current - 1;
    livesRef.current = newLives;
    setLives(newLives);
    if (newLives <= 0) {
      hideBall();
      playGameOverSound();
      updateGameState("game_over");
      const stats: GameStats = {
        maxCombo: maxComboRef.current,
        maxMultiplier: maxMultiplierRef.current,
        demogorgons: demogorgonsRef.current,
        portals: portalsRef.current,
        hetic: heticRef.current,
        durationS: gameStartRef.current
          ? Math.round((performance.now() - gameStartRef.current) / 1000)
          : 0,
      };
      callbacks?.onGameOver?.(scoreRef.current, stats);
    } else {
      updateGameState("idle");
      callbacks?.onLifeLost?.(newLives);
    }
  };

  const resetGame = () => {
    scoreRef.current = 0;
    setScore(0);
    livesRef.current = INITIAL_LIVES;
    setLives(INITIAL_LIVES);
    comboRef.current = 0;
    multiplierRef.current = 1;
    setCombo(0);
    setMultiplier(1);
    heticRef.current = 0;
    setHetic(0);
    milestonesPassedRef.current.clear();
    feverUntilRef.current = 0;
    setFever(false);
    lastEventTimeRef.current = 0;
    maxComboRef.current = 0;
    maxMultiplierRef.current = 1;
    demogorgonsRef.current = 0;
    portalsRef.current = 0;
    gameStartRef.current = 0;
    const newName = generatePlayerName();
    setPlayer(newName);
    playerRef.current = newName;
    clearDemogorgonHud();
    clearScorePops();
    clearUpsideDownSession();
    updateGameState("idle");
    callbacks?.onIdleReset?.();
  };

  const buildEmit = (hideBall: () => void): GameEventListener =>
    (event) => {
      handlePinballSoundEvent(event);

      const now = performance.now();

      if ("scoreIncrement" in event && event.scoreIncrement) {
        const comboChange = applyComboEvent(now);
        maxComboRef.current = Math.max(maxComboRef.current, comboRef.current);
        maxMultiplierRef.current = Math.max(
          maxMultiplierRef.current,
          multiplierRef.current,
        );
        // En fever le multiplier effectif est forcé à 5 (combo continue
        // de compter en arrière-plan).
        const mult = isFeverActive() ? 5 : multiplierRef.current;
        const finalPoints = event.scoreIncrement * mult;
        const prevScore = scoreRef.current;
        scoreRef.current += finalPoints;
        setScore(scoreRef.current);

        callbacks?.onScoreEvent?.({
          event,
          finalPoints,
          previousCombo: comboChange.prevCombo,
          newCombo: comboRef.current,
          previousMultiplier: comboChange.prevMult,
          newMultiplier: multiplierRef.current,
        });

        // Paliers de score
        const crossed = nextMilestone(prevScore, scoreRef.current, milestonesPassedRef.current);
        if (crossed) {
          milestonesPassedRef.current.add(crossed);
          callbacks?.onMilestone?.(crossed);
        }
      }
      if (event.type === "BUMPER_HIT") {
        const bumper = BUMPER_POSITIONS[event.bumperIndex];
        if (bumper) {
          const point = jitterScreenPoint(
            playfieldToScreenPercent(bumper.x, bumper.z),
          );
          pushScorePop({
            amount: event.scoreIncrement * multiplierRef.current,
            x: point.x,
            y: point.y,
            tone: "bumper",
          });
        }
      }
      if (event.type === "DEMOGORGON_TARGET_HIT") {
        const point = jitterScreenPoint(
          playfieldToScreenPercent(DEMOGORGON_TARGET.x, DEMOGORGON_TARGET.z),
          4,
        );
        pushScorePop({
          amount: event.scoreIncrement * multiplierRef.current,
          x: point.x,
          y: point.y,
          tone: "target",
        });
        const victory = event.hitCount >= DEMOGORGON_TARGET_HITS;
        if (victory) demogorgonsRef.current += 1;
        setDemogorgonHud((prev) => ({
          ...prev,
          active: true,
          hits: event.hitCount,
          victory,
          elevenFlash: false,
        }));
        if (victory) {
          victoryTimerRef.current = window.setTimeout(() => {
            victoryTimerRef.current = null;
            setDemogorgonHud(initialDemogorgonHud());
          }, 1400);
        }
      }
      if (event.type === "DEMOGORGON_REVEAL") {
        if (victoryTimerRef.current !== null) {
          window.clearTimeout(victoryTimerRef.current);
          victoryTimerRef.current = null;
        }
        setDemogorgonHud({ active: true, hits: 0, victory: false, elevenFlash: false });
      }
      if (event.type === "ELEVEN_ASSIST") {
        setDemogorgonHud((prev) => ({
          ...prev,
          active: true,
          elevenFlash: true,
        }));
        if (elevenTimerRef.current !== null) {
          window.clearTimeout(elevenTimerRef.current);
        }
        elevenTimerRef.current = window.setTimeout(() => {
          elevenTimerRef.current = null;
          setDemogorgonHud((prev) => ({ ...prev, elevenFlash: false }));
        }, 900);
      }
      if (event.type === "DRAIN" || event.type === "BOTTOM_OUT") {
        comboRef.current = 0;
        multiplierRef.current = 1;
        setCombo(0);
        setMultiplier(1);
        clearScorePops();
        handleDrain(hideBall);
        if (livesRef.current <= 0) {
          clearDemogorgonHud();
        }
      }
      if (event.type === "DROP_TARGET_COMPLETE") {
        heticRef.current += 1;
        setHetic(heticRef.current);
        if (heticRef.current < 5) {
          callbacks?.onHeticLetter?.(heticRef.current); // 1..4
        } else {
          // complete émis AVANT le reset (snapshot montre encore 5/5), puis
          // la boucle redevient collectable (re-jouable).
          callbacks?.onHeticComplete?.();
          heticRef.current = 0;
          setHetic(0);
        }
      }
      if (event.type === "BALL_LAUNCHED") {
        if (gameStartRef.current === 0) gameStartRef.current = now;
        if (gameStateRef.current === "idle") callbacks?.onGameStart?.();
        updateGameState("playing");
      }
      if (event.type === "PORTAL_ENTER") {
        portalsRef.current += 1;
        const point = jitterScreenPoint(
          playfieldToScreenPercent(PORTAL_UPSIDE_DOWN.x, PORTAL_UPSIDE_DOWN.z),
          3,
        );
        pushScorePop({
          amount: event.scoreIncrement * multiplierRef.current,
          x: point.x,
          y: point.y,
          tone: "target",
        });
      }
      if (event.type === "PORTAL_TRANSITION_END") {
        setUpsideDownActive(true);
        setUpsideDownHint(true);
        if (upsideDownHintTimerRef.current !== null) {
          window.clearTimeout(upsideDownHintTimerRef.current);
        }
        upsideDownHintTimerRef.current = window.setTimeout(() => {
          upsideDownHintTimerRef.current = null;
          setUpsideDownHint(false);
        }, UPSIDE_DOWN_HINT_MS);
        callbacks?.onAtmosphereChange?.(true);
      }
    };

  return {
    score,
    lives,
    gameState,
    gameStateRef,
    combo,
    multiplier,
    player,
    scoreRef,
    livesRef,
    comboRef,
    multiplierRef,
    playerRef,
    demogorgonHud,
    scorePops,
    upsideDownActive,
    upsideDownHint,
    hetic,
    heticRef,
    fever,
    isFeverActive,
    startFever,
    clearUpsideDownSession,
    resetGame,
    buildEmit,
  };
}
