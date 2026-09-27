import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { RecorderCore, type RecStatus } from './lib/recorder'
import type { RawFix, Run, TrackPoint } from './lib/types'
import {
  addRun,
  clearLive,
  deleteRun as deleteRunKV,
  loadLive,
  loadRuns,
  loadSettings,
  newId,
  saveLive,
  saveSettings,
  type LiveSnapshot,
  type Settings,
} from './lib/storage'
import { FIRST_FIX_ACCURACY } from './lib/filter'

export type GpsQuality = 'off' | 'searching' | 'weak' | 'ok' | 'good'

export interface GpsState {
  fix: RawFix | null
  /** Date.now() when the last fix arrived. */
  at: number
  error: { code: number; message: string } | null
}

export interface WakeState {
  supported: boolean
  active: boolean
  error: string | null
}

interface Ctx {
  status: RecStatus
  points: TrackPoint[]
  distanceM: number
  movingMs: number
  gps: GpsState
  quality: GpsQuality
  wake: WakeState
  gap: number | null
  dismissGap: () => void
  recovered: LiveSnapshot | null
  resumeRecovered: () => void
  saveRecovered: () => Run | null
  discardRecovered: () => void
  start: () => void
  startAnyway: () => void
  canStartAnyway: boolean
  cancelWaiting: () => void
  pause: () => void
  resume: () => void
  finish: () => Run | null
  discard: () => void
  setWarm: (on: boolean) => void
  retryGps: () => void
  runs: Run[]
  deleteRun: (id: string) => void
  reloadRuns: () => void
  settings: Settings
  updateSettings: (s: Partial<Settings>) => void
  storageError: string | null
  clearStorageError: () => void
  geoSupported: boolean
}

const RecorderCtx = createContext<Ctx | null>(null)

export function useRecorder(): Ctx {
  const c = useContext(RecorderCtx)
  if (!c) throw new Error('useRecorder outside provider')
  return c
}

const SAVE_EVERY_MS = 5000
const GAP_MS = 20_000

export function qualityOf(gps: GpsState, now: number): GpsQuality {
  if (gps.error) return 'off'
  if (!gps.fix || now - gps.at > 15_000) return 'searching'
  const a = gps.fix.acc
  if (a > 30) return 'weak'
  if (a > FIRST_FIX_ACCURACY) return 'ok'
  return 'good'
}

export function RecorderProvider({ children }: { children: ReactNode }) {
  const kv = typeof localStorage !== 'undefined' ? localStorage : null
  const core = useRef(new RecorderCore())
  const [, bump] = useReducer((x: number) => x + 1, 0)
  const [now, setNow] = useState(() => Date.now())
  const [warm, setWarmState] = useState(0)
  const [watchKey, setWatchKey] = useState(0)
  const [gps, setGps] = useState<GpsState>({ fix: null, at: 0, error: null })
  const [wake, setWake] = useState<WakeState>({
    supported: typeof navigator !== 'undefined' && 'wakeLock' in navigator,
    active: false,
    error: null,
  })
  const [gap, setGap] = useState<number | null>(null)
  const [recovered, setRecovered] = useState<LiveSnapshot | null>(() => {
    const s = kv ? loadLive(kv) : null
    return s && s.points.length ? s : null
  })
  const [runs, setRuns] = useState<Run[]>(() => (kv ? loadRuns(kv) : []))
  const [settings, setSettings] = useState<Settings>(() => (kv ? loadSettings(kv) : { vibrateOnSplit: true, autoFollow: true }))
  const [storageError, setStorageError] = useState<string | null>(null)
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const lastAcceptedAt = useRef(0)

  const status = core.current.status
  const geoSupported = typeof navigator !== 'undefined' && 'geolocation' in navigator
  const wantGps = warm > 0 || status !== 'idle'

  // ---- Persistence ----
  const persist = useCallback(() => {
    const c = core.current
    if (!kv || c.status === 'idle' || !c.points.length) return
    saveLive(kv, c.snapshot(Date.now()))
  }, [kv])

  // ---- Geolocation ----
  useEffect(() => {
    if (!wantGps || !geoSupported) return
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const t = Date.now()
        // Some devices report odd timestamps; fall back to the local clock if it's way off.
        const ts = Math.abs(pos.timestamp - t) < 60_000 ? pos.timestamp : t
        const fix: RawFix = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          acc: pos.coords.accuracy,
          ele: pos.coords.altitude,
          t: ts,
        }
        setGps({ fix, at: t, error: null })
        const c = core.current
        const prev = c.points.length ? c.points[c.points.length - 1] : null
        const r = c.addFix(fix, t)
        if (r.accepted) {
          const p = c.points[c.points.length - 1]
          if (prev && prev.seg === p.seg && p.t - prev.t > GAP_MS && c.status === 'recording') {
            setGap(p.t - prev.t)
          }
          lastAcceptedAt.current = t
          if (r.newSplits > 0 && settingsRef.current.vibrateOnSplit && 'vibrate' in navigator) {
            try {
              navigator.vibrate([300, 150, 300])
            } catch {
              /* ignore */
            }
          }
          if (r.started) persist()
          bump()
        }
      },
      (err) => {
        // TIMEOUT is not fatal for a watch; keep going.
        if (err.code === err.TIMEOUT) return
        setGps((g) => ({ ...g, error: { code: err.code, message: err.message } }))
      },
      { enableHighAccuracy: true, maximumAge: 0 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [wantGps, geoSupported, watchKey, persist])

  // ---- Clock + periodic save ----
  useEffect(() => {
    if (status === 'idle') return
    const tick = setInterval(() => setNow(Date.now()), 1000)
    const save = setInterval(persist, SAVE_EVERY_MS)
    return () => {
      clearInterval(tick)
      clearInterval(save)
    }
  }, [status, persist])

  // Keep the GPS indicator fresh even when idle.
  useEffect(() => {
    if (!wantGps || status !== 'idle') return
    const tick = setInterval(() => setNow(Date.now()), 3000)
    return () => clearInterval(tick)
  }, [wantGps, status])

  // ---- Wake lock + visibility gap detection ----
  const active = status !== 'idle'
  useEffect(() => {
    if (!active) return
    let sentinel: WakeLockSentinel | null = null
    let cancelled = false
    let hiddenAt = 0
    let acceptedAtHide = 0

    const acquire = async () => {
      if (!('wakeLock' in navigator)) {
        setWake({ supported: false, active: false, error: null })
        return
      }
      if (sentinel && !sentinel.released) return
      try {
        const s = await navigator.wakeLock.request('screen')
        if (cancelled) {
          s.release().catch(() => {})
          return
        }
        sentinel = s
        setWake({ supported: true, active: true, error: null })
        s.addEventListener('release', () => {
          if (!cancelled) setWake((w) => ({ ...w, active: false }))
        })
      } catch (e) {
        setWake({ supported: true, active: false, error: (e as Error)?.message || 'Wake lock refused' })
      }
    }

    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        acceptedAtHide = lastAcceptedAt.current
        persist()
      } else {
        acquire()
        const away = Date.now() - hiddenAt
        if (hiddenAt && core.current.status === 'recording' && away > 10_000 && lastAcceptedAt.current <= acceptedAtHide) {
          setGap(away)
        }
        hiddenAt = 0
        setNow(Date.now())
      }
    }
    const onHide = () => persist()

    acquire()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', onHide)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pagehide', onHide)
      sentinel?.release().catch(() => {})
      setWake((w) => ({ ...w, active: false }))
    }
  }, [active, persist])

  // ---- Actions ----
  const start = useCallback(() => {
    const c = core.current
    c.start(newId())
    // If we already have a good, fresh fix, feed it straight in.
    if (gps.fix && Date.now() - gps.at < 5000) c.addFix(gps.fix, Date.now())
    setGap(null)
    setNow(Date.now())
    bump()
  }, [gps])

  const startAnyway = useCallback(() => {
    const c = core.current
    c.relaxFirstFix()
    if (gps.fix && Date.now() - gps.at < 5000) c.addFix(gps.fix, Date.now())
    bump()
  }, [gps])

  const cancelWaiting = useCallback(() => {
    core.current.reset()
    bump()
  }, [])

  const pause = useCallback(() => {
    core.current.pause(Date.now())
    persist()
    setNow(Date.now())
    bump()
  }, [persist])

  const resume = useCallback(() => {
    core.current.resume(Date.now())
    setGap(null)
    setNow(Date.now())
    bump()
  }, [])

  const saveRunSafely = useCallback(
    (run: Run): boolean => {
      if (!kv) return false
      try {
        setRuns(addRun(kv, run))
        clearLive(kv)
        return true
      } catch (e) {
        setStorageError((e as Error).message)
        // Keep the live snapshot so nothing is lost.
        return false
      }
    },
    [kv],
  )

  const finish = useCallback((): Run | null => {
    const c = core.current
    if (!c.points.length) {
      c.reset()
      if (kv) clearLive(kv)
      bump()
      return null
    }
    const snap = c.snapshot(Date.now())
    const run = c.finish(Date.now())
    if (!saveRunSafely(run)) {
      c.restore(snap)
      bump()
      return null
    }
    setGap(null)
    bump()
    return run
  }, [kv, saveRunSafely])

  const discard = useCallback(() => {
    core.current.reset()
    if (kv) clearLive(kv)
    setGap(null)
    bump()
  }, [kv])

  const resumeRecovered = useCallback(() => {
    if (!recovered) return
    core.current.restore(recovered)
    setRecovered(null)
    bump()
  }, [recovered])

  const saveRecovered = useCallback((): Run | null => {
    if (!recovered) return null
    const tmp = new RecorderCore()
    tmp.restore(recovered)
    const lastT = recovered.points[recovered.points.length - 1]?.t ?? recovered.savedAt
    const run = tmp.finish(lastT)
    run.movingMs = recovered.accumulatedMs
    if (saveRunSafely(run)) {
      setRecovered(null)
      return run
    }
    return null
  }, [recovered, saveRunSafely])

  const discardRecovered = useCallback(() => {
    if (kv) clearLive(kv)
    setRecovered(null)
  }, [kv])

  const setWarm = useCallback((on: boolean) => setWarmState((w) => Math.max(0, w + (on ? 1 : -1))), [])
  const retryGps = useCallback(() => {
    setGps({ fix: null, at: 0, error: null })
    setWatchKey((k) => k + 1)
  }, [])

  const deleteRun = useCallback(
    (id: string) => {
      if (!kv) return
      try {
        setRuns(deleteRunKV(kv, id))
      } catch (e) {
        setStorageError((e as Error).message)
      }
    },
    [kv],
  )
  const reloadRuns = useCallback(() => kv && setRuns(loadRuns(kv)), [kv])

  const updateSettings = useCallback(
    (s: Partial<Settings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...s }
        if (kv) saveSettings(kv, next)
        return next
      })
    },
    [kv],
  )

  const c = core.current
  const quality = qualityOf(gps, now)
  const canStartAnyway = c.status === 'waiting' && !!gps.fix && gps.fix.acc <= 30 && now - gps.at < 15_000

  const value = useMemo<Ctx>(
    () => ({
      status: c.status,
      points: c.points,
      distanceM: c.distanceM,
      movingMs: c.movingMs(Math.max(now, Date.now())),
      gps,
      quality,
      wake,
      gap,
      dismissGap: () => setGap(null),
      recovered,
      resumeRecovered,
      saveRecovered,
      discardRecovered,
      start,
      startAnyway,
      canStartAnyway,
      cancelWaiting,
      pause,
      resume,
      finish,
      discard,
      setWarm,
      retryGps,
      runs,
      deleteRun,
      reloadRuns,
      settings,
      updateSettings,
      storageError,
      clearStorageError: () => setStorageError(null),
      geoSupported,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [c.status, c.points.length, now, gps, quality, wake, gap, recovered, runs, settings, storageError, canStartAnyway,
      resumeRecovered, saveRecovered, discardRecovered, start, startAnyway, cancelWaiting, pause, resume, finish, discard,
      setWarm, retryGps, deleteRun, reloadRuns, updateSettings, geoSupported],
  )

  return <RecorderCtx.Provider value={value}>{children}</RecorderCtx.Provider>
}
