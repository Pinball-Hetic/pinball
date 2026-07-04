import { useEffect } from "react";
import type { ResolvedMap } from "@pinball/maps";
import { setMapAudioUrls } from "@/audio/pinballAudio";

// Wires the map's audio URLs (ambient music, game-over sound, alternate-world
// music) as a side effect, kept out of the render body.
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

// URLs to prewarm (warmMapSounds): boss sounds + alternate-world music +
// manifest sounds. Derived from the resolved map.
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
