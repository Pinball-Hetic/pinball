import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-950 px-6 text-zinc-100">
      <h1 className="text-2xl font-semibold tracking-tight">Pinball Monorepo</h1>
      <p className="max-w-md text-center text-sm text-zinc-400">
        Démo playfield 3D (Three.js) : palettes Q/D ou flèches après avoir cliqué sur la scène.
      </p>
      <Link
        href="/pinball"
        className="rounded-full bg-zinc-100 px-6 py-2.5 text-sm font-medium text-zinc-950 transition hover:bg-white"
      >
        Ouvrir le playfield
      </Link>
    </div>
  );
}
