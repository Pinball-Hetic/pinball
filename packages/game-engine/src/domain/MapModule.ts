import type * as THREE from 'three';
import type { MapManifest, MapState } from '@pinball/shared-types';
import type { GameEvent } from './GameEvents';
import type { MapLayout } from './MapLayout';
import type { PhysicsWorld } from '../infrastructure/PhysicsWorld';

// Contrat runtime d'un module de map (comportement playfield custom). Le
// moteur reste générique : un module reçoit un MapContext (injecté par
// PinballPlayfield) qui expose les leviers du game loop, sans que le module
// ne touche directement aux refs React ni au rendu bas niveau.
export interface MapContext {
  scene: THREE.Scene;
  physics: PhysicsWorld;
  layout: MapLayout;
  manifest: MapManifest;

  /** Résout un objet de la scène par nom (applique meshAliases). */
  resolve(name: string): THREE.Object3D | null;

  /** Ajoute du score (+ label DMD optionnel) via le scoring du jeu. */
  addScore(points: number, label?: string): void;

  /** Patche le sac d'état de la map → propagé dans les snapshots. */
  setMapState(patch: MapState): void;

  /** Force le multiplicateur effectif (ex. fever) pour une durée. */
  forceMultiplier(value: number, durationMs: number): void;

  /** Pousse un event DMD (label + points). */
  pushDmdEvent(label: string, points: number): void;

  /** Joue une cinématique (gel + DMD + backglass, timings du manifest). */
  playCinematic(clipId: string): void;

  /** Active/désactive l'atmosphère custom (dim/strobe/fog). */
  setAtmosphere(active: boolean): void;

  /** Émet un GameEvent dans la chaîne (scoring, DMD, etc.). */
  emitGameEvent(e: GameEvent): void;
}

export interface MapModule {
  /** Appelé une fois après le chargement du GLB. */
  setup(ctx: MapContext): void;
  /** Chaque GameEvent du jeu (le module réagit à ceux qui le concernent). */
  onGameEvent(e: GameEvent): void;
  /** Boucle d'animation (dt en secondes). */
  update(dt: number): void;
  /** Reset de partie (nouvelle bille / nouvelle partie). */
  onGameReset(): void;
  /** Nettoyage (démontage de la scène). */
  dispose(): void;
}
