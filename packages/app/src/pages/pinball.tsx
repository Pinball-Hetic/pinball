import dynamic from 'next/dynamic';

const PinballPlayfield = dynamic(
  () => import('@/components/pinball/PinballPlayfield'),
  { ssr: false },
);

export default function PinballPage() {
  return <PinballPlayfield />;
}
