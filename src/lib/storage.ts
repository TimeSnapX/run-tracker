import type { Run, TrackPoint } from './types'

/** Minimal Storage interface so logic can be tested without a browser. */
export interface KV {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
  removeItem(k: string): void
}

const RUNS_KEY = 'rt.runs.v1'
const LIVE_KEY = 'rt.live.v1'
const SETTINGS_KEY = 'rt.settings.v1'

// Compact point encoding: [lat, lon, t, acc, ele|null, seg, d, mt]
type PackedPoint = [number, number, number, number, number | null, number, number, number]

const r = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp

export function packPoints(points: TrackPoint[]): PackedPoint[] {
  return points.map((p) => [
    r(p.lat, 7),
    r(p.lon, 7),
    Math.round(p.t),
    r(p.acc, 1),
    p.ele != null && Number.isFinite(p.ele) ? r(p.ele, 1) : null,
    p.seg,
    r(p.d, 1),
    Math.round(p.mt),
  ])
}

export function unpackPoints(packed: unknown): TrackPoint[] {
  if (!Array.isArray(packed)) return []
  const out: TrackPoint[] = []
  for (const a of packed) {
    if (Array.isArray(a) && a.length >= 8 && typeof a[0] === 'number' && typeof a[1] === 'number') {
      out.push({ lat: a[0], lon: a[1], t: a[2], acc: a[3], ele: a[4], seg: a[5], d: a[6], mt: a[7] })
    } else if (a && typeof a === 'object' && typeof (a as TrackPoint).lat === 'number') {
      out.push(a as TrackPoint) // tolerate un-packed points (e.g. hand-edited backups)
    }
  }
  return out
}

interface StoredRun extends Omit<Run, 'points'> {
  points: PackedPoint[]
}

export function serialiseRun(run: Run): StoredRun {
  return { ...run, points: packPoints(run.points) }
}

export function deserialiseRun(o: unknown): Run | null {
  if (!o || typeof o !== 'object') return null
  const x = o as Record<string, unknown>
  if (typeof x.id !== 'string' || typeof x.startedAt !== 'number') return null
  const points = unpackPoints(x.points)
  return {
    id: x.id,
    startedAt: x.startedAt,
    endedAt: typeof x.endedAt === 'number' ? x.endedAt : x.startedAt,
    movingMs: typeof x.movingMs === 'number' ? x.movingMs : 0,
    distanceM: typeof x.distanceM === 'number' ? x.distanceM : points.length ? points[points.length - 1].d : 0,
    points,
    name: typeof x.name === 'string' ? x.name : undefined,
  }
}

export class StorageFullError extends Error {}

function safeSet(kv: KV, key: string, value: string) {
  try {
    kv.setItem(key, value)
  } catch (e) {
    throw new StorageFullError(
      'Storage is full. Export a backup and delete some old runs, then try again. ' + String((e as Error)?.message ?? ''),
    )
  }
}

export function loadRuns(kv: KV): Run[] {
  try {
    const raw = kv.getItem(RUNS_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.map(deserialiseRun).filter((x): x is Run => !!x).sort((a, b) => b.startedAt - a.startedAt)
  } catch {
    return []
  }
}

export function saveRuns(kv: KV, runs: Run[]) {
  safeSet(kv, RUNS_KEY, JSON.stringify(runs.map(serialiseRun)))
}

export function addRun(kv: KV, run: Run): Run[] {
  const runs = loadRuns(kv).filter((r) => r.id !== run.id)
  runs.unshift(run)
  runs.sort((a, b) => b.startedAt - a.startedAt)
  saveRuns(kv, runs)
  return runs
}

export function deleteRun(kv: KV, id: string): Run[] {
  const runs = loadRuns(kv).filter((r) => r.id !== id)
  saveRuns(kv, runs)
  return runs
}

// ---- In-progress run snapshot (crash safety) ----

export interface LiveSnapshot {
  id: string
  startedAt: number
  /** Moving time accumulated up to the snapshot (ms). */
  accumulatedMs: number
  seg: number
  points: TrackPoint[]
  savedAt: number
}

export function saveLive(kv: KV, s: LiveSnapshot) {
  try {
    kv.setItem(LIVE_KEY, JSON.stringify({ ...s, points: packPoints(s.points) }))
  } catch {
    /* best effort – never break recording because of storage */
  }
}

export function loadLive(kv: KV): LiveSnapshot | null {
  try {
    const raw = kv.getItem(LIVE_KEY)
    if (!raw) return null
    const o = JSON.parse(raw)
    if (!o || typeof o.id !== 'string') return null
    return {
      id: o.id,
      startedAt: o.startedAt,
      accumulatedMs: o.accumulatedMs || 0,
      seg: o.seg || 0,
      points: unpackPoints(o.points),
      savedAt: o.savedAt || Date.now(),
    }
  } catch {
    return null
  }
}

export function clearLive(kv: KV) {
  kv.removeItem(LIVE_KEY)
}

// ---- Settings ----

export interface Settings {
  vibrateOnSplit: boolean
  autoFollow: boolean
}

export const DEFAULT_SETTINGS: Settings = { vibrateOnSplit: true, autoFollow: true }

export function loadSettings(kv: KV): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(kv.getItem(SETTINGS_KEY) || '{}') }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(kv: KV, s: Settings) {
  try {
    kv.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

// ---- Backup / restore ----

export interface Backup {
  app: 'run-tracker'
  version: 1
  exportedAt: string
  settings: Settings
  runs: StoredRun[]
}

export function buildBackup(kv: KV): Backup {
  return {
    app: 'run-tracker',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: loadSettings(kv),
    runs: loadRuns(kv).map(serialiseRun),
  }
}

/** Merge a backup into storage. Existing runs with the same id are kept. Returns counts. */
export function importBackup(kv: KV, json: string): { added: number; skipped: number; total: number } {
  let o: unknown
  try {
    o = JSON.parse(json)
  } catch {
    throw new Error('That file is not valid JSON.')
  }
  const b = o as Partial<Backup>
  if (!b || b.app !== 'run-tracker' || !Array.isArray(b.runs)) {
    throw new Error("That doesn't look like a Run Tracker backup file.")
  }
  const existing = loadRuns(kv)
  const ids = new Set(existing.map((r) => r.id))
  let added = 0
  let skipped = 0
  for (const raw of b.runs) {
    const run = deserialiseRun(raw)
    if (!run || ids.has(run.id)) {
      skipped++
      continue
    }
    existing.push(run)
    ids.add(run.id)
    added++
  }
  existing.sort((a, b2) => b2.startedAt - a.startedAt)
  saveRuns(kv, existing)
  return { added, skipped, total: existing.length }
}

export function newId(): string {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
}
