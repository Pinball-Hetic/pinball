import dynamic from 'next/dynamic';
import Head from 'next/head';
import { useCallback, useState } from 'react';
import { createPinballSocket } from '@pinball/shared-types/src/socket-client';
import { getMapPackage, AVAILABLE_MAPS } from '@pinball/maps';
import { parsePlayfieldViewMode } from '@pinball/game-engine';
import { MapSelectorScreen } from '@/components/pinball/MapSelectorScreen';
import '@/audio/pinballAudio';

const PinballPlayfield = dynamic(
  () => import('@/components/pinball/PinballPlayfield'),
  { ssr: false },
);

const PORTRAIT_FILL =
  parsePlayfieldViewMode(process.env.NEXT_PUBLIC_PLAYFIELD_VIEW_MODE) === 'portrait-fill';
const PORTRAIT_VIEWPORT =
  'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover';
function preloadAs(path: string): string {
  if (/\.(glb|gltf|bin)$/i.test(path)) return 'fetch';
  if (/\.(png|jpe?g|webp|gif|svg)$/i.test(path)) return 'image';
  if (/\.(mp3|ogg|wav)$/i.test(path)) return 'audio';
  return 'fetch';
}

const FORCED_MAP_ID = process.env.NEXT_PUBLIC_MAP_ID;

export default function PinballPage() {
  const [selectedMapId, setSelectedMapId] = useState<string | null>(
    FORCED_MAP_ID ?? null,
  );

  const handleSelect = useCallback((mapId: string) => {
    const socket = createPinballSocket();
    socket.once('connect', () => {
      socket.emit('map:select', { mapId });
      socket.disconnect();
    });
    setSelectedMapId(mapId);
  }, []);

  const preload = selectedMapId
    ? (getMapPackage(selectedMapId)?.manifest.preload ?? [])
    : [];

  if (!selectedMapId) {
    return <MapSelectorScreen maps={AVAILABLE_MAPS} onSelect={handleSelect} />;
  }

  return (
    <>
      <Head>
        <meta
          name="viewport"
          content={PORTRAIT_FILL ? PORTRAIT_VIEWPORT : 'width=device-width, initial-scale=1'}
        />
        <link rel="preload" href="/audio/early-sound.mp3" as="audio" type="audio/mpeg" />
        {preload.map((p) => (
          <link key={p} rel="preload" href={p} as={preloadAs(p)} />
        ))}
      </Head>
      {/* key forces a full remount on map change, resetting physics + Three.js. */}
      <PinballPlayfield key={selectedMapId} mapId={selectedMapId} />
    </>
  );
}
