import type { MapLayout } from '@pinball/game-engine'
import { bossDefinitions } from './bosses'
import {
  WALL_LEFT_X,
  WALL_RIGHT_X,
  WALL_TOP_Z,
  WALL_BOTTOM_Z,
  PLAYFIELD_SHADE_W,
  PLAYFIELD_SHADE_D,
  PLAYFIELD_SHADE_Y,
  PLAYFIELD_SHADE_Z,
  PLAYFIELD_SHADE_MAX_OPACITY,
} from '@pinball/game-engine'

// Layout Zelda. Géométrie identique au plateau physique ST (même board).
// Mettre à jour bumpers/dropTargets/sensors/shooterLane après export du GLB
// Zelda si les positions de meshes changent.
export const layout: MapLayout = {
  bumpers: [
    // Positions exactes extraites du node GLB zelda.glb (via dump-glb-meshes)
    { x: -0.02561, y: 1.02870, z: -0.19060 }, // bumper_3 (centre bas)
    { x: -0.09967, y: 1.04850, z: -0.32417 }, // bumper_2 (gauche haut)
    { x: 0.05183,  y: 1.04850, z: -0.32417 }, // bumper_1 (droite haut)
  ],
  dropTargets: [
    { id: 'drop_left_1', x: -0.209, y: 1.022, z: -0.019, side: 'left' },
    { id: 'drop_left_2', x: -0.205, y: 1.026, z: -0.049, side: 'left' },
    { id: 'drop_right_1', x: 0.157, y: 1.024, z: -0.041, side: 'right' },
    { id: 'drop_right_2', x: 0.148, y: 1.028, z: -0.077, side: 'right' },
    { id: 'drop_right_3', x: 0.137, y: 1.032, z: -0.114, side: 'right' },
  ],
  sensors: {
    popZones: [
      { x: -0.0225, y: 1.057, z: -0.448 },
      { x: -0.087, y: 1.056, z: -0.438 },
      { x: 0.042, y: 1.056, z: -0.438 },
    ],
    rocket: { x: 0.193, y: 1.021, z: -0.13 },
    bossReveal: { x: -0.0195, y: 1.0575, z: -0.269 },
    portal: { x: -0.0249, y: 1.01379, z: -0.0740 },
  },
  spawns: {
    ball: { x: 0.2355, y: 1.01, z: 0.161 },
    alternateWorld: { x: -0.0225, z: -0.48 },
    alternateWorldImpulse: { x: 0, y: 0, z: 0.055 },
    // Retour monde normal : repositionné près du haut du plateau (comme
    // alternateWorld) plutôt qu'à z=-0.12 — même plateau physique que ST
    // (cf. commentaire en tête de fichier), même bug/fix. À z=-0.12 la balle
    // réapparaissait déjà au niveau des slingshots/flippers et tombait pile
    // au centre sans rien pour la dévier avant le drain.
    normalReturn: { x: -0.0225, z: -0.46 },
    normalReturnImpulse: { x: 0, y: 0, z: 0.06 },
  },
  shooterLane: {
    xMin: 0.206,
    xMax: 0.265,
    bottomZ: 0.42,
    topZ: -0.49,
    wallHeight: 0.05,
    wallThickness: 0.02,
    restitution: 0.2,
    friction: 0.08,
    leftWallTopZ: -0.28,
    lockX: 0.19,
    exitX: 0.18,
    failZ: 0.3,
    guideCenter: { x: 0.206, z: -0.4 },
    guideRadius: 0.059,
    guideSegments: 10,
    guideAngleStart: Math.PI * 1.5,
    guideAngleEnd: Math.PI * 2,
  },
  flipperPivots: {
    leftX: 0.02,
    rightX: -0.02,
    y: 0.0,
    z: -0.018,
  },
  bosses: bossDefinitions,
  geometry: {
    // surfaceYAtZ(z) = 1.068 - ((z + 0.552) / 0.970) * 0.110
    coefficients: { base: 1.068, zOffset: 0.552, zSpan: 0.97, yDrop: 0.11 },
    bounds: { leftX: WALL_LEFT_X, rightX: WALL_RIGHT_X, topZ: WALL_TOP_Z, bottomZ: WALL_BOTTOM_Z },
    shade: {
      width: PLAYFIELD_SHADE_W,
      depth: PLAYFIELD_SHADE_D,
      y: PLAYFIELD_SHADE_Y,
      z: PLAYFIELD_SHADE_Z,
      maxOpacity: PLAYFIELD_SHADE_MAX_OPACITY,
    },
  },
  // Sacred Realm : atmosphère dorée / verte — à affiner avec les constantes
  // dédiées quand le module ZeldaAtmosphere sera implémenté.
  atmosphere: {
    transition: {
      durationS: 2.0,
      blackout: 0.3,
      reveal: 0.5,
      restore: 0.4,
      tremor: 0.2,
      strobeHz: 8,
    },
    portalVisual: {
      openPolish: 0.8,
      pulseSpeed: 1.5,
      accentPulseSpeed: 2.0,
      vineCount: 0,
    },
    blend: 2.0,
    bg: 0x081a08,
    tint: 0x0a2010,
    surfaceTint: 0x081508,
    wallTint: 0x0a1e10,
    decorTint: 0x123018,
    emissive: 0x0a3015,
    decorEmissive: 0x154020,
    exposure: 1.1,
    ambientIntensity: 0.55,
    hemiIntensity: 0.45,
    dirIntensity: 1.0,
    fillIntensity: 0.4,
    shadeOpacity: 0.3,
    shadeColor: 0x082008,
    fogColor: 0x051005,
    fogDensity: 0.1,
    pulseExposureMin: 0.9,
    pulseExposureMax: 1.3,
    pulseExposureSpeed: 0.7,
    strobeHz: 0,
    blendStrobeHz: 0,
    sporeCount: 0,
    hintMs: 45_000,
    bannerLabel: 'Sacred Realm',
    hintLabel: 'Le Royaume Sacré t\'appelle…',
  },
}
