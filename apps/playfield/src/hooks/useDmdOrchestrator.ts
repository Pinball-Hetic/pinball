import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  DmdDisplay,
  ScoreUpdate,
  GameStats,
  CinematicClip,
} from '@pinball/shared-types';
import { clipShowMs, clipTakeoverMs } from '@pinball/shared-types';
import type { GameEvent } from '@pinball/game-engine';
import { getBossDefinition } from '@/map/activeMapBosses';

type PinballSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface DisplayPushOpts {
  duration?: number;
  priority: number;
}

// Priorités (plus haut = plus prioritaire) :
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


// upsideDown est injecté au moment de l'emit (atmosphereRef) — la stack
// stocke les displays sans ce champ. Omit distributif sur l'union.
type DisplayBase = DmdDisplay extends infer T
  ? T extends DmdDisplay
    ? Omit<T, 'upsideDown'>
    : never
  : never;

interface PendingDisplay {
  display: DisplayBase;
  priority: number;
  expiresAt: number; // performance.now() + duration, Infinity si sticky
}

export interface DmdOrchestrator {
  // Score broadcast bas niveau (DMD data sync, indépendant du mode display)
  emitScoreSnapshot: (s: ScoreUpdate) => void;
  emitGameStart: (player: string) => void;
  emitGameOver: (player: string, finalScore: number, mapId: string, stats: GameStats) => void;
  // Clip cinématique plein écran (prio max) — synchro avec playfield/backglass.
  pushCinematic: (clip: CinematicClip, value?: number) => void;
  // DMD high-level : push une display, l'orchestrator décide quoi montrer
  pushIntro: (player: string) => void;
  pushScore: (s: ScoreUpdate) => void;
  pushEvent: (label: string, points: number, snap: ScoreUpdate) => void;
  pushComboFlash: (combo: number, multiplier: number, snap: ScoreUpdate) => void;
  pushMultiFlash: (multiplier: number, combo: number, snap: ScoreUpdate) => void;
  pushLifeLost: (livesRemaining: number, score: number, player: string) => void;
  pushGameOver: (player: string, finalScore: number) => void;
  setAtmosphere: (upsideDownActive: boolean) => void;
}

// Labels lisibles pour les events highlight :
function eventLabel(event: GameEvent): string | null {
  switch (event.type) {
    case 'BOSS_REVEAL':
      return getBossDefinition(event.bossId).hud.dmdLabel;
    case 'BOSS_TARGET_HIT': {
      const def = getBossDefinition(event.bossId);
      return event.hitCount >= def.targetHits
        ? `${def.hud.dmdLabel} VAINCU`
        : `${def.hud.dmdLabel} HIT ${event.hitCount}/${def.targetHits}`;
    }
    case 'PORTAL_ENTER': return 'PORTAL';
    case 'RETURN_PORTAL_ENTER': return 'RETOUR';
    case 'WORLD_CYCLE_COMPLETE': return 'CYCLE COMPLET';
    case 'RAMP_HIT': return 'RAMP';
    case 'DROP_TARGET_COMPLETE': return `DROP ${event.side.toUpperCase()}`;
    // TODO phase 5 : libellé fourni par le contenu DMD de la map (eventLabels).
    case 'ASSIST': return 'ELEVEN +' + 100;
    default: return null; // bumpers/slingshots/zones → pas de highlight, juste score
  }
}

export { eventLabel }; // exporté pour tests

export function useDmdOrchestrator(): DmdOrchestrator {
  const socketRef = useRef<PinballSocket | null>(null);
  const stackRef = useRef<PendingDisplay[]>([]);
  const lastSentRef = useRef<string>(''); // JSON.stringify de la dernière display envoyée
  const atmosphereRef = useRef<boolean>(false);
  // Dernier snapshot joueur/score (pour alimenter pushCinematic).
  const lastSnapRef = useRef<{ player: string; score: number }>({ player: '', score: 0 });

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SOCKET_URL || undefined;
    const transports: ('polling' | 'websocket')[] = url ? ['websocket'] : ['polling'];
    socketRef.current = io(url, { transports });

    // Tick d'expiration : retire les displays expirés et émet la plus
    // prioritaire restante (ou SCORE par défaut).
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
    // upsideDown injecté ici → l'atmosphere voyage dans chaque display.
    const payload = { ...top.display, upsideDown: atmosphereRef.current } as DmdDisplay;
    const serialized = JSON.stringify(payload);
    if (serialized === lastSentRef.current) return;
    lastSentRef.current = serialized;
    socket.emit('dmd:display', payload);
  };

  const push = (display: DisplayBase, opts: DisplayPushOpts) => {
    const now = performance.now();
    const expiresAt = opts.duration ? now + opts.duration : Infinity;
    // Si même mode déjà présent, on remplace (refresh des données)
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
      // Reset complet : l'INTRO ne s'affiche qu'au repos (ball non lancée),
      // donc on vide la stack (retire un GAME_OVER sticky / SCORE résiduel).
      stackRef.current = [];
      push({ mode: 'INTRO', player }, { priority: PRIO.INTRO });
    },

    pushScore: (s) => {
      // Dès qu'un score arrive (ball lancée), l'INTRO et un éventuel
      // LIFE_LOST sticky disparaissent ; le SCORE devient l'affichage défaut.
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
      // Sticky : persiste jusqu'au prochain SCORE (relance de bille), qui le
      // retire via pushScore. Pas de duration.
      push(
        { mode: 'LIFE_LOST', livesRemaining, score, player },
        { priority: PRIO.LIFE_LOST },
      ),

    pushGameOver: (player, finalScore) => {
      // GAME_OVER est sticky : pas de duration. Pour le retirer, appeler
      // pushIntro() au reset.
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
        // Segment plein écran : le mode SCORE reprend après (fever en SCORE).
        { priority: PRIO.CINEMATIC, duration: clipTakeoverMs(clip) ?? clipShowMs(clip) },
      );
    },

    setAtmosphere: (upsideDownActive) => {
      if (atmosphereRef.current === upsideDownActive) return;
      atmosphereRef.current = upsideDownActive;
      // Re-pousse le display courant avec la nouvelle atmosphere.
      lastSentRef.current = '';
      sendCurrent();
    },
  };
}
