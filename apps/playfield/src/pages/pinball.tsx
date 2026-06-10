import dynamic from 'next/dynamic';
import Head from 'next/head';
import '@/audio/pinballAudio';

const PinballPlayfield = dynamic(
  () => import('@/components/pinball/PinballPlayfield'),
  { ssr: false },
);

export default function PinballPage() {
  return (
    <>
      <Head>
        <link rel="preload" href="/audio/early-sound.mp3" as="audio" type="audio/mpeg" />
      </Head>
      <PinballPlayfield />
    </>
  );
}
