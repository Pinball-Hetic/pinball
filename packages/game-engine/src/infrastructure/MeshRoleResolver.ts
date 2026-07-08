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

export function normalizeMeshName(name: string): string {
  return name.toLowerCase().replace(/[\s.-]+/g, '_');
}

export class MeshRoleResolver {
  private readonly aliases: Record<string, string>;
  private readonly unresolved = new Set<string>();
  private warned = false;

  constructor(aliases: Record<string, string> = {}) {
    this.aliases = {};
    for (const [from, to] of Object.entries(aliases)) {
      this.aliases[normalizeMeshName(from)] = normalizeMeshName(to);
    }
  }

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

  resolve(meshName: string): ResolvedRole | null {
    const r = this.match(meshName);
    if (!r) this.unresolved.add(meshName);
    return r;
  }

  // Most specific first: a parent group prefixed once is inherited by children
  // (per-material split primitives), and a named child can override its group.
  resolveFromAncestry(namesFromSelfToRoot: string[]): ResolvedRole | null {
    for (const name of namesFromSelfToRoot) {
      const r = this.match(name);
      if (r) return r;
    }
    if (namesFromSelfToRoot.length > 0) this.unresolved.add(namesFromSelfToRoot[0]);
    return null;
  }

  getUnresolved(): string[] {
    return [...this.unresolved];
  }

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
