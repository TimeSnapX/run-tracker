import { FIRST_FIX_ACCURACY, GpsFilter, type FilterOptions } from './filter'
import type { RawFix, Run, TrackPoint } from './types'
import type { LiveSnapshot } from './storage'

export type RecStatus = 'idle' | 'waiting' | 'recording' | 'paused'

export interface AddFixResult {
  accepted: boolean
  reason?: string
  /** Number of km splits newly completed by this fix. */
  newSplits: number
  /** True if this fix started the moving timer (first good fix after Start). */
  started?: boolean
}

/**
 * Framework-free run recorder: owns status, moving-time clock, segments and the GPS filter.
 * All times are passed in so it can be driven by synthetic data in tests.
 */
export class RecorderCore {
  status: RecStatus = 'idle'
  id = ''
  startedAt = 0
  points: TrackPoint[] = []
  seg = 0
  accumulatedMs = 0
  activeSince: number | null = null
  firstFixAccuracy = FIRST_FIX_ACCURACY
  private filter: GpsFilter
  private needAnchor = true
  private segHasPoints = false

  constructor(filterOpts: Partial<FilterOptions> = {}) {
    this.filter = new GpsFilter(filterOpts)
  }

  movingMs(now: number): number {
    return this.accumulatedMs + (this.activeSince != null ? Math.max(0, now - this.activeSince) : 0)
  }

  get distanceM(): number {
    return this.points.length ? this.points[this.points.length - 1].d : 0
  }

  /** Press Start: wait for a decent fix before the clock and distance start. */
  start(id: string) {
    this.reset()
    this.id = id
    this.status = 'waiting'
  }

  /** Accept a weaker first fix (user chose "start anyway"). */
  relaxFirstFix() {
    this.firstFixAccuracy = this.filter.opts.maxAccuracy
  }

  pause(now: number) {
    if (this.status !== 'recording') return
    this.accumulatedMs = this.movingMs(now)
    this.activeSince = null
    this.status = 'paused'
  }

  resume(now: number) {
    if (this.status !== 'paused') return
    if (this.points.length) this.seg++
    this.segHasPoints = false
    this.needAnchor = true
    this.filter.reset()
    this.activeSince = now
    this.status = 'recording'
  }

  addFix(fix: RawFix, now: number): AddFixResult {
    if (this.status === 'waiting') {
      if (!(fix.acc <= this.firstFixAccuracy)) return { accepted: false, reason: 'waiting', newSplits: 0 }
      this.status = 'recording'
      this.startedAt = now
      this.activeSince = now
      this.needAnchor = true
      this.filter.reset()
      const r = this.addFix(fix, now)
      return { ...r, started: true }
    }
    if (this.status !== 'recording') return { accepted: false, reason: this.status, newSplits: 0 }

    const v = this.filter.check(fix)
    if (!v.ok) return { accepted: false, reason: v.reason, newSplits: 0 }
    const before = this.distanceM
    const wasAnchor = this.needAnchor
    const add = wasAnchor || v.reanchor ? 0 : v.distance
    this.needAnchor = false
    // A re-anchor mid-segment starts a new segment so the map doesn't draw the bogus jump.
    if (v.reanchor && !wasAnchor && this.segHasPoints) this.seg++
    const p: TrackPoint = {
      lat: fix.lat,
      lon: fix.lon,
      t: fix.t,
      acc: fix.acc,
      ele: fix.ele ?? null,
      seg: this.seg,
      d: before + add,
      mt: this.movingMs(now),
    }
    this.segHasPoints = true
    this.points.push(p)
    const newSplits = Math.floor(p.d / 1000) - Math.floor(before / 1000)
    return { accepted: true, newSplits }
  }

  snapshot(now: number): LiveSnapshot {
    return {
      id: this.id,
      startedAt: this.startedAt || now,
      accumulatedMs: this.movingMs(now),
      seg: this.seg,
      points: this.points,
      savedAt: now,
    }
  }

  /** Restore from a crash snapshot into the paused state. */
  restore(s: LiveSnapshot) {
    this.reset()
    this.id = s.id
    this.startedAt = s.startedAt
    this.accumulatedMs = s.accumulatedMs
    this.seg = s.seg
    this.points = s.points
    this.status = 'paused'
  }

  finish(now: number): Run {
    const movingMs = this.movingMs(now)
    const run: Run = {
      id: this.id,
      startedAt: this.startedAt || now,
      endedAt: now,
      movingMs,
      distanceM: this.distanceM,
      points: this.points,
    }
    this.reset()
    return run
  }

  reset() {
    this.status = 'idle'
    this.id = ''
    this.startedAt = 0
    this.points = []
    this.seg = 0
    this.accumulatedMs = 0
    this.activeSince = null
    this.needAnchor = true
    this.segHasPoints = false
    this.firstFixAccuracy = FIRST_FIX_ACCURACY
    this.filter.reset()
  }
}
