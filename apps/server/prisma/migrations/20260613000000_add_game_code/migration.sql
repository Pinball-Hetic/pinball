-- Colonne `code` : token de claim encodé dans le QR de fin de partie.
-- Nullable (parties existantes / pas encore générées) + unique.

ALTER TABLE "Game" ADD COLUMN "code" TEXT;

CREATE UNIQUE INDEX "Game_code_key" ON "Game" ("code");
