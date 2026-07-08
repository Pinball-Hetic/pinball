import * as THREE from 'three';
import { MeshRoleResolver } from './MeshRoleResolver';
import type { MapLayout, MapPoint3 } from '../domain/MapLayout';

export interface DerivedLayout {
  bumpers: (MapPoint3 | null)[];
  dropTargets: Record<string, MapPoint3>;
}

function ancestryNames(obj: THREE.Object3D): string[] {
  const names: string[] = [];
  let cur: THREE.Object3D | null = obj;
  while (cur) {
    names.push(cur.name);
    cur = cur.parent;
  }
  return names;
}

function worldCenter(mesh: THREE.Object3D): MapPoint3 {
  const box = new THREE.Box3().setFromObject(mesh);
  const c = box.getCenter(new THREE.Vector3());
  return { x: c.x, y: c.y, z: c.z };
}

function distMm(a: MapPoint3, b: MapPoint3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) * 1000;
}

export class LayoutResolver {
  static derive(playfieldRoot: THREE.Object3D, resolver: MeshRoleResolver): DerivedLayout {
    playfieldRoot.updateMatrixWorld(true);
    const bumpers: (MapPoint3 | null)[] = [];
    const dropTargets: Record<string, MapPoint3> = {};

    playfieldRoot.traverse((child) => {
      const resolved = resolver.resolveFromAncestry(ancestryNames(child));
      if (!resolved) return;
      if (resolved.role === 'bumper') {
        const n = parseInt(resolved.id, 10);
        if (!Number.isNaN(n)) bumpers[n - 1] = worldCenter(child);
      } else if (resolved.role === 'target') {
        dropTargets[`drop_${resolved.id}`] = worldCenter(child);
      }
    });

    return { bumpers, dropTargets };
  }

  static deriveAndCompare(
    playfieldRoot: THREE.Object3D,
    resolver: MeshRoleResolver,
    layout: MapLayout,
    toleranceMm = 5,
  ): DerivedLayout {
    const derived = LayoutResolver.derive(playfieldRoot, resolver);
    const log = (id: string, d: MapPoint3 | undefined, c: MapPoint3 | undefined): void => {
      if (!d || !c) {
        // eslint-disable-next-line no-console
        console.warn(`[LayoutResolver] ${id} — ${!d ? 'pas de mesh dérivé' : 'pas de constante'}`);
        return;
      }
      const delta = distMm(d, c);
      const mark = delta <= toleranceMm ? 'OK' : '⚠ HORS TOLÉRANCE';
      const fmt = (v: MapPoint3) => `{${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}}`;
      // eslint-disable-next-line no-console
      console.log(
        `[LayoutResolver] ${id} derived=${fmt(d)} constant=${fmt(c)} delta=${delta.toFixed(1)}mm ${mark}`,
      );
    };

    layout.bumpers.forEach((c, i) => log(`bumper_${i + 1}`, derived.bumpers[i] ?? undefined, c));
    for (const t of layout.dropTargets) {
      log(t.id, derived.dropTargets[t.id], { x: t.x, y: t.y, z: t.z });
    }
    return derived;
  }

  // Bumpers are NOT derived (Box3 center ≠ tuned collider point, deltas out of
  // tolerance) → they keep their literals; a drop target without a mesh too.
  static withDerivedDropTargets(layout: MapLayout, derived: DerivedLayout): MapLayout {
    return {
      ...layout,
      dropTargets: layout.dropTargets.map((dt) => {
        const d = derived.dropTargets[dt.id];
        return d ? { ...dt, x: d.x, y: d.y, z: d.z } : dt;
      }),
    };
  }
}
