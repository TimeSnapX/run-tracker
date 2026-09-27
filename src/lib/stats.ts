import type { Split, TrackPoint } from './types'

/** Km splits from cumulative distance/moving time, interpolating the crossing moment. */
export function computeSplits(points: TrackPoint[], splitM = 1000): Split[] {
  const splits: Split[] = []
  let prevCum = 0
  let next = splitM
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    while (b.d >= next && b.d > a.d) {
      const f = (next - a.d) / (b.d - a.d)
      const cum = a.mt + f * (b.mt - a.mt)
      splits.push({ km: splits.length + 1, splitMs: cum - prevCum, cumulativeMs: cum })
      prevCum = cum
      next += splitM
    }
  }
  return splits
}

/** Pace in seconds per km, or null if not meaningful. */
export function paceSecPerKm(distanceM: number, ms: number): number | null {
  if (distanceM < 10 || ms <= 0) return null
  const p = ms / 1000 / (distanceM / 1000)
  return p > 60 * 60 ? null : p // slower than 60 min/km is effectively "stopped"
}

/**
 * Current (rolling) pace: look back from the latest point until the window spans
 * at least `windowMs` of moving time or `windowM` of distance, whichever comes first.
 * `nowMt` lets the pace slow down while you're standing still between fixes.
 * Only considers the current segment.
 */
export function rollingPace(
  points: TrackPoint[],
  nowMt?: number,
  windowMs = 30_000,
  windowM = 100,
): number | null {
  if (points.length < 2) return null
  const last = points[points.length - 1]
  const endMt = Math.max(nowMt ?? last.mt, last.mt)
  let startIdx = points.length - 1
  for (let i = points.length - 2; i >= 0; i--) {
    if (points[i].seg !== last.seg) break
    startIdx = i
    if (endMt - points[i].mt >= windowMs || last.d - points[i].d >= windowM) break
  }
  const start = points[startIdx]
  return paceSecPerKm(last.d - start.d, endMt - start.mt)
}

export function totalDistance(points: TrackPoint[]): number {
  return points.length ? points[points.length - 1].d : 0
}

/** Start of the current week (Monday 00:00 local time). */
export function startOfWeek(now: Date = new Date()): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  const day = (d.getDay() + 6) % 7 // Monday = 0
  d.setDate(d.getDate() - day)
  return d.getTime()
}

export function totals(runs: { startedAt: number; distanceM: number }[], now: Date = new Date()) {
  const wk = startOfWeek(now)
  let weekM = 0
  let allM = 0
  let weekRuns = 0
  for (const r of runs) {
    allM += r.distanceM
    if (r.startedAt >= wk) {
      weekM += r.distanceM
      weekRuns++
    }
  }
  return { weekKm: weekM / 1000, allKm: allM / 1000, weekRuns, allRuns: runs.length }
}
