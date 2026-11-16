import type { Doc, DocNode, Rect } from '../model/types'
import { pageArtboards } from '../model/doc'
import { measureMap } from './measure'

function containsPoint(rect: Rect, x: number, y: number) {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
}

function hitsShape(node: DocNode, rect: Rect, x: number, y: number) {
  if (node.kind === 'ellipse') {
    const rx = rect.width / 2
    const ry = rect.height / 2
    if (rx <= 0 || ry <= 0) return false
    const nx = (x - (rect.x + rx)) / rx
    const ny = (y - (rect.y + ry)) / ry
    return nx * nx + ny * ny <= 1
  }
  return containsPoint(rect, x, y)
}

export function hitTest(doc: Doc, pageId: string, x: number, y: number, root?: string): string | null {
  const visit = (id: string, clipParent: Rect | null): string | null => {
    const node = doc.nodes[id]
    if (!node || !node.visible || node.locked) return null
    const rect = measureMap.get(id)
    if (!rect) return null
    if (clipParent && !containsPoint(clipParent, x, y)) return null

    for (let i = node.children.length - 1; i >= 0; i -= 1) {
      const hit = visit(node.children[i], node.clip ? rect : null)
      if (hit) return hit
    }
    // Artboards are picked by their label, not their background, so pressing
    // empty artboard space starts a marquee like Paper does.
    if (node.parentId === null) return null
    return hitsShape(node, rect, x, y) ? id : null
  }

  if (root) return visit(root, null)
  const artboards = pageArtboards(doc, pageId)
  for (let i = artboards.length - 1; i >= 0; i -= 1) {
    const hit = visit(artboards[i], null)
    if (hit) return hit
  }
  return null
}

/** Returns the node's ancestor that is a direct child of an artboard (or itself). */
export function topLevelChild(doc: Doc, id: string): string {
  let node = doc.nodes[id]
  if (!node) return id
  let current = id
  while (node.parentId) {
    const parent = doc.nodes[node.parentId]
    if (!parent || parent.parentId === null) break
    current = node.parentId
    node = parent
  }
  return current
}

export function descendantsOf(doc: Doc, id: string, out = new Set<string>()) {
  const node = doc.nodes[id]
  if (!node) return out
  for (const childId of node.children) {
    out.add(childId)
    descendantsOf(doc, childId, out)
  }
  return out
}

export function ancestorsOf(doc: Doc, id: string) {
  const out: string[] = []
  let node = doc.nodes[id]
  while (node?.parentId) {
    out.push(node.parentId)
    node = doc.nodes[node.parentId]
  }
  return out
}

export function expandSelection(doc: Doc, ids: string[]) {
  const set = new Set(ids)
  for (const id of ids) descendantsOf(doc, id, set)
  return set
}

export function topLevelOnly(doc: Doc, ids: string[]) {
  const set = new Set(ids)
  return ids.filter((id) => !ancestorsOf(doc, id).some((parentId) => set.has(parentId)))
}
