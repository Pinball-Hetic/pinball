-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "player" TEXT NOT NULL,
    "playerId" TEXT,
    "score" INTEGER NOT NULL,
    "maxCombo" INTEGER NOT NULL DEFAULT 0,
    "maxMultiplier" INTEGER NOT NULL DEFAULT 1,
    "demogorgons" INTEGER NOT NULL DEFAULT 0,
    "portals" INTEGER NOT NULL DEFAULT 0,
    "hetic" INTEGER NOT NULL DEFAULT 0,
    "durationS" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Game_score_idx" ON "Game"("score" DESC);

-- CreateIndex
CREATE INDEX "Game_createdAt_idx" ON "Game"("createdAt");
