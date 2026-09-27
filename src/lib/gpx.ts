import type { Run } from './types'
import { defaultRunName } from './format'

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

/** Build a GPX 1.1 document. One <trkseg> per recording segment (pauses split segments). */
export function buildGpx(run: Run): string {
  const name = esc(run.name || defaultRunName(run.startedAt))
  const out: string[] = []
  out.push('<?xml version="1.0" encoding="UTF-8"?>')
  out.push(
    '<gpx version="1.1" creator="Run Tracker" xmlns="http://www.topografix.com/GPX/1/1" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
      'xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">',
  )
  out.push(`  <metadata><name>${name}</name><time>${new Date(run.startedAt).toISOString()}</time></metadata>`)
  out.push('  <trk>')
  out.push(`    <name>${name}</name>`)
  out.push('    <type>running</type>')
  let seg: number | null = null
  for (const p of run.points) {
    if (p.seg !== seg) {
      if (seg !== null) out.push('    </trkseg>')
      out.push('    <trkseg>')
      seg = p.seg
    }
    const ele = p.ele != null && Number.isFinite(p.ele) ? `<ele>${p.ele.toFixed(1)}</ele>` : ''
    out.push(
      `      <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">${ele}<time>${new Date(p.t).toISOString()}</time></trkpt>`,
    )
  }
  if (seg !== null) out.push('    </trkseg>')
  out.push('  </trk>')
  out.push('</gpx>')
  return out.join('\n') + '\n'
}

export function gpxFilename(run: Run): string {
  const d = new Date(run.startedAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `run-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.gpx`
}
