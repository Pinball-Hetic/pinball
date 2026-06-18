import dynamic from 'next/dynamic';
import Head from 'next/head';
import { useCallback, useState } from 'react';
import { io } from 'socket.io-client';
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
// Type de ressource <link rel=preload> inféré depuis l'extension.
function preloadAs(path: string): string {
  if (/\.(glb|gltf|bin)$/i.test(path)) return 'fetch';
  if (/\.(png|jpe?g|webp|gif|svg)$/i.test(path)) return 'image';
  if (/\.(mp3|ogg|wav)$/i.test(path)) return 'audio';
  return 'fetch';
}

// Si NEXT_PUBLIC_MAP_ID est défini (ex: prod Fliphetic mono-map), on bypasse
// le sélecteur et on charge directement cette map.
const FORCED_MAP_ID = process.env.NEXT_PUBLIC_MAP_ID;

export default function PinballPage() {
  const [selectedMapId, setSelectedMapId] = useState<string | null>(
    FORCED_MAP_ID ?? null,
  );

  // Émet map:select au server (→ broadcast aux DMD/backglass) puis met à jour
  // l'état local. Connexion socket éphémère : crée, émet, déconnecte.
  const handleSelect = useCallback((mapId: string) => {
    const url = process.env.NEXT_PUBLIC_SOCKET_URL || undefined;
    const transports: ('websocket' | 'polling')[] = url ? ['websocket'] : ['polling'];
    const socket = io(url, { transports });
    socket.once('connect', () => {
      socket.emit('map:select', { mapId });
      socket.disconnect();
    });
    setSelectedMapId(mapId);
  }, []);

  const preload = selectedMapId
    ? (getMapPackage(selectedMapId)?.manifest.preload ?? [])
    : [];

  // Sélecteur de map — affiché si aucune map forcée et aucune map choisie.
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
      {/*
        key={selectedMapId} → remonte complètement le composant si on change
        de map (ex: retour menu + nouvelle sélection). Garantit que le moteur
        physique, les loaders Three.js et les refs internes repartent à zéro.
      */}
      <PinballPlayfield
        key={selectedMapId}
        mapId={selectedMapId}
        onReturnToSelector={() => setSelectedMapId(null)}
      />
    </>
  );
}
