import { distanceBetween } from './geo'
import type { RawFix } from './types'

export interface FilterOptions {
  /** Reject fixes with accuracy worse than this (m). */
  maxAccuracy: number
  /** Reject jumps implying a speed above this (m/s). */
  maxSpeed: number
  /** Ignore movement smaller than this (m) – stationary jitter. */
  minMove: number
  /** After this many consecutive "jump" rejections, re-anchor at the new position. */
  reanchorAfter: number
}

export const DEFAULT_FILTER: FilterOptions = {
  maxAccuracy: 30,
  maxSpeed: 8,
  minMove: 3,
  reanchorAfter: 5,
}

/** Accuracy needed before the first point of a run is accepted. */
export const FIRST_FIX_ACCURACY = 20

export type FilterVerdict =
  | { ok: true; distance: number; reanchor?: false }
  | { ok: true; distance: 0; reanchor: true }
  | { ok: false; reason: 'inaccurate' | 'jump' | 'jitter' | 'stale' }

/**
 * Stateful GPS filter. `check(fix)` compares against the last *accepted* fix.
 * Accepted fixes become the new anchor; rejected ones do not.
 */
export class GpsFilter {
  private last: RawFix | null = null
  private jumpStreak = 0
  opts: FilterOptions

  constructor(opts: Partial<FilterOptions> = {}) {
    this.opts = { ...DEFAULT_FILTER, ...opts }
  }

  /** Forget the anchor (e.g. after a pause) – next good fix starts a new segment. */
  reset(anchor: RawFix | null = null) {
    this.last = anchor
    this.jumpStreak = 0
  }

  get anchor(): RawFix | null {
    return this.last
  }

  check(fix: RawFix): FilterVerdict {
    const o = this.opts
    if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lon) || !(fix.acc <= o.maxAccuracy)) {
      return { ok: false, reason: 'inaccurate' }
    }
    const prev = this.last
    if (!prev) {
      this.last = fix
      return { ok: true, distance: 0, reanchor: true }
    }
    const dt = (fix.t - prev.t) / 1000
    if (dt <= 0) return { ok: false, reason: 'stale' }
    const d = distanceBetween(prev, fix)
    if (d / dt > o.maxSpeed) {
      this.jumpStreak++
      if (this.jumpStreak >= o.reanchorAfter) {
        // The old anchor was probably the bad one; start again from here without adding distance.
        this.last = fix
        this.jumpStreak = 0
        return { ok: true, distance: 0, reanchor: true }
      }
      return { ok: false, reason: 'jump' }
    }
    this.jumpStreak = 0
    if (d < o.minMove) return { ok: false, reason: 'jitter' }
    this.last = fix
    return { ok: true, distance: d }
  }
}
