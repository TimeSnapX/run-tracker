import { Link } from 'react-router-dom'
import { useRecorder } from '../RecorderContext'
import { paceSecPerKm, totals } from '../lib/stats'
import { defaultRunName, formatDate, formatDuration, formatKm, formatPace, formatTime } from '../lib/format'

export default function HistoryPage() {
  const { runs } = useRecorder()
  const t = totals(runs)
  return (
    <div className="page">
      <h1>History</h1>
      <div className="totals">
        <div className="stat">
          <div className="stat-val">{t.weekKm.toFixed(1)}</div>
          <div className="stat-lbl">km this week ({t.weekRuns} {t.weekRuns === 1 ? 'run' : 'runs'})</div>
        </div>
        <div className="stat">
          <div className="stat-val">{t.allKm.toFixed(1)}</div>
          <div className="stat-lbl">km all-time ({t.allRuns} {t.allRuns === 1 ? 'run' : 'runs'})</div>
        </div>
      </div>
      {!runs.length && (
        <p className="muted center">No runs yet. Head to Record and tap Start.</p>
      )}
      <ul className="run-list">
        {runs.map((run) => (
          <li key={run.id}>
            <Link to={`/run/${run.id}`} className="run-item">
              <div className="run-item-head">
                <span className="run-name">{run.name || defaultRunName(run.startedAt)}</span>
                <span className="muted small">
                  {formatDate(run.startedAt)} · {formatTime(run.startedAt)}
                </span>
              </div>
              <div className="run-item-stats">
                <span>
                  <b>{formatKm(run.distanceM)}</b> km
                </span>
                <span>
                  <b>{formatDuration(run.movingMs)}</b>
                </span>
                <span>
                  <b>{formatPace(paceSecPerKm(run.distanceM, run.movingMs))}</b> /km
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
