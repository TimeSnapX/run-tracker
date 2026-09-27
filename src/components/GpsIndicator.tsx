import type { GpsQuality } from '../RecorderContext'

const LABEL: Record<GpsQuality, string> = {
  off: 'off',
  searching: 'Searching…',
  weak: 'Weak',
  ok: 'OK',
  good: 'Good',
}

export default function GpsIndicator({ quality, acc }: { quality: GpsQuality; acc: number | null }) {
  const bars = quality === 'good' ? 3 : quality === 'ok' ? 2 : quality === 'weak' ? 1 : 0
  return (
    <div className={`gps gps-${quality}`} role="status" aria-live="polite">
      <span className="bars" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <span key={i} className={i <= bars ? 'on' : ''} style={{ height: 6 + i * 5 }} />
        ))}
      </span>
      <span className="gps-label">
        GPS {LABEL[quality]}
        {acc != null && quality !== 'searching' && quality !== 'off' ? ` ±${Math.round(acc)} m` : ''}
      </span>
    </div>
  )
}
