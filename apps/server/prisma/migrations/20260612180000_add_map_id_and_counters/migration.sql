-- Migration manuelle : mapId + counters génériques (remplace demogorgons/portals/hetic).
-- ⚠️ NON testée sur dump réel — valider sur une DB jetable avant `migrate deploy` en prod
--   (task db:dump:dev → restore → migrate deploy → vérifier les counters).

-- 1. Nouvelles colonnes
ALTER TABLE "Game" ADD COLUMN "mapId" TEXT NOT NULL DEFAULT 'strangerthings';
ALTER TABLE "Game" ADD COLUMN "counters" JSONB NOT NULL DEFAULT '{}';

-- 2. Backfill des counters depuis les anciennes colonnes AVANT de les drop
--    (préserve l'historique : chaque partie garde ses compteurs ST).
UPDATE "Game" SET "counters" = jsonb_build_object(
  'demogorgons', "demogorgons",
  'portals', "portals",
  'hetic', "hetic"
);

-- 3. Drop des anciennes colonnes ST-spécifiques
ALTER TABLE "Game" DROP COLUMN "demogorgons";
ALTER TABLE "Game" DROP COLUMN "portals";
ALTER TABLE "Game" DROP COLUMN "hetic";

-- 4. Index (mapId, score desc) pour les leaderboards par map
CREATE INDEX "Game_mapId_score_idx" ON "Game" ("mapId", "score" DESC);
