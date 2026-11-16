import type { Doc, DocNode, Rect } from '../model/types'
import { pageArtboards } from '../model/doc'
import { measureMap } from './measure'

export interface SnapResult {
  dx: number
  dy: number
  guidesX: number[]
  guidesY: number[]
}

interface Line {
  value: number
  target: number
}

function collectTargets(doc: Doc, pageId: string, movingIds: Set<string>): DocNode[] {
  const targets: DocNode[] = []
  const parents = new Set<string | null>()
  for (const id of movingIds) {
    const node = doc.nodes[id]
    if (node) parents.add(node.parentId)
  }
  for (const artboardId of pageArtboards(doc, pageId)) {
    if (!movingIds.has(artboardId)) targets.push(doc.nodes[artboardId])
  }
  for (const parentId of parents) {
    if (parentId === null) continue
    const parent = doc.nodes[parentId]
    if (!parent) continue
    for (const childId of parent.children) {
      if (movingIds.has(childId)) continue
      targets.push(doc.nodes[childId])
    }
  }
  return targets
}

export function computeSnap(
  doc: Doc,
  pageId: string,
  movingIds: Set<string>,
  box: Rect,
  threshold: number,
): SnapResult {
  const targets = collectTargets(doc, pageId, movingIds)
  const movingX = [box.x, box.x + box.width / 2, box.x + box.width]
  const movingY = [box.y, box.y + box.height / 2, box.y + box.height]

  const xs: Line[] = []
  const ys: Line[] = []
  for (const node of targets) {
    const rect = measureMap.get(node.id)
    if (!rect) continue
    xs.push({ value: rect.x, target: rect.x }, { value: rect.x + rect.width / 2, target: rect.x + rect.width / 2 }, { value: rect.x + rect.width, target: rect.x + rect.width })
    ys.push({ value: rect.y, target: rect.y }, { value: rect.y + rect.height / 2, target: rect.y + rect.height / 2 }, { value: rect.y + rect.height, target: rect.y + rect.height })
  }

  let bestDx = 0
  let bestX = threshold
  let bestDy = 0
  let bestY = threshold
  for (const line of xs) {
    for (const edge of movingX) {
      const delta = line.target - edge
      if (Math.abs(delta) < Math.abs(bestX)) {
        bestX = delta
        bestDx = delta
      }
    }
  }
  for (const line of ys) {
    for (const edge of movingY) {
      const delta = line.target - edge
      if (Math.abs(delta) < Math.abs(bestY)) {
        bestY = delta
        bestDy = delta
      }
    }
  }

  const snappedX = Math.abs(bestDx) <= threshold
  const snappedY = Math.abs(bestDy) <= threshold
  const dx = snappedX ? bestDx : 0
  const dy = snappedY ? bestDy : 0

  const guidesX: number[] = []
  const guidesY: number[] = []
  if (snappedX) {
    for (const line of xs) {
      if (movingX.some((edge) => Math.abs(line.target - (edge + dx)) < 0.5)) guidesX.push(line.target)
    }
  }
  if (snappedY) {
    for (const line of ys) {
      if (movingY.some((edge) => Math.abs(line.target - (edge + dy)) < 0.5)) guidesY.push(line.target)
    }
  }

  return { dx, dy, guidesX: unique(guidesX), guidesY: unique(guidesY) }
}

function unique(values: number[]) {
  const out: number[] = []
  for (const v of values) if (!out.some((o) => Math.abs(o - v) < 0.5)) out.push(v)
  return out
}
