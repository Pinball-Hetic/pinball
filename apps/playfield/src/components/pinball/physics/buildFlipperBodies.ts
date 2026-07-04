import * as THREE from "three";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";
import type RAPIER from "@dimforge/rapier3d-compat";
import {
  buildFlipperHullBody,
  FLIPPER_RESTITUTION,
  FLIPPER_FRICTION,
  type FlipperPivot,
} from "@pinball/game-engine";

// Debug colors (wireframe hull + pivot sphere) per flipper.
const LEFT_DEBUG_COLOR = 0x00ffff;
const RIGHT_DEBUG_COLOR = 0xff00ff;

export interface FlipperBodyResult {
  body: RAPIER.RigidBody | null;
  debugMesh: THREE.Mesh | null;
  offset: THREE.Vector3;
}

export interface FlipperBodiesResult {
  left: FlipperBodyResult;
  right: FlipperBodyResult;
  leftPivotMarker: THREE.Mesh | null;
  rightPivotMarker: THREE.Mesh | null;
}

export interface BuildFlipperBodiesDeps {
  world: RAPIER.World;
  scene: THREE.Object3D;
  leftFlipper: THREE.Mesh | null;
  rightFlipper: THREE.Mesh | null;
  leftPivot: FlipperPivot | null;
  rightPivot: FlipperPivot | null;
  // Component dispose registries — the geos/mats created here are pushed in.
  disposableGeos: THREE.BufferGeometry[];
  disposableMats: THREE.Material[];
}

// Setup-only construction (no frame work): flipper kinematic bodies + debug
// convex hulls, plus the pivot marker spheres (visible when H is active).
// Meshes are added to the scene and registered for dispose. Nothing reads
// them from the animate loop during construction — the returned refs are
// assigned in the init closure afterwards.
export function buildFlipperBodies(
  deps: BuildFlipperBodiesDeps,
): FlipperBodiesResult {
  const {
    world,
    scene,
    leftFlipper,
    rightFlipper,
    leftPivot,
    rightPivot,
    disposableGeos,
    disposableMats,
  } = deps;

  const makeBody = (
    flipper: THREE.Mesh | null,
    debugColor: number,
  ): FlipperBodyResult => {
    if (!flipper) {
      return { body: null, debugMesh: null, offset: new THREE.Vector3() };
    }

    const { body, localOffset, localPts } = buildFlipperHullBody(world, flipper, {
      restitution: FLIPPER_RESTITUTION,
      friction: FLIPPER_FRICTION,
    });

    const convexGeo = new ConvexGeometry(localPts);
    const convexMat = new THREE.MeshBasicMaterial({
      color: debugColor,
      wireframe: true,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
    });
    const debugMesh = new THREE.Mesh(convexGeo, convexMat);
    debugMesh.renderOrder = 999;
    debugMesh.visible = false;
    scene.add(debugMesh);
    disposableGeos.push(convexGeo);
    disposableMats.push(convexMat);

    return { body, debugMesh, offset: localOffset };
  };

  const left = makeBody(leftFlipper, LEFT_DEBUG_COLOR);
  const right = makeBody(rightFlipper, RIGHT_DEBUG_COLOR);

  // Pivot debug markers — spheres visible when H is active.
  const pivotGeo = new THREE.SphereGeometry(0.008, 12, 12);
  const pivotMatL = new THREE.MeshBasicMaterial({ color: LEFT_DEBUG_COLOR, depthTest: false });
  const pivotMatR = new THREE.MeshBasicMaterial({ color: RIGHT_DEBUG_COLOR, depthTest: false });
  disposableGeos.push(pivotGeo);
  disposableMats.push(pivotMatL, pivotMatR);

  const makePivotMarker = (
    pivot: FlipperPivot | null,
    mat: THREE.Material,
  ): THREE.Mesh | null => {
    if (!pivot) return null;
    const wp = new THREE.Vector3();
    pivot.pivot.getWorldPosition(wp);
    const marker = new THREE.Mesh(pivotGeo, mat);
    marker.position.copy(wp);
    marker.renderOrder = 1000;
    marker.visible = false;
    scene.add(marker);
    return marker;
  };

  return {
    left,
    right,
    leftPivotMarker: makePivotMarker(leftPivot, pivotMatL),
    rightPivotMarker: makePivotMarker(rightPivot, pivotMatR),
  };
}
