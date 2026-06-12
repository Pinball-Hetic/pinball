import { getMapPackage } from "@pinball/maps";
import type { BossDefinition, BossId } from "@pinball/game-engine";

// Définitions de boss de la map active (résolues build-time via
// NEXT_PUBLIC_MAP_ID). Le moteur ne fournit plus de registry boss : les apps
// lisent les définitions de la map. Remplace l'ancien getBossDefinition/
// BOSS_IDS de game-engine.
const MAP_ID = process.env.NEXT_PUBLIC_MAP_ID ?? "strangerthings";

export const ACTIVE_BOSSES: BossDefinition[] = getMapPackage(MAP_ID)?.layout.bosses ?? [];

const byId: Record<string, BossDefinition> = Object.fromEntries(
  ACTIVE_BOSSES.map((b) => [b.id, b]),
);

export const BOSS_IDS: readonly BossId[] = ACTIVE_BOSSES.map((b) => b.id);

export function getBossDefinition(id: BossId): BossDefinition {
  return byId[id];
}
