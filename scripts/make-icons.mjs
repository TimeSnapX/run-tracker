// Generates PNG app icons (no dependencies) matching public/favicon.svg.
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const BG = [17, 17, 17]
const AMBER = [255, 191, 0]
const WHITE = [255, 255, 255]
const pts = [[150, 330], [215, 250], [270, 300], [362, 178]]
function segDist(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - ax - t * dx, py - ay - t * dy)
}
function roundRectInside(x, y, r) {
  const cx = Math.min(Math.max(x, r), 512 - r), cy = Math.min(Math.max(y, r), 512 - r)
  return Math.hypot(x - cx, y - cy) <= r
}
/** Colour at a point in 512-unit design space. */
function sample(x, y, { maskable }) {
  // maskable: full-bleed background, artwork scaled into the safe zone
  let bg = maskable ? true : x >= 0 && y >= 0 && x <= 512 && y <= 512 && roundRectInside(x, y, 112)
  if (!bg) return null
  let ux = x, uy = y
  if (maskable) { ux = 256 + (x - 256) / 0.78; uy = 256 + (y - 256) / 0.78 }
  if (Math.hypot(ux - 362, uy - 178) <= 30) return WHITE
  for (let i = 0; i < pts.length - 1; i++) if (segDist(ux, uy, pts[i], pts[i + 1]) <= 18) return AMBER
  const r = Math.hypot(ux - 256, uy - 256)
  if (Math.abs(r - 176) <= 14) return AMBER
  return BG
}
function render(size, opts) {
  const buf = Buffer.alloc(size * size * 4)
  const SS = 4
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const c = sample(((x + (sx + 0.5) / SS) / size) * 512, ((y + (sy + 0.5) / SS) / size) * 512, opts)
          if (c) { r += c[0]; g += c[1]; b += c[2]; a++ }
        }
      const i = (y * size + x) * 4
      if (a) { buf[i] = r / a; buf[i + 1] = g / a; buf[i + 2] = b / a }
      buf[i + 3] = Math.round((a / (SS * SS)) * 255)
    }
  return png(size, buf)
}
writeFileSync('public/icon-192.png', render(192, { maskable: false }))
writeFileSync('public/icon-512.png', render(512, { maskable: false }))
writeFileSync('public/icon-maskable-512.png', render(512, { maskable: true }))
writeFileSync('public/apple-touch-icon.png', render(180, { maskable: true })) // iOS applies its own rounding
console.log('icons written')
