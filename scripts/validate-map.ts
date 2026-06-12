// Valide une map : manifest (champs requis) + GLB (contrat minimal de rôles
// via MeshRoleResolver) + cohérence layout/GLB. Bun CLI.
//
// Usage: bun scripts/validate-map.ts [mapId]   (défaut: strangerthings)
//        task maps:validate -- <mapId>
//
// Parse le chunk JSON du GLB à la main (pas de dépendance gltf), applique les
// conventions de préfixe (mêmes que le moteur), et vérifie le contrat minimal.
import { readFileSync } from 'fs'
import { getMapPackage } from '@pinball/maps'
import { MeshRoleResolver } from '@pinball/game-engine'

const id = process.argv[2] ?? 'strangerthings'
const errors: string[] = []
const warnings: string[] = []

const pkg = getMapPackage(id)
if (!pkg) {
  console.error(`✗ Map introuvable dans le registry: ${id}`)
  process.exit(1)
}

const { manifest, layout } = pkg

// ── Manifest : champs requis ────────────────────────────────────────────────
if (!manifest.id) errors.push('manifest.id manquant')
if (manifest.id !== id) errors.push(`manifest.id (${manifest.id}) ≠ id demandé (${id})`)
if (!manifest.name) errors.push('manifest.name manquant')
if (typeof manifest.version !== 'number') errors.push('manifest.version doit être un number')
if (!manifest.glb) errors.push('manifest.glb manquant')
if (typeof manifest.rules?.lives !== 'number') errors.push('rules.lives manquant')
if (!Array.isArray(manifest.rules?.milestones)) errors.push('rules.milestones manquant')
if (!Array.isArray(manifest.rules?.multiplierThresholds))
  errors.push('rules.multiplierThresholds manquant')
if (!manifest.scoring || Object.keys(manifest.scoring).length === 0)
  warnings.push('manifest.scoring vide')

// ── GLB : parse du chunk JSON + résolution des rôles ────────────────────────
const glbPath = `apps/playfield/public/${manifest.glb}`
let nodes: Array<{ name?: string; mesh?: number; children?: number[] }> = []
try {
  const data = readFileSync(glbPath)
  const magic = data.toString('ascii', 0, 4)
  if (magic !== 'glTF') errors.push(`${glbPath} : entête glTF invalide`)
  const jsonLen = data.readUInt32LE(12)
  const json = JSON.parse(data.subarray(20, 20 + jsonLen).toString('utf8'))
  nodes = json.nodes ?? []
} catch (e) {
  errors.push(`GLB illisible (${glbPath}): ${(e as Error).message}`)
}

const parent = new Map<number, number>()
nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parent.set(c, i)))

function ancestry(i: number): string[] {
  const names: string[] = []
  let cur: number | undefined = i
  while (cur !== undefined) {
    names.push(nodes[cur].name ?? '')
    cur = parent.get(cur)
  }
  return names
}

const resolver = new MeshRoleResolver(manifest.meshAliases)
const roles = new Map<string, Set<string>>() // role → ids
nodes.forEach((n, i) => {
  if (n.mesh === undefined) return
  const r = resolver.resolveFromAncestry(ancestry(i))
  if (!r) return
  if (!roles.has(r.role)) roles.set(r.role, new Set())
  roles.get(r.role)!.add(r.id)
})

const unresolved = resolver.getUnresolved()
if (unresolved.length > 0) {
  warnings.push(`${unresolved.length} mesh(es) sans rôle ni vis_ : ${unresolved.join(', ')}`)
}

// ── Contrat minimal de rôles ────────────────────────────────────────────────
if (nodes.length > 0) {
  for (const req of ['floor', 'wall'] as const) {
    if (!roles.has(req)) errors.push(`contrat minimal : aucun mesh '${req}_'`)
  }
  const flippers = roles.get('flipper') ?? new Set()
  if (!flippers.has('left')) errors.push("contrat minimal : 'flipper_left' absent")
  if (!flippers.has('right')) errors.push("contrat minimal : 'flipper_right' absent")
  // lane_ optionnel : le couloir plongeur peut être analytique (layout.shooterLane).
  if (!roles.has('lane')) warnings.push("pas de mesh 'lane_' (couloir analytique via layout — OK)")
}

// ── Cohérence layout ↔ GLB (drop targets référencés) ────────────────────────
const targetIds = roles.get('target') ?? new Set()
for (const dt of layout.dropTargets) {
  // l'id layout (ex. drop_left_1) doit correspondre à un target_<side>_<n>.
  const sideN = dt.id.replace(/^drop_/, '') // left_1
  if (targetIds.size > 0 && !targetIds.has(sideN)) {
    warnings.push(`layout.dropTargets '${dt.id}' sans mesh target_${sideN}`)
  }
}

// ── Rapport ─────────────────────────────────────────────────────────────────
console.log(`Validation map '${id}' (GLB: ${manifest.glb})`)
console.log(`  rôles détectés : ${[...roles.keys()].sort().join(', ') || '(aucun)'}`)
for (const w of warnings) console.log(`  ⚠ ${w}`)
for (const e of errors) console.log(`  ✗ ${e}`)

if (errors.length > 0) {
  console.log(`\n${errors.length} erreur(s), ${warnings.length} warning(s) — INVALIDE`)
  process.exit(1)
}
console.log(`\n✓ valide (${warnings.length} warning(s))`)
