import type { Doc, DocPage } from './types'

export function pageArtboards(doc: Doc, pageId: string): string[] {
  const page = doc.pages.find((p) => p.id === pageId)
  return page ? page.artboards.filter((id) => !!doc.nodes[id]) : []
}

export function pageOfNode(doc: Doc, nodeId: string): string | null {
  let node = doc.nodes[nodeId]
  if (!node) return null
  while (node.parentId) {
    const parent = doc.nodes[node.parentId]
    if (!parent) return null
    node = parent
  }
  return doc.pages.find((page) => page.artboards.includes(node.id))?.id ?? null
}

export function countPageNodes(doc: Doc, pageId: string) {
  let total = 0
  const walk = (id: string) => {
    const node = doc.nodes[id]
    if (!node) return
    total += 1
    for (const childId of node.children) walk(childId)
  }
  for (const id of pageArtboards(doc, pageId)) walk(id)
  return total
}

export function firstArtboardOf(doc: Doc, page: DocPage) {
  return page.artboards.find((id) => !!doc.nodes[id]) ?? null
}