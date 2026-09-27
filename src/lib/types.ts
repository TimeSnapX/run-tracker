/** A single accepted GPS point in a run. */
export interface TrackPoint {
  lat: number
  lon: number
  /** Epoch ms of the fix. */
  t: number
  /** Reported horizontal accuracy (m). */
  acc: number
  /** Altitude (m) if the device reported one. */
  ele?: number | null
  /** Segment index; a new segment starts after each pause. */
  seg: number
  /** Cumulative distance (m) at this point. */
  d: number
  /** Cumulative moving time (ms, excludes pauses) at this point. */
  mt: number
}

export interface Run {
  id: string
  startedAt: number
  endedAt: number
  movingMs: number
  distanceM: number
  points: TrackPoint[]
  name?: string
}

export interface Split {
  /** 1-based km number. */
  km: number
  /** Moving time taken for this km (ms). */
  splitMs: number
  /** Cumulative moving time at the end of this km (ms). */
  cumulativeMs: number
}

/** Raw fix as fed into the filter. */
export interface RawFix {
  lat: number
  lon: number
  t: number
  acc: number
  ele?: number | null
}
