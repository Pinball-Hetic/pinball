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
import {
  UPSIDE_DOWN_TRANSITION_DURATION,
  UPSIDE_DOWN_TRANSITION_BLACKOUT,
  UPSIDE_DOWN_TRANSITION_REVEAL,
  UPSIDE_DOWN_TRANSITION_RESTORE,
  UPSIDE_DOWN_TRANSITION_TREMOR,
  UPSIDE_DOWN_TRANSITION_STROBE_HZ,
  UPSIDE_DOWN_PORTAL_OPEN_POLISH,
  UPSIDE_DOWN_PORTAL_PULSE_SPEED,
  UPSIDE_DOWN_PORTAL_ACCENT_PULSE_SPEED,
  UPSIDE_DOWN_PORTAL_VINE_COUNT,
  UPSIDE_DOWN_ATMOSPHERE_BLEND,
  UPSIDE_DOWN_ATMOSPHERE_BG,
  UPSIDE_DOWN_ATMOSPHERE_TINT,
  UPSIDE_DOWN_ATMOSPHERE_SURFACE_TINT,
  UPSIDE_DOWN_ATMOSPHERE_WALL_TINT,
  UPSIDE_DOWN_ATMOSPHERE_DECOR_TINT,
  UPSIDE_DOWN_ATMOSPHERE_EMISSIVE,
  UPSIDE_DOWN_ATMOSPHERE_DECOR_EMISSIVE,
  UPSIDE_DOWN_ATMOSPHERE_EXPOSURE,
  UPSIDE_DOWN_ATMOSPHERE_AMBIENT_INTENSITY,
  UPSIDE_DOWN_ATMOSPHERE_HEMI_INTENSITY,
  UPSIDE_DOWN_ATMOSPHERE_DIR_INTENSITY,
  UPSIDE_DOWN_ATMOSPHERE_FILL_INTENSITY,
  UPSIDE_DOWN_ATMOSPHERE_SHADE_OPACITY,
  UPSIDE_DOWN_ATMOSPHERE_SHADE_COLOR,
  UPSIDE_DOWN_ATMOSPHERE_FOG_COLOR,
  UPSIDE_DOWN_ATMOSPHERE_FOG_DENSITY,
  UPSIDE_DOWN_ATMOSPHERE_PULSE_EXPOSURE_MIN,
  UPSIDE_DOWN_ATMOSPHERE_PULSE_EXPOSURE_MAX,
  UPSIDE_DOWN_ATMOSPHERE_PULSE_EXPOSURE_SPEED,
  UPSIDE_DOWN_ATMOSPHERE_STROBE_HZ,
  UPSIDE_DOWN_ATMOSPHERE_BLEND_STROBE_HZ,
  UPSIDE_DOWN_ATMOSPHERE_SPORE_COUNT,
  UPSIDE_DOWN_HINT_MS,
} from './systems/UpsideDownConstants'

// ST layout. Transitional step: MapLayout is assembled from existing
// game-engine constants (referenced, not copied → no drift). Ownership flip
// (literals here, constants removed from game-engine) happens consumer by
// consumer.
export const layout: MapLayout = {
  // Bumpers: literals (tuned collider). The Box3 center of bumper_* meshes
  // deviates 11-15 mm (mushroom cap) → not derivable. TODO(blender): add
  // bumper_anchor_1/2/3 (empty at the collider point) to derive eventually.
  bumpers: [
    { x: -0.020586, y: 1.0482, z: -0.1967 },
    { x: -0.097406, y: 1.0621, z: -0.30509 },
    { x: 0.059483, y: 1.0621, z: -0.30509 },
  ],
  // Drop targets: positions derived from the GLB at runtime (LayoutResolver,
  // target_* meshes). Literals below = fallback (≤ 0.7 mm off the derived).
  dropTargets: [
    { id: 'drop_left_1', x: -0.209, y: 1.022, z: -0.019, side: 'left' },
    { id: 'drop_left_2', x: -0.205, y: 1.026, z: -0.049, side: 'left' },
    { id: 'drop_right_1', x: 0.157, y: 1.024, z: -0.041, side: 'right' },
    { id: 'drop_right_2', x: 0.148, y: 1.028, z: -0.077, side: 'right' },
    { id: 'drop_right_3', x: 0.137, y: 1.032, z: -0.114, side: 'right' },
  ],
  // TODO(blender): derive from the GLB once sensor_* meshes exist
  // (sensor_pop_1/2/3, sensor_rocket, sensor_demogorgon). Explicit literals
  // until then — no mesh in the current GLB.
  sensors: {
    popZones: [
      { x: -0.0225, y: 1.057, z: -0.448 },
      { x: -0.087, y: 1.056, z: -0.438 },
      { x: 0.042, y: 1.056, z: -0.438 },
    ],
    rocket: { x: 0.193, y: 1.021, z: -0.13 },
    // Scoop hole (saucer): capture → +life/+points/×2(5s) → kick. Position to
    // refine at smoke test (H key = collider wireframes).
    scoop: { x: 0.192, y: 1.028, z: -0.061 },
    bossReveal: { x: -0.0195, y: 1.0575, z: -0.269 },
    // sensor_portal (sensor Ø 1.7 cm) — literal until the mesh exists.
    portal: { x: -0.000751, y: 1.015191, z: -0.064818 },
  },
  // Spawns: analytic (no mesh expected — outside lane/hinge).
  spawns: {
    ball: { x: 0.2355, y: 1.01, z: 0.161 },
    alternateWorld: { x: -0.0225, z: -0.48 },
    alternateWorldImpulse: { x: 0, y: 0, z: 0.055 },
    // Normal-world return → the ball EXITS THE PORTAL (= sensors.portal) with
    // a push toward the flippers. Not the shooter lane: while `playing` the
    // plunger does not charge (idle only) and the lane gate is closed
    // → ball trapped. No re-trigger: the portal is closed after the cycle
    // (portalOpen=false until a boss reopens it).
    normalReturn: { x: -0.000751, z: -0.064818 },
    normalReturnImpulse: { x: 0, y: 0, z: 0.055 },
  },
  // Shooter lane: analytic geometry (no mesh). Map literals.
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
  // Fine flipper pivot tuning (offset from the bbox edge).
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
  atmosphere: {
    transition: {
      durationS: UPSIDE_DOWN_TRANSITION_DURATION,
      blackout: UPSIDE_DOWN_TRANSITION_BLACKOUT,
      reveal: UPSIDE_DOWN_TRANSITION_REVEAL,
      restore: UPSIDE_DOWN_TRANSITION_RESTORE,
      tremor: UPSIDE_DOWN_TRANSITION_TREMOR,
      strobeHz: UPSIDE_DOWN_TRANSITION_STROBE_HZ,
    },
    portalVisual: {
      openPolish: UPSIDE_DOWN_PORTAL_OPEN_POLISH,
      pulseSpeed: UPSIDE_DOWN_PORTAL_PULSE_SPEED,
      accentPulseSpeed: UPSIDE_DOWN_PORTAL_ACCENT_PULSE_SPEED,
      vineCount: UPSIDE_DOWN_PORTAL_VINE_COUNT,
    },
    blend: UPSIDE_DOWN_ATMOSPHERE_BLEND,
    bg: UPSIDE_DOWN_ATMOSPHERE_BG,
    tint: UPSIDE_DOWN_ATMOSPHERE_TINT,
    surfaceTint: UPSIDE_DOWN_ATMOSPHERE_SURFACE_TINT,
    wallTint: UPSIDE_DOWN_ATMOSPHERE_WALL_TINT,
    decorTint: UPSIDE_DOWN_ATMOSPHERE_DECOR_TINT,
    emissive: UPSIDE_DOWN_ATMOSPHERE_EMISSIVE,
    decorEmissive: UPSIDE_DOWN_ATMOSPHERE_DECOR_EMISSIVE,
    exposure: UPSIDE_DOWN_ATMOSPHERE_EXPOSURE,
    ambientIntensity: UPSIDE_DOWN_ATMOSPHERE_AMBIENT_INTENSITY,
    hemiIntensity: UPSIDE_DOWN_ATMOSPHERE_HEMI_INTENSITY,
    dirIntensity: UPSIDE_DOWN_ATMOSPHERE_DIR_INTENSITY,
    fillIntensity: UPSIDE_DOWN_ATMOSPHERE_FILL_INTENSITY,
    shadeOpacity: UPSIDE_DOWN_ATMOSPHERE_SHADE_OPACITY,
    shadeColor: UPSIDE_DOWN_ATMOSPHERE_SHADE_COLOR,
    fogColor: UPSIDE_DOWN_ATMOSPHERE_FOG_COLOR,
    fogDensity: UPSIDE_DOWN_ATMOSPHERE_FOG_DENSITY,
    pulseExposureMin: UPSIDE_DOWN_ATMOSPHERE_PULSE_EXPOSURE_MIN,
    pulseExposureMax: UPSIDE_DOWN_ATMOSPHERE_PULSE_EXPOSURE_MAX,
    pulseExposureSpeed: UPSIDE_DOWN_ATMOSPHERE_PULSE_EXPOSURE_SPEED,
    strobeHz: UPSIDE_DOWN_ATMOSPHERE_STROBE_HZ,
    blendStrobeHz: UPSIDE_DOWN_ATMOSPHERE_BLEND_STROBE_HZ,
    sporeCount: UPSIDE_DOWN_ATMOSPHERE_SPORE_COUNT,
    hintMs: UPSIDE_DOWN_HINT_MS,
    bannerLabel: 'Upside Down',
    hintLabel: 'Le monde s\'est inversé…',
  },
}
