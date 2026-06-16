import dynamic from 'next/dynamic';
import Head from 'next/head';
import { getMapPackage } from '@pinball/maps';
import { parsePlayfieldViewMode } from '@pinball/game-engine';
import { DEFAULT_MAP_ID } from '@pinball/shared-types';
import '@/audio/pinballAudio';

const PinballPlayfield = dynamic(
  () => import('@/components/pinball/PinballPlayfield'),
  { ssr: false },
);

const MAP_ID = process.env.NEXT_PUBLIC_MAP_ID ?? DEFAULT_MAP_ID;
const PRELOAD = getMapPackage(MAP_ID)?.manifest.preload ?? [];
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

export default function PinballPage() {
  return (
    <>
      <Head>
        <meta
          name="viewport"
          content={PORTRAIT_FILL ? PORTRAIT_VIEWPORT : 'width=device-width, initial-scale=1'}
        />
        <link rel="preload" href="/audio/early-sound.mp3" as="audio" type="audio/mpeg" />
        {PRELOAD.map((p) => (
          <link key={p} rel="preload" href={p} as={preloadAs(p)} />
        ))}
      </Head>
      <PinballPlayfield />
    </>
  );
}
