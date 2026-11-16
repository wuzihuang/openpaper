import type { Doc, DocNode } from './types'
import { currentPage, focusNode, getState, pageOfNode, select, subscribe } from './store'
import { applyLinkTarget } from './store'
import { copyText, nodeLink, pageHash, pageLink, parseHash, projectLink } from './links'
import { showToast } from '../ui/Toast'
import { currentDocId, currentDocName, listDocs, setCurrentDocId } from './docs'

export const PROJECT_NAME = 'Untitled'
export const projectName = () => currentDocName()

let started = false

export function startLinkSync() {
  if (started) return () => {}
  started = true

  const sync = () => {
    const { doc, ui } = getState()
    const page = currentPage()
    const nodeId = ui.selection.length === 1 ? ui.selection[0] : null
    if (page) {
      const hash = pageHash(page.id, nodeId)
      if (location.hash !== hash) history.replaceState(null, '', hash)
    }
    const nodeName = nodeId ? doc.nodes[nodeId]?.name : null
    document.title = nodeName
      ? `${nodeName} — ${page?.name ?? ''} — ${projectName()}`
      : page
        ? `${page.name} — ${projectName()}`
        : projectName()
  }

  const onHash = () => {
    const target = parseHash(location.hash)
    if (target.docId && target.docId !== currentDocId() && listDocs().some((d) => d.id === target.docId)) {
      setCurrentDocId(target.docId)
      location.reload()
      return
    }
    if (target.pageId || target.nodeId) applyLinkTarget(target)
  }

  window.addEventListener('hashchange', onHash)
  const unsubscribe = subscribe(sync)
  sync()

  return () => {
    window.removeEventListener('hashchange', onHash)
    unsubscribe()
    started = false
  }
}

async function copy(message: string, text: string) {
  const ok = await copyText(text)
  showToast(ok ? message : 'Copy failed — copy manually')
}

export function copyProjectLink() {
  return copy('Project link copied', projectLink())
}

export function copyPageLink(pageId: string) {
  return copy('Page link copied', pageLink(pageId))
}

export function copyNodeLink(nodeId: string) {
  const pageId = pageOfNode(getState().doc, nodeId)
  if (!pageId) return
  return copy('Layer link copied', nodeLink(pageId, nodeId))
}

export function copySelectionLink() {
  const { ui } = getState()
  if (ui.selection.length === 1) return copyNodeLink(ui.selection[0])
  return copyPageLink(ui.pageId)
}

export interface PaperSnapshot {
  project: { title: string; url: string }
  page: { id: string; name: string; url: string; artboards: Array<{ id: string; name: string }> } | null
  pages: Array<{ id: string; name: string; artboards: number; url: string }>
  selection: DocNode[]
  document: Doc
}

declare global {
  interface Window {
    paper?: {
      project: string
      snapshot: () => PaperSnapshot
      link: {
        project: () => string
        page: (pageId?: string) => string | null
        node: (nodeId: string) => string | null
      }
      open: (url: string) => boolean
      select: (nodeId: string | string[]) => boolean
    }
  }
}

export function installPaperApi() {
  window.paper = {
    project: projectName(),
    snapshot: () => {
      const { doc, ui } = getState()
      const page = currentPage()
      return {
        project: { title: projectName(), url: projectLink() },
        page: page
          ? {
              id: page.id,
              name: page.name,
              url: pageLink(page.id),
              artboards: page.artboards
                .filter((id) => !!doc.nodes[id])
                .map((id) => ({ id, name: doc.nodes[id].name })),
            }
          : null,
        pages: doc.pages.map((p) => ({
          id: p.id,
          name: p.name,
          artboards: p.artboards.length,
          url: pageLink(p.id),
        })),
        selection: ui.selection.map((id) => doc.nodes[id]).filter(Boolean),
        document: doc,
        ui,
        camera: getState().camera,
      }
    },
    link: {
      project: () => projectLink(),
      page: (pageId) => {
        const id = pageId ?? getState().ui.pageId
        return id ? pageLink(id) : null
      },
      node: (nodeId) => {
        const pageId = pageOfNode(getState().doc, nodeId)
        return pageId ? nodeLink(pageId, nodeId) : null
      },
    },
    open: (url) => {
      const target = parseHash(new URL(url, location.href).hash)
      if (target.docId && target.docId !== currentDocId() && listDocs().some((d) => d.id === target.docId)) {
        setCurrentDocId(target.docId)
        location.reload()
        return true
      }
      if (!target.pageId && !target.nodeId) return false
      applyLinkTarget(target)
      return true
    },
    select: (nodeId) => {
      if (Array.isArray(nodeId)) {
        const { doc } = getState()
        const ids = nodeId.filter((id) => !!doc.nodes[id])
        if (ids.length === 0) return false
        select(ids)
        return true
      }
      return focusNode(nodeId)
    },
  }
}