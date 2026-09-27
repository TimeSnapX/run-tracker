import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useRecorder } from '../RecorderContext'
import RunMap from '../components/RunMap'
import SplitsList from '../components/SplitsList'
import { computeSplits, paceSecPerKm } from '../lib/stats'
import { defaultRunName, formatDate, formatDuration, formatKm, formatPace, formatTime } from '../lib/format'
import { buildGpx, gpxFilename } from '../lib/gpx'
import { canShareFiles, downloadText, shareText } from '../lib/download'

function elevationGain(points: { ele?: number | null }[]): number | null {
  let gain = 0
  let last: number | null = null
  let any = false
  for (const p of points) {
    if (p.ele == null) continue
    any = true
    if (last == null) last = p.ele
    // 3 m hysteresis to ignore GPS altitude noise
    if (p.ele - last >= 3) {
      gain += p.ele - last
      last = p.ele
    } else if (last - p.ele >= 3) last = p.ele
  }
  return any ? gain : null
}

export default function RunDetailPage() {
  const { id } = useParams()
  const { runs, deleteRun } = useRecorder()
  const nav = useNavigate()
  const run = runs.find((r) => r.id === id)
  const splits = useMemo(() => (run ? computeSplits(run.points) : []), [run])
  if (!run) {
    return (
      <div className="page">
        <p>Run not found.</p>
        <Link to="/history" className="btn">Back to history</Link>
      </div>
    )
  }
  const last = splits[splits.length - 1]
  const partial = { m: run.distanceM - splits.length * 1000, ms: run.movingMs - (last?.cumulativeMs ?? 0) }
  const gain = elevationGain(run.points)
  const gpx = () => buildGpx(run)
  const share = canShareFiles()

  return (
    <div className="page">
      <div className="detail-head">
        <Link to="/history" className="back" aria-label="Back to history">‹ History</Link>
      </div>
      <h1>{run.name || defaultRunName(run.startedAt)}</h1>
      <p className="muted">
        {formatDate(run.startedAt)} · {formatTime(run.startedAt)}–{formatTime(run.endedAt)}
      </p>
      <div className="map-wrap map-detail">
        {run.points.length ? <RunMap points={run.points} fit className="map" /> : <p className="muted">No GPS points.</p>}
      </div>
      <div className="stats">
        <div className="stat stat-big">
          <div className="stat-val">{formatKm(run.distanceM)}</div>
          <div className="stat-lbl">km</div>
        </div>
        <div className="stat stat-big">
          <div className="stat-val">{formatDuration(run.movingMs)}</div>
          <div className="stat-lbl">Moving time</div>
        </div>
        <div className="stat">
          <div className="stat-val">{formatPace(paceSecPerKm(run.distanceM, run.movingMs))}</div>
          <div className="stat-lbl">Avg /km</div>
        </div>
        <div className="stat">
          <div className="stat-val">{gain != null ? Math.round(gain) + ' m' : '–'}</div>
          <div className="stat-lbl">Elev. gain</div>
        </div>
      </div>
      <p className="muted small">Total elapsed (incl. pauses): {formatDuration(run.endedAt - run.startedAt)}</p>

      <section className="card">
        <h2>Splits</h2>
        <SplitsList splits={splits} partial={partial} />
      </section>

      <div className="row wrap">
        <button className="btn btn-primary" onClick={() => downloadText(gpxFilename(run), gpx(), 'application/gpx+xml')}>
          Download GPX
        </button>
        {share && (
          <button className="btn btn-secondary" onClick={() => shareText(gpxFilename(run), gpx(), 'application/gpx+xml')}>
            Share GPX
          </button>
        )}
        <button
          className="btn btn-danger-outline"
          onClick={() => {
            if (window.confirm('Delete this run? This cannot be undone.')) {
              deleteRun(run.id)
              nav('/history')
            }
          }}
        >
          Delete run
        </button>
      </div>
    </div>
  )
}
