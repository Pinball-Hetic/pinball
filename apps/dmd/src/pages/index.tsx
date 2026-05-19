import { useSocketScore } from '@/hooks/useSocketScore'

export default function ScoreboardPage() {
  const { score, connected } = useSocketScore()

  return (
    <main className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-6xl font-bold mb-8">SCORE</h1>
      <div className="text-9xl font-mono font-bold tabular-nums">
        {score.score.toLocaleString()}
      </div>
      {score.combo > 1 && (
        <div className="text-4xl mt-4 text-yellow-400">
          COMBO x{score.combo}
        </div>
      )}
      {!connected && (
        <div className="absolute top-4 right-4 text-red-500 text-sm">
          Disconnected
        </div>
      )}
    </main>
  )
}
