import { describe, expect, it } from 'vitest'
import { haversine, offsetMetres } from './geo'
import { GpsFilter } from './filter'
import { computeSplits, paceSecPerKm, rollingPace, startOfWeek, totals } from './stats'
import { formatDuration, formatPace } from './format'
import { buildGpx } from './gpx'
import { RecorderCore } from './recorder'
import { buildBackup, importBackup, loadRuns, addRun, loadLive, saveLive, type KV } from './storage'
import type { RawFix } from './types'

const BNE = { lat: -27.4698, lon: 153.0251 } // Brisbane CBD

function memKV(): KV & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  }
}

/** Synthetic run: heading east at `speed` m/s, one fix per second. */
function track(seconds: number, speed: number, t0 = Date.UTC(2026, 8, 25, 20, 0, 0)): RawFix[] {
  const out: RawFix[] = []
  for (let i = 0; i <= seconds; i++) {
    const p = offsetMetres(BNE.lat, BNE.lon, 0, i * speed)
    out.push({ ...p, t: t0 + i * 1000, acc: 5, ele: 20 + Math.sin(i / 60) * 5 })
  }
  return out
}

describe('haversine', () => {
  it('matches known distances', () => {
    // 1 degree of latitude ≈ 111.2 km
    expect(haversine(0, 0, 1, 0)).toBeCloseTo(111195, -2)
    // Brisbane → Sydney ≈ 732 km
    expect(haversine(-27.4698, 153.0251, -33.8688, 151.2093) / 1000).toBeGreaterThan(725)
    expect(haversine(-27.4698, 153.0251, -33.8688, 151.2093) / 1000).toBeLessThan(740)
    const p = offsetMetres(BNE.lat, BNE.lon, 300, 400)
    expect(haversine(BNE.lat, BNE.lon, p.lat, p.lon)).toBeCloseTo(500, 0)
  })
})

describe('GpsFilter', () => {
  it('rejects poor accuracy, jumps and jitter', () => {
    const f = new GpsFilter()
    const t = 1_000_000
    expect(f.check({ ...BNE, t, acc: 50 }).ok).toBe(false) // inaccurate
    expect(f.check({ ...BNE, t, acc: 5 }).ok).toBe(true) // anchor
    const jitter = offsetMetres(BNE.lat, BNE.lon, 1, 1)
    expect(f.check({ ...jitter, t: t + 1000, acc: 5 })).toMatchObject({ ok: false, reason: 'jitter' })
    const jump = offsetMetres(BNE.lat, BNE.lon, 0, 100)
    expect(f.check({ ...jump, t: t + 2000, acc: 5 })).toMatchObject({ ok: false, reason: 'jump' })
    const good = offsetMetres(BNE.lat, BNE.lon, 0, 10)
    const v = f.check({ ...good, t: t + 3000, acc: 5 })
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.distance).toBeCloseTo(10, 1)
  })

  it('re-anchors after a run of consistent "jumps" (bad anchor)', () => {
    const f = new GpsFilter()
    f.check({ ...BNE, t: 0, acc: 5 })
    const far = offsetMetres(BNE.lat, BNE.lon, 0, 500)
    let last
    for (let i = 1; i <= 5; i++) last = f.check({ ...offsetMetres(far.lat, far.lon, 0, i * 3), t: i * 1000, acc: 5 })
    expect(last).toMatchObject({ ok: true, reanchor: true, distance: 0 })
  })
})

describe('recorder + splits on a synthetic 3.5 km run', () => {
  it('computes distance, splits and pace', () => {
    const fixes = track(1200, 3) // 3.6 km at 3 m/s → 5:33.3 /km
    // Inject noise: a very inaccurate fix and a big outlier jump
    fixes[100] = { ...fixes[100], acc: 80, lat: fixes[100].lat + 0.01 }
    fixes[200] = { ...fixes[200], lat: fixes[200].lat + 0.002 } // ~220 m sideways spike
    const rec = new RecorderCore()
    rec.start('test')
    let splitsFired = 0
    // A weak first fix should keep us waiting
    expect(rec.addFix({ ...fixes[0], acc: 40 }, fixes[0].t).accepted).toBe(false)
    expect(rec.status).toBe('waiting')
    for (const f of fixes) splitsFired += rec.addFix(f, f.t).newSplits
    expect(rec.status).toBe('recording')
    const d = rec.distanceM
    expect(Math.abs(d - 3600)).toBeLessThan(3600 * 0.01)
    expect(splitsFired).toBe(3)
    const splits = computeSplits(rec.points)
    expect(splits.map((s) => s.km)).toEqual([1, 2, 3])
    for (const s of splits) expect(s.splitMs / 1000).toBeCloseTo(333.3, -1)
    const rp = rollingPace(rec.points)
    expect(rp).not.toBeNull()
    expect(rp!).toBeCloseTo(333.3, -1)
    expect(formatPace(paceSecPerKm(d, rec.movingMs(fixes[fixes.length - 1].t)))).toBe('5:33')
  })

  it('excludes paused time and paused distance', () => {
    const fixes = track(1000, 3)
    const rec = new RecorderCore()
    rec.start('p')
    for (const f of fixes.slice(0, 301)) rec.addFix(f, f.t) // 900 m in 300 s
    rec.pause(fixes[300].t)
    for (const f of fixes.slice(301, 601)) rec.addFix(f, f.t) // ignored while paused
    rec.resume(fixes[600].t)
    for (const f of fixes.slice(600)) rec.addFix(f, f.t) // 1200 m in 400 s
    const end = fixes[fixes.length - 1].t
    expect(rec.movingMs(end) / 1000).toBeCloseTo(700, 0)
    expect(rec.distanceM).toBeGreaterThan(2080)
    expect(rec.distanceM).toBeLessThan(2120)
    expect(new Set(rec.points.map((p) => p.seg))).toEqual(new Set([0, 1]))
    const run = rec.finish(end)
    expect(run.movingMs / 1000).toBeCloseTo(700, 0)
    expect(rec.status).toBe('idle')
  })

  it('ignores stationary jitter', () => {
    const rec = new RecorderCore()
    rec.start('j')
    const t0 = 0
    for (let i = 0; i < 120; i++) {
      const p = offsetMetres(BNE.lat, BNE.lon, Math.sin(i) * 1.2, Math.cos(i * 1.7) * 1.2)
      rec.addFix({ ...p, t: t0 + i * 1000, acc: 6 }, t0 + i * 1000)
    }
    expect(rec.distanceM).toBeLessThan(5)
  })
})

describe('GPX', () => {
  it('builds GPX 1.1 with trkpt, ele and time', () => {
    const fixes = track(60, 3)
    const rec = new RecorderCore()
    rec.start('g')
    fixes.forEach((f) => rec.addFix(f, f.t))
    const run = rec.finish(fixes[60].t)
    run.name = 'Test & <run>'
    const gpx = buildGpx(run)
    expect(gpx.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(gpx).toContain('version="1.1"')
    expect(gpx).toContain('xmlns="http://www.topografix.com/GPX/1/1"')
    expect(gpx).toContain('Test &amp; &lt;run&gt;')
    expect((gpx.match(/<trkpt /g) || []).length).toBe(run.points.length)
    expect(gpx).toMatch(/<trkpt lat="-27\.\d{7}" lon="153\.\d{7}"><ele>[\d.]+<\/ele><time>2026-09-25T20:00:00\.000Z<\/time><\/trkpt>/)
    expect((gpx.match(/<trkseg>/g) || []).length).toBe(1)
  })
})

describe('storage', () => {
  it('round-trips runs, live snapshot and backups', () => {
    const kv = memKV()
    const fixes = track(400, 3)
    const rec = new RecorderCore()
    rec.start('s1')
    fixes.forEach((f) => rec.addFix(f, f.t))
    saveLive(kv, rec.snapshot(fixes[400].t))
    const live = loadLive(kv)!
    expect(live.points.length).toBe(rec.points.length)
    const r2 = new RecorderCore()
    r2.restore(live)
    expect(r2.status).toBe('paused')
    expect(Math.abs(r2.distanceM - rec.distanceM)).toBeLessThan(0.2)

    const run = rec.finish(fixes[400].t)
    addRun(kv, run)
    const loaded = loadRuns(kv)
    expect(loaded).toHaveLength(1)
    expect(loaded[0].points[10].lat).toBeCloseTo(run.points[10].lat, 6)

    const backup = JSON.stringify(buildBackup(kv))
    const kv2 = memKV()
    expect(importBackup(kv2, backup)).toEqual({ added: 1, skipped: 0, total: 1 })
    expect(importBackup(kv2, backup)).toEqual({ added: 0, skipped: 1, total: 1 })
    expect(() => importBackup(kv2, '{"foo":1}')).toThrow()
  })
})

describe('format + totals', () => {
  it('formats', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(65_000)).toBe('1:05')
    expect(formatDuration(3_725_000)).toBe('1:02:05')
    expect(formatPace(null)).toBe('–:––')
    expect(formatPace(299.7)).toBe('5:00')
  })
  it('weekly totals start Monday', () => {
    const now = new Date(2026, 8, 25, 12) // Fri 25 Sep 2026
    expect(new Date(startOfWeek(now)).getDate()).toBe(21)
    const t = totals(
      [
        { startedAt: new Date(2026, 8, 21, 6).getTime(), distanceM: 5000 },
        { startedAt: new Date(2026, 8, 20, 6).getTime(), distanceM: 10000 },
      ],
      now,
    )
    expect(t.weekKm).toBe(5)
    expect(t.allKm).toBe(15)
  })
})

describe('GPX sample output', () => {
  it('writes a sample GPX when GPX_OUT is set (for external XSD validation)', async () => {
    const out = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.GPX_OUT
    if (!out) return
    const fixes = track(300, 3)
    const rec = new RecorderCore()
    rec.start('x')
    fixes.slice(0, 150).forEach((f) => rec.addFix(f, f.t))
    rec.pause(fixes[150].t)
    rec.resume(fixes[160].t)
    fixes.slice(160).forEach((f) => rec.addFix(f, f.t))
    const { writeFileSync } = await import('node:fs')
    writeFileSync(out, buildGpx(rec.finish(fixes[300].t)))
  })
})
