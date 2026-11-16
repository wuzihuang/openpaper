import type { VectorPoint } from './types'

export function vectorPathD(points: VectorPoint[], closed: boolean): string {
  if (points.length === 0) return ''
  const parts = [`M ${points[0].x} ${points[0].y}`]
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const point = points[i]
    if (prev.handleOut || point.handleIn) {
      const c1 = prev.handleOut ?? { x: prev.x, y: prev.y }
      const c2 = point.handleIn ?? { x: point.x, y: point.y }
      parts.push(`C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${point.x} ${point.y}`)
    } else {
      parts.push(`L ${point.x} ${point.y}`)
    }
  }
  if (closed && points.length > 2) {
    const last = points[points.length - 1]
    const first = points[0]
    if (last.handleOut || first.handleIn) {
      const c1 = last.handleOut ?? { x: last.x, y: last.y }
      const c2 = first.handleIn ?? { x: first.x, y: first.y }
      parts.push(`C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${first.x} ${first.y}`)
    }
    parts.push('Z')
  }
  return parts.join(' ')
}

function cubicPoint(
  p0: { x: number; y: number },
  c1: { x: number; y: number },
  c2: { x: number; y: number },
  p1: { x: number; y: number },
  t: number,
) {
  const u = 1 - t
  return {
    x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x,
    y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y,
  }
}

function segmentDistance(
  a: VectorPoint,
  b: VectorPoint,
  p: { x: number; y: number },
): { t: number; dist: number } {
  if (!a.handleOut && !b.handleIn) {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
    return { t, dist: Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)) }
  }
  const c1 = a.handleOut ?? a
  const c2 = b.handleIn ?? b
  let best = { t: 0, dist: Infinity }
  for (let i = 0; i <= 32; i += 1) {
    const t = i / 32
    const q = cubicPoint(a, c1, c2, b, t)
    const dist = Math.hypot(p.x - q.x, p.y - q.y)
    if (dist < best.dist) best = { t, dist }
  }
  return best
}

/** Finds the closest path segment to `p` (local coords); returns segment start index and t. */
export function closestOnPath(
  points: VectorPoint[],
  closed: boolean,
  p: { x: number; y: number },
): { index: number; t: number; dist: number } | null {
  if (points.length < 2) return null
  let best: { index: number; t: number; dist: number } | null = null
  const count = closed ? points.length : points.length - 1
  for (let i = 0; i < count; i += 1) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const hit = segmentDistance(a, b, p)
    if (!best || hit.dist < best.dist) best = { index: i, t: hit.t, dist: hit.dist }
  }
  return best
}

export function pointsBounds(points: VectorPoint[]): { x: number; y: number; width: number; height: number } {
  const xs: number[] = []
  const ys: number[] = []
  for (const p of points) {
    xs.push(p.x)
    ys.push(p.y)
    if (p.handleIn) { xs.push(p.handleIn.x); ys.push(p.handleIn.y) }
    if (p.handleOut) { xs.push(p.handleOut.x); ys.push(p.handleOut.y) }
  }
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return { x: minX, y: minY, width: Math.max(1, Math.max(...xs) - minX), height: Math.max(1, Math.max(...ys) - minY) }
}
