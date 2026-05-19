import { useLeaderboard } from '@/hooks/useLeaderboard'

export default function LeaderboardPage() {
  const { entries, connected } = useLeaderboard()

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-6xl font-bold mb-12">LEADERBOARD</h1>
      <table className="w-full max-w-2xl text-left">
        <thead>
          <tr className="text-2xl border-b border-white/20">
            <th className="py-4 w-20">#</th>
            <th className="py-4">Player</th>
            <th className="py-4 text-right">Score</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.rank} className="text-3xl border-b border-white/10">
              <td className="py-4 font-mono">{entry.rank}</td>
              <td className="py-4">{entry.name}</td>
              <td className="py-4 text-right font-mono tabular-nums">
                {entry.score.toLocaleString()}
              </td>
            </tr>
          ))}
          {entries.length === 0 && (
            <tr>
              <td colSpan={3} className="py-8 text-center text-white/40 text-2xl">
                No scores yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {!connected && (
        <div className="absolute top-4 right-4 text-red-500 text-sm">
          Disconnected
        </div>
      )}
    </main>
  )
}
