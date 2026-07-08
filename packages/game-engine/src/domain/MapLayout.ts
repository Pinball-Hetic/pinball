import type { BossDefinition } from './BossRegistry';

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
  popZones: MapPoint3[];
  rocket: MapPoint3;
  bossReveal: MapPoint3;
  portal: MapPoint3;
  scoop?: MapPoint3;
}

export interface SpawnLayout {
  ball: MapPoint3;
  alternateWorld: MapPoint2;
  alternateWorldImpulse: MapPoint3;
  normalReturn: MapPoint2;
  normalReturnImpulse: MapPoint3;
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
  leftX: number;
  rightX: number;
  topZ: number;
  bottomZ: number;
}

export interface GeometryLayout {
  coefficients: SurfaceCoefficients;
  bounds: PlayfieldBounds;
  shade: {
    width: number;
    depth: number;
    y: number;
    z: number;
    maxOpacity: number;
  };
}

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
  bannerLabel: string;
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
