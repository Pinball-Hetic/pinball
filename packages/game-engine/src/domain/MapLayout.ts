import type { BossDefinition } from './BossRegistry';

// Placement/geometry data for a map, injected into the engine. TYPES live in
// game-engine; VALUES live in the map package (layout.ts).

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
  popZones: MapPoint3[]; // pop-bumper zone sensors
  rocket: MapPoint3; // ramp sensor
  bossReveal: MapPoint3; // boss-reveal flash anchor (normal world)
  portal: MapPoint3; // alternate-world portal anchor
  scoop?: MapPoint3; // saucer hole sensor: capture → rewards → kick. Optional.
}

export interface SpawnLayout {
  ball: MapPoint3; // shooter lane spawn
  alternateWorld: MapPoint2; // alternate-world spawn
  alternateWorldImpulse: MapPoint3; // alternate-world entry impulse
  normalReturn: MapPoint2; // return-to-normal-world spawn
  normalReturnImpulse: MapPoint3; // return impulse
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

// All alternate-world atmosphere tuning (atmosphere is provided by the map).
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
  /** Active-atmosphere banner label (e.g. « monde alternatif »). */
  bannerLabel: string;
  /** Atmosphere-entry hint label (e.g. « Le monde s'est inversé… »). */
  hintLabel: string;
}

export interface MapLayout {
  bumpers: MapPoint3[];
  dropTargets: DropTargetDef[];
  sensors: SensorLayout;
  spawns: SpawnLayout;
  shooterLane: ShooterLaneLayout;
  flipperPivots: FlipperPivots;
  bosses: BossDefinition[];
  geometry: GeometryLayout;
  atmosphere: AtmosphereLayout;
}
