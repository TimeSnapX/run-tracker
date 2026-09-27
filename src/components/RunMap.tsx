import { useEffect, useRef } from 'react'
import L from 'leaflet'
import type { TrackPoint } from '../lib/types'

interface Props {
  points: TrackPoint[]
  /** Live position marker (record screen). */
  current?: { lat: number; lon: number; acc: number } | null
  /** Keep the map centred on `current`. */
  follow?: boolean
  /** Called when the user drags the map (so the parent can switch follow off). */
  onUserPan?: () => void
  /** Fit the whole route (detail screen). */
  fit?: boolean
  className?: string
}

const AMBER = '#ffbf00'
const BRISBANE: L.LatLngTuple = [-27.4698, 153.0251]

export default function RunMap({ points, current, follow, onUserPan, fit, className }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const route = useRef<L.LayerGroup | null>(null)
  const marker = useRef<L.CircleMarker | null>(null)
  const accCircle = useRef<L.Circle | null>(null)
  const panCb = useRef(onUserPan)
  panCb.current = onUserPan
  const centred = useRef(false)

  // Init once
  useEffect(() => {
    if (!el.current) return
    const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView(BRISBANE, 13)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m)
    L.control.zoom({ position: 'bottomright' }).addTo(m)
    route.current = L.layerGroup().addTo(m)
    m.on('dragstart', () => panCb.current?.())
    map.current = m
    const ro = new ResizeObserver(() => m.invalidateSize())
    ro.observe(el.current)
    return () => {
      ro.disconnect()
      m.remove()
      map.current = null
      marker.current = null
      accCircle.current = null
      centred.current = false
    }
  }, [])

  // Route polyline(s): one per segment so pauses don't draw connecting lines.
  const n = points.length
  const lastSeg = n ? points[n - 1].seg : -1
  useEffect(() => {
    const g = route.current
    const m = map.current
    if (!g || !m) return
    g.clearLayers()
    const segs = new Map<number, L.LatLngTuple[]>()
    for (const p of points) {
      let arr = segs.get(p.seg)
      if (!arr) segs.set(p.seg, (arr = []))
      arr.push([p.lat, p.lon])
    }
    for (const latlngs of segs.values()) {
      L.polyline(latlngs, { color: '#000', weight: 9, opacity: 0.45 }).addTo(g)
      L.polyline(latlngs, { color: AMBER, weight: 5, opacity: 1 }).addTo(g)
    }
    if (fit && n) {
      const s = points[0]
      const e = points[n - 1]
      L.circleMarker([s.lat, s.lon], { radius: 7, color: '#111', weight: 2, fillColor: '#3ddc84', fillOpacity: 1 })
        .bindTooltip('Start')
        .addTo(g)
      L.circleMarker([e.lat, e.lon], { radius: 7, color: '#111', weight: 2, fillColor: '#ff5252', fillOpacity: 1 })
        .bindTooltip('Finish')
        .addTo(g)
      if (n > 1) m.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lon] as L.LatLngTuple)), { padding: [24, 24] })
      else m.setView([s.lat, s.lon], 16)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, lastSeg, fit, points])

  // Live marker
  useEffect(() => {
    const m = map.current
    if (!m || !current) return
    const ll: L.LatLngTuple = [current.lat, current.lon]
    if (!marker.current) {
      accCircle.current = L.circle(ll, {
        radius: current.acc,
        color: AMBER,
        weight: 1,
        fillColor: AMBER,
        fillOpacity: 0.12,
        interactive: false,
      }).addTo(m)
      marker.current = L.circleMarker(ll, {
        radius: 9,
        color: '#fff',
        weight: 3,
        fillColor: AMBER,
        fillOpacity: 1,
        interactive: false,
      }).addTo(m)
    } else {
      marker.current.setLatLng(ll)
      accCircle.current?.setLatLng(ll).setRadius(current.acc)
    }
    if (!centred.current) {
      m.setView(ll, 17)
      centred.current = true
    } else if (follow) {
      m.panTo(ll, { animate: true, duration: 0.5 })
    }
  }, [current?.lat, current?.lon, current?.acc, follow]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className={className ?? 'map'} />
}
