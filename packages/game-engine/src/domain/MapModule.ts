import type * as THREE from 'three';
import type { MapManifest, MapState } from '@pinball/shared-types';
import type { GameEvent } from './GameEvents';
import type { MapLayout } from './MapLayout';
import type { PhysicsWorld } from '../infrastructure/PhysicsWorld';

// Contrat runtime d'un module de map (comportement playfield custom). Le
// moteur reste générique : un module reçoit un MapContext (injecté par
// PinballPlayfield) qui expose les leviers du game loop, sans que le module
// ne touche directement aux refs React ni au rendu bas niveau.
// Éclairage de la scène (manipulé par les ambiances de map, ex. Upside Down).
export interface MapLighting {
  renderer: THREE.WebGLRenderer;
  ambient: THREE.AmbientLight;
  hemi: THREE.HemisphereLight;
  dir: THREE.DirectionalLight;
  fill: THREE.DirectionalLight;
}

export interface MapContext {
  scene: THREE.Scene;
  /** Racine du GLB chargé (sous laquelle vivent les meshes de la map). */
  root: THREE.Object3D;
  camera: THREE.Camera;
  physics: PhysicsWorld;
  layout: MapLayout;
  manifest: MapManifest;
  lighting: MapLighting;
  /** Map handle collider → rôle (pour créer des sensors taggés, ex. portail). */
  colliderMap: Map<number, string>;

  /** Résout un objet de la scène par nom (applique meshAliases). */
  resolve(name: string): THREE.Object3D | null;

  /** Ouvre/ferme la « porte » d'un sensor de portail côté traitement collision. */
  setPortalGateOpen(open: boolean): void;

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
  /** true → le moteur gèle la physique cette frame (ex. transition de monde). */
  shouldFreezePhysics?(): boolean;
}
