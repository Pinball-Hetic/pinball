// ───────────────────────────────────────────────────────────────────────────
// Machine à états PURE de la « prise d'écran » (takeover) du backglass.
//
// POURQUOI CE FICHIER EXISTE
// Avant, toute cette logique vivait DANS le hook React `useBackglassTakeover`
// (~320 lignes), mélangée avec la connexion Socket.io et les `setState`. Le hook
// avait donc plusieurs responsabilités à la fois → violation du principe SRP
// (Single Responsibility Principle, le « S » de SOLID).
//
// On isole ici la SEULE responsabilité « décider quelle scène afficher » :
//   - une PILE de scènes candidates, chacune avec une PRIORITÉ et une expiration,
//   - la purge des scènes expirées + l'enchaînement (`followUp`),
//   - la surbrillance temporaire d'une ligne de classement (high-score),
//   - l'« attract mode » après une période d'inactivité,
//   - le choix de la scène active = la plus haute priorité.
//
// Cette classe ne connaît NI React NI Socket.io → elle est testable unitairement
// (on lui injecte le temps `now` et quelques callbacks). Le hook devient un
// simple orchestrateur (cf. useBackglassTakeover.ts).
// ───────────────────────────────────────────────────────────────────────────

import type { GameOver } from '@pinball/shared-types';

export type TakeoverScene =
  | 'HIGH_SCORE'
  | 'RECAP'
  | 'MAP_EVENT'
  | 'ATTRACT'
  | 'CINEMATIC';

/** Scène effectivement affichée par l'UI (résultat exposé au composant). */
export interface Takeover {
  scene: TakeoverScene;
  payload?: GameOver & { rank: number };
  clip?: string;
}

// Chaînage : la scène suivante n'est poussée qu'à l'expiration de la courante
// (sa durée démarre alors). Le modèle pile-à-priorités préempte mais ne séquence
// pas — followUp ajoute le séquençage.
export interface FollowUp {
  scene: TakeoverScene;
  durationMs: number;
  priority?: number;
  payload?: GameOver & { rank: number };
}

/** Une scène candidate dans la pile (avec priorité + horodatage d'expiration). */
export interface StackEntry {
  scene: TakeoverScene;
  priority: number;
  expiresAt: number;
  payload?: GameOver & { rank: number };
  clip?: string;
  followUp?: FollowUp;
}

/** Dépendances injectées au `tick` (gardent la classe pure : aucun accès direct). */
export interface TakeoverTickDeps {
  /** true si ce clip doit retarder le flip 3D du hall of fame (ex. portal_swallow). */
  holdsHallFlip: (clip: string) => boolean;
  /** Pseudo à afficher sur le Joyce wall en attract mode (n°1 du classement), ou null. */
  attractJoyceName: () => string | null;
  /** Émet un signal Joyce (effet de bord délégué au hook). */
  onJoyce: (text: string) => void;
}

/** État dérivé renvoyé à chaque tick (consommé par le hook pour son setState). */
export interface TakeoverTickResult {
  top: StackEntry | null;
  highlightRank: number | undefined;
  holdHallFlip: boolean;
}

const HIGHLIGHT_MS = 4_000;
const ATTRACT_IDLE_MS = 60_000;
const JOYCE_IDLE_MS = 90_000;

export class TakeoverStack {
  private stack: StackEntry[] = [];
  private lastActivity = 0;
  private lastJoyceIdle = 0;
  private highlightUntil = 0;
  private highlightRank: number | undefined = undefined;

  /** À appeler une fois au démarrage : initialise les horloges d'inactivité. */
  start(now: number): void {
    this.lastActivity = now;
    this.lastJoyceIdle = now;
  }

  /** Signale une activité de jeu → repousse le déclenchement de l'attract mode. */
  markActivity(now: number): void {
    this.lastActivity = now;
  }

  /** Empile une scène candidate (la plus haute priorité gagnera au prochain tick). */
  push(entry: StackEntry): void {
    this.stack.push(entry);
  }

  /**
   * Avance la machine à l'instant `now` :
   *  1. purge les scènes expirées,
   *  2. enchaîne les `followUp` des scènes qui viennent d'expirer,
   *  3. gère la surbrillance de la ligne high-score,
   *  4. (dé)clenche l'attract mode selon l'inactivité,
   *  5. renvoie la scène active (priorité max) + l'état dérivé.
   */
  tick(now: number, deps: TakeoverTickDeps): TakeoverTickResult {
    // 1. purge des scènes expirées
    const expiring = this.stack.filter((e) => e.expiresAt <= now);
    this.stack = this.stack.filter((e) => e.expiresAt > now);

    // 2. chaînage : une scène expirée avec un followUp pousse la suivante
    //    MAINTENANT (sa durée démarre ici, plus de masquage).
    for (const e of expiring) {
      if (e.followUp) {
        this.stack.push({
          scene: e.followUp.scene,
          priority: e.followUp.priority ?? 80,
          expiresAt: now + e.followUp.durationMs,
          payload: e.followUp.payload,
        });
      }
    }

    // 3. un HIGH_SCORE qui vient d'expirer → surbrillance de la ligne. Si un
    //    followUp (RECAP) suit, on prolonge la surbrillance pour qu'elle survive
    //    au recap et reste visible sur la scène de base.
    const highExpired = expiring.find((e) => e.scene === 'HIGH_SCORE');
    if (highExpired?.payload) {
      this.highlightRank = highExpired.payload.rank;
      const extra = highExpired.followUp ? highExpired.followUp.durationMs : 0;
      this.highlightUntil = now + extra + HIGHLIGHT_MS;
    }
    if (this.highlightUntil && now > this.highlightUntil) {
      this.highlightUntil = 0;
      this.highlightRank = undefined;
    }

    // 4. ATTRACT : aucune activité depuis ATTRACT_IDLE_MS
    const idle = now - this.lastActivity > ATTRACT_IDLE_MS;
    const hasReal = this.stack.some((e) => e.scene !== 'ATTRACT');
    this.stack = this.stack.filter((e) => e.scene !== 'ATTRACT');
    if (idle && !hasReal) {
      this.stack.push({ scene: 'ATTRACT', priority: 10, expiresAt: Infinity });
      // pseudo du n°1 sur le Joyce wall, périodiquement
      if (now - this.lastJoyceIdle > JOYCE_IDLE_MS) {
        this.lastJoyceIdle = now;
        const name = deps.attractJoyceName();
        if (name) deps.onJoyce(name);
      }
    }

    // 5. takeover actif = plus haute priorité
    const top = this.stack.reduce<StackEntry | null>(
      (best, e) => (!best || e.priority > best.priority ? e : best),
      null,
    );

    // Clip qui retarde le flip 3D du hall of fame (ex. portal_swallow).
    const holdHallFlip = this.stack.some(
      (e) => e.scene === 'CINEMATIC' && e.clip != null && deps.holdsHallFlip(e.clip),
    );

    return { top, highlightRank: this.highlightRank, holdHallFlip };
  }
}
