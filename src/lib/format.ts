export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = h ? String(m).padStart(2, '0') : String(m)
  return `${h ? h + ':' : ''}${mm}:${String(sec).padStart(2, '0')}`
}

/** Seconds per km → "5:23". */
export function formatPace(secPerKm: number | null | undefined): string {
  if (secPerKm == null || !Number.isFinite(secPerKm)) return '–:––'
  let m = Math.floor(secPerKm / 60)
  let s = Math.round(secPerKm - m * 60)
  if (s === 60) {
    m++
    s = 0
  }
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatKm(m: number, dp = 2): string {
  return (m / 1000).toFixed(dp)
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })
}

export function defaultRunName(ts: number): string {
  const h = new Date(ts).getHours()
  const part = h < 5 ? 'Night' : h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : h < 21 ? 'Evening' : 'Night'
  return `${part} run`
}
