import { useSyncExternalStore } from 'react'
import type { DesignToken, Camera, Doc, DocComment, DocNode, DocPage, FlexLayout, Guides, Rect, Tool, VectorPoint } from './types'
import { measureMap } from '../canvas/measure'
import { fitBounds, stepZoom, unionRects, zoomAtPoint, clampScale } from '../canvas/camera'
import { buildSampleDoc, uid } from './sample'
import { topLevelOnly } from '../canvas/hitTest'
import { parseHash } from './links'
import { pageArtboards, pageOfNode } from './doc'
import { showToast } from '../ui/Toast'
import { SHADER_PRESETS } from './fills'
import {
  createDocMeta,
  currentDocId,
  deleteDocMeta,
  duplicateDocMeta,
  listDocs,
  purgeDocMeta,
  readDocRaw,
  renameDocMeta,
  restoreDocMeta,
  setCurrentDocId,
  trashDocMeta,
  writeDocRaw,
} from './docs'

export { countPageNodes, pageArtboards, pageOfNode } from './doc'

export type PanelTab = 'design' | 'theme'

export interface PenDraft {
  points: VectorPoint[]
  closed: boolean
  parentId: string | null
}

export interface PathEdit {
  nodeId: string
  pointIndex: number | null
}

export interface UIState {
  pageId: string
  selection: string[]
  hoverId: string | null
  /** Frame/artboard that would receive the dragged selection (Paper drop-target highlight). */
  dropTargetId: string | null
  editingId: string | null
  renamingNodeId: string | null
  renamingPageId: string | null
  panelTab: PanelTab
  tool: Tool
  spaceDown: boolean
  marquee: Rect | null
  pen: PenDraft | null
  pathEdit: PathEdit | null
  pixelSnap: boolean
  layersEpoch: number
  measure: boolean
  uiVisible: boolean
  leftPanelVisible: boolean
  /** Paper panelState widths — floating panels, drag-resizable. */
  leftPanelWidth: number
  rightPanelWidth: number
  commentsVisible: boolean
  hotkeysVisible: boolean
  pixelGrid: boolean
  /** Paper ⇧G: whether snapping guides render during drags. */
  guidesEnabled: boolean
  theme: 'light' | 'dark'
  nudgeAmounts: [number, number]
  nudgeSettingsVisible: boolean
  /** Paper file browser overlay. */
  fileBrowserVisible: boolean
  /** Paper pageListIsOpen/pageListHeight — collapsible, resizable Pages section. */
  pageListOpen: boolean
  pageListHeight: number
  /** Paper user preferences (scroll-wheel zoom, invert, right-click pan, zoom-centers-selection, deep selection). */
  prefs: { wheelZooms?: boolean; invertZoom?: boolean; rightClickPan?: boolean; zoomCentersSelection?: boolean; deepSelection?: boolean }
}

export interface ViewportState {
  width: number
  height: number
  left: number
  right: number
  top: number
  bottom: number
}

export interface EditorState {
  doc: Doc
  camera: Camera
  ui: UIState
  guides: Guides
  viewport: ViewportState
}

const STORAGE_KEY = 'paper-canvas-doc-v2' // legacy; superseded by model/docs registry
const LEGACY_KEY = 'paper-canvas-doc-v1'

function normalizeDoc(value: unknown): Doc | null {
  if (!value || typeof value !== 'object') return null
  const parsed = value as { pages?: DocPage[]; artboards?: string[]; nodes?: Record<string, DocNode> }
  if (Array.isArray(parsed.pages) && parsed.nodes) {
    const pages = parsed.pages.filter((page) => page && page.id && Array.isArray(page.artboards))
    if (pages.length > 0) return { ...(parsed as Doc), pages, nodes: parsed.nodes }
  }
  if (Array.isArray(parsed.artboards) && parsed.nodes) {
    return { pages: [{ id: 'page_main', name: 'Page 1', artboards: parsed.artboards }], nodes: parsed.nodes }
  }
  return null
}

function loadDoc(): Doc {
  try {
    const raw = readDocRaw(BOOT_DOC_ID) ?? localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_KEY)
    if (!raw) return buildSampleDoc()
    const doc = normalizeDoc(JSON.parse(raw))
    if (doc) return doc
  } catch {
    /* fall through to sample */
  }
  return buildSampleDoc()
}

const bootLink = parseHash(window.location.hash)
// Deep links may target another file: `#/f/<doc>/…` switches the boot document before capture.
if (bootLink.docId && bootLink.docId !== currentDocId() && listDocs().some((d) => d.id === bootLink.docId)) {
  setCurrentDocId(bootLink.docId)
}
/** Document this app instance owns — captured at boot so other tabs can't redirect saves. */
const BOOT_DOC_ID = currentDocId()

export function bootLinkTarget() {
  return bootLink
}

function initialState(): EditorState {
  const doc = loadDoc()
  const pageId = doc.pages.find((page) => page.id === bootLink.pageId)?.id ?? doc.pages[0]?.id ?? ''
  return {
    doc,
    camera: { x: 0, y: 0, scale: 1 },
    ui: {
      pageId,
      selection: [],
      hoverId: null,
      dropTargetId: null,
      editingId: null,
      renamingNodeId: null,
      renamingPageId: null,
      panelTab: 'design',
      tool: 'select',
      spaceDown: false,
      marquee: null,
      pen: null,
      pathEdit: null,
      pixelSnap: true,
      layersEpoch: 0,
      measure: false,
      uiVisible: true,
      leftPanelVisible: true,
      leftPanelWidth: Number(localStorage.getItem('openpaper:panel-w')?.split(',')[0]) || 240,
      rightPanelWidth: Number(localStorage.getItem('openpaper:panel-w')?.split(',')[1]) || 280,
      commentsVisible: true,
      hotkeysVisible: false,
      fileBrowserVisible: false,
      pageListOpen: true,
      pageListHeight: 140,
      pixelGrid: false,
      guidesEnabled: true,
      theme: (typeof localStorage !== 'undefined' && localStorage.getItem('openpaper:theme')) === 'dark' ? 'dark' : 'light',
      nudgeAmounts: ((): [number, number] => {
        if (typeof localStorage === 'undefined') return [1, 8]
        const raw = localStorage.getItem('openpaper:nudge')
        const parsed = raw ? (JSON.parse(raw) as number[]) : null
        return Array.isArray(parsed) && parsed.length === 2 ? [parsed[0], parsed[1]] : [1, 8]
      })(),
      nudgeSettingsVisible: false,
      prefs: (() => {
        if (typeof localStorage === 'undefined') return {}
        try {
          return (JSON.parse(localStorage.getItem('openpaper:prefs') ?? '{}') ?? {}) as UIState['prefs']
        } catch {
          return {}
        }
      })(),
    },
    guides: { x: [], y: [] },
    viewport: { width: 1440, height: 900, left: 0, right: 0, top: 0, bottom: 0 },
  }
}

let state: EditorState = initialState()
const listeners = new Set<() => void>()

function emit() {
  for (const fn of listeners) fn()
}

export function getState() {
  return state
}

export function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

function setState(next: EditorState) {
  if (next === state) return
  state = next
  emit()
}

export function useEditor<T>(selector: (s: EditorState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state))
}

export function setUI(patch: Partial<UIState>) {
  setState({ ...state, ui: { ...state.ui, ...patch } })
  if (patch.leftPanelWidth !== undefined || patch.rightPanelWidth !== undefined) {
    localStorage.setItem('openpaper:panel-w', `${state.ui.leftPanelWidth},${state.ui.rightPanelWidth}`)
  }
}

export function setCamera(camera: Camera) {
  setState({ ...state, camera })
}

export function setGuides(guides: Guides) {
  if (state.guides.x.join() === guides.x.join() && state.guides.y.join() === guides.y.join()) return
  setState({ ...state, guides })
}

export function setViewport(viewport: ViewportState) {
  const v = state.viewport
  if (v.width === viewport.width && v.height === viewport.height) return
  setState({ ...state, viewport })
}

/* ------------------------------------------------------------------ */
/* pages                                                               */
/* ------------------------------------------------------------------ */

const pageCameras = new Map<string, Camera>()

export function currentPage(editor = state): DocPage | undefined {
  return editor.doc.pages.find((page) => page.id === editor.ui.pageId) ?? editor.doc.pages[0]
}

export function switchPage(pageId: string) {
  const page = state.doc.pages.find((p) => p.id === pageId)
  if (!page || page.divider || state.ui.pageId === pageId) return
  pageCameras.set(state.ui.pageId, state.camera)
  const saved = pageCameras.get(pageId)
  setState({
    ...state,
    camera: saved ?? state.camera,
    ui: {
      ...state.ui,
      pageId,
      selection: [],
      hoverId: null,
      dropTargetId: null,
      editingId: null,
      renamingNodeId: null,
      renamingPageId: null,
      marquee: null,
    },
  })
  setGuides({ x: [], y: [] })
  if (!saved) zoomToFit()
}

export function addPage() {
  const id = uid('page_')
  withHistory((doc) => {
    doc.pages.push({ id, name: `Page ${doc.pages.length + 1}`, artboards: [] })
  })
  pageCameras.delete(id)
  switchPage(id)
  return id
}

export function addPageDivider(afterId?: string) {
  const id = uid('page_')
  withHistory((doc) => {
    const at = afterId ? doc.pages.findIndex((p) => p.id === afterId) + 1 : doc.pages.length
    doc.pages.splice(Math.max(0, at), 0, { id, name: '', artboards: [], divider: true })
  })
}

export function setPageIcon(id: string, icon: string) {
  withHistory((doc) => {
    const page = doc.pages.find((p) => p.id === id)
    if (page) page.icon = icon || undefined
  })
}

export function renamePage(id: string, name: string) {
  const trimmed = name.trim()
  if (!trimmed) return
  withHistory((doc) => {
    const page = doc.pages.find((p) => p.id === id)
    if (page) page.name = trimmed
  })
}

/** Clones a page with all of its artboards and comments (Paper duplicate page). */
export function duplicatePage(id: string) {
  const index = state.doc.pages.findIndex((p) => p.id === id)
  if (index < 0) return null
  const newId = uid('page_')
  withHistory((doc) => {
    const source = doc.pages[index]
    if (!source) return
    const artboards = source.artboards
      .map((aid) => cloneSubtree(doc, aid, null, 0, 0))
      .filter((aid): aid is string => !!aid)
    doc.pages.splice(index + 1, 0, {
      id: newId,
      name: `${source.name} copy`,
      artboards,
      thumbnailId: undefined,
    })
    for (const aid of artboards) doc.nodes[aid].component = undefined
    const comments = (doc.comments ?? []).filter((c) => c.pageId === id)
    if (comments.length) {
      doc.comments = [
        ...(doc.comments ?? []),
        ...comments.map((c) => ({ ...structuredClone(c), id: uid('com_'), pageId: newId })),
      ]
    }
  })
  return newId
}

/** Reorders a page up/down the page list (Paper page move). */
export function movePage(id: string, dir: -1 | 1) {
  const index = state.doc.pages.findIndex((p) => p.id === id)
  const target = index + dir
  if (index < 0 || target < 0 || target >= state.doc.pages.length) return
  withHistory((doc) => {
    const [page] = doc.pages.splice(index, 1)
    doc.pages.splice(target, 0, page)
  })
}

/** Moves a layer to a new parent/index via layers-panel drag (Paper layer reorder/nest). */
export function reparentNode(id: string, parentId: string | null, index: number) {
  const node = state.doc.nodes[id]
  if (!node || id === parentId) return
  if (parentId) {
    let cur: string | null = parentId
    while (cur) {
      if (cur === id) return
      cur = state.doc.nodes[cur]?.parentId ?? null
    }
  }
  withHistory((doc) => {
    const draft = doc.nodes[id]
    if (!draft) return
    if (draft.parentId) {
      const old = doc.nodes[draft.parentId]
      if (old) old.children = old.children.filter((c) => c !== id)
    } else {
      for (const page of doc.pages) page.artboards = page.artboards.filter((c) => c !== id)
    }
    if (parentId) {
      const parent = doc.nodes[parentId]
      if (!parent) return
      parent.children.splice(Math.max(0, Math.min(index, parent.children.length)), 0, id)
      draft.parentId = parentId
    } else {
      const page = doc.pages.find((p) => p.id === state.ui.pageId) ?? doc.pages[0]
      if (!page) return
      page.artboards.splice(Math.max(0, Math.min(index, page.artboards.length)), 0, id)
      draft.parentId = null
    }
  })
}

/** Paper design tokens: named colors bound to node fills, propagating on edit. */
export function createTokenFromSelection() {
  const id = state.ui.selection[0]
  const node = id ? state.doc.nodes[id] : null
  const value = node?.fills?.find((f) => f.type === 'solid' && f.isVisible !== false)?.color ?? node?.fill
  if (!node || !value || value === 'transparent') {
    showToast('Select a layer with a fill first')
    return null
  }
  const tokenId = uid('tok_')
  withHistory((doc) => {
    doc.tokens = doc.tokens ?? []
    doc.tokens.push({ id: tokenId, name: `Color ${doc.tokens.length + 1}`, value })
    doc.nodes[node.id].fill = value
    doc.nodes[node.id].fillToken = tokenId
  })
  showToast('Color token created')
  return tokenId
}

/** Paper spacing token: creates a numeric token from the selected frame's gap (or 8px). */
export function createSpacingToken() {
  const id = state.ui.selection[0]
  const gap = id ? state.doc.nodes[id]?.layout?.gap : undefined
  const tokenId = uid('tok_')
  withHistory((doc) => {
    doc.tokens = doc.tokens ?? []
    doc.tokens.push({ id: tokenId, name: `Spacing ${doc.tokens.length + 1}`, value: String(gap ?? 8), type: 'spacing' })
    const node = id ? doc.nodes[id] : undefined
    if (node?.layout) node.layout.gapToken = tokenId
  })
  showToast('Spacing token created')
  return tokenId
}

/** Token field bindings: token type → node field + binding field (Paper token references). */
const TOKEN_BINDINGS: Record<string, { field: keyof DocNode; tokenField: keyof DocNode; numeric?: boolean; textOnly?: boolean }> = {
  radius: { field: 'radius', tokenField: 'radiusToken', numeric: true },
  opacity: { field: 'opacity', tokenField: 'opacityToken', numeric: true },
  fontSize: { field: 'fontSize', tokenField: 'fontSizeToken', numeric: true, textOnly: true },
  fontWeight: { field: 'fontWeight', tokenField: 'fontWeightToken', numeric: true, textOnly: true },
  lineHeight: { field: 'lineHeight', tokenField: 'lineHeightToken', numeric: true, textOnly: true },
  letterSpacing: { field: 'letterSpacing', tokenField: 'letterSpacingToken', numeric: true, textOnly: true },
  fontFamily: { field: 'fontFamily', tokenField: 'fontFamilyToken', textOnly: true },
}

/** Binds a token to the current selection — color → fill, spacing → flex gap, others → their field. */
export function applyTokenToSelection(tokenId: string) {
  const token = state.doc.tokens?.find((t) => t.id === tokenId)
  if (!token) {
    showToast('Token not found')
    return
  }
  const type: NonNullable<DesignToken['type']> = token.type ?? 'color'
  if (type === 'spacing') {
    const ids = state.ui.selection.filter((id) => state.doc.nodes[id]?.layout)
    if (ids.length === 0) {
      showToast('Select a flex container to apply a spacing token')
      return
    }
    const value = Number.parseFloat(token.value) || 0
    updateNodes(ids, (node) => ({ layout: { ...node.layout!, gap: value, gapToken: tokenId } }), true)
    showToast(`Applied "${token.name}"`)
    return
  }
  const binding = TOKEN_BINDINGS[type as string] as { field: keyof DocNode; tokenField: keyof DocNode; numeric?: boolean; textOnly?: boolean } | undefined
  if (binding) {
    const ids = state.ui.selection.filter((id) => {
      const n = state.doc.nodes[id]
      return n && (!binding.textOnly || n.kind === 'text')
    })
    if (ids.length === 0) {
      showToast(binding.textOnly ? 'Select a text layer' : 'Select a layer')
      return
    }
    const value = binding.numeric ? Number.parseFloat(token.value) || 0 : token.value
    updateNodes(ids, () => ({ [binding.field]: value, [binding.tokenField]: tokenId } as Partial<DocNode>), true)
    showToast(`Applied "${token.name}"`)
    return
  }
  if ((type as string) === 'breakpoint' || (type as string) === 'container') {
    showToast('Breakpoint and container tokens are organizational only')
    return
  }
  const ids = state.ui.selection.filter((id) => state.doc.nodes[id]?.kind !== 'text')
  if (ids.length === 0) return
  updateNodes(ids, () => ({ fill: token.value, fillToken: tokenId }), true)
  showToast(`Applied "${token.name}"`)
}

/** Creates a token of any Paper token type from the inspector/panel. */
export function createToken(type: NonNullable<DesignToken['type']>, value: string, name?: string) {
  const id = uid('tok_')
  withHistory((doc) => {
    doc.tokens = doc.tokens ?? []
    doc.tokens.push({ id, name: name?.trim() || `${type} ${doc.tokens.length + 1}`, value, type })
  })
  showToast(`${type[0].toUpperCase() + type.slice(1)} token created`)
  return id
}

export function updateToken(tokenId: string, patch: { name?: string; value?: string }) {
  const token = state.doc.tokens?.find((t) => t.id === tokenId)
  if (!token) return
  withHistory((doc) => {
    const t = doc.tokens?.find((item) => item.id === tokenId)
    if (!t) return
    if (patch.name?.trim()) t.name = patch.name.trim()
    if (patch.value) {
      t.value = patch.value
      // Propagate to every bound node.
      for (const node of Object.values(doc.nodes)) {
        if (node.fillToken === tokenId) node.fill = patch.value
        if (node.layout?.gapToken === tokenId) node.layout.gap = Number.parseFloat(patch.value) || 0
        for (const binding of Object.values(TOKEN_BINDINGS)) {
          if ((node as unknown as Record<string, unknown>)[binding.tokenField as string] === tokenId) {
            ;(node as unknown as Record<string, unknown>)[binding.field as string] = binding.numeric
              ? Number.parseFloat(patch.value) || 0
              : patch.value
          }
        }
      }
    }
  })
}

export function deleteToken(tokenId: string) {
  withHistory((doc) => {
    doc.tokens = (doc.tokens ?? []).filter((t) => t.id !== tokenId)
    for (const node of Object.values(doc.nodes)) {
      if (node.fillToken === tokenId) delete node.fillToken
      if (node.layout?.gapToken === tokenId) delete node.layout.gapToken
      for (const binding of Object.values(TOKEN_BINDINGS)) {
        if ((node as unknown as Record<string, unknown>)[binding.tokenField as string] === tokenId) {
          delete (node as unknown as Record<string, unknown>)[binding.tokenField as string]
        }
      }
    }
  })
}

export function deletePage(id: string) {
  const index = state.doc.pages.findIndex((page) => page.id === id)
  if (index < 0 || state.doc.pages.length <= 1) return
  const page = state.doc.pages[index]
  const wasCurrent = state.ui.pageId === id
  withHistory((doc) => {
    for (const artboardId of page.artboards) removeRecursive(doc, artboardId)
    doc.pages = doc.pages.filter((item) => item.id !== id)
  })
  pageCameras.delete(id)
  if (wasCurrent) {
    const next = state.doc.pages[Math.min(index, state.doc.pages.length - 1)]
    if (next) switchPage(next.id)
  }
}

export function select(ids: string[]) {
  const next = ids.filter((id) => state.doc.nodes[id])
  if (next.join() === state.ui.selection.join()) return
  const pathEdit = state.ui.pathEdit && !next.includes(state.ui.pathEdit.nodeId) ? null : state.ui.pathEdit
  setState({ ...state, ui: { ...state.ui, selection: next, editingId: null, pathEdit } })
}

export function toggleSelect(id: string) {
  const has = state.ui.selection.includes(id)
  select(has ? state.ui.selection.filter((s) => s !== id) : [...state.ui.selection, id])
}

export function clearSelection() {
  select([])
}

export function setEditing(id: string | null) {
  if (state.ui.editingId === id) return
  setState({ ...state, ui: { ...state.ui, editingId: id } })
}

export function startRenamingNode(id: string) {
  if (!state.doc.nodes[id]) return
  setUI({ renamingNodeId: id, renamingPageId: null, panelTab: 'design' })
}

export function setRenamingNode(id: string | null) {
  if (state.ui.renamingNodeId === id) return
  setUI({ renamingNodeId: id })
}

export function startRenamingPage(id: string) {
  if (!state.doc.pages.some((page) => page.id === id)) return
  setUI({ renamingPageId: id, renamingNodeId: null, panelTab: 'design' })
}

export function setRenamingPage(id: string | null) {
  if (state.ui.renamingPageId === id) return
  setUI({ renamingPageId: id })
}

export function setTool(tool: Tool) {
  if (state.ui.tool === tool) return
  const pen = tool === 'pen' ? state.ui.pen : null
  setState({ ...state, ui: { ...state.ui, tool, pen, pathEdit: null } })
}

export function setPen(pen: PenDraft | null) {
  setState({ ...state, ui: { ...state.ui, pen } })
}

export function setPathEdit(pathEdit: PathEdit | null) {
  setState({ ...state, ui: { ...state.ui, pathEdit } })
}

/** Commits the in-progress pen draft as a vector node (or discards it). */
export function finishPen(commit: boolean) {
  const draft = state.ui.pen
  setPen(null)
  if (!draft || draft.points.length < 2) return null
  if (!commit) return null
  const xs = draft.points.flatMap((p) => [p.x, p.handleIn?.x ?? p.x, p.handleOut?.x ?? p.x])
  const ys = draft.points.flatMap((p) => [p.y, p.handleIn?.y ?? p.y, p.handleOut?.y ?? p.y])
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const width = Math.max(1, Math.round(Math.max(...xs) - minX))
  const height = Math.max(1, Math.round(Math.max(...ys) - minY))
  const parentId = draft.parentId
  const parentRect = parentId ? documentRect(state.doc, parentId) : null
  const points = draft.points.map((p) => ({
    x: Math.round((p.x - minX) * 10) / 10,
    y: Math.round((p.y - minY) * 10) / 10,
    ...(p.handleIn ? { handleIn: { x: Math.round((p.handleIn.x - minX) * 10) / 10, y: Math.round((p.handleIn.y - minY) * 10) / 10 } } : {}),
    ...(p.handleOut ? { handleOut: { x: Math.round((p.handleOut.x - minX) * 10) / 10, y: Math.round((p.handleOut.y - minY) * 10) / 10 } } : {}),
  }))
  const id = uid('vec_')
  withHistory((doc) => {
    doc.nodes[id] = {
      id,
      kind: 'vector',
      name: 'Vector',
      parentId,
      children: [],
      x: Math.round(minX - (parentRect?.x ?? 0)),
      y: Math.round(minY - (parentRect?.y ?? 0)),
      width,
      height,
      visible: true,
      clip: false,
      fill: '#888888',
      closed: draft.closed,
      points,
    }
    if (parentId) doc.nodes[parentId]?.children.push(id)
    else doc.pages.find((page) => page.id === state.ui.pageId)?.artboards.push(id)
  })
  select([id])
  return id
}

export function setMarquee(marquee: Rect | null) {
  if (!marquee && !state.ui.marquee) return
  setState({ ...state, ui: { ...state.ui, marquee } })
}

/* ------------------------------------------------------------------ */
/* document mutation + history                                         */
/* ------------------------------------------------------------------ */

const undoStack: Doc[] = []
const redoStack: Doc[] = []
let transactionStart: Doc | null = null

function cloneDoc(doc: Doc): Doc {
  return structuredClone(doc)
}

function pushUndo(snapshot: Doc) {
  undoStack.push(snapshot)
  if (undoStack.length > 100) undoStack.shift()
  redoStack.length = 0
}

export function beginTransaction() {
  transactionStart = state.doc
}

export function endTransaction(changed: boolean) {
  if (changed && transactionStart && transactionStart !== state.doc) pushUndo(transactionStart)
  transactionStart = null
}

export function mutateDoc(fn: (doc: Doc) => void) {
  const next = cloneDoc(state.doc)
  fn(next)
  setState({ ...state, doc: next })
}

export function withHistory(fn: (doc: Doc) => void) {
  pushUndo(state.doc)
  mutateDoc(fn)
}

export function undo() {
  const previous = undoStack.pop()
  if (!previous) return
  redoStack.push(state.doc)
  const pageId = previous.pages.some((p) => p.id === state.ui.pageId) ? state.ui.pageId : previous.pages[0]?.id ?? ''
  setState({
    ...state,
    doc: previous,
    ui: { ...state.ui, pageId, selection: state.ui.selection.filter((id) => previous.nodes[id]) },
  })
}

export function redo() {
  const next = redoStack.pop()
  if (!next) return
  undoStack.push(state.doc)
  const pageId = next.pages.some((p) => p.id === state.ui.pageId) ? state.ui.pageId : next.pages[0]?.id ?? ''
  setState({
    ...state,
    doc: next,
    ui: { ...state.ui, pageId, selection: state.ui.selection.filter((id) => next.nodes[id]) },
  })
}

export function canUndo() {
  return undoStack.length > 0
}

export function canRedo() {
  return redoStack.length > 0
}

export function updateNode(id: string, patch: Partial<DocNode>, record = true) {
  const fn = (doc: Doc) => {
    const node = doc.nodes[id]
    if (!node) return
    Object.assign(node, patch)
  }
  if (record) withHistory(fn)
  else mutateDoc(fn)
}

export function updateNodes(ids: string[], patcher: (node: DocNode, index: number) => Partial<DocNode>, record = false) {
  const fn = (doc: Doc) => {
    ids.forEach((id, index) => {
      const node = doc.nodes[id]
      if (node) Object.assign(node, patcher(node, index))
    })
  }
  if (record) withHistory(fn)
  else mutateDoc(fn)
}

/** Removes the selected path anchor; deletes the node when fewer than 2 points remain. */
export function deletePathPoint() {
  const edit = state.ui.pathEdit
  const node = edit ? state.doc.nodes[edit.nodeId] : null
  if (!edit || !node?.points || edit.pointIndex === null) return false
  if (node.points.length <= 2) {
    select([])
    withHistory((doc) => removeRecursive(doc, node.id))
    setPathEdit(null)
    return true
  }
  const index = edit.pointIndex
  updateNode(node.id, { points: node.points.filter((_, i) => i !== index) })
  setPathEdit({ nodeId: node.id, pointIndex: null })
  return true
}

const lerpPoint = (a: { x: number; y: number }, b: { x: number; y: number }, t: number) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
})

/** Inserts an anchor on segment `index` (between points[index] and the next) at parameter t. */
export function insertPathPoint(nodeId: string, index: number, t: number) {
  const node = state.doc.nodes[nodeId]
  const points = node?.points
  if (!node || !points) return
  const wraps = index + 1 === points.length
  const a = points[index]
  const b = points[(index + 1) % points.length]
  const round = (v: number) => Math.round(v * 100) / 100
  const rp = (p: { x: number; y: number }) => ({ x: round(p.x), y: round(p.y) })
  const curved = !!a.handleOut || !!b.handleIn
  const insert = [...points]
  let pointIndex: number
  if (!curved) {
    pointIndex = index + 1
    insert.splice(index + 1, 0, rp(lerpPoint(a, b, t)))
  } else {
    // de Casteljau split of the cubic segment at t
    const c1 = a.handleOut ?? a
    const c2 = b.handleIn ?? b
    const p1 = lerpPoint(a, c1, t)
    const p2 = lerpPoint(c1, c2, t)
    const p3 = lerpPoint(c2, b, t)
    const p12 = lerpPoint(p1, p2, t)
    const p23 = lerpPoint(p2, p3, t)
    const m = lerpPoint(p12, p23, t)
    if (wraps) {
      pointIndex = insert.length
      insert[index] = { ...a, handleOut: rp(p1) }
      insert.push({ ...rp(m), handleIn: rp(p12), handleOut: rp(p23) })
      insert[0] = { ...b, handleIn: rp(p3) }
    } else {
      pointIndex = index + 1
      insert.splice(index, 2,
        { ...a, handleOut: rp(p1) },
        { ...rp(m), handleIn: rp(p12), handleOut: rp(p23) },
        { ...b, handleIn: rp(p3) },
      )
    }
  }
  updateNode(nodeId, { points: insert })
  setPathEdit({ nodeId, pointIndex })
}

/** Scales the selection about an anchor point (Paper multi-select W/H edits). */
export function scaleSelection(sx: number, sy: number, ax: number, ay: number) {
  const ids = state.ui.selection
  if (ids.length === 0 || !Number.isFinite(sx) || !Number.isFinite(sy) || sx <= 0 || sy <= 0) return
  withHistory((doc) => {
    for (const id of ids) {
      const node = doc.nodes[id]
      if (!node) continue
      node.x = ax + (node.x - ax) * sx
      node.y = ay + (node.y - ay) * sy
      node.width = Math.max(1, node.width * sx)
      node.height = Math.max(1, node.height * sy)
      if (node.fontSize && sx === sy) node.fontSize = Math.max(1, node.fontSize * sx)
      if (node.points) {
        for (const p of node.points) {
          p.x *= sx
          p.y *= sy
          if (p.handleIn) { p.handleIn.x *= sx; p.handleIn.y *= sy }
          if (p.handleOut) { p.handleOut.x *= sx; p.handleOut.y *= sy }
        }
      }
    }
  })
}

export function moveNodes(ids: string[], dx: number, dy: number, record = false) {
  const snap = state.ui.pixelSnap
  const fn = (doc: Doc) => {
    for (const id of ids) {
      const node = doc.nodes[id]
      if (!node || nodeIsLocked(doc, id)) continue
      const nx = node.x + dx
      const ny = node.y + dy
      node.x = snap ? Math.round(nx) : nx
      node.y = snap ? Math.round(ny) : ny
    }
  }
  if (record) withHistory(fn)
  else mutateDoc(fn)
}

/** Applies a mesh-style shader preset to the selected nodes (Paper `s` menu). */
export function applyShaderPreset(index: number) {
  const preset = SHADER_PRESETS[index]
  const ids = state.ui.selection.filter((id) => !nodeIsLocked(state.doc, id) && state.doc.nodes[id])
  if (!preset || ids.length === 0) {
    if (!preset) return
    showToast('Select a layer first')
    return
  }
  withHistory((doc) => {
    for (const id of ids) {
      const node = doc.nodes[id]
      if (!node) continue
      node.fills = [
        ...preset.fills.map((f) => structuredClone(f)),
        ...(preset.base ? [{ type: 'solid' as const, color: preset.base, isVisible: true }] : []),
      ]
      node.fill = undefined
    }
  })
  showToast(`Applied "${preset.name}" shader`)
}

/** Drops a comment pin at a world position on the current page (Paper `c`/`y` tool). */
export function addComment(x: number, y: number, text: string) {
  const id = uid('cmt_')
  mutateDoc((doc) => {
    doc.comments = [
      ...(doc.comments ?? []),
      { id, pageId: state.ui.pageId, x: Math.round(x), y: Math.round(y), text, createdAt: Date.now() },
    ]
  })
  return id
}

export function updateComment(id: string, patch: Partial<DocComment>) {
  mutateDoc((doc) => {
    const c = doc.comments?.find((item) => item.id === id)
    if (c) Object.assign(c, patch)
  })
}

export function replyToComment(id: string, text: string) {
  mutateDoc((doc) => {
    const c = doc.comments?.find((item) => item.id === id)
    if (c) c.replies = [...(c.replies ?? []), { text, createdAt: Date.now() }]
  })
}

export function focusComment(x: number, y: number) {
  // center the pin in the viewport at a readable zoom
  const scale = Math.max(state.camera.scale, 1)
  setCamera({ x: -x * scale + window.innerWidth / 2, y: -y * scale + window.innerHeight / 2, scale })
}

export function deleteComment(id: string) {
  mutateDoc((doc) => {
    doc.comments = (doc.comments ?? []).filter((item) => item.id !== id)
  })
}

/** Toggles pixel-perfect rounding for move/resize (Paper: ⌘⇧'). */
export function togglePixelSnap() {
  setUI({ pixelSnap: !state.ui.pixelSnap })
  showToast(state.ui.pixelSnap ? 'Pixel snapping off' : 'Pixel snapping on')
}

/** Sets measure mode while ⌥ is held (Paper: Alt → measure distances). */
export function setMeasure(on: boolean) {
  if (state.ui.measure !== on) setUI({ measure: on })
}

export function collapseAllLayers() {
  setUI({ layersEpoch: state.ui.layersEpoch + 1 })
}

/** Paper `i`/⌃C: pick a screen color and apply it as the primary fill of the selection. */
export async function eyeDropPick() {
  const ids = state.ui.selection.filter((id) => !nodeIsLocked(state.doc, id) && state.doc.nodes[id])
  if (ids.length === 0) {
    showToast('Select a layer first')
    return
  }
  const EyeDropperCtor = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper
  if (!EyeDropperCtor) {
    showToast('Eyedropper not supported in this browser')
    return
  }
  try {
    const { sRGBHex } = await new EyeDropperCtor().open()
    withHistory((doc) => {
      for (const id of ids) {
        const node = doc.nodes[id]
        if (!node) continue
        const idx = node.fills?.findIndex((f) => f.isVisible && f.type === 'solid') ?? -1
        if (node.fills && idx >= 0) node.fills[idx].color = sRGBHex
        else if (node.fills && node.fills.length > 0) node.fills[0].color = sRGBHex
        else node.fill = sRGBHex
      }
    })
    showToast(`Picked ${sRGBHex}`)
  } catch {
    /* user cancelled */
  }
}

/** Paper ⇧X: swaps the primary fill paint with the stroke paint on each selected node. */
export function swapFillAndStroke() {
  const ids = state.ui.selection.filter((id) => !nodeIsLocked(state.doc, id) && state.doc.nodes[id])
  if (ids.length === 0) return
  withHistory((doc) => {
    for (const id of ids) {
      const node = doc.nodes[id]
      if (!node) continue
      const strokePaint = node.stroke
      if (node.fills && node.fills.length > 0) {
        const idx = node.fills.findIndex((f) => f.isVisible && f.type === 'solid')
        const top = node.fills[idx >= 0 ? idx : 0]
        const paint = top?.type === 'solid' ? top.color : undefined
        if (top && top.type === 'solid') top.color = strokePaint ?? '#000000'
        node.stroke = paint
      } else {
        const original = node.fill
        node.fill = strokePaint
        node.stroke = original
      }
      if (node.stroke !== undefined && (node.strokeWidth ?? 0) === 0) node.strokeWidth = 1
    }
  })
}

/** Digit keys set selection opacity (Paper: 0–9 → 100%–90%). */
export function setSelectionOpacity(value: number) {
  const ids = state.ui.selection.filter((id) => !nodeIsLocked(state.doc, id) && state.doc.nodes[id])
  if (ids.length === 0) return
  withHistory((doc) => {
    for (const id of ids) {
      const node = doc.nodes[id]
      if (node) node.opacity = value
    }
  })
}

/** Paper ⌥⇧⌘R: flex container hugs content on both axes; otherwise wraps to children bounds. */
export function resizeToFit() {
  const ids = state.ui.selection.filter((id) => state.doc.nodes[id])
  if (ids.length === 0) return
  withHistory((doc) => {
    for (const id of ids) {
      const node = doc.nodes[id]
      if (!node) continue
      if (node.layout) {
        node.layout = { ...node.layout, hugW: true, hugH: true }
        continue
      }
      if (node.children.length === 0) continue
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const childId of node.children) {
        const child = doc.nodes[childId]
        if (!child || !child.visible) continue
        minX = Math.min(minX, child.x)
        minY = Math.min(minY, child.y)
        maxX = Math.max(maxX, child.x + child.width)
        maxY = Math.max(maxY, child.y + child.height)
      }
      if (!isFinite(minX)) continue
      node.width = Math.max(1, maxX - minX)
      node.height = Math.max(1, maxY - minY)
      for (const childId of node.children) {
        const child = doc.nodes[childId]
        if (!child) continue
        child.x -= minX
        child.y -= minY
      }
      node.x += minX
      node.y += minY
    }
  })
}

/** Paper ⌥⇧⌘F: a flex child fills its container on both axes. */
export function resizeToFill() {
  const ids = state.ui.selection.filter((id) => {
    const node = state.doc.nodes[id]
    return node?.parentId && state.doc.nodes[node.parentId]?.layout
  })
  if (ids.length === 0) return
  withHistory((doc) => {
    for (const id of ids) {
      const node = doc.nodes[id]
      if (node) node.sizing = { w: 'fill', h: 'fill' }
    }
  })
}

export function nodeIsLocked(doc: Doc, id: string) {
  let node: DocNode | undefined = doc.nodes[id]
  while (node) {
    if (node.locked) return true
    node = node.parentId ? doc.nodes[node.parentId] : undefined
  }
  return false
}

export function nudgeSelection(dx: number, dy: number) {
  const ids = topLevelOnly(state.doc, state.ui.selection).filter((id) => !nodeIsLocked(state.doc, id))
  if (ids.length > 0) moveNodes(ids, dx, dy, true)
}

export type AlignEdge = 'left' | 'right' | 'top' | 'bottom' | 'h-center' | 'v-center'

/** Aligns each selected node to the union bounds of the selection (Paper: ⌥A/D/W/S, ⌥H/V). */
export function alignSelection(edge: AlignEdge) {
  const ids = state.ui.selection.filter((id) => !nodeIsLocked(state.doc, id) && state.doc.nodes[id])
  if (ids.length < 2) return
  const nodes = ids.map((id) => state.doc.nodes[id])
  const minX = Math.min(...nodes.map((n) => n.x))
  const maxX = Math.max(...nodes.map((n) => n.x + n.width))
  const minY = Math.min(...nodes.map((n) => n.y))
  const maxY = Math.max(...nodes.map((n) => n.y + n.height))
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  withHistory((doc) => {
    for (const id of ids) {
      const n = doc.nodes[id]
      if (!n) continue
      if (edge === 'left') n.x = minX
      else if (edge === 'right') n.x = maxX - n.width
      else if (edge === 'top') n.y = minY
      else if (edge === 'bottom') n.y = maxY - n.height
      else if (edge === 'h-center') n.x = cx - n.width / 2
      else n.y = cy - n.height / 2
    }
  })
}

/** Spaces ≥3 selected nodes evenly between the outermost edges (Paper: ⌥⇧H/V). */
export function distributeSelection(axis: 'x' | 'y') {
  const ids = state.ui.selection.filter((id) => !nodeIsLocked(state.doc, id) && state.doc.nodes[id])
  if (ids.length < 3) return
  const sorted = ids
    .map((id) => state.doc.nodes[id])
    .sort((a, b) => (axis === 'x' ? a.x - b.x : a.y - b.y))
  const sizeOf = (n: (typeof sorted)[number]) => (axis === 'x' ? n.width : n.height)
  const span = (axis === 'x' ? sorted.at(-1)!.x + sorted.at(-1)!.width - sorted[0].x : sorted.at(-1)!.y + sorted.at(-1)!.height - sorted[0].y)
  const total = sorted.reduce((s, n) => s + sizeOf(n), 0)
  const gap = (span - total) / (sorted.length - 1)
  withHistory((doc) => {
    let cursor = axis === 'x' ? sorted[0].x : sorted[0].y
    for (const item of sorted) {
      const n = doc.nodes[item.id]
      if (!n) continue
      if (axis === 'x') {
        n.x = cursor
        cursor += n.width + gap
      } else {
        n.y = cursor
        cursor += n.height + gap
      }
    }
  })
}

function removeRecursive(doc: Doc, id: string) {
  const node = doc.nodes[id]
  if (!node) return
  for (const childId of [...node.children]) removeRecursive(doc, childId)
  if (node.parentId) {
    const parent = doc.nodes[node.parentId]
    if (parent) parent.children = parent.children.filter((childId) => childId !== id)
  } else {
    for (const page of doc.pages) page.artboards = page.artboards.filter((artboardId) => artboardId !== id)
  }
  delete doc.nodes[id]
}

export function deleteSelection() {
  const ids = topLevelOnly(state.doc, state.ui.selection).filter((id) => !nodeIsLocked(state.doc, id))
  if (ids.length === 0) return
  withHistory((doc) => {
    for (const id of ids) removeRecursive(doc, id)
  })
  select([])
}

export function duplicateSelection(offset?: { x: number; y: number }, record = true) {
  const ids = topLevelOnly(state.doc, state.ui.selection).filter((id) => !nodeIsLocked(state.doc, id))
  if (ids.length === 0) return [] as string[]
  const pageId = state.ui.pageId
  const created: string[] = []
  const fn = (doc: Doc) => {
    const copy = (id: string, parentId: string | null, dx: number, dy: number): string => {
      const source = doc.nodes[id]
      if (!source) return ''
      const newId = uid(source.kind.slice(0, 3) + '_')
      const next: DocNode = {
        ...structuredClone(source),
        id: newId,
        parentId,
        children: [],
        x: source.x + dx,
        y: source.y + dy,
        name: source.name,
      }
      doc.nodes[newId] = next
      if (parentId) doc.nodes[parentId].children.push(newId)
      for (const childId of source.children) copy(childId, newId, 0, 0)
      return newId
    }
    for (const id of ids) {
      const source = doc.nodes[id]
      if (!source) continue
      const dx = offset?.x ?? (source.parentId ? 16 : 40)
      const dy = offset?.y ?? (source.parentId ? 16 : 0)
      const newId = copy(id, source.parentId, dx, dy)
      if (!source.parentId && newId) doc.pages.find((page) => page.id === pageId)?.artboards.push(newId)
      if (newId) created.push(newId)
    }
  }
  if (record) withHistory(fn)
  else mutateDoc(fn)
  select(created)
  return created
}

export function selectParent() {
  const id = state.ui.selection[0]
  const parentId = id ? state.doc.nodes[id]?.parentId : null
  if (parentId) select([parentId])
}

/** Paper selectInverse: selects all unselected siblings of the current selection. */
export function selectInverse() {
  const doc = state.doc
  const sel = new Set(state.ui.selection)
  const result: string[] = []
  if (sel.size === 0) {
    for (const id of currentPage()?.artboards ?? []) if (!nodeIsLocked(doc, id)) result.push(id)
    select(result)
    return
  }
  const byParent = new Map<string | null, Set<string>>()
  for (const id of sel) {
    const p = doc.nodes[id]?.parentId ?? null
    if (!byParent.has(p)) byParent.set(p, new Set())
    byParent.get(p)!.add(id)
  }
  for (const [pid, ids] of byParent) {
    const siblings = pid ? doc.nodes[pid]?.children ?? [] : currentPage()?.artboards ?? []
    for (const s of siblings) if (!ids.has(s) && !nodeIsLocked(doc, s)) result.push(s)
  }
  select(result)
}

export function selectChildren() {
  const id = state.ui.selection[0]
  const node = id ? state.doc.nodes[id] : null
  if (node && node.children.length > 0) select([...node.children])
}

export function toggleSelectionVisibility() {
  const ids = state.ui.selection
  const first = ids[0] ? state.doc.nodes[ids[0]] : null
  if (!first) return
  const visible = !first.visible
  updateNodes(ids, () => ({ visible }), true)
}

export function toggleSelectionLock() {
  const ids = state.ui.selection
  const first = ids[0] ? state.doc.nodes[ids[0]] : null
  if (!first) return
  const locked = !first.locked
  updateNodes(ids, () => ({ locked }), true)
}

/** Paper ⇧G `toggleGuides`: show/hide snapping guides during drags. */
export function toggleGuides() {
  setUI({ guidesEnabled: !state.ui.guidesEnabled })
  showToast(state.ui.guidesEnabled ? 'Hide layout guides' : 'Show layout guides')
}

/** Paper ⌥1 `showLayers`: reveal the left panel on the layers tab. */
export function showLayers() {
  setUI({ leftPanelVisible: true, panelTab: 'design' })
}

/** Paper ⇧A `addFlex` / ⌥⇧A `removeFlex`: apply or clear flex layout on containers. */
export function setSelectionFlex(enabled: boolean) {
  const ids = state.ui.selection.filter((id) => {
    const node = state.doc.nodes[id]
    return node && node.kind !== 'text' && node.kind !== 'image' && node.kind !== 'vector'
  })
  if (ids.length === 0) return
  withHistory((doc) => {
    for (const id of ids) {
      const node = doc.nodes[id]
      if (enabled && !node.layout) {
        node.layout = { direction: 'row', gap: 8, padding: 8, mainAlign: 'start', crossAlign: 'start', hugW: true, hugH: true }
      } else if (!enabled) {
        delete node.layout
      }
    }
  })
}

/** Paper ⌥C `clipContent`: toggle content clipping on selected containers. */
export function toggleClipSelection() {
  const ids = state.ui.selection.filter((id) => state.doc.nodes[id] && state.doc.nodes[id].kind !== 'text')
  if (ids.length === 0) return
  const next = !ids.every((id) => state.doc.nodes[id].clip)
  updateNodes(ids, () => ({ clip: next }), true)
  showToast(next ? 'Crop' : 'Cancel crop')
}

/** Paper ⌘⌥L/T/R/J: set text alignment on selected text nodes. */
export function setSelectionTextAlign(align: 'left' | 'center' | 'right' | 'justify') {
  const ids = state.ui.selection.filter((id) => state.doc.nodes[id]?.kind === 'text')
  if (ids.length === 0) return
  updateNodes(ids, () => ({ textAlign: align }), true)
}

export function selectAll() {
  const selected = state.ui.selection[0] ? state.doc.nodes[state.ui.selection[0]] : null
  if (selected?.parentId) {
    const parent = state.doc.nodes[selected.parentId]
    if (parent) {
      select(parent.children.filter((id) => !nodeIsLocked(state.doc, id)))
      return
    }
  }
  select(pageArtboards(state.doc, state.ui.pageId).filter((id) => !state.doc.nodes[id]?.locked))
}

/** Tab / ⇧Tab (Paper iterateThroughSiblings): cycle to the next/prev sibling. */
export function iterateSiblings(dir: 1 | -1) {
  const current = state.ui.selection[0] ? state.doc.nodes[state.ui.selection[0]] : null
  const siblings = current?.parentId
    ? state.doc.nodes[current.parentId]?.children
    : pageArtboards(state.doc, state.ui.pageId)
  const list = (siblings ?? []).filter((id) => !state.doc.nodes[id]?.locked && state.doc.nodes[id]?.visible !== false)
  if (list.length === 0) return
  const index = current ? list.indexOf(current.id) : -1
  const next = list[(index + dir + list.length) % list.length]
  if (next) select([next])
}

/** Paper ⌘⇧A "Select others": all siblings except the current selection. */
export function selectAllSiblingsExceptSelf() {
  const selected = new Set(state.ui.selection)
  const first = state.ui.selection[0] ? state.doc.nodes[state.ui.selection[0]] : null
  const siblings = first?.parentId
    ? state.doc.nodes[first.parentId]?.children
    : pageArtboards(state.doc, state.ui.pageId)
  select((siblings ?? []).filter((id) => !selected.has(id) && !nodeIsLocked(state.doc, id)))
}

/** Paper ⌘⇧⌥L: unlock every locked node. */
export function unlockAll() {
  mutateDoc((doc) => {
    for (const node of Object.values(doc.nodes)) node.locked = false
  })
  showToast('All layers unlocked')
}

/** Paper `n` / `⇧N`: cycle selection through the page's artboards. */
export function cycleArtboard(dir: 1 | -1) {
  const page = state.doc.pages.find((item) => item.id === state.ui.pageId)
  const artboards = (page?.artboards ?? []).filter((id) => state.doc.nodes[id])
  if (artboards.length === 0) return
  const sel = state.ui.selection[0]
  const top = sel ? topLevelOnly(state.doc, [sel])[0] : null
  const index = top ? artboards.indexOf(top) : -1
  const next = artboards[(index + dir + artboards.length) % artboards.length]
  select([next])
  zoomToSelection()
}

/** PageDown / PageUp (Paper nextPage/previousPage). */
export function cyclePage(dir: 1 | -1) {
  const pages = state.doc.pages
  if (pages.length < 2) return
  const index = pages.findIndex((item) => item.id === state.ui.pageId)
  const next = pages[(index + dir + pages.length) % pages.length]
  switchPage(next.id)
}

/** Paper ⌘B / ⌘I: toggle bold / italic on selected text nodes. */
export function toggleTextStyle(style: 'bold' | 'italic') {
  const ids = state.ui.selection.filter((id) => state.doc.nodes[id]?.kind === 'text' && !nodeIsLocked(state.doc, id))
  if (ids.length === 0) return
  updateNodes(ids, (node) => {
    if (style === 'bold') return { fontWeight: (node.fontWeight ?? 400) >= 600 ? 400 : 700 }
    return { fontStyle: node.fontStyle === 'italic' ? undefined : 'italic' }
  }, true)
}

/** Paper ⌘⇧</⌘⇧>: nudge font size of selected text nodes along a size ladder. */
export function adjustFontSize(dir: 1 | -1) {
  const ids = state.ui.selection.filter((id) => state.doc.nodes[id]?.kind === 'text' && !nodeIsLocked(state.doc, id))
  if (ids.length === 0) return
  updateNodes(ids, (node) => {
    const cur = node.fontSize ?? 16
    const step = cur >= 48 ? 8 : cur >= 24 ? 4 : cur >= 12 ? 2 : 1
    const next = Math.max(1, dir > 0 ? cur + step : cur - (cur - step < 1 ? 1 : step))
    return { fontSize: next }
  }, true)
}

export function toggleComments() {
  setUI({ commentsVisible: !state.ui.commentsVisible })
  showToast(state.ui.commentsVisible ? 'Show comments' : 'Hide comments')
}

export function toggleUI() {
  setUI({ uiVisible: !state.ui.uiVisible })
}

export function toggleLeftPanel() {
  setUI({ leftPanelVisible: !state.ui.leftPanelVisible })
}

/** Paper ⌃⇧?: shortcuts cheat-sheet overlay. */
export function toggleHotkeys() {
  setUI({ hotkeysVisible: !state.ui.hotkeysVisible })
}

/** Paper ⇧': pixel grid at high zoom. */
export function togglePixelGrid() {
  setUI({ pixelGrid: !state.ui.pixelGrid })
  showToast(state.ui.pixelGrid ? 'Hide pixel grid' : 'Show pixel grid')
}

/** Paper ⌥2 (showTheme): light ↔ dark UI theme, persisted. */
export function toggleTheme() {
  const theme = state.ui.theme === 'dark' ? 'light' : 'dark'
  setUI({ theme })
  try {
    localStorage.setItem('openpaper:theme', theme)
  } catch { /* ignore */ }
  showToast(theme === 'dark' ? 'Dark theme' : 'Light theme')
}

/** Paper "Nudge settings…": custom small/big arrow-nudge distances. */
export function setNudgeAmounts(small: number, big: number) {
  const amounts: [number, number] = [Math.max(0.01, small), Math.max(0.01, big)]
  setUI({ nudgeAmounts: amounts })
  try {
    localStorage.setItem('openpaper:nudge', JSON.stringify(amounts))
  } catch { /* ignore */ }
}

export function toggleNudgeSettings() {
  setUI({ nudgeSettingsVisible: !state.ui.nudgeSettingsVisible })
}

/** Paper preferences toggles — persisted to localStorage. */
export function setPref(key: keyof UIState['prefs'], value: boolean) {
  const prefs = { ...state.ui.prefs, [key]: value || undefined }
  setUI({ prefs })
  try {
    localStorage.setItem('openpaper:prefs', JSON.stringify(prefs))
  } catch { /* ignore */ }
}

export function frameSelection(layout?: FlexLayout) {
  const ids = topLevelOnly(state.doc, state.ui.selection).filter((id) => !nodeIsLocked(state.doc, id))
  const parentId = ids[0] ? state.doc.nodes[ids[0]]?.parentId : null
  if (!parentId || ids.some((id) => state.doc.nodes[id]?.parentId !== parentId)) return null
  const bounds = unionRects(ids.map((id) => documentRect(state.doc, id)).filter((rect): rect is Rect => !!rect))
  const parentRect = documentRect(state.doc, parentId)
  if (!bounds || !parentRect) return null
  const id = uid('fra_')
  const sourceRects = new Map(ids.map((nodeId) => [nodeId, documentRect(state.doc, nodeId)]))
  withHistory((doc) => {
    const parent = doc.nodes[parentId]
    if (!parent) return
    const ordered = parent.children.filter((childId) => ids.includes(childId))
    const index = Math.min(...ordered.map((childId) => parent.children.indexOf(childId)))
    parent.children = parent.children.filter((childId) => !ids.includes(childId))
    doc.nodes[id] = {
      id,
      kind: 'frame',
      name: 'Frame',
      parentId,
      children: ordered,
      x: Math.round(bounds.x - parentRect.x),
      y: Math.round(bounds.y - parentRect.y),
      width: Math.max(1, Math.round(bounds.width)),
      height: Math.max(1, Math.round(bounds.height)),
      fill: 'transparent',
      visible: true,
      clip: false,
      ...(layout ? { layout } : {}),
    }
    parent.children.splice(Math.max(0, index), 0, id)
    for (const childId of ordered) {
      const child = doc.nodes[childId]
      const rect = sourceRects.get(childId)
      if (!child || !rect) continue
      child.parentId = id
      child.x = Math.round(rect.x - bounds.x)
      child.y = Math.round(rect.y - bounds.y)
    }
  })
  select([id])
  return id
}

/** Paper "Wrap in flex" — frame selection with a row layout in one transaction. */
export function wrapInFlex() {
  return frameSelection({ direction: 'row', gap: 8, padding: 8, mainAlign: 'start', crossAlign: 'start' })
}

export function ungroupSelection() {
  const ids = topLevelOnly(state.doc, state.ui.selection).filter((id) => {
    const node = state.doc.nodes[id]
    return node?.kind === 'frame' && node.parentId !== null && !nodeIsLocked(state.doc, id)
  })
  if (ids.length === 0) return
  const created: string[] = []
  withHistory((doc) => {
    for (const id of ids) {
      const node = doc.nodes[id]
      const parent = node?.parentId ? doc.nodes[node.parentId] : null
      if (!node || !parent || !node.parentId) continue
      const index = parent.children.indexOf(id)
      parent.children = parent.children.filter((childId) => childId !== id)
      parent.children.splice(Math.max(0, index), 0, ...node.children)
      for (const childId of node.children) {
        const child = doc.nodes[childId]
        if (!child) continue
        child.parentId = node.parentId
        child.x += node.x
        child.y += node.y
        created.push(childId)
      }
      delete doc.nodes[id]
    }
  })
  select(created)
}

export function setPageThumbnail(nodeId: string) {
  const pageId = pageOfNode(state.doc, nodeId)
  if (!pageId || state.doc.nodes[nodeId]?.parentId !== null) return
  withHistory((doc) => {
    const page = doc.pages.find((item) => item.id === pageId)
    if (page) page.thumbnailId = nodeId
  })
  showToast('Set as page thumbnail')
}

interface ClipboardPayload {
  roots: string[]
  nodes: Record<string, DocNode>
  rootRects: Record<string, Rect>
}

const CLIPBOARD_PREFIX = 'paper-canvas:nodes:'
let clipboard: ClipboardPayload | null = null
let copiedStyles: Partial<DocNode> | null = null

function makeClipboardPayload(): ClipboardPayload | null {
  const roots = topLevelOnly(state.doc, state.ui.selection)
  if (roots.length === 0) return null
  const nodes: Record<string, DocNode> = {}
  const rootRects: Record<string, Rect> = {}
  const copy = (id: string) => {
    const node = state.doc.nodes[id]
    if (!node) return
    nodes[id] = structuredClone(node)
    for (const childId of node.children) copy(childId)
  }
  for (const id of roots) {
    copy(id)
    const rect = documentRect(state.doc, id)
    if (rect) rootRects[id] = rect
  }
  return { roots, nodes, rootRects }
}

export function hasClipboard() {
  return clipboard !== null
}

export async function copySelection(cut = false) {
  const payload = makeClipboardPayload()
  if (!payload) return false
  clipboard = payload
  try {
    await navigator.clipboard?.writeText(CLIPBOARD_PREFIX + JSON.stringify(payload))
  } catch {
    // The in-memory clipboard still works when browser permission is unavailable.
  }
  if (cut) deleteSelection()
  showToast(cut ? 'Cut' : 'Copied')
  return true
}

async function readClipboard() {
  if (clipboard) return clipboard
  try {
    const text = await navigator.clipboard?.readText()
    if (!text?.startsWith(CLIPBOARD_PREFIX)) return null
    const parsed = JSON.parse(text.slice(CLIPBOARD_PREFIX.length)) as ClipboardPayload
    if (!Array.isArray(parsed.roots) || !parsed.nodes || !parsed.rootRects) return null
    clipboard = parsed
    return parsed
  } catch {
    return null
  }
}

export type PasteMode = 'paste' | 'over' | 'replace' | 'noImages'

export async function pasteSelection(mode: PasteMode = 'paste') {
  const payload = await readClipboard()
  if (!payload) {
    showToast('Nothing to paste')
    return [] as string[]
  }
  const selectedIds = topLevelOnly(state.doc, state.ui.selection)
  const replacement = mode === 'replace' ? selectedIds[0] : null
  const replacementNode = replacement ? state.doc.nodes[replacement] : null
  const selected = state.ui.selection[0] ? state.doc.nodes[state.ui.selection[0]] : null
  const fallbackParent = selected?.kind === 'frame' && !nodeIsLocked(state.doc, selected.id)
    ? selected.id
    : currentArtboardId()
  const targetParentId = replacementNode?.parentId ?? fallbackParent
  const targetParentRect = targetParentId ? documentRect(state.doc, targetParentId) : null
  const replacementRect = replacement ? documentRect(state.doc, replacement) : null
  const firstSourceRect = payload.rootRects[payload.roots[0]]
  const created: string[] = []
  const idMap = new Map<string, string>()
  for (const id of Object.keys(payload.nodes)) idMap.set(id, uid(payload.nodes[id].kind.slice(0, 3) + '_'))
  withHistory((doc) => {
    if (mode === 'replace') for (const id of selectedIds) removeRecursive(doc, id)
    const clone = (sourceId: string, parentId: string | null, rect: Rect | null): string => {
      const source = payload.nodes[sourceId]
      const id = idMap.get(sourceId)
      if (!source || !id) return ''
      const sourceRect = payload.rootRects[sourceId]
      let x = source.x
      let y = source.y
      if (sourceRect) {
        if (mode === 'over') {
          x = sourceRect.x - (rect?.x ?? 0)
          y = sourceRect.y - (rect?.y ?? 0)
        } else if (mode === 'replace' && replacementRect && firstSourceRect) {
          x = replacementRect.x + sourceRect.x - firstSourceRect.x - (rect?.x ?? 0)
          y = replacementRect.y + sourceRect.y - firstSourceRect.y - (rect?.y ?? 0)
        } else {
          x += parentId ? 16 : 40
          y += parentId ? 16 : 0
        }
      }
      const next: DocNode = {
        ...structuredClone(source),
        id,
        parentId,
        children: [],
        x: Math.round(x),
        y: Math.round(y),
        locked: false,
      }
      if (mode === 'noImages') {
        // Paper "Paste without images": drop image fills and image sources.
        if (next.kind === 'image') return ''
        delete next.imageSrc
        if (next.fills) next.fills = next.fills.filter((f) => f.type !== 'image')
      }
      next.children = source.children.map((childId) => clone(childId, id, null)).filter(Boolean)
      doc.nodes[id] = next
      return id
    }
    for (const sourceId of payload.roots) {
      const source = payload.nodes[sourceId]
      if (!source) continue
      const parentId = source.parentId === null ? null : targetParentId
      if (source.parentId !== null && (!parentId || !doc.nodes[parentId])) continue
      const rect = parentId ? targetParentRect : null
      const id = clone(sourceId, parentId, rect)
      if (!id) continue
      if (parentId) doc.nodes[parentId].children.push(id)
      else doc.pages.find((page) => page.id === state.ui.pageId)?.artboards.push(id)
      created.push(id)
    }
  })
  select(created)
  if (created.length > 0) showToast(mode === 'replace' ? 'Pasted (replaced)' : 'Pasted')
  return created
}

const STYLE_KEYS = [
  'fill',
  'stroke',
  'strokeWidth',
  'radius',
  'opacity',
  'shadow',
  'blendMode',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'textAlign',
  'color',
] as const

export function hasCopiedStyles() {
  return copiedStyles !== null
}

export function copyStyles() {
  const node = state.ui.selection[0] ? state.doc.nodes[state.ui.selection[0]] : null
  if (!node) return false
  copiedStyles = {}
  for (const key of STYLE_KEYS) {
    if (node[key] !== undefined) copiedStyles[key] = structuredClone(node[key]) as never
  }
  showToast('Style copied')
  return true
}

export function pasteStyles() {
  if (!copiedStyles || state.ui.selection.length === 0) return false
  const styles = structuredClone(copiedStyles)
  updateNodes(
    state.ui.selection,
    (node) => {
      const patch: Partial<DocNode> = {}
      for (const key of STYLE_KEYS) {
        if (!(key in styles)) continue
        const textOnly = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textAlign', 'color'].includes(key)
        if (textOnly && node.kind !== 'text') continue
        if (key === 'fill' && node.kind === 'text') continue
        patch[key] = structuredClone(styles[key]) as never
      }
      return patch
    },
    true,
  )
  showToast('Style pasted')
  return true
}

export type TypographyAdjustment = 'fontSize' | 'fontWeight' | 'lineHeight' | 'letterSpacing'

export function adjustTypography(property: TypographyAdjustment, direction: 1 | -1) {
  const ids = state.ui.selection.filter((id) => state.doc.nodes[id]?.kind === 'text' && !nodeIsLocked(state.doc, id))
  if (ids.length === 0) return
  updateNodes(
    ids,
    (node) => {
      if (property === 'fontSize') return { fontSize: Math.max(1, (node.fontSize ?? 14) + direction) }
      if (property === 'fontWeight') return { fontWeight: Math.min(900, Math.max(100, (node.fontWeight ?? 400) + direction * 100)) }
      if (property === 'lineHeight') return { lineHeight: Math.max(0.5, Math.round(((node.lineHeight ?? 1.4) + direction * 0.1) * 10) / 10) }
      return { letterSpacing: Math.round(((node.letterSpacing ?? 0) + direction * 0.5) * 10) / 10 }
    },
    true,
  )
}

function siblingList(doc: Doc, id: string): string[] | null {
  const node = doc.nodes[id]
  if (!node) return null
  if (node.parentId) return doc.nodes[node.parentId]?.children ?? null
  return doc.pages.find((page) => page.artboards.includes(id))?.artboards ?? null
}

export type ArrangeMode = 'front' | 'back' | 'forward' | 'backward'

export function arrangeSelection(mode: ArrangeMode) {
  const ids = new Set(state.ui.selection)
  if (ids.size === 0) return
  withHistory((doc) => {
    const moving = new Set<string>()
    for (const id of ids) {
      const list = siblingList(doc, id)
      if (list) for (const sibling of list) if (ids.has(sibling)) moving.add(sibling)
    }
    const lists = new Set<string[]>()
    for (const id of moving) {
      const list = siblingList(doc, id)
      if (list) lists.add(list)
    }
    for (const list of lists) {
      if (mode === 'front' || mode === 'back') {
        const selected = list.filter((id) => moving.has(id))
        const rest = list.filter((id) => !moving.has(id))
        list.splice(0, list.length, ...(mode === 'front' ? [...rest, ...selected] : [...selected, ...rest]))
      } else if (mode === 'forward') {
        for (let i = list.length - 2; i >= 0; i -= 1) {
          if (moving.has(list[i]) && !moving.has(list[i + 1])) {
            ;[list[i], list[i + 1]] = [list[i + 1], list[i]]
          }
        }
      } else {
        for (let i = 1; i < list.length; i += 1) {
          if (moving.has(list[i]) && !moving.has(list[i - 1])) {
            ;[list[i], list[i - 1]] = [list[i - 1], list[i]]
          }
        }
      }
    }
  })
}

/** Marks the selected node as a component root (Figma-style: works on frames/containers). */
export function createComponent() {
  const id = state.ui.selection.length === 1 ? state.ui.selection[0] : null
  const node = id ? state.doc.nodes[id] : null
  if (!node || (node.kind !== 'frame' && node.parentId !== null && node.children.length === 0)) {
    showToast('Select a container or group first')
    return null
  }
  if (node.component) {
    updateNode(node.id, { component: undefined })
    showToast('Component removed')
    return node.id
  }
  updateNode(node.id, { component: true, name: node.name })
  showToast('Component created')
  return node.id
}

/** Instantiates a component at a world position (or next to its source). */
export function instantiateComponent(compId: string, at?: { x: number; y: number }) {
  const comp = state.doc.nodes[compId]
  if (!comp?.component) return null
  const instanceId = uid('ins_')
  withHistory((doc) => {
    doc.nodes[instanceId] = {
      id: instanceId,
      kind: 'instance',
      name: `${comp.name} copy`,
      parentId: comp.parentId,
      children: [],
      x: at?.x ?? comp.x + comp.width + 24,
      y: at?.y ?? comp.y,
      width: comp.width,
      height: comp.height,
      visible: true,
      clip: false,
      instanceOf: comp.id,
      overrides: {},
    }
    if (comp.parentId) doc.nodes[comp.parentId]?.children.push(instanceId)
    else doc.pages.find((page) => page.id === state.ui.pageId)?.artboards.push(instanceId)
  })
  select([instanceId])
  return instanceId
}

/** Instantiates the selected component next to its source. */
export function createInstance() {
  const id = state.ui.selection.length === 1 ? state.ui.selection[0] : null
  const comp = id ? state.doc.nodes[id] : null
  if (!comp?.component) {
    showToast('Select a component first')
    return null
  }
  const instanceId = instantiateComponent(comp.id)
  if (instanceId) showToast('Instance created')
  return instanceId
}

/** Deep-clones a subtree with fresh ids (used by detach). */
function cloneSubtree(doc: Doc, sourceId: string, parentId: string | null, dx: number, dy: number): string | null {
  const source = doc.nodes[sourceId]
  if (!source) return null
  const id = uid(source.kind.slice(0, 3) + '_')
  const next: DocNode = { ...structuredClone(source), id, parentId, children: [], x: source.x + dx, y: source.y + dy }
  doc.nodes[id] = next
  next.children = source.children.map((c) => cloneSubtree(doc, c, id, 0, 0)).filter((c): c is string => !!c)
  return id
}

/** Replaces an instance with a detached clone of its component. */
export function detachInstance() {
  const id = state.ui.selection.length === 1 ? state.ui.selection[0] : null
  const inst = id ? state.doc.nodes[id] : null
  const comp = inst?.instanceOf ? state.doc.nodes[inst.instanceOf] : null
  if (!inst || !comp) {
    showToast('Select an instance first')
    return null
  }
  let cloneId: string | null = null
  withHistory((doc) => {
    cloneId = cloneSubtree(doc, comp.id, inst.parentId, inst.x - comp.x, inst.y - comp.y)
    if (!cloneId) return
    doc.nodes[cloneId].component = undefined
    doc.nodes[cloneId].name = `${comp.name} copy`
    // Apply stored overrides to the detached clone.
    for (const [nid, ov] of Object.entries(inst.overrides ?? {})) {
      const target = findCloneTarget(doc, cloneId, comp.id, nid)
      if (target) Object.assign(doc.nodes[target] ?? {}, ov)
    }
    const list = inst.parentId ? doc.nodes[inst.parentId]?.children : doc.pages.find((p) => p.id === state.ui.pageId)?.artboards
    const index = list?.indexOf(inst.id) ?? -1
    if (list && index >= 0) list[index] = cloneId
    delete doc.nodes[inst.id]
  })
  if (cloneId) {
    select([cloneId])
    showToast('Instance detached')
  }
  return cloneId
}

/** Maps a component-descendant id to its counterpart inside a clone subtree. */
function findCloneTarget(doc: Doc, cloneRoot: string, compRoot: string, compNodeId: string): string | null {
  if (compNodeId === compRoot) return cloneRoot
  const path: number[] = []
  let cur = doc.nodes[compNodeId]
  while (cur && cur.id !== compRoot) {
    const parent = cur.parentId ? doc.nodes[cur.parentId] : null
    if (!parent) return null
    path.unshift(parent.children.indexOf(cur.id))
    cur = parent
  }
  let node = doc.nodes[cloneRoot]
  for (const i of path) node = node?.children[i] ? doc.nodes[node.children[i]] : (undefined as never)
  return node?.id ?? null
}

export function addArtboard(width = 390, height = 844, name?: string) {
  const id = uid('art_')
  const pageId = state.ui.pageId
  withHistory((doc) => {
    const page = doc.pages.find((p) => p.id === pageId)
    if (!page) return
    const lastId = page.artboards[page.artboards.length - 1]
    const lastRect = lastId ? nodeRect(lastId) : null
    const count = page.artboards.length + 1
    const x = lastRect ? Math.round(lastRect.x + lastRect.width + 80) : 0
    const y = lastRect ? Math.round(lastRect.y) : 0
    doc.nodes[id] = {
      id,
      kind: 'frame',
      name: name ?? `Artboard ${count}`,
      parentId: null,
      children: [],
      x,
      y,
      width,
      height,
      fill: '#FFFFFF',
      clip: true,
      visible: true,
      radius: 0,
    }
    page.artboards.push(id)
  })
  select([id])
  const rect = nodeRect(id)
  if (rect) {
    const { camera, viewport } = state
    const centerX = viewport.left + (viewport.width - viewport.left - viewport.right) / 2
    const centerY = viewport.top + (viewport.height - viewport.top - viewport.bottom) / 2
    const worldCenter = {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
    }
    setCamera({
      scale: camera.scale,
      x: centerX - worldCenter.x * camera.scale,
      y: centerY - worldCenter.y * camera.scale,
    })
  }
}

export function addNode(kind: 'rect' | 'ellipse' | 'text') {
  const target = currentArtboardId()
  if (!target) return
  const id = uid(kind.slice(0, 3) + '_')
  const width = kind === 'text' ? 220 : kind === 'ellipse' ? 96 : 160
  const height = kind === 'text' ? Math.round(20 * 1.4) : 96
  const parentRect = nodeRect(target)
  const { camera, viewport } = state
  const viewCenter = {
    x: viewport.left + (viewport.width - viewport.left - viewport.right) / 2,
    y: viewport.top + (viewport.height - viewport.top - viewport.bottom) / 2,
  }
  const worldCenter = {
    x: (viewCenter.x - camera.x) / camera.scale,
    y: (viewCenter.y - camera.y) / camera.scale,
  }
  withHistory((doc) => {
    const parent = doc.nodes[target]
    if (!parent) return
    let x = parentRect ? worldCenter.x - parentRect.x - width / 2 : 32
    let y = parentRect ? worldCenter.y - parentRect.y - height / 2 : 32
    x = Math.round(Math.min(Math.max(x, 0), Math.max(0, parent.width - width)))
    y = Math.round(Math.min(Math.max(y, 0), Math.max(0, parent.height - height)))
    const base = {
      id,
      kind,
      name: kind === 'text' ? 'Text' : kind === 'ellipse' ? 'Ellipse' : 'Rectangle',
      parentId: target,
      children: [] as string[],
      x,
      y,
      width,
      height,
      visible: true,
      clip: false,
    }
    if (kind === 'text') {
      doc.nodes[id] = {
        ...base,
        heightAuto: true,
        widthAuto: true,
        text: 'Text',
        fontSize: 20,
        fontWeight: 500,
        lineHeight: 1.4,
        color: '#111111',
      }
    } else {
      doc.nodes[id] = {
        ...base,
        fill: kind === 'ellipse' ? '#DDE7F0' : '#EFE6DA',
        radius: kind === 'rect' ? 16 : 0,
      }
    }
    parent.children.push(id)
  })
  select([id])
}

export function createDrawnNode(
  kind: 'frame' | 'rect' | 'ellipse' | 'text',
  rect: Rect,
  parentId: string | null,
  autoWidth = false,
) {
  if (kind !== 'frame' && !parentId) return null
  const id = uid(kind === 'frame' && parentId === null ? 'art_' : kind.slice(0, 3) + '_')
  const parentRect = parentId ? documentRect(state.doc, parentId) : null
  const width = Math.max(1, Math.round(rect.width))
  const height = Math.max(1, Math.round(rect.height))
  const base: DocNode = {
    id,
    kind,
    name: kind === 'frame' ? (parentId ? 'Frame' : `Artboard ${pageArtboards(state.doc, state.ui.pageId).length + 1}`) : kind === 'text' ? 'Text' : kind === 'ellipse' ? 'Ellipse' : 'Rectangle',
    parentId,
    children: [],
    x: Math.round(rect.x - (parentRect?.x ?? 0)),
    y: Math.round(rect.y - (parentRect?.y ?? 0)),
    width,
    height,
    visible: true,
    clip: kind === 'frame' && parentId === null,
  }
  if (kind === 'text') {
    Object.assign(base, {
      heightAuto: true,
      widthAuto: autoWidth,
      height: Math.max(height, 28),
      text: 'Text',
      fontFamily: 'Inter',
      fontSize: 20,
      fontWeight: 400,
      lineHeight: 1.4,
      color: '#111111',
    })
  } else {
    Object.assign(base, {
      fill: kind === 'frame' ? '#FFFFFF' : kind === 'ellipse' ? '#DDE7F0' : '#EFE6DA',
      radius: 0,
    })
  }
  withHistory((doc) => {
    doc.nodes[id] = base
    if (parentId) doc.nodes[parentId]?.children.push(id)
    else doc.pages.find((page) => page.id === state.ui.pageId)?.artboards.push(id)
  })
  select([id])
  setTool('select')
  if (kind === 'text') setEditing(id)
  return id
}

export function addImage(src: string, naturalWidth: number, naturalHeight: number) {
  const parentId = currentArtboardId()
  const parent = parentId ? state.doc.nodes[parentId] : null
  if (!parentId || !parent) {
    showToast('Create an artboard first')
    return null
  }
  const parentRect = documentRect(state.doc, parentId)
  if (!parentRect) return null
  const maxWidth = Math.max(32, Math.min(480, parent.width - 32))
  const maxHeight = Math.max(32, Math.min(480, parent.height - 32))
  const ratio = Math.min(1, maxWidth / Math.max(1, naturalWidth), maxHeight / Math.max(1, naturalHeight))
  const width = Math.max(1, Math.round(naturalWidth * ratio))
  const height = Math.max(1, Math.round(naturalHeight * ratio))
  const center = viewportCenter()
  const worldCenter = {
    x: (center.x - state.camera.x) / state.camera.scale,
    y: (center.y - state.camera.y) / state.camera.scale,
  }
  const id = uid('ima_')
  withHistory((doc) => {
    doc.nodes[id] = {
      id,
      kind: 'image',
      name: 'Image',
      parentId,
      children: [],
      x: Math.round(worldCenter.x - parentRect.x - width / 2),
      y: Math.round(worldCenter.y - parentRect.y - height / 2),
      width,
      height,
      visible: true,
      clip: true,
      imageSrc: src,
      imageFit: 'fill',
    }
    doc.nodes[parentId]?.children.push(id)
  })
  select([id])
  return id
}

function readImageFile(file: File): Promise<{ src: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read'))
    reader.onload = () => {
      const src = String(reader.result)
      const image = new Image()
      image.onerror = () => reject(new Error('decode'))
      image.onload = () => resolve({ src, width: image.naturalWidth, height: image.naturalHeight })
      image.src = src
    }
    reader.readAsDataURL(file)
  })
}

export async function importImageFile(file: File, replaceId?: string) {
  if (!file.type.startsWith('image/')) {
    showToast('Choose an image file')
    return null
  }
  try {
    const { src, width, height } = await readImageFile(file)
    if (replaceId && state.doc.nodes[replaceId]?.kind === 'image') {
      updateNode(replaceId, { imageSrc: src, name: file.name })
      showToast('Image replaced')
      return replaceId
    }
    const id = addImage(src, width, height)
    if (id) showToast('Image inserted')
    return id
  } catch {
    showToast('Could not read this image')
    return null
  }
}

/** Paper "Extract colors": median-cut the image into a palette frame below it. */
export async function extractImageColors(nodeId: string, count = 5) {
  const node = state.doc.nodes[nodeId]
  if (node?.kind !== 'image' || !node.imageSrc) return
  const img = new Image()
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('decode'))
      img.src = node.imageSrc!
    })
  } catch {
    showToast('Could not read this image')
    return
  }
  const size = 48
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')
  if (!g) return
  g.drawImage(img, 0, 0, size, size)
  const data = g.getImageData(0, 0, size, size).data
  const pixels: [number, number, number][] = []
  for (let i = 0; i < data.length; i += 16) {
    if (data[i + 3] > 128) pixels.push([data[i], data[i + 1], data[i + 2]])
  }
  if (pixels.length === 0) return

  // Median-cut quantization.
  type Box = [number, number, number][]
  const boxes: Box[] = [pixels]
  while (boxes.length < count) {
    boxes.sort((a, b) => range(b) - range(a))
    const box = boxes.shift()
    if (!box || box.length < 2) {
      if (box) boxes.push(box)
      break
    }
    const ch = widestChannel(box)
    box.sort((a, b) => a[ch] - b[ch])
    boxes.push(box.slice(0, box.length >> 1), box.slice(box.length >> 1))
  }
  const colors = boxes.map((box) => {
    const n = box.length || 1
    const c = box.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]], [0, 0, 0])
    return `#${((1 << 24) | (Math.round(c[0] / n) << 16) | (Math.round(c[1] / n) << 8) | Math.round(c[2] / n)).toString(16).slice(1)}`
  })
  function range(box: Box) {
    return Math.max(...[0, 1, 2].map((ch) => Math.max(...box.map((p) => p[ch])) - Math.min(...box.map((p) => p[ch]))))
  }
  function widestChannel(box: Box) {
    const ranges = [0, 1, 2].map((ch) => Math.max(...box.map((p) => p[ch])) - Math.min(...box.map((p) => p[ch])))
    return ranges.indexOf(Math.max(...ranges))
  }

  const sw = 64
  const frameId = uid('frm_')
  withHistory((doc) => {
    const parentId = node.parentId
    doc.nodes[frameId] = {
      id: frameId,
      kind: 'frame',
      name: 'Palette',
      parentId,
      children: [],
      x: node.x,
      y: node.y + node.height + 16,
      width: sw * colors.length,
      height: sw,
      visible: true,
      clip: true,
      radius: 8,
      fills: [{ type: 'solid', color: '#000000', isVisible: true }],
    }
    colors.forEach((color, i) => {
      const rid = uid('rct_')
      doc.nodes[rid] = {
        id: rid,
        kind: 'rect',
        name: color,
        parentId: frameId,
        children: [],
        x: i * sw,
        y: 0,
        width: sw,
        height: sw,
        visible: true,
        clip: false,
        fills: [{ type: 'solid', color, isVisible: true }],
      }
      doc.nodes[frameId].children.push(rid)
    })
    const parent = parentId ? doc.nodes[parentId] : null
    if (parent) {
      const at = parent.children.indexOf(nodeId)
      parent.children.splice(at + 1, 0, frameId)
    } else {
      const page = doc.pages.find((p) => p.id === state.ui.pageId)
      const at = page?.artboards.indexOf(nodeId) ?? -1
      if (page && at >= 0) page.artboards.splice(at + 1, 0, frameId)
    }
  })
  select([frameId])
  showToast(`Extracted ${colors.length} colors`)
}

/** Paper file-drop: places an image at the drop point, parenting into the artboard under it. */
export async function importImageFileAt(file: File, world: { x: number; y: number }) {
  if (!file.type.startsWith('image/')) {
    showToast('Choose an image file')
    return null
  }
  try {
    const { src, width: nw, height: nh } = await readImageFile(file)
    const artboards = pageArtboards(state.doc, state.ui.pageId)
    let parentId: string | null = null
    let parentRect: Rect | null = null
    for (const artId of artboards) {
      const r = documentRect(state.doc, artId)
      if (r && world.x >= r.x && world.x <= r.x + r.width && world.y >= r.y && world.y <= r.y + r.height) {
        parentId = artId
        parentRect = r
      }
    }
    if (!parentId) parentId = currentArtboardId()
    if (!parentId || !(parentRect = parentRect ?? documentRect(state.doc, parentId))) {
      showToast('Create an artboard first')
      return null
    }
    const parent = state.doc.nodes[parentId]
    const maxW = Math.max(32, Math.min(480, (parent?.width ?? 480) - 32))
    const maxH = Math.max(32, Math.min(480, (parent?.height ?? 480) - 32))
    const ratio = Math.min(1, maxW / Math.max(1, nw), maxH / Math.max(1, nh))
    const width = Math.max(1, Math.round(nw * ratio))
    const height = Math.max(1, Math.round(nh * ratio))
    const id = uid('ima_')
    const pid = parentId
    withHistory((doc) => {
      doc.nodes[id] = {
        id,
        kind: 'image',
        name: file.name.replace(/\.[a-z0-9]+$/i, '') || 'Image',
        parentId: pid,
        children: [],
        x: Math.round(world.x - parentRect.x - width / 2),
        y: Math.round(world.y - parentRect.y - height / 2),
        width,
        height,
        visible: true,
        clip: true,
        imageSrc: src,
        imageFit: 'fill',
      }
      doc.nodes[pid]?.children.push(id)
    })
    select([id])
    showToast('Image inserted')
    return id
  } catch {
    showToast('Could not read this image')
    return null
  }
}

/** Paper "Create SVG": local equivalent — insert SVG markup from the clipboard as a vector image node. */
export async function insertSvgFromClipboard() {
  try {
    const text = await navigator.clipboard.readText()
    const match = text.trim().match(/<svg[\s\S]*<\/svg>/i)
    if (!match) {
      showToast('Copy SVG markup first, then choose Create SVG')
      return null
    }
    const svg = match[0]
    const w = Number(svg.match(/width="?([\d.]+)/i)?.[1]) || Number(svg.match(/viewBox="[\d.\s-]+([\d.]+)\s+[\d.]+"/i)?.[1]) || 240
    const h = Number(svg.match(/height="?([\d.]+)/i)?.[1]) || Number(svg.match(/viewBox="[\d.\s-]+[\d.]+\s+([\d.]+)"/i)?.[1]) || 240
    const src = `data:image/svg+xml,${encodeURIComponent(svg)}`
    const id = addImage(src, w, h)
    if (id) {
      showToast('SVG inserted')
      updateNode(id, { name: 'SVG' })
    }
    return id
  } catch {
    showToast('Clipboard blocked — paste SVG onto the canvas instead')
    return null
  }
}

export function chooseImage(replaceId?: string) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.style.display = 'none'
  document.body.appendChild(input)
  input.onchange = () => {
    const file = input.files?.[0]
    if (file) void importImageFile(file, replaceId)
    input.remove()
  }
  input.click()
}

export function currentArtboardId(): string | null {
  const fromSelection = state.ui.selection[0]
  if (fromSelection) {
    let node = state.doc.nodes[fromSelection]
    while (node?.parentId) node = state.doc.nodes[node.parentId]
    if (node) return node.id
  }
  const ids = pageArtboards(state.doc, state.ui.pageId)
  return ids[ids.length - 1] ?? null
}

export function renameNode(id: string, name: string) {
  const trimmed = name.trim()
  if (!trimmed) return
  updateNode(id, { name: trimmed })
}

/* ------------------------------------------------------------------ */
/* geometry helpers                                                    */
/* ------------------------------------------------------------------ */

export function documentRect(doc: Doc, id: string): Rect | null {
  const node = doc.nodes[id]
  if (!node) return null
  let x = node.x
  let y = node.y
  let parentId = node.parentId
  while (parentId) {
    const parent = doc.nodes[parentId]
    if (!parent) break
    x += parent.x
    y += parent.y
    parentId = parent.parentId
  }
  return { x, y, width: node.width, height: node.height }
}

export function nodeRect(id: string): Rect | null {
  const measured = measureMap.get(id)
  if (measured) return measured
  const node = state.doc.nodes[id]
  if (!node) return null
  let x = node.x
  let y = node.y
  let parentId = node.parentId
  while (parentId) {
    const parent = state.doc.nodes[parentId]
    if (!parent) break
    x += parent.x
    y += parent.y
    parentId = parent.parentId
  }
  return { x, y, width: node.width, height: node.height }
}

export function selectionBounds(ids = state.ui.selection): Rect | null {
  const rects = ids.map((id) => nodeRect(id)).filter((r): r is Rect => !!r)
  return unionRects(rects)
}

/* ------------------------------------------------------------------ */
/* camera actions                                                      */
/* ------------------------------------------------------------------ */

export function viewportCenter() {
  const { viewport } = state
  return {
    x: viewport.left + (viewport.width - viewport.left - viewport.right) / 2,
    y: viewport.top + (viewport.height - viewport.top - viewport.bottom) / 2,
  }
}

export function zoomTo(scale: number, anchor = viewportCenter()) {
  setCamera(zoomAtPoint(state.camera, anchor, clampScale(scale)))
}

export function zoomByStep(direction: 1 | -1) {
  zoomTo(stepZoom(state.camera.scale, direction))
}

export function zoomToFit() {
  const rects: Rect[] = []
  for (const id of pageArtboards(state.doc, state.ui.pageId)) {
    const rect = nodeRect(id)
    if (rect) rects.push(rect)
  }
  const bounds = unionRects(rects)
  if (!bounds) return
  fitBoundsTo(bounds)
}

export function zoomToSelection() {
  const bounds = selectionBounds()
  if (!bounds) {
    zoomToFit()
    return
  }
  fitBoundsTo(bounds, 120)
}

function fitBoundsTo(bounds: Rect, padding = 72) {
  const { viewport } = state
  setCamera(
    fitBounds(bounds, {
      width: viewport.width,
      height: viewport.height,
      left: viewport.left,
      right: viewport.right,
      top: viewport.top,
      bottom: viewport.bottom,
    }, padding),
  )
}

function rootNodeId(id: string) {
  let node = state.doc.nodes[id]
  if (!node) return null
  while (node.parentId) {
    const parent = state.doc.nodes[node.parentId]
    if (!parent) break
    node = parent
  }
  return node.id
}

/** Selects a layer and frames the artboard that contains it. */
export function focusNode(id: string) {
  const node = state.doc.nodes[id]
  if (!node) return false
  const pageId = pageOfNode(state.doc, id)
  if (pageId && pageId !== state.ui.pageId) switchPage(pageId)
  select([id])
  const rootId = node.parentId === null ? id : rootNodeId(id)
  const bounds = (rootId ? nodeRect(rootId) : null) ?? nodeRect(id)
  if (bounds) fitBoundsTo(bounds, 96)
  return true
}

/** Resolves a shared link: switches page, then selects and frames the node. */
export function applyLinkTarget(target: { pageId: string | null; nodeId: string | null }, fitPage = true) {
  const pageId =
    target.pageId && state.doc.pages.some((page) => page.id === target.pageId)
      ? target.pageId
      : target.nodeId
        ? pageOfNode(state.doc, target.nodeId)
        : null
  if (pageId && pageId !== state.ui.pageId) switchPage(pageId)
  if (target.nodeId && focusNode(target.nodeId)) return
  if (fitPage) zoomToFit()
}

/* ------------------------------------------------------------------ */
/* persistence                                                         */
/* ------------------------------------------------------------------ */

let saveTimer: number | undefined
export function startPersistence() {
  subscribe(() => {
    if (saveTimer) window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => {
      try {
        writeDocRaw(BOOT_DOC_ID, JSON.stringify(state.doc))
      } catch {
        /* ignore quota errors */
      }
    }, 400)
  })
}

export function resetDocument() {
  const sample = buildSampleDoc()
  withHistory((doc) => {
    doc.pages = sample.pages
    doc.nodes = sample.nodes
  })
  pageCameras.clear()
  select([])
  setState({ ...state, ui: { ...state.ui, pageId: sample.pages[0].id } })
  zoomToFit()
}

/* ------------------------------------------------------------------ */
/* multi-file project layer (Paper file browser)                       */
/* ------------------------------------------------------------------ */

function persistNow() {
  try {
    writeDocRaw(BOOT_DOC_ID, JSON.stringify(state.doc))
  } catch {
    /* ignore quota errors */
  }
}

function reloadApp() {
  persistNow()
  window.location.reload()
}

export function toggleFileBrowser(open?: boolean) {
  setUI({ fileBrowserVisible: open ?? !state.ui.fileBrowserVisible })
}

export function openFile(id: string) {
  if (id === currentDocId()) return toggleFileBrowser(false)
  setCurrentDocId(id)
  reloadApp()
}

export function createFile(name?: string, doc?: Doc) {
  const meta = createDocMeta(name ?? 'Untitled', doc)
  setCurrentDocId(meta.id)
  reloadApp()
}

export function renameFile(id: string, name: string) {
  renameDocMeta(id, name)
  setUI({}) // re-render subscribers
}

export function duplicateFile(id: string) {
  persistNow()
  duplicateDocMeta(id)
  setUI({})
}

export function deleteFile(id: string) {
  if (id === currentDocId()) {
    const fallback = deleteDocMeta(id)
    setCurrentDocId(fallback!)
    window.location.reload()
    return
  }
  trashDocMeta(id)
  setUI({})
}

export function restoreFile(id: string) {
  restoreDocMeta(id)
  setUI({})
}

export function purgeFile(id: string) {
  purgeDocMeta(id)
  setUI({})
}

export async function importFileJson(): Promise<boolean> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return resolve(false)
      try {
        const doc = normalizeDoc(JSON.parse(await file.text()))
        if (!doc) return resolve(false)
        createFile(file.name.replace(/\.json$/i, '') || 'Imported', doc)
        resolve(true)
      } catch {
        resolve(false)
      }
    }
    input.click()
  })
}
