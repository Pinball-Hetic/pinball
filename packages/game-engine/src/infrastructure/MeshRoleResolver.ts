// Résout le rôle physique d'un mesh à partir de son nom, par convention de
// préfixe. Une map fournit un GLB nommé selon ces conventions ; un éventuel
// `meshAliases` (manifest) traduit d'abord les noms legacy avant le matching.
//
// Conventions (préfixe → rôle) :
//   vis_        décor, zéro physique
//   floor_      surface de jeu → trimesh + dérivation de pente
//   wall_       trimesh solide
//   flipper_    flipper_left / flipper_right
//   bumper_<n>  collider analytique + visuel
//   slingshot_  slingshot_left / slingshot_right
//   target_<id> drop target
//   sensor_<id> zone trigger (pas de solide)
//   lane_       couloir plongeur

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
  /** Suffixe après le préfixe (ex. bumper_1 → '1', flipper_left → 'left'). */
  id: string;
}

// Ordre indifférent : les préfixes ne se chevauchent pas.
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

/** Normalise un nom GLB : minuscules, séparateurs (espace/point/tiret) → underscore. */
export function normalizeMeshName(name: string): string {
  return name.toLowerCase().replace(/[\s.-]+/g, '_');
}

export class MeshRoleResolver {
  private readonly aliases: Record<string, string>;
  // Noms non résolus (ni rôle ni vis_) — agrégés pour un seul warn.
  private readonly unresolved = new Set<string>();
  private warned = false;

  constructor(aliases: Record<string, string> = {}) {
    // Normalise les clés d'alias pour matcher quel que soit le casing du GLB.
    this.aliases = {};
    for (const [from, to] of Object.entries(aliases)) {
      this.aliases[normalizeMeshName(from)] = normalizeMeshName(to);
    }
  }

  /** Rôle + id du mesh, ou null si non reconnu (enregistré pour warn agrégé). */
  resolve(meshName: string): ResolvedRole | null {
    const norm = normalizeMeshName(meshName);
    const canonical = this.aliases[norm] ?? norm;

    for (const [prefix, role] of PREFIXES) {
      if (canonical.startsWith(prefix)) {
        return { role, id: canonical.slice(prefix.length) };
      }
    }

    this.unresolved.add(meshName);
    return null;
  }

  /** Liste agrégée des meshes sans rôle (hors vis_). */
  getUnresolved(): string[] {
    return [...this.unresolved];
  }

  /** Émet un unique console.warn récapitulatif si des meshes sont non résolus. */
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
