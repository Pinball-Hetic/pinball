import QRCode from 'qrcode';
import { randomBytes } from 'crypto';
import type { GameOver, GameRegistered } from '@pinball/shared-types';
import { prisma } from '../infrastructure/prisma';

const CLAIM_BASE_URL = process.env.CLAIM_BASE_URL ?? 'http://test.fr/';

function generateCode(): string {
  // token opaque court, base36
  return randomBytes(8).toString('hex');
}

function buildClaimUrl(code: string): string {
  const u = new URL(CLAIM_BASE_URL);
  u.searchParams.set('code', code);
  return u.toString(); // ex http://test.fr/?code=ab12...
}

export async function registerScore(data: GameOver): Promise<GameRegistered> {
  const code = generateCode();
  await prisma.game.create({
    data: {
      player: data.player,
      mapId: data.mapId,
      score: data.finalScore,
      maxCombo: data.stats.maxCombo,
      maxMultiplier: data.stats.maxMultiplier,
      counters: data.stats.counters,
      durationS: data.stats.durationS,
      code,
    },
  });
  const claimUrl = buildClaimUrl(code);
  const qrDataUrl = await QRCode.toDataURL(claimUrl);
  return { code, claimUrl, qrDataUrl };
}
