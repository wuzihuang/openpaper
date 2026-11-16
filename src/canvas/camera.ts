import type { Camera, Rect } from '../model/types'

export const ZOOM_STEPS = [0.02, 0.03, 0.06, 0.13, 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256]
export const MIN_SCALE = ZOOM_STEPS[0]
export const MAX_SCALE = ZOOM_STEPS[ZOOM_STEPS.length - 1]

export function clampScale(scale: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

export function worldToViewport(x: number, y: number, camera: Camera) {
  return { x: x * camera.scale + camera.x, y: y * camera.scale + camera.y }
}

export function viewportToWorld(x: number, y: number, camera: Camera) {
  return { x: (x - camera.x) / camera.scale, y: (y - camera.y) / camera.scale }
}

// Paper rounds the camera translation to whole pixels so hairlines stay crisp.
export function cameraMatrix(camera: Camera) {
  const s = camera.scale
  const x = Math.round(camera.x)
  const y = Math.round(camera.y)
  return `matrix3d(${s}, 0, 0, 0, 0, ${s}, 0, 0, 0, 0, 1, 0, ${x}, ${y}, 0, 1)`
}

export function zoomAtPoint(camera: Camera, point: { x: number; y: number }, scale: number): Camera {
  const world = viewportToWorld(point.x, point.y, camera)
  const next = clampScale(scale)
  return { scale: next, x: point.x - world.x * next, y: point.y - world.y * next }
}

export function stepZoom(scale: number, direction: 1 | -1) {
  if (direction > 0) {
    for (const step of ZOOM_STEPS) if (step > scale + 1e-6) return step
    return MAX_SCALE
  }
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i -= 1) if (ZOOM_STEPS[i] < scale - 1e-6) return ZOOM_STEPS[i]
  return MIN_SCALE
}

export interface Viewport {
  width: number
  height: number
  left: number
  top: number
  right: number
  bottom: number
}

export function fitBounds(bounds: Rect | null, viewport: Viewport, padding = 72): Camera {
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    return { x: viewport.width / 2, y: viewport.height / 2, scale: 1 }
  }
  const availableW = Math.max(1, viewport.width - viewport.left - viewport.right - padding * 2)
  const availableH = Math.max(1, viewport.height - viewport.top - viewport.bottom - padding * 2)
  const scale = clampScale(Math.min(availableW / bounds.width, availableH / bounds.height))
  const cx = viewport.left + availableW / 2 + padding
  const cy = viewport.top + availableH / 2 + padding
  return {
    scale,
    x: cx - (bounds.x + bounds.width / 2) * scale,
    y: cy - (bounds.y + bounds.height / 2) * scale,
  }
}

export function unionRects(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null
  let x1 = Infinity
  let y1 = Infinity
  let x2 = -Infinity
  let y2 = -Infinity
  for (const r of rects) {
    x1 = Math.min(x1, r.x)
    y1 = Math.min(y1, r.y)
    x2 = Math.max(x2, r.x + r.width)
    y2 = Math.max(y2, r.y + r.height)
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
}

export function rectsIntersect(a: Rect, b: Rect) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}
