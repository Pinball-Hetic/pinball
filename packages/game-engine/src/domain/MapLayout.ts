import type { BossDefinition } from './BossRegistry';

// Données de placement/géométrie d'une map. Le moteur reçoit ce bloc par
// injection (phase 4) au lieu d'importer des constantes ST. Les TYPES vivent
// dans game-engine ; les VALEURS dans le package de la map (layout.ts).

export interface MapPoint3 {
  x: number;
  y: number;
  z: number;
}

export interface MapPoint2 {
  x: number;
  z: number;
}

export interface DropTargetDef {
  id: string;
  x: number;
  y: number;
  z: number;
  side: 'left' | 'right';
}

export interface SensorLayout {
  popZones: MapPoint3[]; // capteurs de zone pop-bumper
  rocket: MapPoint3; // capteur de rampe
  bossReveal: MapPoint3; // ancre de flash du reveal boss (monde normal)
  portal: MapPoint3; // ancre du portail monde alternatif
  scoop?: MapPoint3; // trou capteur (saucer) : capture → récompenses → kick. Optionnel.
}

export interface SpawnLayout {
  ball: MapPoint3; // spawn couloir plongeur
  alternateWorld: MapPoint2; // spawn monde alternatif
  alternateWorldImpulse: MapPoint3; // impulsion d'entrée monde alternatif
  normalReturn: MapPoint2; // spawn retour monde normal
  normalReturnImpulse: MapPoint3; // impulsion de retour
}

export interface ShooterLaneLayout {
  xMin: number;
  xMax: number;
  bottomZ: number;
  topZ: number;
  wallHeight: number;
  wallThickness: number;
  restitution: number;
  friction: number;
  leftWallTopZ: number;
  lockX: number;
  exitX: number;
  failZ: number;
  guideCenter: MapPoint2;
  guideRadius: number;
  guideSegments: number;
  guideAngleStart: number;
  guideAngleEnd: number;
}

export interface FlipperPivots {
  leftX: number;
  rightX: number;
  y: number;
  z: number;
}

// surfaceYAtZ(z) = base - ((z + zOffset) / zSpan) * yDrop
export interface SurfaceCoefficients {
  base: number;
  zOffset: number;
  zSpan: number;
  yDrop: number;
}

export interface PlayfieldBounds {
  leftX: number; // WALL_LEFT_X
  rightX: number; // WALL_RIGHT_X
  topZ: number; // WALL_TOP_Z
  bottomZ: number; // WALL_BOTTOM_Z
}

export interface GeometryLayout {
  coefficients: SurfaceCoefficients;
  bounds: PlayfieldBounds;
  shade: {
    width: number; // PLAYFIELD_SHADE_W
    depth: number; // PLAYFIELD_SHADE_D
    y: number; // PLAYFIELD_SHADE_Y
    z: number; // PLAYFIELD_SHADE_Z
    maxOpacity: number; // PLAYFIELD_SHADE_MAX_OPACITY
  };
}

// Tous les réglages d'ambiance monde alternatif (ambiance fournie par la map).
export interface AtmosphereLayout {
  transition: {
    durationS: number;
    blackout: number;
    reveal: number;
    restore: number;
    tremor: number;
    strobeHz: number;
  };
  portalVisual: {
    openPolish: number;
    pulseSpeed: number;
    accentPulseSpeed: number;
    vineCount: number;
  };
  blend: number;
  bg: number;
  tint: number;
  surfaceTint: number;
  wallTint: number;
  decorTint: number;
  emissive: number;
  decorEmissive: number;
  exposure: number;
  ambientIntensity: number;
  hemiIntensity: number;
  dirIntensity: number;
  fillIntensity: number;
  shadeOpacity: number;
  shadeColor: number;
  fogColor: number;
  fogDensity: number;
  pulseExposureMin: number;
  pulseExposureMax: number;
  pulseExposureSpeed: number;
  strobeHz: number;
  blendStrobeHz: number;
  sporeCount: number;
  hintMs: number;
  /** Libellé de la bannière d'atmosphère active (ex. « monde alternatif »). */
  bannerLabel: string;
  /** Libellé du hint d'entrée dans l'atmosphère (ex. « Le monde s'est inversé… »). */
  hintLabel: string;
}

export interface MapLayout {
  bumpers: MapPoint3[]; // BUMPER_POSITIONS
  dropTargets: DropTargetDef[]; // DROP_TARGETS
  sensors: SensorLayout;
  spawns: SpawnLayout;
  shooterLane: ShooterLaneLayout;
  flipperPivots: FlipperPivots;
  bosses: BossDefinition[]; // BOSS_REGISTRY (données ; types restent dans game-engine)
  geometry: GeometryLayout;
  atmosphere: AtmosphereLayout;
}
