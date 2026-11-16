import { currentDocId } from './docs'

export interface LinkTarget {
  docId: string | null
  pageId: string | null
  nodeId: string | null
}

const NODE_MARK = '/n/'
const FILE_MARK = '/f/'
const PAGE_MARK = '/p/'

/** Parses `#/f/<doc>/p/<page>/n/<node>`; the `/f/` segment is optional for backward compatibility. */
export function parseHash(hash: string): LinkTarget {
  const value = hash.startsWith('#') ? hash.slice(1) : hash
  let rest = value
  let docId: string | null = null
  if (rest.startsWith(FILE_MARK)) {
    const end = rest.indexOf('/', FILE_MARK.length)
    docId = decodeURIComponent(end === -1 ? rest.slice(FILE_MARK.length) : rest.slice(FILE_MARK.length, end))
    rest = end === -1 ? '' : rest.slice(end)
  }
  if (!rest.startsWith(PAGE_MARK)) return { docId, pageId: null, nodeId: null }
  const body = rest.slice(PAGE_MARK.length)
  const mark = body.indexOf(NODE_MARK)
  if (mark === -1) {
    return { docId, pageId: decodeURIComponent(body) || null, nodeId: null }
  }
  return {
    docId,
    pageId: decodeURIComponent(body.slice(0, mark)) || null,
    nodeId: decodeURIComponent(body.slice(mark + NODE_MARK.length)) || null,
  }
}

export function pageLink(pageId: string) {
  return `${projectLink()}${pageHash(pageId)}`
}

export function nodeLink(pageId: string, nodeId: string) {
  return `${projectLink()}${pageHash(pageId, nodeId)}`
}

export function pageHash(pageId: string, nodeId?: string | null) {
  const file = FILE_MARK + encodeURIComponent(currentDocId())
  return nodeId
    ? `#${file}/p/${encodeURIComponent(pageId)}/n/${encodeURIComponent(nodeId)}`
    : `#${file}/p/${encodeURIComponent(pageId)}`
}

export function fileHash(docId: string) {
  return `#${FILE_MARK}${encodeURIComponent(docId)}`
}

export function projectLink() {
  const { origin, pathname } = window.location
  return `${origin}${pathname}`
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const field = document.createElement('textarea')
    field.value = text
    field.setAttribute('readonly', '')
    field.style.position = 'fixed'
    field.style.opacity = '0'
    document.body.appendChild(field)
    field.select()
    const ok = document.execCommand('copy')
    field.remove()
    return ok
  }
}
