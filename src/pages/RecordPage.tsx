import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRecorder } from '../RecorderContext'
import RunMap from '../components/RunMap'
import GpsIndicator from '../components/GpsIndicator'
import LocationHelp from '../components/LocationHelp'
import SplitsList from '../components/SplitsList'
import { computeSplits, paceSecPerKm, rollingPace } from '../lib/stats'
import { formatDuration, formatKm, formatPace, formatTime } from '../lib/format'

export default function RecordPage() {
  const r = useRecorder()
  const nav = useNavigate()
  const [follow, setFollow] = useState(r.settings.autoFollow)
  const [confirmFinish, setConfirmFinish] = useState(false)

  const { setWarm } = r
  useEffect(() => {
    setWarm(true)
    return () => setWarm(false)
  }, [setWarm])

  const n = r.points.length
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const splits = useMemo(() => computeSplits(r.points), [n, r.points])
  const lastPoint = n ? r.points[n - 1] : null
  const current = r.gps.fix
    ? { lat: r.gps.fix.lat, lon: r.gps.fix.lon, acc: r.gps.fix.acc }
    : lastPoint
      ? { lat: lastPoint.lat, lon: lastPoint.lon, acc: lastPoint.acc }
      : null

  const curPace = r.status === 'recording' ? rollingPace(r.points, r.movingMs) : null
  const avgPace = paceSecPerKm(r.distanceM, r.movingMs)
  const idle = r.status === 'idle'
  const denied = r.gps.error

  const onFinish = () => {
    const run = r.finish()
    setConfirmFinish(false)
    if (run) nav(`/run/${run.id}`)
  }
  const onDiscard = () => {
    if (window.confirm('Discard this run? It will be deleted and cannot be recovered.')) {
      r.discard()
      setConfirmFinish(false)
    }
  }

  return (
    <div className={`page record status-${r.status}`}>
      <div className="topbar">
        <GpsIndicator quality={r.quality} acc={r.gps.fix?.acc ?? null} />
        {r.status === 'recording' && <span className="pill pill-rec">● REC</span>}
        {r.status === 'paused' && <span className="pill pill-paused">❚❚ PAUSED</span>}
        {!idle && r.wake.active && <span className="pill" title="Screen will stay on">☀ Screen on</span>}
      </div>

      {!r.geoSupported && (
        <div className="banner banner-error">This browser doesn't support location, so runs can't be recorded.</div>
      )}
      {denied && <LocationHelp code={denied.code} onRetry={r.retryGps} />}

      {r.storageError && (
        <div className="banner banner-error">
          {r.storageError}
          <div className="banner-actions">
            <button className="btn btn-small" onClick={() => nav('/more')}>Backup</button>
            <button className="btn btn-small btn-ghost" onClick={r.clearStorageError}>Dismiss</button>
          </div>
        </div>
      )}

      {r.recovered && idle && (
        <div className="banner banner-warn">
          <strong>Unfinished run found</strong> — started {formatTime(r.recovered.startedAt)},{' '}
          {formatKm(r.recovered.points[r.recovered.points.length - 1]?.d ?? 0)} km,{' '}
          {formatDuration(r.recovered.accumulatedMs)}.
          <div className="banner-actions">
            <button className="btn btn-small" onClick={r.resumeRecovered}>Resume</button>
            <button
              className="btn btn-small btn-ghost"
              onClick={() => {
                const run = r.saveRecovered()
                if (run) nav(`/run/${run.id}`)
              }}
            >
              Save
            </button>
            <button
              className="btn btn-small btn-danger"
              onClick={() => window.confirm('Discard the unfinished run?') && r.discardRecovered()}
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {r.gap != null && (
        <div className="banner banner-warn">
          <strong>GPS gap of {formatDuration(r.gap)}.</strong> The browser stops getting GPS when the screen is off or
          the app is in the background. The gap is joined with a straight line.
          <div className="banner-actions">
            <button className="btn btn-small btn-ghost" onClick={r.dismissGap}>OK</button>
          </div>
        </div>
      )}

      {!idle && !r.wake.supported && (
        <div className="banner banner-info small">
          Keep the screen on — locking your phone pauses GPS in the browser.
        </div>
      )}
      {!idle && r.wake.supported && r.wake.error && (
        <div className="banner banner-info small">
          Couldn't keep the screen awake ({r.wake.error}). Keep the screen on — locking your phone pauses GPS.
        </div>
      )}

      <div className="map-wrap">
        <RunMap points={r.points} current={current} follow={follow} onUserPan={() => setFollow(false)} />
        <button
          className={`map-btn ${follow ? 'on' : ''}`}
          onClick={() => setFollow((f) => !f)}
          aria-pressed={follow}
          aria-label="Auto-follow position"
        >
          {follow ? '◎ Following' : '◎ Follow'}
        </button>
      </div>

      <div className="stats">
        <div className="stat stat-big">
          <div className="stat-val">{formatDuration(r.movingMs)}</div>
          <div className="stat-lbl">Time</div>
        </div>
        <div className="stat stat-big">
          <div className="stat-val">{formatKm(r.distanceM)}</div>
          <div className="stat-lbl">km</div>
        </div>
        <div className="stat">
          <div className="stat-val">{formatPace(curPace)}</div>
          <div className="stat-lbl">Current /km</div>
        </div>
        <div className="stat">
          <div className="stat-val">{formatPace(avgPace)}</div>
          <div className="stat-lbl">Avg /km</div>
        </div>
      </div>

      <div className="controls">
        {idle && (
          <button className="btn btn-primary btn-huge" onClick={r.start} disabled={!r.geoSupported || !!denied}>
            Start
          </button>
        )}
        {r.status === 'waiting' && (
          <div className="waiting">
            <div className="waiting-msg">
              <span className="spinner" aria-hidden="true" /> Waiting for a good GPS fix
              {r.gps.fix ? ` (±${Math.round(r.gps.fix.acc)} m, need ±20 m)` : '…'}
            </div>
            <div className="row">
              {r.canStartAnyway && (
                <button className="btn btn-primary" onClick={r.startAnyway}>Start anyway</button>
              )}
              <button className="btn btn-ghost" onClick={r.cancelWaiting}>Cancel</button>
            </div>
            <p className="muted small">Stand still outdoors with a clear view of the sky. The clock starts once GPS locks on.</p>
          </div>
        )}
        {r.status === 'recording' && (
          <div className="row">
            <button className="btn btn-secondary btn-huge" onClick={r.pause}>Pause</button>
          </div>
        )}
        {r.status === 'paused' && (
          <div className="row">
            <button className="btn btn-primary btn-huge" onClick={r.resume}>Resume</button>
            <button className="btn btn-danger btn-huge" onClick={() => setConfirmFinish(true)}>Finish</button>
          </div>
        )}
      </div>

      {idle && (
        <p className="muted small center tip">
          Tip: keep the screen on while running (phone in hand or pocket is fine). Locking the phone pauses GPS in the
          browser.
        </p>
      )}

      {!idle && (
        <section className="card">
          <h2>Splits</h2>
          <SplitsList splits={splits} />
        </section>
      )}

      {confirmFinish && (
        <div className="sheet-backdrop" onClick={() => setConfirmFinish(false)}>
          <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Finish run?</h2>
            <p>
              {formatKm(r.distanceM)} km in {formatDuration(r.movingMs)}
            </p>
            <button className="btn btn-primary btn-huge" onClick={onFinish}>
              {n ? 'Save run' : 'Finish (nothing recorded)'}
            </button>
            <button className="btn btn-ghost btn-huge" onClick={() => setConfirmFinish(false)}>
              Keep going
            </button>
            <button className="btn btn-danger-outline" onClick={onDiscard}>
              Discard run
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
