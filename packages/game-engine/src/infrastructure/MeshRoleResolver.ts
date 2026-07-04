// Resolves a mesh's physical role from its name, by prefix convention. A map
// provides a GLB named to these conventions; an optional `meshAliases`
// (manifest) first translates legacy names before matching.
//
// Conventions (prefix → role):
//   vis_        decor, zero physics
//   floor_      play surface → trimesh + slope derivation
//   wall_       solid trimesh
//   flipper_    flipper_left / flipper_right
//   bumper_<n>  analytic collider + visual
//   slingshot_  slingshot_left / slingshot_right
//   target_<id> drop target
//   sensor_<id> trigger zone (no solid)
//   lane_       shooter lane

export type MeshRole =
  | 'vis'
  | 'floor'
  | 'wall'
  | 'flipper'
  | 'bumper'
  | 'slingshot'
  | 'target'
  | 'sensor'
  | 'lane';

export interface ResolvedRole {
  role: MeshRole;
  /** Suffix after the prefix (e.g. bumper_1 → '1', flipper_left → 'left'). */
  id: string;
}

// Order does not matter: the prefixes do not overlap.
const PREFIXES: ReadonlyArray<readonly [string, MeshRole]> = [
  ['vis_', 'vis'],
  ['floor_', 'floor'],
  ['wall_', 'wall'],
  ['flipper_', 'flipper'],
  ['bumper_', 'bumper'],
  ['slingshot_', 'slingshot'],
  ['target_', 'target'],
  ['sensor_', 'sensor'],
  ['lane_', 'lane'],
];

/** Normalizes a GLB name: lowercase, separators (space/dot/dash) → underscore. */
export function normalizeMeshName(name: string): string {
  return name.toLowerCase().replace(/[\s.-]+/g, '_');
}

export class MeshRoleResolver {
  private readonly aliases: Record<string, string>;
  // Unresolved names (no role, no vis_) — aggregated into a single warn.
  private readonly unresolved = new Set<string>();
  private warned = false;

  constructor(aliases: Record<string, string> = {}) {
    // Normalize alias keys to match regardless of the GLB casing.
    this.aliases = {};
    for (const [from, to] of Object.entries(aliases)) {
      this.aliases[normalizeMeshName(from)] = normalizeMeshName(to);
    }
  }

  /** Matches a single name (alias + prefix), side-effect free. */
  private match(name: string): ResolvedRole | null {
    const norm = normalizeMeshName(name);
    const canonical = this.aliases[norm] ?? norm;
    for (const [prefix, role] of PREFIXES) {
      if (canonical.startsWith(prefix)) {
        return { role, id: canonical.slice(prefix.length) };
      }
    }
    return null;
  }

  /** Mesh role + id, or null if unrecognized (recorded for the aggregated warn). */
  resolve(meshName: string): ResolvedRole | null {
    const r = this.match(meshName);
    if (!r) this.unresolved.add(meshName);
    return r;
  }

  /**
   * Resolves by walking up the hierarchy: names from the mesh toward the
   * root, first recognized prefix wins (most specific first). Lets a parent
   * GROUP be prefixed once for all its children — primitives coming from a
   * per-material split (e.g. `Circle.018` → `Mesh_8/9/10`) inherit the
   * parent's role. A named child can override its group.
   */
  resolveFromAncestry(namesFromSelfToRoot: string[]): ResolvedRole | null {
    for (const name of namesFromSelfToRoot) {
      const r = this.match(name);
      if (r) return r;
    }
    // No ancestor resolved → record the most specific name (the mesh).
    if (namesFromSelfToRoot.length > 0) this.unresolved.add(namesFromSelfToRoot[0]);
    return null;
  }

  /** Aggregated list of meshes with no role (vis_ excluded). */
  getUnresolved(): string[] {
    return [...this.unresolved];
  }

  /** Emits a single summary console.warn if some meshes are unresolved. */
  warnUnresolvedOnce(): void {
    if (this.warned || this.unresolved.size === 0) return;
    this.warned = true;
    // eslint-disable-next-line no-console
    console.warn(
      `[MeshRoleResolver] ${this.unresolved.size} mesh(es) sans rôle ni préfixe vis_ ` +
        `(ignorés) : ${[...this.unresolved].join(', ')}`,
    );
  }
}
