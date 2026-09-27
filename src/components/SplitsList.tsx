import type { Split } from '../lib/types'
import { formatDuration, formatPace } from '../lib/format'

export default function SplitsList({ splits, partial }: { splits: Split[]; partial?: { m: number; ms: number } | null }) {
  if (!splits.length && !partial) return <p className="muted small">Km splits appear here as you complete each kilometre.</p>
  const fastest = splits.length > 1 ? Math.min(...splits.map((s) => s.splitMs)) : -1
  return (
    <table className="splits">
      <thead>
        <tr>
          <th>Km</th>
          <th>Pace</th>
          <th className="bar-col" aria-hidden="true"></th>
          <th>Time</th>
        </tr>
      </thead>
      <tbody>
        {splits.map((s) => (
          <tr key={s.km} className={s.splitMs === fastest ? 'fastest' : ''}>
            <td>{s.km}</td>
            <td className="num">{formatPace(s.splitMs / 1000)}</td>
            <td className="bar-col" aria-hidden="true">
              <span className="bar" style={{ width: `${Math.max(12, (fastest > 0 ? fastest : s.splitMs) / s.splitMs * 100)}%`}} />
            </td>
            <td className="num">{formatDuration(s.cumulativeMs)}</td>
          </tr>
        ))}
        {partial && partial.m >= 50 && (
          <tr className="partial">
            <td>{(partial.m / 1000).toFixed(2)}</td>
            <td className="num">{formatPace(partial.ms / 1000 / (partial.m / 1000))}</td>
            <td className="bar-col" />
            <td className="num muted">partial</td>
          </tr>
        )}
      </tbody>
    </table>
  )
}
