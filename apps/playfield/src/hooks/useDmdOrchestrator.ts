import { useEffect, useRef } from 'react';
import { createPinballSocket, type PinballSocket } from '@pinball/shared-types/src/socket-client';
import type {
  DmdDisplay,
  ScoreUpdate,
  GameStats,
  CinematicClip,
  GameRegistered,
} from '@pinball/shared-types';
import { clipShowMs, clipTakeoverMs, type ClipTimings } from '@pinball/shared-types';
import type { GameEvent, BossDefinition } from '@pinball/game-engine';
import { getBossById } from '@pinball/game-engine';

interface DisplayPushOpts {
  duration?: number;
  priority: number;
}

// Priorities (higher wins):
const PRIO = {
  CINEMATIC: 110,
  GAME_OVER: 100,
  LIFE_LOST: 80,
  EVENT: 60,
  COMBO_FLASH: 55,
  MULTI_FLASH: 50,
  INTRO: 30,
  SCORE: 10,
} as const;

const DURATIONS = {
  EVENT: 1200,
  COMBO_FLASH: 1500,
  MULTI_FLASH: 1500,
} as const;


// alternateWorld is injected at emit time (atmosphereRef) — the stack stores
// displays without that field. Distributive Omit over the union.
type DisplayBase = DmdDisplay extends infer T
  ? T extends DmdDisplay
    ? Omit<T, 'alternateWorld'>
    : never
  : never;

interface PendingDisplay {
  display: DisplayBase;
  priority: number;
  expiresAt: number; // performance.now() + duration, Infinity when sticky
}

export interface DmdOrchestrator {
  // Low-level score broadcast (DMD data sync, independent of the display mode)
  emitScoreSnapshot: (s: ScoreUpdate) => void;
  emitGameStart: (player: string) => void;
  emitGameOver: (player: string, finalScore: number, mapId: string, stats: GameStats) => void;
  // Fullscreen cinematic clip (max priority) — synced with playfield/backglass.
  pushCinematic: (clip: CinematicClip, value?: number) => void;
  // High-level DMD: push a display, the orchestrator decides what to show
  pushIntro: (player: string) => void;
  pushScore: (s: ScoreUpdate) => void;
  pushEvent: (label: string, points: number, snap: ScoreUpdate) => void;
  pushComboFlash: (combo: number, multiplier: number, snap: ScoreUpdate) => void;
  pushMultiFlash: (multiplier: number, combo: number, snap: ScoreUpdate) => void;
  pushLifeLost: (livesRemaining: number, score: number, player: string) => void;
  pushGameOver: (player: string, finalScore: number) => void;
  setAtmosphere: (alternateWorldActive: boolean) => void;
}

// Readable labels for highlight events (boss defs injected by the map):
function eventLabel(event: GameEvent, bosses: BossDefinition[]): string | null {
  switch (event.type) {
    case 'BOSS_REVEAL':
      return getBossById(bosses, event.bossId)?.hud.dmdLabel ?? event.bossId.toUpperCase();
    case 'BOSS_TARGET_HIT': {
      const def = getBossById(bosses, event.bossId);
      const label = def?.hud.dmdLabel ?? event.bossId.toUpperCase();
      const hits = def?.targetHits ?? event.hitCount;
      return event.hitCount >= hits
        ? `${label} VAINCU`
        : `${label} HIT ${event.hitCount}/${hits}`;
    }
    case 'PORTAL_ENTER': return 'PORTAL';
    case 'RETURN_PORTAL_ENTER': return 'RETOUR';
    case 'WORLD_CYCLE_COMPLETE': return 'CYCLE COMPLET';
    case 'RAMP_HIT': return 'RAMP';
    case 'DROP_TARGET_COMPLETE': return `DROP ${event.side.toUpperCase()}`;
    case 'ASSIST': {
      const label = bosses.find((b) => b.hud.assistLabel)?.hud.assistLabel ?? 'ASSIST';
      return label.toUpperCase();
    }
    default: return null; // bumpers/slingshots/zones → no highlight, score only
  }
}

export { eventLabel }; // exported for tests

export function useDmdOrchestrator(
  clips?: Record<string, ClipTimings>,
  onGameRegistered?: (data: GameRegistered) => void,
): DmdOrchestrator {
  // Map clip table (manifest.clips), read through a ref so it stays fresh
  // without recreating the orchestrator.
  const clipsRef = useRef(clips);
  clipsRef.current = clips;
  // game:registered callback kept fresh via ref (no network-driven re-render).
  const onRegisteredRef = useRef(onGameRegistered);
  onRegisteredRef.current = onGameRegistered;
  const socketRef = useRef<PinballSocket | null>(null);
  const stackRef = useRef<PendingDisplay[]>([]);
  const lastSentRef = useRef<string>(''); // JSON.stringify of the last display sent
  const atmosphereRef = useRef<boolean>(false);
  // Last player/score snapshot (feeds pushCinematic).
  const lastSnapRef = useRef<{ player: string; score: number }>({ player: '', score: 0 });

  useEffect(() => {
    socketRef.current = createPinballSocket();

    // game:registered → routed to the callback (end-of-game QR). Cleared by
    // the disconnect in the cleanup below.
    socketRef.current.on('game:registered', (d) => onRegisteredRef.current?.(d));

    // Expiration tick: drop expired displays and emit the highest-priority
    // one left (or SCORE by default).
    const tick = window.setInterval(() => {
      const now = performance.now();
      stackRef.current = stackRef.current.filter((p) => p.expiresAt > now);
      sendCurrent();
    }, 100);

    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
      window.clearInterval(tick);
    };
  }, []);

  const sendCurrent = () => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    if (stackRef.current.length === 0) return;
    const top = stackRef.current
      .slice()
      .sort((a, b) => b.priority - a.priority)[0]!;
    // alternateWorld injected here → the atmosphere travels with every display.
    const payload = { ...top.display, alternateWorld: atmosphereRef.current } as DmdDisplay;
    const serialized = JSON.stringify(payload);
    if (serialized === lastSentRef.current) return;
    lastSentRef.current = serialized;
    socket.emit('dmd:display', payload);
  };

  const push = (display: DisplayBase, opts: DisplayPushOpts) => {
    const now = performance.now();
    const expiresAt = opts.duration ? now + opts.duration : Infinity;
    // If the same mode is already present, replace it (data refresh)
    stackRef.current = stackRef.current.filter((p) => p.display.mode !== display.mode);
    stackRef.current.push({ display, priority: opts.priority, expiresAt });
    sendCurrent();
  };

  return {
    emitScoreSnapshot: (s) => {
      lastSnapRef.current = { player: s.player, score: s.score };
      socketRef.current?.emit('score:update', s);
    },
    emitGameStart: (player) => socketRef.current?.emit('game:start', { player }),
    emitGameOver: (player, finalScore, mapId, stats) =>
      socketRef.current?.emit('game:over', { player, finalScore, mapId, stats }),

    pushIntro: (player) => {
      // Full reset: INTRO only shows at rest (ball not launched), so clear
      // the stack (removes a sticky GAME_OVER / leftover SCORE).
      stackRef.current = [];
      push({ mode: 'INTRO', player }, { priority: PRIO.INTRO });
    },

    pushScore: (s) => {
      // As soon as a score arrives (ball launched), INTRO and any sticky
      // LIFE_LOST disappear; SCORE becomes the default display.
      stackRef.current = stackRef.current.filter(
        (p) => p.display.mode !== 'INTRO' && p.display.mode !== 'LIFE_LOST',
      );
      push({ mode: 'SCORE', ...s }, { priority: PRIO.SCORE });
    },

    pushEvent: (label, points, snap) =>
      push(
        { mode: 'EVENT', label, points, ...snap },
        { priority: PRIO.EVENT, duration: DURATIONS.EVENT },
      ),

    pushComboFlash: (combo, multiplier, snap) =>
      push(
        {
          mode: 'COMBO_FLASH',
          combo,
          multiplier,
          score: snap.score,
          lives: snap.lives,
          player: snap.player,
          mapState: snap.mapState,
        },
        { priority: PRIO.COMBO_FLASH, duration: DURATIONS.COMBO_FLASH },
      ),

    pushMultiFlash: (multiplier, combo, snap) =>
      push(
        {
          mode: 'MULTI_FLASH',
          multiplier,
          combo,
          score: snap.score,
          lives: snap.lives,
          player: snap.player,
          mapState: snap.mapState,
        },
        { priority: PRIO.MULTI_FLASH, duration: DURATIONS.MULTI_FLASH },
      ),

    pushLifeLost: (livesRemaining, score, player) =>
      // Sticky: persists until the next SCORE (ball relaunch), which removes
      // it via pushScore. No duration.
      push(
        { mode: 'LIFE_LOST', livesRemaining, score, player },
        { priority: PRIO.LIFE_LOST },
      ),

    pushGameOver: (player, finalScore) => {
      // GAME_OVER is sticky: no duration. To remove it, call pushIntro() on
      // reset.
      stackRef.current = stackRef.current.filter(
        (p) => p.display.mode === 'INTRO' || p.display.mode === 'SCORE',
      );
      push(
        { mode: 'GAME_OVER', player, finalScore },
        { priority: PRIO.GAME_OVER },
      );
    },

    pushCinematic: (clip, value) => {
      const { player, score } = lastSnapRef.current;
      push(
        { mode: 'CINEMATIC', clip, player, score, value },
        // Fullscreen segment: SCORE mode resumes afterwards (fever shows in SCORE).
        {
          priority: PRIO.CINEMATIC,
          duration: clipTakeoverMs(clipsRef.current, clip) ?? clipShowMs(clipsRef.current, clip),
        },
      );
    },

    setAtmosphere: (alternateWorldActive) => {
      if (atmosphereRef.current === alternateWorldActive) return;
      atmosphereRef.current = alternateWorldActive;
      // Re-push the current display with the new atmosphere.
      lastSentRef.current = '';
      sendCurrent();
    },
  };
}
