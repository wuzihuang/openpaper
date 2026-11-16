import { useSyncExternalStore } from 'react'
import type { Camera, Rect } from '../model/types'

export const measureMap = new Map<string, Rect>()

let version = 0
const subscribers = new Set<() => void>()

export function setMeasures(next: Map<string, Rect>) {
  measureMap.clear()
  for (const [id, rect] of next) measureMap.set(id, rect)
  version += 1
  for (const fn of subscribers) fn()
}

export function subscribeMeasures(fn: () => void) {
  subscribers.add(fn)
  return () => {
    subscribers.delete(fn)
  }
}

export function useMeasuresVersion() {
  return useSyncExternalStore(subscribeMeasures, () => version)
}

export function measureDocument(root: HTMLElement, camera: Camera) {
  const rootRect = root.getBoundingClientRect()
  const next = new Map<string, Rect>()
  for (const el of root.querySelectorAll<HTMLElement>('[data-node-id]')) {
    const id = el.dataset.nodeId
    if (!id) continue
    const r = el.getBoundingClientRect()
    next.set(id, {
      x: (r.left - rootRect.left - camera.x) / camera.scale,
      y: (r.top - rootRect.top - camera.y) / camera.scale,
      width: r.width / camera.scale,
      height: r.height / camera.scale,
    })
  }
  setMeasures(next)
  return next
}
