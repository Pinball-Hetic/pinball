import { useEffect } from "react";
import type { ResolvedMap } from "@pinball/maps";
import { setMapAudioUrls } from "@/audio/pinballAudio";

// Branche les URLs audio de la map (musique d'ambiance, son de game over,
// musique du monde alternatif) — effet de bord isolé du corps de rendu.
export function useMapAudio(manifest: ResolvedMap["manifest"]): void {
  useEffect(() => {
    setMapAudioUrls(
      manifest.ambientMusic,
      manifest.gameOverSound,
      manifest.alternateWorldMusicUrl,
      manifest.alternateWorldMusicVolume,
    );
  }, [
    manifest.ambientMusic,
    manifest.gameOverSound,
    manifest.alternateWorldMusicUrl,
    manifest.alternateWorldMusicVolume,
  ]);
}

// URLs à préchauffer (warmMapSounds) : sons de boss + musique monde alternatif
// + sons du manifest. Dérivation pure de la map résolue.
export function collectMapSoundUrls(resolvedMap: ResolvedMap): string[] {
  const bosses = resolvedMap.layout.bosses ?? [];
  return [
    ...bosses.map((b) => b.revealSoundUrl).filter((u): u is string => !!u),
    ...bosses.map((b) => b.latePhaseSoundUrl).filter((u): u is string => !!u),
    ...bosses.map((b) => b.victoryMusicUrl).filter((u): u is string => !!u),
    ...(resolvedMap.manifest.alternateWorldMusicUrl
      ? [resolvedMap.manifest.alternateWorldMusicUrl]
      : []),
    ...Object.values(resolvedMap.manifest.sounds ?? {}).map((s) => s.url),
  ];
}
