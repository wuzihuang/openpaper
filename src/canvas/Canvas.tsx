import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type React from 'react'
import type { Camera, Doc, Guides, Rect } from '../model/types'
import type { AlignEdge } from '../model/store'
import {
  adjustFontSize,
  adjustTypography,
  applyLinkTarget,
  arrangeSelection,
  beginTransaction,
  bootLinkTarget,
  chooseImage,
  importImageFileAt,
  clearSelection,
  copySelection,
  copyStyles,
  alignSelection,
  createComponent,
  createDrawnNode,
  createInstance,
  deletePathPoint,
  distributeSelection,
  eyeDropPick,
  resizeToFill,
  resizeToFit,
  setMeasure,
  setSelectionOpacity,
  swapFillAndStroke,
  collapseAllLayers,
  createFile,
  addComment,
  updateComment,
  deleteComment,
  togglePixelSnap,
  deleteSelection,
  documentRect,
  duplicateSelection,
  endTransaction,
  finishPen,
  frameSelection,
  cycleArtboard,
  cyclePage,
  getState,
  insertPathPoint,
  iterateSiblings,
  mutateDoc,
  nodeIsLocked,
  nodeRect,
  renameNode,
  setRenamingNode,
  nudgeSelection,
  pasteSelection,
  pasteStyles,
  redo,
  select,
  selectAll,
  selectAllSiblingsExceptSelf,
  selectChildren,
  selectParent,
  updateNode,
  selectionBounds,
  setCamera,
  setEditing,
  setGuides,
  setMarquee,
  setPathEdit,
  setPen,
  setTool,
  setUI,
  setViewport,
  setSelectionFlex,
  setSelectionTextAlign,
  showLayers,
  startRenamingNode,
  toggleClipSelection,
  toggleComments,
  toggleGuides,
  toggleHotkeys,
  toggleLeftPanel,
  togglePixelGrid,
  toggleTheme,
  toggleSelect,
  toggleSelectionLock,
  toggleSelectionVisibility,
  toggleFileBrowser,
  toggleTextStyle,
  toggleUI,
  unlockAll,
  undo,
  ungroupSelection,
  useEditor,
  zoomByStep,
  zoomTo,
  zoomToFit,
  zoomToSelection,
} from '../model/store'
import { stepZoom } from './camera'
import { copySelectionLink } from '../model/navigation'
import { copySelectionAsPng, copySelectionAsReactCss, downloadSelectionPng } from '../model/export'
import { openCanvasMenu, openNodeMenu, openShadersMenu } from '../ui/menuActions'
import { pageArtboards } from '../model/doc'
import { measureDocument, measureMap } from './measure'
import { hitTest, topLevelChild } from './hitTest'
import { computeSnap } from './snap'
import { cameraMatrix, zoomAtPoint } from './camera'
import { DocumentTree } from './NodeView'
import { Hud } from './Hud'
import { closestOnPath, vectorPathD } from '../model/vector'
import { fillsOf } from '../model/fills'
import type { PenDraft } from '../model/store'
import type { DocNode } from '../model/types'

const HANDLES: Array<[number, number]> = [
  [0, 0],
  [0.5, 0],
  [1, 0],
  [1, 0.5],
  [1, 1],
  [0.5, 1],
  [0, 1],
  [0, 0.5],
]

const CURSORS = [
  'url(/cursors/cursor-resize-top-left.webp) 16 16, nwse-resize',
  'url(/cursors/cursor-resize-y.webp) 16 16, ns-resize',
  'url(/cursors/cursor-resize-top-right.webp) 16 16, nesw-resize',
  'url(/cursors/cursor-resize-x.webp) 16 16, ew-resize',
  'url(/cursors/cursor-resize-top-right.webp) 16 16, nwse-resize',
  'url(/cursors/cursor-resize-y.webp) 16 16, ns-resize',
  'url(/cursors/cursor-resize-top-left.webp) 16 16, nesw-resize',
  'url(/cursors/cursor-resize-x.webp) 16 16, ew-resize',
]

const CURSOR_ARROW = 'url(/cursors/cursor-arrow.webp) 4 3, default'
const CURSOR_GRAB = 'url(/cursors/cursor-hand-open.webp) 16 16, grab'
const CURSOR_GRABBING = 'url(/cursors/cursor-hand-closed.webp) 16 16, grabbing'
const CURSOR_MOVE = 'url(/cursors/cursor-move.webp) 16 16, move'
const CURSOR_CROSS = 'url(/cursors/cursor-crosshair.webp) 16 16, crosshair'
const CURSOR_COMMENT = 'url(/cursors/cursor-comment.webp) 16 16, default'
const CURSOR_ZOOM_IN = 'url(/cursors/cursor-zoom-in.webp) 16 16, zoom-in'

type DrawTool = 'frame' | 'rect' | 'ellipse' | 'text'

type Drag =
  | { kind: 'pan'; startClient: { x: number; y: number }; startCamera: Camera }
  | {
      kind: 'move'
      startWorld: { x: number; y: number }
      startLocal: { x: number; y: number }
      ids: string[]
      origins: Record<string, { x: number; y: number }>
      box: Rect
      moved: boolean
      duplicated: boolean
      deselectOnRelease?: string
      selectOnRelease?: string
    }
  | {
      kind: 'rotate'
      id: string
      cx: number
      cy: number
      startAngle: number
      startRot: number
      applied: number
      moved: boolean
    }
  | {
      kind: 'resize'
      handle: number
      id: string
      startWorld: { x: number; y: number }
      startLocal: { x: number; y: number }
      startBox: Rect
      startNode: { x: number; y: number; width: number; height: number; heightAuto: boolean; ratioLocked: boolean }
      childOrigins: Record<string, { x: number; y: number; width: number; height: number }>
      moved: boolean
    }
  | { kind: 'marquee'; startWorld: { x: number; y: number }; startLocal: { x: number; y: number }; additive: boolean; base: string[]; moved: boolean }
  | { kind: 'create'; tool: DrawTool; startWorld: { x: number; y: number }; startLocal: { x: number; y: number }; parentId: string | null; moved: boolean }
  | { kind: 'penCurve' }
  | { kind: 'gradient'; nodeId: string; part: 'start' | 'end' | 'center' | 'radius'; moved: boolean }
  | { kind: 'pathPoint'; nodeId: string; index: number; moved: boolean }
  | { kind: 'pathHandle'; nodeId: string; index: number; side: 'handleIn' | 'handleOut'; moved: boolean }

function drawRect(drag: Extract<Drag, { kind: 'create' }>, world: { x: number; y: number }, square: boolean): Rect {
  let dx = world.x - drag.startWorld.x
  let dy = world.y - drag.startWorld.y
  if (square && drag.tool !== 'text') {
    const size = Math.max(Math.abs(dx), Math.abs(dy))
    dx = Math.sign(dx || 1) * size
    dy = Math.sign(dy || 1) * size
  }
  return {
    x: Math.min(drag.startWorld.x, drag.startWorld.x + dx),
    y: Math.min(drag.startWorld.y, drag.startWorld.y + dy),
    width: Math.abs(dx),
    height: Math.abs(dy),
  }
}

function localPoint(root: HTMLElement, clientX: number, clientY: number) {
  const rect = root.getBoundingClientRect()
  return { x: clientX - rect.left, y: clientY - rect.top }
}

/** World-space handle positions for the node's top gradient fill, or null. */
function gradientHandles(node: DocNode, rect: Rect) {
  const fill = fillsOf(node).find((f) => f.isVisible !== false && f.type === 'gradient')
  if (!fill) return null
  const shape = fill.shape ?? 'linear'
  const center = fill.center ?? { x: 0.5, y: 0.5 }
  const cx = rect.x + center.x * rect.width
  const cy = rect.y + center.y * rect.height
  if (shape === 'linear') {
    const a = (((fill.angle ?? 180) - 90) * Math.PI) / 180
    const dx = Math.cos(a) * 0.5
    const dy = Math.sin(a) * 0.5
    return {
      shape,
      center: { x: cx, y: cy },
      start: { x: rect.x + (center.x - dx) * rect.width, y: rect.y + (center.y - dy) * rect.height },
      end: { x: rect.x + (center.x + dx) * rect.width, y: rect.y + (center.y + dy) * rect.height },
    }
  }
  if (shape === 'radial') {
    return {
      shape,
      center: { x: cx, y: cy },
      radius: { x: cx + (fill.length ?? 1) * 0.5 * rect.width, y: cy },
    }
  }
  const a = (((fill.angle ?? 0) - 90) * Math.PI) / 180
  const r = Math.min(rect.width, rect.height) * 0.35
  return {
    shape,
    center: { x: cx, y: cy },
    start: { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r },
  }
}

export function Canvas() {
  const rootRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const opacityChordRef = useRef<{ digit: number; time: number } | null>(null)
  const pendingMenuRef = useRef<{ x: number; y: number } | null>(null)
  const camera = useEditor((s) => s.camera)
  const doc = useEditor((s) => s.doc)
  const tool = useEditor((s) => s.ui.tool)
  const spaceDown = useEditor((s) => s.ui.spaceDown)
  const editingId = useEditor((s) => s.ui.editingId)
  const pageId = useEditor((s) => s.ui.pageId)
  const pen = useEditor((s) => s.ui.pen)
  const pathEdit = useEditor((s) => s.ui.pathEdit)
  const selection = useEditor((s) => s.ui.selection)
  const measure = useEditor((s) => s.ui.measure)
  const commentsVisible = useEditor((s) => s.ui.commentsVisible)
  const pixelGrid = useEditor((s) => s.ui.pixelGrid)
  const guidesEnabled = useEditor((s) => s.ui.guidesEnabled)
  const hoverId = useEditor((s) => s.ui.hoverId)
  const guides = useEditor((s) => s.guides)
  const [penHover, setPenHover] = useState<{ x: number; y: number } | null>(null)
  const [commentDraft, setCommentDraft] = useState<{ x: number; y: number } | null>(null)

  const measureOverlay =
    measure && selection.length === 1 && hoverId && hoverId !== selection[0]
      ? (() => {
          const sel = measureMap.get(selection[0]) ?? documentRect(doc, selection[0])
          const hov = measureMap.get(hoverId) ?? documentRect(doc, hoverId)
          return sel && hov ? { sel, hov } : null
        })()
      : null

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    measureDocument(root, camera)
  }, [doc, camera])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const initialTarget = bootLinkTarget()
    if (initialTarget.nodeId) applyLinkTarget(initialTarget)
    let initialFit: Camera | null = null
    const fitOnce = () => {
      if (initialFit) return
      if (initialTarget.pageId || initialTarget.nodeId) applyLinkTarget(initialTarget)
      else zoomToFit()
      initialFit = getState().camera
    }
    const observer = new ResizeObserver(() => {
      setViewport({
        width: root.clientWidth,
        height: root.clientHeight,
        left: 24,
        right: 24,
        top: 56,
        bottom: 64,
      })
      const state = getState()
      measureDocument(root, state.camera)
      requestAnimationFrame(fitOnce)
    })
    observer.observe(root)
    document.fonts?.ready.then(() => {
      if (!initialFit) return
      if (initialTarget.pageId || initialTarget.nodeId) {
        measureDocument(root, getState().camera)
        return
      }
      const current = getState().camera
      const untouched =
        current.x === initialFit.x && current.y === initialFit.y && current.scale === initialFit.scale
      if (!untouched) return
      initialFit = null
      measureDocument(root, current)
      fitOnce()
    })
    return () => {
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const state = getState()
      const prefs = state.ui.prefs
      if (event.ctrlKey || event.metaKey || prefs?.wheelZooms) {
        const dir = prefs?.invertZoom ? -1 : 1
        const factor = Math.exp(-event.deltaY * 0.01 * dir)
        let point = localPoint(root, event.clientX, event.clientY)
        // Paper "Zoom centers selection": zoom toward the selection center instead of the cursor.
        if (prefs?.zoomCentersSelection && state.ui.selection.length > 0) {
          const b = selectionBounds()
          if (b) point = { x: (b.x + b.width / 2) * state.camera.scale + state.camera.x, y: (b.y + b.height / 2) * state.camera.scale + state.camera.y }
        }
        setCamera(zoomAtPoint(state.camera, point, state.camera.scale * factor))
      } else {
        setCamera({ ...state.camera, x: state.camera.x - event.deltaX, y: state.camera.y - event.deltaY })
      }
    }
    root.addEventListener('wheel', onWheel, { passive: false })
    return () => root.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('input, textarea, [contenteditable="true"]')) {
        // Paper keeps ⌘B/⌘I active while editing text — they apply to the node being edited.
        const k = event.key.toLowerCase()
        if (!((event.metaKey || event.ctrlKey) && (k === 'b' || k === 'i'))) return
      }
      const state = getState()
      const mod = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()

      if (key === ' ') {
        event.preventDefault()
        if (!state.ui.spaceDown) setUI({ spaceDown: true })
        return
      }
      if (event.key === 'Alt') {
        setMeasure(true)
        return
      }
      if (mod && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (mod && event.altKey && key === 'c') {
        event.preventDefault()
        copyStyles()
        return
      }
      if (mod && event.altKey && key === 'v') {
        event.preventDefault()
        pasteStyles()
        return
      }
      if (mod && event.shiftKey && (key === ',' || key === '<')) {
        event.preventDefault()
        adjustFontSize(-1)
        return
      }
      if (mod && event.shiftKey && (key === '.' || key === '>')) {
        event.preventDefault()
        adjustFontSize(1)
        return
      }
      if (mod && event.shiftKey && key === 'c') {
        event.preventDefault()
        void copySelectionAsPng()
        return
      }
      if (mod && event.shiftKey && key === 'e') {
        event.preventDefault()
        void downloadSelectionPng()
        return
      }
      if (mod && event.shiftKey && (key === 'i' || key === 'k')) {
        event.preventDefault()
        chooseImage()
        return
      }
      if (mod && event.altKey && event.shiftKey && key === 'r') {
        event.preventDefault()
        resizeToFit()
        return
      }
      if (mod && event.altKey && event.shiftKey && key === 'f') {
        event.preventDefault()
        resizeToFill()
        return
      }
      if (mod && event.shiftKey && key === "'") {
        event.preventDefault()
        togglePixelSnap()
        return
      }
      if (mod && key === "'") {
        event.preventDefault()
        togglePixelGrid()
        return
      }
      if (!mod && !event.altKey && event.shiftKey && (key === "'" || key === '"')) {
        event.preventDefault()
        togglePixelGrid()
        return
      }
      if (mod && event.shiftKey && key === 'r') {
        event.preventDefault()
        void pasteSelection('replace')
        return
      }
      if (!mod && event.altKey && key === 'r') {
        event.preventDefault()
        void copySelectionAsReactCss()
        return
      }
      if (mod && key === 'r') {
        if (state.ui.selection.length === 1) {
          event.preventDefault()
          startRenamingNode(state.ui.selection[0])
        }
        return
      }
      if (mod && event.shiftKey && key === 'v') {
        event.preventDefault()
        void pasteSelection('over')
        return
      }
      if (mod && key === 'v') {
        event.preventDefault()
        void pasteSelection()
        return
      }
      if (mod && key === 'x') {
        event.preventDefault()
        void copySelection(true)
        return
      }
      if (mod && event.ctrlKey && !event.metaKey && key === 'c') {
        event.preventDefault()
        void eyeDropPick()
        return
      }
      if (mod && key === 'c') {
        event.preventDefault()
        void copySelection()
        return
      }
      if (mod && event.altKey && event.shiftKey && key === 'l') {
        event.preventDefault()
        unlockAll()
        return
      }
      if (mod && event.altKey && key === 'k') {
        event.preventDefault()
        createInstance()
        return
      }
      if (mod && key === 'k') {
        event.preventDefault()
        createComponent()
        return
      }
      if (mod && key === 'd') {
        event.preventDefault()
        duplicateSelection()
        return
      }
      // Alignment & distribution (Paper: ⌥A/D/W/S edges, ⌥H/V centers, ⌥⇧H/V distribute, ⌃⌘arrows)
      if (!mod && event.altKey) {
        const code = event.code
        const shift = event.shiftKey
        const edge = code === 'KeyA' ? 'left' : code === 'KeyD' ? 'right' : code === 'KeyW' ? 'top' : code === 'KeyS' && !shift ? 'bottom' : null
        const center = code === 'KeyH' && !shift ? 'h-center' : code === 'KeyV' && !shift ? 'v-center' : code === 'KeyS' && shift ? 'h-center' : code === 'KeyW' && shift ? 'v-center' : null
        const dist = code === 'KeyH' && shift ? 'x' : code === 'KeyV' && shift ? 'y' : null
        if (edge || center) {
          event.preventDefault()
          alignSelection((edge ?? center) as AlignEdge)
          return
        }
        if (dist) {
          event.preventDefault()
          distributeSelection(dist)
          return
        }
        if (event.code === 'KeyL' && !event.shiftKey) {
          event.preventDefault()
          collapseAllLayers()
          return
        }
      }
      if (mod && event.ctrlKey && key.startsWith('arrow')) {
        event.preventDefault()
        const edge = key === 'arrowleft' ? 'left' : key === 'arrowright' ? 'right' : key === 'arrowup' ? 'top' : 'bottom'
        alignSelection(event.altKey ? (edge === 'left' || edge === 'right' ? 'h-center' : 'v-center') : edge)
        return
      }
      // Paper Mod/Alt+Arrow = nudge (Shift = big step; layer order lives on ⌘[/⌘])
      if ((mod || event.altKey) && !event.ctrlKey && key.startsWith('arrow')) {
        event.preventDefault()
        const step = state.ui.nudgeAmounts[event.shiftKey ? 1 : 0]
        nudgeSelection(key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0, key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0)
        return
      }
      if (mod && event.shiftKey && key === 'g') {
        event.preventDefault()
        ungroupSelection()
        return
      }
      if (!mod && !event.altKey && event.shiftKey && key === 'x') {
        event.preventDefault()
        swapFillAndStroke()
        return
      }
      if (!mod && !event.altKey && event.shiftKey && key === 'f') {
        event.preventDefault()
        frameSelection()
        return
      }
      if (mod && event.shiftKey && key === 'l') {
        event.preventDefault()
        toggleSelectionLock()
        return
      }
      if (mod && key === 'l') {
        event.preventDefault()
        copySelectionLink()
        return
      }
      if (mod && event.shiftKey && key === 'h') {
        event.preventDefault()
        toggleSelectionVisibility()
        return
      }
      if (mod && event.shiftKey && key === 'a') {
        event.preventDefault()
        selectAllSiblingsExceptSelf()
        return
      }
      if (mod && event.shiftKey && (key === '\\' || key === '|')) {
        event.preventDefault()
        toggleLeftPanel()
        return
      }
      if (mod && key === '\\') {
        event.preventDefault()
        toggleUI()
        return
      }
      if (mod && !event.shiftKey && !event.altKey && key === 'o') {
        event.preventDefault()
        toggleFileBrowser()
        return
      }
      if (mod && !event.shiftKey && !event.altKey && key === 'n') {
        event.preventDefault()
        createFile()
        return
      }
      if (!mod && !event.altKey && event.shiftKey && key === 'c') {
        event.preventDefault()
        toggleComments()
        return
      }
      // Paper ⇧G / ⇧A / ⌥⇧A / ⇧. / ⇧\
      if (!mod && event.shiftKey && !event.altKey) {
        if (key === 'g') {
          event.preventDefault()
          toggleGuides()
          return
        }
        if (key === 'a') {
          event.preventDefault()
          setSelectionFlex(true)
          return
        }
        if (key === '>' || key === '|') {
          event.preventDefault()
          toggleLeftPanel()
          return
        }
      }
      if (!mod && event.altKey && event.shiftKey && key === 'a') {
        event.preventDefault()
        setSelectionFlex(false)
        return
      }
      // Paper ⌘⌥L/T/R text alignment (alignTextLeft/Center/Right; justify has no hotkey in Paper)
      if (mod && event.altKey && !event.shiftKey && (key === 'l' || key === 't' || key === 'r')) {
        event.preventDefault()
        setSelectionTextAlign(key === 'l' ? 'left' : key === 't' ? 'center' : 'right')
        return
      }
      // Paper ⌘⌥G wrap in frame
      if (mod && event.altKey && key === 'g') {
        event.preventDefault()
        frameSelection()
        return
      }
      // Paper ⌥1 layers / ⌥C clip
      if (!mod && event.altKey && !event.shiftKey) {
        if (event.code === 'Digit1') {
          event.preventDefault()
          showLayers()
          return
        }
        if (event.code === 'KeyC') {
          event.preventDefault()
          toggleClipSelection()
          return
        }
      }
      if (!mod && event.altKey && !event.shiftKey && event.code === 'Digit2') {
        event.preventDefault()
        toggleTheme()
        return
      }
      if (mod && key === 'f') {
        event.preventDefault()
        if (!state.ui.leftPanelVisible) toggleLeftPanel()
        window.setTimeout(() => document.querySelector<HTMLInputElement>('.search-chip input')?.focus(), 0)
        return
      }
      if (mod && key === 'b') {
        event.preventDefault()
        toggleTextStyle('bold')
        return
      }
      if (mod && key === 'i') {
        event.preventDefault()
        toggleTextStyle('italic')
        return
      }
      if (mod && key === 'a') {
        event.preventDefault()
        selectAll()
        return
      }
      if ((key === '>' || key === '<' || key === '.' || key === ',') && (mod || event.altKey)) {
        const direction = key === '>' || key === '.' ? 1 : -1
        if (mod && event.altKey) adjustTypography('fontWeight', direction)
        else if (mod && event.shiftKey) adjustTypography('fontSize', direction)
        else if (event.altKey && event.shiftKey) adjustTypography('lineHeight', direction)
        else if (event.altKey) adjustTypography('letterSpacing', direction)
        else return
        event.preventDefault()
        return
      }
      if (key === ']' || key === '}') {
        event.preventDefault()
        arrangeSelection(mod ? 'forward' : 'front')
        return
      }
      if (key === '[' || key === '{') {
        event.preventDefault()
        arrangeSelection(mod ? 'backward' : 'back')
        return
      }
      if (!mod && event.shiftKey && event.code === 'Digit0') {
        event.preventDefault()
        zoomTo(1)
        return
      }
      if (!mod && event.shiftKey && event.code === 'Digit1') {
        event.preventDefault()
        zoomToFit()
        return
      }
      if (!mod && event.shiftKey && event.code === 'Digit2') {
        event.preventDefault()
        zoomToSelection()
        return
      }
      if (!event.altKey && (key === '=' || key === '+')) {
        event.preventDefault()
        zoomByStep(1)
        return
      }
      if (!event.altKey && key === '-') {
        event.preventDefault()
        zoomByStep(-1)
        return
      }
      if (mod && event.code === 'Digit0') {
        event.preventDefault()
        zoomTo(1)
        return
      }
      if (mod && key === 'backspace') {
        if (state.ui.selection.length > 0) {
          event.preventDefault()
          ungroupSelection()
        }
        return
      }
      if (key === 'delete' || key === 'backspace') {
        if (state.ui.pathEdit?.pointIndex != null) {
          event.preventDefault()
          deletePathPoint()
        } else if (state.ui.selection.length > 0) {
          event.preventDefault()
          deleteSelection()
        }
        return
      }
      if (event.ctrlKey && event.shiftKey && (key === '?' || key === '/')) {
        event.preventDefault()
        toggleHotkeys()
        return
      }
      if (key === 'escape') {
        if (state.ui.hotkeysVisible) toggleHotkeys()
        else if (state.ui.pathEdit) setPathEdit(null)
        else if (state.ui.pen) finishPen(false)
        else if (state.ui.editingId) setEditing(null)
        else if (state.ui.tool !== 'select') setTool('select')
        else if (state.ui.selection.length > 0) selectParent()
        else clearSelection()
        return
      }
      if (key === 'enter') {
        if (state.ui.pen) {
          event.preventDefault()
          finishPen(true)
          return
        }
        if (state.ui.pathEdit) {
          event.preventDefault()
          setPathEdit(null)
          return
        }
        if (state.ui.selection.length > 0) {
          event.preventDefault()
          if (event.shiftKey) selectParent()
          else selectChildren()
        }
        return
      }
      if (!mod && !event.altKey && !event.shiftKey) {
        if (/^[0-9]$/.test(key) && state.ui.selection.length > 0) {
          event.preventDefault()
          // Paper two-digit opacity chords (prevOpacityDigits + timeout): quick "35" → 35%, "0" → 100%, "00" → 0%
          const now = Date.now()
          const prev = opacityChordRef.current
          if (prev && now - prev.time < 600) {
            opacityChordRef.current = null
            setSelectionOpacity(Math.min(100, prev.digit * 10 + Number(key)) / 100)
          } else {
            opacityChordRef.current = { digit: Number(key), time: now }
            setSelectionOpacity(key === '0' ? 1 : Number(key) / 10)
          }
          return
        }
        if (key === 'v') setTool('select')
        else if (key === 'h') setTool('hand')
        else if (key === 'f' || key === 'a') setTool('frame')
        else if (key === 'z') setTool('zoom')
        else if (key === '.') toggleUI()
        else if (key === '0' && state.ui.selection.length === 0) zoomTo(1)
        else if (key === '1' && state.ui.selection.length === 0) zoomToFit()
        else if (key === '2' && state.ui.selection.length > 0) zoomToSelection()
        else if (key === 'r') setTool('rect')
        else if (key === 't') setTool('text')
        else if (key === 'p') setTool('pen')
        else if (key === 'i') void eyeDropPick()
        else if (key === 'c' || key === 'y') setTool('comment')
        else if (key === 's') openShadersMenu(window.innerWidth / 2 - 80, window.innerHeight - 200)
        else if (key === 'n') cycleArtboard(1)
        else if (key === '\\') selectParent()
        else if (key === 'tab') {
          event.preventDefault()
          iterateSiblings(1)
        }
        else if (key === 'pagedown') cyclePage(1)
        else if (key === 'pageup') cyclePage(-1)
        else if (key.startsWith('arrow') && state.ui.selection.length > 0) {
          event.preventDefault()
          const step = state.ui.nudgeAmounts[0]
          nudgeSelection(key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0, key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0)
        }
        return
      }
      if (!mod && !event.altKey && event.shiftKey) {
        if (key === 'n') cycleArtboard(-1)
        else if (key === 'tab') {
          event.preventDefault()
          iterateSiblings(-1)
        } else if (key.startsWith('arrow') && state.ui.selection.length > 0) {
          event.preventDefault()
          const step = state.ui.nudgeAmounts[1]
          nudgeSelection(key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0, key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0)
        }
        return
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === ' ') setUI({ spaceDown: false })
      if (event.key === 'Alt') setMeasure(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  const handleAt = (local: { x: number; y: number }): number | null => {
    const state = getState()
    if (state.ui.selection.length !== 1 || nodeIsLocked(state.doc, state.ui.selection[0])) return null
    const bounds = selectionBounds()
    if (!bounds) return null
    const scale = state.camera.scale
    const vx = bounds.x * scale + state.camera.x
    const vy = bounds.y * scale + state.camera.y
    const vw = bounds.width * scale
    const vh = bounds.height * scale
    for (let i = 0; i < HANDLES.length; i += 1) {
      const [fx, fy] = HANDLES[i]
      const px = vx + vw * fx
      const py = vy + vh * fy
      if (Math.abs(local.x - px) <= 6 && Math.abs(local.y - py) <= 6) return i
    }
    return null
  }

  /** Paper/Figma rotate zones: hit boxes just outside the four selection corners. */
  const rotateAt = (local: { x: number; y: number }): boolean => {
    const state = getState()
    if (state.ui.selection.length !== 1 || nodeIsLocked(state.doc, state.ui.selection[0])) return false
    const bounds = selectionBounds()
    if (!bounds) return false
    const scale = state.camera.scale
    const vx = bounds.x * scale + state.camera.x
    const vy = bounds.y * scale + state.camera.y
    const vw = bounds.width * scale
    const vh = bounds.height * scale
    for (const [fx, fy] of [[0, 0], [1, 0], [1, 1], [0, 1]] as const) {
      const cxp = vx + vw * fx + (fx === 0 ? -16 : 16)
      const cyp = vy + vh * fy + (fy === 0 ? -16 : 16)
      if (Math.abs(local.x - cxp) <= 10 && Math.abs(local.y - cyp) <= 10) return true
    }
    return false
  }

  const pointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1 && !(event.button === 2 && getState().ui.prefs?.rightClickPan)) return
    if ((event.target as HTMLElement).closest('[contenteditable="true"]')) return
    const root = rootRef.current
    if (!root) return
    const state = getState()
    const local = localPoint(root, event.clientX, event.clientY)
    const world = {
      x: (local.x - state.camera.x) / state.camera.scale,
      y: (local.y - state.camera.y) / state.camera.scale,
    }

    if (state.ui.tool === 'zoom' && event.button === 0) {
      // Paper `z`: click zooms in around the point, ⌥-click zooms out.
      const step = stepZoom(state.camera.scale, event.altKey ? -1 : 1)
      zoomTo(step, local)
      return
    }
    if (state.ui.tool === 'comment' && event.button === 0) {
      setCommentDraft({ x: world.x, y: world.y })
      return
    }

    if (state.ui.pathEdit && event.button === 0) {
      const edit = state.ui.pathEdit
      const node = state.doc.nodes[edit.nodeId]
      const rect = node ? documentRect(state.doc, edit.nodeId) : null
      if (node?.points && rect) {
        const tol = 7 / state.camera.scale
        for (let i = 0; i < node.points.length; i += 1) {
          for (const side of ['handleIn', 'handleOut'] as const) {
            const h = node.points[i][side]
            if (h && Math.hypot(world.x - (rect.x + h.x), world.y - (rect.y + h.y)) <= tol) {
              setPathEdit({ nodeId: edit.nodeId, pointIndex: i })
              beginTransaction()
              root.setPointerCapture(event.pointerId)
              dragRef.current = { kind: 'pathHandle', nodeId: edit.nodeId, index: i, side, moved: false }
              return
            }
          }
        }
        for (let i = 0; i < node.points.length; i += 1) {
          const p = node.points[i]
          if (Math.hypot(world.x - (rect.x + p.x), world.y - (rect.y + p.y)) <= tol) {
            setPathEdit({ nodeId: edit.nodeId, pointIndex: i })
            beginTransaction()
            root.setPointerCapture(event.pointerId)
            dragRef.current = { kind: 'pathPoint', nodeId: edit.nodeId, index: i, moved: false }
            return
          }
        }
        if (world.x >= rect.x - tol && world.x <= rect.x + rect.width + tol && world.y >= rect.y - tol && world.y <= rect.y + rect.height + tol) {
          setPathEdit({ nodeId: edit.nodeId, pointIndex: null })
          return
        }
      }
      setPathEdit(null)
    }

    if (state.ui.selection.length === 1 && event.button === 0) {
      const node = state.doc.nodes[state.ui.selection[0]]
      const rect = node ? documentRect(state.doc, node.id) : null
      const handles = node && rect ? gradientHandles(node, rect) : null
      if (handles) {
        const tol = 8 / state.camera.scale
        const entries = Object.entries(handles).filter(([k]) => k !== 'shape') as Array<['start' | 'end' | 'center' | 'radius', { x: number; y: number }]>
        let hit: (typeof entries)[number] | null = null
        let hitDist = tol
        for (const entry of entries) {
          const dist = Math.hypot(world.x - entry[1].x, world.y - entry[1].y)
          if (dist <= hitDist) { hit = entry; hitDist = dist }
        }
        if (hit) {
          beginTransaction()
          root.setPointerCapture(event.pointerId)
          dragRef.current = { kind: 'gradient', nodeId: node.id, part: hit[0], moved: false }
          return
        }
      }
    }

    if (state.ui.tool === 'pen' && event.button === 0) {
      const draft = state.ui.pen
      const artboards = pageArtboards(state.doc, state.ui.pageId)
      let parentId: string | null = draft?.parentId ?? null
      if (!draft) {
        for (let i = artboards.length - 1; i >= 0; i -= 1) {
          const rect = documentRect(state.doc, artboards[i])
          if (rect && world.x >= rect.x && world.x <= rect.x + rect.width && world.y >= rect.y && world.y <= rect.y + rect.height) {
            parentId = artboards[i]
            break
          }
        }
        if (!parentId) return
      }
      if (draft && draft.points.length >= 3) {
        const first = draft.points[0]
        const dist = Math.hypot(world.x - first.x, world.y - first.y)
        if (dist <= 8 / state.camera.scale) {
          setPen({ ...draft, closed: true })
          finishPen(true)
          return
        }
      }
      const point = { x: world.x, y: world.y }
      setPen(draft ? { ...draft, points: [...draft.points, point] } : { points: [point], closed: false, parentId })
      root.setPointerCapture(event.pointerId)
      dragRef.current = { kind: 'penCurve' }
      return
    }

    const wantsPan = event.button === 1 || (event.button === 2 && !!state.ui.prefs?.rightClickPan) || state.ui.tool === 'hand' || state.ui.spaceDown
    if (wantsPan) {
      root.setPointerCapture(event.pointerId)
      dragRef.current = {
        kind: 'pan',
        startClient: { x: event.clientX, y: event.clientY },
        startCamera: state.camera,
      }
      root.style.cursor = CURSOR_GRABBING
      return
    }

    if (state.ui.tool === 'frame' || state.ui.tool === 'rect' || state.ui.tool === 'ellipse' || state.ui.tool === 'text') {
      let parentId: string | null = null
      if (state.ui.tool !== 'frame') {
        const artboards = pageArtboards(state.doc, state.ui.pageId)
        for (let i = artboards.length - 1; i >= 0; i -= 1) {
          const rect = documentRect(state.doc, artboards[i])
          if (rect && world.x >= rect.x && world.x <= rect.x + rect.width && world.y >= rect.y && world.y <= rect.y + rect.height) {
            parentId = artboards[i]
            break
          }
        }
        if (!parentId) return
      }
      root.setPointerCapture(event.pointerId)
      dragRef.current = { kind: 'create', tool: state.ui.tool, startWorld: world, startLocal: local, parentId, moved: false }
      setMarquee({ x: world.x, y: world.y, width: 0, height: 0 })
      root.style.cursor = CURSOR_CROSS
      return
    }

    if (state.ui.editingId) {
      const active = document.activeElement
      if (active instanceof HTMLElement) active.blur()
      setEditing(null)
    }

    const handle = handleAt(local)
    if (handle === null && rotateAt(local)) {
      const id = state.ui.selection[0]
      const bounds = selectionBounds()
      const node = id ? state.doc.nodes[id] : null
      if (bounds && node) {
        root.setPointerCapture(event.pointerId)
        beginTransaction()
        dragRef.current = {
          kind: 'rotate',
          id,
          cx: (bounds.x + bounds.width / 2) * state.camera.scale + state.camera.x,
          cy: (bounds.y + bounds.height / 2) * state.camera.scale + state.camera.y,
          startAngle: (Math.atan2(local.y - ((bounds.y + bounds.height / 2) * state.camera.scale + state.camera.y), local.x - ((bounds.x + bounds.width / 2) * state.camera.scale + state.camera.x)) * 180) / Math.PI,
          startRot: node.rotation ?? 0,
          applied: node.rotation ?? 0,
          moved: false,
        }
      }
      return
    }
    if (handle !== null) {
      const id = state.ui.selection[0]
      const node = state.doc.nodes[id]
      const box = nodeRect(id)
      if (node && box) {
        root.setPointerCapture(event.pointerId)
        beginTransaction()
        const childOrigins: Record<string, { x: number; y: number; width: number; height: number }> = {}
        for (const cid of node.children) {
          const c = state.doc.nodes[cid]
          if (c) childOrigins[cid] = { x: c.x, y: c.y, width: c.width, height: c.height }
        }
        dragRef.current = {
          kind: 'resize',
          handle,
          id,
          startWorld: world,
          startLocal: local,
          startBox: box,
          startNode: { x: node.x, y: node.y, width: node.width, height: node.height, heightAuto: !!node.heightAuto, ratioLocked: !!node.ratioLocked },
          childOrigins,
          moved: false,
        }
      }
      return
    }

    const beginMove = (picked: string, selectOnRelease?: string) => {
      const additive = event.shiftKey
      const wasSelected = state.ui.selection.includes(picked)
      if (additive && !wasSelected) toggleSelect(picked)
      else if (!additive && !wasSelected) select([picked])
      beginTransaction()
      let duplicated = false
      if (event.altKey) duplicated = duplicateSelection({ x: 0, y: 0 }, false).length > 0
      const nextState = getState()
      const ids = nextState.ui.selection.filter((id) => !nodeIsLocked(nextState.doc, id))
      const box = selectionBounds(ids)
      if (!box || ids.length === 0) {
        endTransaction(duplicated)
        return
      }
      const origins: Record<string, { x: number; y: number }> = {}
      for (const id of ids) {
        const node = nextState.doc.nodes[id]
        if (node) origins[id] = { x: node.x, y: node.y }
      }
      root.setPointerCapture(event.pointerId)
      dragRef.current = {
        kind: 'move',
        startWorld: world,
        startLocal: local,
        ids,
        origins,
        box,
        moved: false,
        duplicated,
        deselectOnRelease: additive && wasSelected ? picked : undefined,
        selectOnRelease,
      }
      root.style.cursor = CURSOR_MOVE
    }

    const hit = hitTest(state.doc, state.ui.pageId, world.x, world.y)
    if (hit) {
      // A plain click picks the top-level layer inside the artboard, like
      // Paper/Figma; ⌘-click picks the deepest node. Pressing inside an
      // already-selected top-level still drags it, while a click without
      // movement drills into the deep node on release.
      const deep = event.metaKey || !!state.ui.prefs?.deepSelection
      const top = topLevelChild(state.doc, hit)
      const sole = state.ui.selection.length === 1 ? state.ui.selection[0] : null
      const drill = !deep && !event.shiftKey && sole === top && hit !== top
      beginMove(deep ? hit : top, drill ? hit : undefined)
      return
    }

    for (const id of pageArtboards(state.doc, state.ui.pageId)) {
      const rect = measureMap.get(id)
      if (!rect) continue
      const vx = rect.x * state.camera.scale + state.camera.x
      const vy = rect.y * state.camera.scale + state.camera.y
      const vw = rect.width * state.camera.scale
      if (local.y >= vy - 20 && local.y <= vy - 2 && local.x >= vx && local.x <= vx + vw) {
        beginMove(id)
        return
      }
    }

    if (!event.shiftKey) clearSelection()
    root.setPointerCapture(event.pointerId)
    dragRef.current = {
      kind: 'marquee',
      startWorld: world,
      startLocal: local,
      additive: event.shiftKey,
      base: getState().ui.selection,
      moved: false,
    }
  }

  const pointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const root = rootRef.current
    if (!root) return
    const state = getState()
    const drag = dragRef.current
    const local = localPoint(root, event.clientX, event.clientY)
    const world = {
      x: (local.x - state.camera.x) / state.camera.scale,
      y: (local.y - state.camera.y) / state.camera.scale,
    }

    if (!drag) {
      if (state.ui.tool === 'pen') setPenHover(world)
      const drawing = state.ui.tool === 'frame' || state.ui.tool === 'rect' || state.ui.tool === 'ellipse' || state.ui.tool === 'text'
      const hit = drawing ? null : hitTest(state.doc, state.ui.pageId, world.x, world.y)
      const hover = hit ? (event.metaKey ? hit : topLevelChild(state.doc, hit)) : null
      if (hover !== state.ui.hoverId) setUI({ hoverId: hover })
      const handle = handleAt(local)
      root.style.cursor =
        state.ui.spaceDown || state.ui.tool === 'hand'
          ? CURSOR_GRAB
          : state.ui.tool === 'comment'
            ? CURSOR_COMMENT
            : state.ui.tool === 'zoom'
              ? CURSOR_ZOOM_IN
              : drawing
                ? CURSOR_CROSS
                : handle !== null
                  ? CURSORS[handle]
                  : rotateAt(local)
                    ? CURSOR_MOVE
                    : CURSOR_ARROW
      return
    }

    if (drag.kind === 'rotate') {
      const angle = (Math.atan2(local.y - drag.cy, local.x - drag.cx) * 180) / Math.PI
      let deg = drag.startRot + angle - drag.startAngle
      if (event.shiftKey) deg = Math.round(deg / 15) * 15
      deg = ((deg % 360) + 360) % 360
      if (deg !== drag.applied) {
        updateNode(drag.id, { rotation: deg || undefined })
        drag.applied = deg
        drag.moved = true
      }
      root.style.cursor = CURSOR_MOVE
      return
    }

    if (drag.kind === 'pan') {
      const dx = event.clientX - drag.startClient.x
      const dy = event.clientY - drag.startClient.y
      setCamera({ ...drag.startCamera, x: drag.startCamera.x + dx, y: drag.startCamera.y + dy })
      return
    }

    if (drag.kind === 'penCurve') {
      const draft = state.ui.pen
      if (draft && draft.points.length > 0) {
        const index = draft.points.length - 1
        const anchor = draft.points[index]
        const dx = world.x - anchor.x
        const dy = world.y - anchor.y
        if (Math.hypot(dx, dy) > 1 / state.camera.scale) {
          const next = draft.points.map((p, i) =>
            i === index
              ? {
                  ...p,
                  handleOut: { x: p.x + dx, y: p.y + dy },
                  handleIn: { x: p.x - dx, y: p.y - dy },
                }
              : p,
          )
          setPen({ ...draft, points: next })
        }
      }
      return
    }

    if (drag.kind === 'gradient') {
      const node = state.doc.nodes[drag.nodeId]
      const rect = node ? documentRect(state.doc, drag.nodeId) : null
      if (!node?.fills || !rect) return
      const index = node.fills.findIndex((f) => f.isVisible !== false && f.type === 'gradient')
      if (index < 0) return
      const nx = (world.x - rect.x) / Math.max(1, rect.width)
      const ny = (world.y - rect.y) / Math.max(1, rect.height)
      drag.moved = true
      mutateDoc((d) => {
        const f = d.nodes[drag.nodeId]?.fills?.[index]
        if (!f || f.type !== 'gradient') return
        const c = f.center ?? { x: 0.5, y: 0.5 }
        if (drag.part === 'center') {
          f.center = { x: Math.min(1, Math.max(0, Math.round(nx * 100) / 100)), y: Math.min(1, Math.max(0, Math.round(ny * 100) / 100)) }
          return
        }
        const shape = f.shape ?? 'linear'
        if (shape === 'radial' && drag.part === 'radius') {
          f.length = Math.min(4, Math.max(0.1, Math.round(Math.hypot(nx - c.x, ny - c.y) * 2 * 100) / 100))
          return
        }
        if (shape === 'conic' && drag.part === 'start') {
          f.angle = Math.round(((Math.atan2(ny - c.y, nx - c.x) * 180) / Math.PI + 90 + 360) % 360)
          return
        }
        if (shape === 'linear' && (drag.part === 'start' || drag.part === 'end')) {
          const dx = drag.part === 'end' ? nx - c.x : c.x - nx
          const dy = drag.part === 'end' ? ny - c.y : c.y - ny
          if (Math.hypot(dx, dy) < 0.02) return
          f.angle = Math.round(((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360)
        }
      })
      return
    }

    if (drag.kind === 'pathPoint' || drag.kind === 'pathHandle') {
      const node = state.doc.nodes[drag.nodeId]
      const rect = node ? documentRect(state.doc, drag.nodeId) : null
      const pt = node?.points?.[drag.index]
      if (!node || !rect || !pt) return
      const lx = world.x - rect.x
      const ly = world.y - rect.y
      const base = drag.kind === 'pathHandle' ? (pt[drag.side] ?? pt) : pt
      if (Math.hypot(lx - base.x, ly - base.y) <= 0.01) return
      drag.moved = true
      mutateDoc((d) => {
        const target = d.nodes[drag.nodeId]?.points?.[drag.index]
        if (!target) return
        if (drag.kind === 'pathPoint') {
          const dx = lx - target.x
          const dy = ly - target.y
          target.x = lx
          target.y = ly
          if (target.handleIn) { target.handleIn.x += dx; target.handleIn.y += dy }
          if (target.handleOut) { target.handleOut.x += dx; target.handleOut.y += dy }
        } else {
          target[drag.side] = { x: lx, y: ly }
          if (!event.altKey || !target[drag.side === 'handleIn' ? 'handleOut' : 'handleIn']) {
            target[drag.side === 'handleIn' ? 'handleOut' : 'handleIn'] = { x: 2 * target.x - lx, y: 2 * target.y - ly }
          }
        }
      })
      return
    }

    if (drag.kind === 'create') {
      const worldNow = {
        x: drag.startWorld.x + (local.x - drag.startLocal.x) / state.camera.scale,
        y: drag.startWorld.y + (local.y - drag.startLocal.y) / state.camera.scale,
      }
      const rect = drawRect(drag, worldNow, event.shiftKey)
      if (rect.width > 1 || rect.height > 1) drag.moved = true
      setMarquee(rect)
      return
    }

    if (drag.kind === 'move') {
      // Delta from view-space movement so a camera jump mid-drag can't fling nodes.
      let dx = (local.x - drag.startLocal.x) / state.camera.scale
      let dy = (local.y - drag.startLocal.y) / state.camera.scale
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) drag.moved = true
      const axis = event.shiftKey ? (Math.abs(dx) > Math.abs(dy) ? 'x' : 'y') : null
      if (axis === 'x') dy = 0
      if (axis === 'y') dx = 0
      const movingIds = new Set(drag.ids)
      const box: Rect = { ...drag.box, x: drag.box.x + dx, y: drag.box.y + dy }
      const snap = computeSnap(state.doc, state.ui.pageId, movingIds, box, 4 / state.camera.scale)
      dx += snap.dx
      dy += snap.dy
      if (axis === 'x') dy = 0
      if (axis === 'y') dx = 0
      setGuides({ x: snap.guidesX, y: snap.guidesY })
      mutateDoc((d) => {
        const flexParents = new Set<string>()
        for (const id of drag.ids) {
          const node = d.nodes[id]
          const origin = drag.origins[id]
          if (!node || !origin) continue
          if (node.parentId && d.nodes[node.parentId]?.layout) {
            flexParents.add(node.parentId)
            continue
          }
          node.x = Math.round(origin.x + dx)
          node.y = Math.round(origin.y + dy)
        }
        for (const parentId of flexParents) {
          const parent = d.nodes[parentId]
          if (!parent?.layout) continue
          const axis = parent.layout.direction === 'row' ? 'x' : 'y'
          const pointerMain = axis === 'x' ? world.x : world.y
          const moving = parent.children.filter((c) => drag.ids.includes(c))
          const rest = parent.children.filter((c) => !drag.ids.includes(c))
          let index = 0
          for (const sib of rest) {
            const r = measureMap.get(sib)
            if (!r) continue
            const center = axis === 'x' ? r.x + r.width / 2 : r.y + r.height / 2
            if (center < pointerMain) index += 1
          }
          parent.children = [...rest.slice(0, index), ...moving, ...rest.slice(index)]
        }
      })
      // Paper: highlight the container that would adopt the dragged selection.
      const moving = new Set(drag.ids)
      let target: { id: string } | null = null
      for (const id of drag.ids) {
        const node = state.doc.nodes[id]
        let anc = node?.parentId ?? null
        let ancestorMoving = false
        while (anc) { if (moving.has(anc)) { ancestorMoving = true; break } anc = state.doc.nodes[anc]?.parentId ?? null }
        if (!node || node.parentId === null || ancestorMoving) continue
        const rect = documentRect(getState().doc, id)
        if (rect) target = dropTargetFor(getState(), id, rect, moving)
        break
      }
      if ((target?.id ?? null) !== state.ui.dropTargetId) setUI({ dropTargetId: target?.id ?? null })
      return
    }

    if (drag.kind === 'resize') {
      const dx = (local.x - drag.startLocal.x) / state.camera.scale
      const dy = (local.y - drag.startLocal.y) / state.camera.scale
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) drag.moved = true
      let { x, y, width, height } = drag.startBox
      const h = drag.handle
      if (h === 0 || h === 6 || h === 7) {
        x = drag.startBox.x + dx
        width = drag.startBox.width - dx
      }
      if (h === 2 || h === 3 || h === 4) width = drag.startBox.width + dx
      if (h === 0 || h === 1 || h === 2) {
        y = drag.startBox.y + dy
        height = drag.startBox.height - dy
      }
      if (h === 4 || h === 5 || h === 6) height = drag.startBox.height + dy
      const locked = !!drag.startNode.ratioLocked
      if ((event.shiftKey || locked) && h % 2 === 0 && drag.startBox.height > 0) {
        const ratio = drag.startBox.width / drag.startBox.height
        if (width / Math.max(1, height) > ratio) width = height * ratio
        else height = width / ratio
        if (h === 0 || h === 6) x = drag.startBox.x + drag.startBox.width - width
        if (h === 0 || h === 2) y = drag.startBox.y + drag.startBox.height - height
      } else if (locked && h % 2 === 1 && drag.startBox.width > 0 && drag.startBox.height > 0) {
        const s = h === 3 || h === 7 ? width / drag.startBox.width : height / drag.startBox.height
        width = drag.startBox.width * s
        height = drag.startBox.height * s
        if (h === 3) x = drag.startBox.x
        else if (h === 7) x = drag.startBox.x + drag.startBox.width - width
        else x = drag.startBox.x + (drag.startBox.width - width) / 2
        if (h === 1) y = drag.startBox.y
        else if (h === 5) y = drag.startBox.y + drag.startBox.height - height
        else y = drag.startBox.y + (drag.startBox.height - height) / 2
      }
      width = Math.max(1, width)
      height = Math.max(1, height)
      const node = state.doc.nodes[drag.id]
      if (!node) return
      const auto = drag.startNode.heightAuto
      const offsetX = x - drag.startBox.x
      const offsetY = auto ? 0 : y - drag.startBox.y
      mutateDoc((d) => {
        const n = d.nodes[drag.id]
        if (!n) return
        n.x = Math.round(drag.startNode.x + offsetX)
        n.y = Math.round(drag.startNode.y + offsetY)
        n.width = Math.round(width)
        if (n.widthAuto) n.widthAuto = false
        if (!auto) n.height = Math.round(height)
        // Apply per-child layout constraints (Paper constraints: pin edges / center / scale).
        const dw = Math.round(width) - drag.startBox.width
        const dh = Math.round(height) - drag.startBox.height
        if (n.children.length && (dw !== 0 || dh !== 0)) {
          const sx = drag.startBox.width > 0 ? Math.round(width) / drag.startBox.width : 1
          const sy = drag.startBox.height > 0 ? Math.round(height) / drag.startBox.height : 1
          for (const cid of n.children) {
            const c = d.nodes[cid]
            const o = drag.childOrigins[cid]
            if (!c || !o || c.kind === 'instance') continue
            const cx = c.constraintsX ?? 'left'
            const cy = c.constraintsY ?? 'top'
            if (cx === 'right') c.x = Math.round(o.x + dw)
            else if (cx === 'center') c.x = Math.round(o.x + dw / 2)
            else if (cx === 'stretch') { c.x = Math.round(o.x * sx); c.width = Math.max(1, Math.round(o.width * sx)) }
            if (cy === 'bottom') c.y = Math.round(o.y + dh)
            else if (cy === 'center') c.y = Math.round(o.y + dh / 2)
            else if (cy === 'stretch') { c.y = Math.round(o.y * sy); c.height = Math.max(1, Math.round(o.height * sy)) }
          }
        }
      })
      return
    }

    if (drag.kind === 'marquee') {
      drag.moved = true
      const worldNow = {
        x: drag.startWorld.x + (local.x - drag.startLocal.x) / state.camera.scale,
        y: drag.startWorld.y + (local.y - drag.startLocal.y) / state.camera.scale,
      }
      const rect: Rect = {
        x: Math.min(drag.startWorld.x, worldNow.x),
        y: Math.min(drag.startWorld.y, worldNow.y),
        width: Math.abs(worldNow.x - drag.startWorld.x),
        height: Math.abs(worldNow.y - drag.startWorld.y),
      }
      setMarquee(rect)
      // Marquee = Figma containment: a fully-enclosed node is picked whole;
      // a partially-hit container is descended into (artboards included, so
      // dragging around an artboard picks the artboard, not its contents).
      const inside: string[] = []
      const pick = (id: string) => {
        const node = state.doc.nodes[id]
        if (!node || nodeIsLocked(state.doc, id) || !node.visible) return
        const r = measureMap.get(id)
        if (!r || r.x >= rect.x + rect.width || r.x + r.width <= rect.x || r.y >= rect.y + rect.height || r.y + r.height <= rect.y) return
        const enclosed = r.x >= rect.x && r.y >= rect.y && r.x + r.width <= rect.x + rect.width && r.y + r.height <= rect.y + rect.height
        if (!enclosed && node.children.length > 0) {
          for (const childId of node.children) pick(childId)
          return
        }
        inside.push(id)
      }
      for (const id of pageArtboards(state.doc, state.ui.pageId)) pick(id)
      const next = drag.additive ? Array.from(new Set([...drag.base, ...inside])) : inside
      select(next)
    }
  }

  /** Deepest frame/artboard (excluding moving ids and their descendants) that fully contains `rect`. */
  const dropTargetFor = (state: ReturnType<typeof getState>, id: string, rect: Rect, moving: Set<string>) => {
    let best: { id: string; depth: number; rect: Rect } | null = null
    const node = state.doc.nodes[id]
    for (const cand of Object.values(state.doc.nodes)) {
      if (cand.kind !== 'frame' || cand.id === id || cand.id === node?.parentId || moving.has(cand.id) || !cand.visible) continue
      let anc = cand.parentId
      let descendant = false
      let depth = 1
      while (anc) {
        if (anc === id) { descendant = true; break }
        depth += 1
        anc = state.doc.nodes[anc]?.parentId ?? null
      }
      if (descendant) continue
      const cr = documentRect(state.doc, cand.id)
      if (!cr) continue
      const inside = rect.x >= cr.x && rect.y >= cr.y && rect.x + rect.width <= cr.x + cr.width && rect.y + rect.height <= cr.y + cr.height
      if (inside && (!best || depth > best.depth)) best = { id: cand.id, depth, rect: cr }
    }
    return best
  }

  /** Paper/Figma drop reparenting: a moved layer fully inside another frame/artboard is reparented
   *  to the deepest such container (also handles escaping a parent frame back to its artboard). */
  const reparentOnDrop = (state: ReturnType<typeof getState>, ids: string[]) => {
    const moving = new Set(ids)
    const skip = new Set<string>()
    for (const id of ids) {
      let cur = state.doc.nodes[id]?.parentId ?? null
      while (cur) {
        if (moving.has(cur)) { skip.add(id); break }
        cur = state.doc.nodes[cur]?.parentId ?? null
      }
    }
    for (const id of ids) {
      if (skip.has(id)) continue
      const node = state.doc.nodes[id]
      const rect = node ? documentRect(state.doc, id) : null
      if (!node || !rect || node.parentId === null) continue // artboards can't nest
      const target = dropTargetFor(state, id, rect, moving)
      if (!target) continue
      mutateDoc((d) => {
        const n = d.nodes[id]
        const np = d.nodes[target.id]
        if (!n || !np) return
        if (n.parentId) {
          const op = d.nodes[n.parentId]
          if (op) op.children = op.children.filter((c) => c !== id)
        } else {
          for (const p of d.pages) p.artboards = p.artboards.filter((c) => c !== id)
        }
        np.children.push(id)
        n.parentId = target.id
        n.x = Math.round(rect.x - target.rect.x)
        n.y = Math.round(rect.y - target.rect.y)
      })
    }
    if (state.ui.dropTargetId) setUI({ dropTargetId: null })
  }

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const root = rootRef.current
    const drag = dragRef.current
    // Right-click-pan pref: a right press that didn't drag still opens the context menu on release.
    if (pendingMenuRef.current) {
      const pending = pendingMenuRef.current
      pendingMenuRef.current = null
      if (Math.abs(event.clientX - pending.x) + Math.abs(event.clientY - pending.y) < 4) openMenuAt(pending.x, pending.y)
      return
    }
    if (root?.hasPointerCapture(event.pointerId)) root.releasePointerCapture(event.pointerId)
    if (drag) {
      if (drag.kind === 'move') {
        if (drag.moved) reparentOnDrop(getState(), drag.ids)
        if (drag.deselectOnRelease && !drag.moved && !drag.duplicated) toggleSelect(drag.deselectOnRelease)
        if (drag.selectOnRelease && !drag.moved && !drag.duplicated) select([drag.selectOnRelease])
        endTransaction(drag.moved || drag.duplicated)
      }
      if (drag.kind === 'resize' || drag.kind === 'rotate') endTransaction(drag.moved)
      if (drag.kind === 'pathPoint' || drag.kind === 'pathHandle') endTransaction(drag.moved)
      if (drag.kind === 'gradient') endTransaction(drag.moved)
      if (drag.kind === 'marquee') setMarquee(null)
      if (drag.kind === 'create') {
        const state = getState()
        const local = root ? localPoint(root, event.clientX, event.clientY) : { x: 0, y: 0 }
        const world = {
          x: drag.startWorld.x + (local.x - drag.startLocal.x) / state.camera.scale,
          y: drag.startWorld.y + (local.y - drag.startLocal.y) / state.camera.scale,
        }
        let rect = drawRect(drag, world, event.shiftKey)
        if (!drag.moved) {
          const width = drag.tool === 'frame' ? 390 : drag.tool === 'text' ? 220 : drag.tool === 'rect' ? 160 : 96
          const height = drag.tool === 'frame' ? 844 : drag.tool === 'text' ? 28 : 96
          rect = {
            x: drag.startWorld.x - (drag.tool === 'frame' ? 0 : width / 2),
            y: drag.startWorld.y - (drag.tool === 'frame' ? 0 : height / 2),
            width,
            height,
          }
        }
        createDrawnNode(drag.tool, rect, drag.parentId, !drag.moved)
        setMarquee(null)
      }
    }
    dragRef.current = null
    setGuides({ x: [], y: [] })
    if (getState().ui.dropTargetId) setUI({ dropTargetId: null })
    if (root) root.style.cursor = getState().ui.spaceDown ? CURSOR_GRAB : CURSOR_ARROW
  }

  const doubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const root = rootRef.current
    if (!root) return
    const state = getState()
    const local = localPoint(root, event.clientX, event.clientY)
    const world = {
      x: (local.x - state.camera.x) / state.camera.scale,
      y: (local.y - state.camera.y) / state.camera.scale,
    }
    const hit = hitTest(state.doc, state.ui.pageId, world.x, world.y)
    const hitNode = hit ? state.doc.nodes[hit] : null
    if (hitNode?.kind === 'vector') {
      if (state.ui.pathEdit?.nodeId === hitNode.id) {
        const rect = documentRect(state.doc, hitNode.id)
        if (rect && hitNode.points) {
          const local = { x: world.x - rect.x, y: world.y - rect.y }
          const close = closestOnPath(hitNode.points, hitNode.closed !== false, local)
          if (close && close.dist <= 12 / state.camera.scale) insertPathPoint(hitNode.id, close.index, close.t)
        }
      } else {
        select([hitNode.id])
        setPathEdit({ nodeId: hitNode.id, pointIndex: null })
      }
      return
    }
    if (state.ui.pathEdit) setPathEdit(null)
    if (hitNode?.kind === 'text') setEditing(hitNode.id)
  }

  const openMenuAt = (clientX: number, clientY: number) => {
    const root = rootRef.current
    if (!root) return
    const state = getState()
    if (state.ui.editingId) setEditing(null)
    const local = localPoint(root, clientX, clientY)
    const world = {
      x: (local.x - state.camera.x) / state.camera.scale,
      y: (local.y - state.camera.y) / state.camera.scale,
    }
    const hit = hitTest(state.doc, state.ui.pageId, world.x, world.y)
    if (hit) {
      openNodeMenu(clientX, clientY, hit)
      return
    }
    for (const id of pageArtboards(state.doc, state.ui.pageId)) {
      const rect = measureMap.get(id)
      if (!rect) continue
      const vx = rect.x * state.camera.scale + state.camera.x
      const vy = rect.y * state.camera.scale + state.camera.y
      const vw = rect.width * state.camera.scale
      if (local.y >= vy - 20 && local.y <= vy - 2 && local.x >= vx && local.x <= vx + vw) {
        openNodeMenu(clientX, clientY, id)
        return
      }
    }
    openCanvasMenu(clientX, clientY)
  }

  const contextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    // Paper "Right click to pan": defer the menu until release-without-drag.
    if (getState().ui.prefs?.rightClickPan) {
      pendingMenuRef.current = { x: event.clientX, y: event.clientY }
      return
    }
    openMenuAt(event.clientX, event.clientY)
  }

  return (
    <div
      ref={rootRef}
      className={`canvas${tool === 'hand' || spaceDown ? ' tool-hand' : ''}${editingId ? ' is-editing' : ''}`}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={() => {
        if (!dragRef.current) setUI({ hoverId: null })
      }}
      onDoubleClick={doubleClick}
      onContextMenu={contextMenu}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
        }
      }}
      onDrop={(event) => {
        const files = [...event.dataTransfer.files].filter((f) => f.type.startsWith('image/'))
        if (files.length === 0) return
        event.preventDefault()
        const state = getState()
        const local = localPoint(event.currentTarget, event.clientX, event.clientY)
        const world = {
          x: (local.x - state.camera.x) / state.camera.scale,
          y: (local.y - state.camera.y) / state.camera.scale,
        }
        for (const file of files) void importImageFileAt(file, world)
      }}
    >
      <div className="camera" style={{ transform: cameraMatrix(camera) }}>
        {pixelGrid && camera.scale >= 4 && <PixelGrid camera={camera} />}
        <ArtboardLabels doc={doc} pageId={pageId} scale={camera.scale} />
        <DocumentTree doc={doc} pageId={pageId} />
        {pen && pen.points.length > 0 && <PenOverlay draft={pen} hover={penHover} scale={camera.scale} />}
        {selection.length === 1 && !pathEdit && doc.nodes[selection[0]] && documentRect(doc, selection[0]) && gradientHandles(doc.nodes[selection[0]], documentRect(doc, selection[0])!) && (
          <GradientOverlay handles={gradientHandles(doc.nodes[selection[0]], documentRect(doc, selection[0])!)!} scale={camera.scale} />
        )}
        {pathEdit && doc.nodes[pathEdit.nodeId]?.points && documentRect(doc, pathEdit.nodeId) && (
          <PathOverlay
            node={doc.nodes[pathEdit.nodeId]}
            rect={documentRect(doc, pathEdit.nodeId)!}
            selected={pathEdit.pointIndex}
            scale={camera.scale}
          />
        )}
        {measureOverlay && <MeasureOverlay sel={measureOverlay.sel} hov={measureOverlay.hov} scale={camera.scale} />}
        {guidesEnabled && (guides.x.length > 0 || guides.y.length > 0) && <GuidesOverlay guides={guides} scale={camera.scale} />}
        {commentsVisible && <CommentPins pageId={pageId} scale={camera.scale} />}
        {commentDraft && (
          <CommentDraftPin
            draft={commentDraft}
            scale={camera.scale}
            onDone={(text) => {
              if (text.trim()) addComment(commentDraft.x, commentDraft.y, text.trim())
              setCommentDraft(null)
              setTool('select')
            }}
            onCancel={() => setCommentDraft(null)}
          />
        )}
      </div>
      <Hud />
    </div>
  )
}

/** Smart-guide lines drawn while a drag snaps (Paper's red guides). */
/** Paper/Figma artboard titles: fixed-size labels above each artboard; click selects, double-click renames. */
function ArtboardLabels({ doc, pageId, scale }: { doc: Doc; pageId: string; scale: number }) {
  const selection = useEditor((s) => s.ui.selection)
  const renamingId = useEditor((s) => s.ui.renamingNodeId)
  const fontSize = Math.max(9, 12) / scale
  return (
    <>
      {pageArtboards(doc, pageId).map((id) => {
        const node = doc.nodes[id]
        const rect = node ? documentRect(doc, id) : null
        if (!node || !rect) return null
        const selected = selection.includes(id)
        return (
          <div
            key={id}
            className="artboard-label"
            data-selected={selected}
            style={{
              left: rect.x,
              top: rect.y - fontSize - 6 / scale,
              fontSize,
              lineHeight: 1,
              padding: `${3 / scale}px ${4 / scale}px`,
              borderRadius: 3 / scale,
            }}
            onPointerDown={(event) => {
              // Let it bubble: the canvas pointerdown sees the label-strip hit and
              // begins a move drag on the artboard (Paper/Figma drag-label-to-move).
              if (event.button === 0) select([id])
            }}
            onDoubleClick={(event) => {
              event.stopPropagation()
              startRenamingNode(id)
            }}
          >
            {renamingId === id ? (
              <input
                className="artboard-rename"
                style={{ fontSize: 'inherit' }}
                autoFocus
                defaultValue={node.name}
                onPointerDown={(event) => event.stopPropagation()}
                onBlur={(event) => {
                  renameNode(id, event.currentTarget.value)
                  setRenamingNode(null)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    renameNode(id, event.currentTarget.value)
                    setRenamingNode(null)
                  }
                  if (event.key === 'Escape') setRenamingNode(null)
                }}
              />
            ) : (
              node.name
            )}
          </div>
        )
      })}
    </>
  )
}

function GuidesOverlay({ guides, scale }: { guides: Guides; scale: number }) {
  const w = 1 / scale
  const span = 1e6
  return (
    <svg className="guides-overlay" style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}>
      {guides.x.map((x, i) => (
        <line key={`x${i}`} x1={x} y1={-span / 2} x2={x} y2={span / 2} stroke="#f43f5e" strokeWidth={w} />
      ))}
      {guides.y.map((y, i) => (
        <line key={`y${i}`} x1={-span / 2} y1={y} x2={span / 2} y2={y} stroke="#f43f5e" strokeWidth={w} />
      ))}
    </svg>
  )
}

function MeasureOverlay({ sel, hov, scale }: { sel: Rect; hov: Rect; scale: number }) {
  const stroke = 1.5 / scale
  const fontSize = 11 / scale
  const color = '#f43f5e'
  const label = (x: number, y: number, text: string, key: string) => (
    <text key={key} x={x} y={y} fontSize={fontSize} fill="#fff" textAnchor="middle" dominantBaseline="central" style={{ paintOrder: 'stroke', stroke: color, strokeWidth: 3 / scale, fontWeight: 600 }}>
      {text}
    </text>
  )
  const hLine = (x1: number, x2: number, y: number, key: string) => (
    <line key={key} x1={x1} y1={y} x2={x2} y2={y} stroke={color} strokeWidth={stroke} />
  )
  const vLine = (x: number, y1: number, y2: number, key: string) => (
    <line key={key} x1={x} y1={y1} x2={x} y2={y2} stroke={color} strokeWidth={stroke} />
  )
  const out: React.ReactNode[] = []
  const midY = Math.max(sel.y, hov.y) + Math.min(sel.y + sel.height, hov.y + hov.height) > Math.max(sel.y, hov.y)
    ? (Math.max(sel.y, hov.y) + Math.min(sel.y + sel.height, hov.y + hov.height)) / 2
    : (sel.y + sel.height / 2 + hov.y + hov.height / 2) / 2
  const midX = (Math.max(sel.x, hov.x) + Math.min(sel.x + sel.width, hov.x + hov.width)) / 2

  const gapXr = hov.x - (sel.x + sel.width)
  const gapXl = sel.x - (hov.x + hov.width)
  const gapYb = hov.y - (sel.y + sel.height)
  const gapYt = sel.y - (hov.y + hov.height)

  if (gapXr > 0) {
    out.push(hLine(sel.x + sel.width, hov.x, midY, 'gxr'), label((sel.x + sel.width + hov.x) / 2, midY, `${Math.round(gapXr)}`, 'lgxr'))
  }
  if (gapXl > 0) {
    out.push(hLine(hov.x + hov.width, sel.x, midY, 'gxl'), label((sel.x + hov.x + hov.width) / 2, midY, `${Math.round(gapXl)}`, 'lgxl'))
  }
  if (gapYb > 0) {
    out.push(vLine(midX, sel.y + sel.height, hov.y, 'gyb'), label(midX, (sel.y + sel.height + hov.y) / 2, `${Math.round(gapYb)}`, 'lgyb'))
  }
  if (gapYt > 0) {
    out.push(vLine(midX, hov.y + hov.height, sel.y, 'gyt'), label(midX, (sel.y + hov.y + hov.height) / 2, `${Math.round(gapYt)}`, 'lgyt'))
  }

  const overlapX = gapXr <= 0 && gapXl <= 0
  const overlapY = gapYb <= 0 && gapYt <= 0
  if (overlapX && overlapY) {
    const dl = hov.x - sel.x
    const dr = hov.x + hov.width - (sel.x + sel.width)
    const dt = hov.y - sel.y
    const db = hov.y + hov.height - (sel.y + sel.height)
    if (Math.abs(dl) > 0.5) out.push(hLine(Math.min(sel.x, hov.x), Math.max(sel.x, hov.x), hov.y + hov.height / 2, 'dl'), label((sel.x + hov.x) / 2, hov.y + hov.height / 2, `${Math.round(Math.abs(dl))}`, 'ldl'))
    if (Math.abs(dr) > 0.5) out.push(hLine(Math.min(sel.x + sel.width, hov.x + hov.width), Math.max(sel.x + sel.width, hov.x + hov.width), sel.y + sel.height / 2, 'dr'), label((sel.x + sel.width + hov.x + hov.width) / 2, sel.y + sel.height / 2, `${Math.round(Math.abs(dr))}`, 'ldr'))
    if (Math.abs(dt) > 0.5) out.push(vLine(hov.x + hov.width / 2, Math.min(sel.y, hov.y), Math.max(sel.y, hov.y), 'dt'), label(hov.x + hov.width / 2, (sel.y + hov.y) / 2, `${Math.round(Math.abs(dt))}`, 'ldt'))
    if (Math.abs(db) > 0.5) out.push(vLine(sel.x + sel.width / 2, Math.min(sel.y + sel.height, hov.y + hov.height), Math.max(sel.y + sel.height, hov.y + hov.height), 'db'), label(sel.x + sel.width / 2, (sel.y + sel.height + hov.y + hov.height) / 2, `${Math.round(Math.abs(db))}`, 'ldb'))
  }
  return (
    <svg style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 40 }}>
      <rect x={hov.x} y={hov.y} width={hov.width} height={hov.height} fill="none" stroke={color} strokeWidth={stroke} />
      {out}
    </svg>
  )
}

const PIN_STYLE = (x: number, y: number, scale: number): React.CSSProperties => ({
  position: 'absolute',
  left: x,
  top: y,
  transform: `translate(-50%, -100%) scale(${1 / scale})`,
  transformOrigin: 'bottom center',
  pointerEvents: 'auto',
  zIndex: 45,
})

function PixelGrid({ camera }: { camera: Camera }) {
  const viewport = useEditor((s) => s.viewport)
  const line = 1 / camera.scale
  const grid = `linear-gradient(to right, rgba(140,140,160,0.28) ${line}px, transparent ${line}px), linear-gradient(to bottom, rgba(140,140,160,0.28) ${line}px, transparent ${line}px)`
  return (
    <div
      className="pixel-grid"
      style={{
        position: 'absolute',
        left: -camera.x / camera.scale,
        top: -camera.y / camera.scale,
        width: viewport.width / camera.scale,
        height: viewport.height / camera.scale,
        backgroundImage: grid,
        backgroundSize: '1px 1px',
        pointerEvents: 'none',
        zIndex: 5,
      }}
    />
  )
}

function CommentPins({ pageId, scale }: { pageId: string; scale: number }) {
  const comments = useEditor((s) => s.doc.comments)?.filter((c) => c.pageId === pageId && !c.resolved) ?? []
  const [openId, setOpenId] = useState<string | null>(null)
  return (
    <>
      {comments.map((c, i) => (
        <div key={c.id} style={PIN_STYLE(c.x, c.y, scale)} onPointerDown={(e) => e.stopPropagation()}>
          <button className="comment-pin" onClick={() => setOpenId(openId === c.id ? null : c.id)} title={c.text}>
            {i + 1}
          </button>
          {openId === c.id && (
            <div className="comment-pop">
              <textarea
                autoFocus
                defaultValue={c.text}
                onBlur={(e) => updateComment(c.id, { text: e.currentTarget.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    ;(e.currentTarget as HTMLTextAreaElement).blur()
                    setOpenId(null)
                  }
                  if (e.key === 'Escape') setOpenId(null)
                }}
              />
              <div className="comment-actions">
                <button
                  onClick={() => {
                    updateComment(c.id, { resolved: true })
                    setOpenId(null)
                  }}
                >
                  Resolve
                </button>
                <button
                  onClick={() => {
                    deleteComment(c.id)
                    setOpenId(null)
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </>
  )
}

function CommentDraftPin({ draft, scale, onDone, onCancel }: { draft: { x: number; y: number }; scale: number; onDone: (text: string) => void; onCancel: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => ref.current?.focus(), [])
  const done = () => onDone(ref.current?.value ?? '')
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onCancel])
  return (
    <div style={PIN_STYLE(draft.x, draft.y, scale)} onPointerDown={(e) => e.stopPropagation()}>
      <span className="comment-pin is-draft">+</span>
      <div className="comment-pop">
        <textarea ref={ref} placeholder="Add a comment…" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); done() } }} onBlur={done} />
      </div>
    </div>
  )
}

function GradientOverlay({ handles, scale }: { handles: NonNullable<ReturnType<typeof gradientHandles>>; scale: number }) {
  const stroke = 1.5 / scale
  const dot = (p: { x: number; y: number }, key: string, filled = true) => (
    <g key={key}>
      <circle cx={p.x} cy={p.y} r={5 / scale} fill={filled ? '#fff' : '#2563eb'} stroke="#2563eb" strokeWidth={stroke} />
    </g>
  )
  const square = (p: { x: number; y: number }, key: string) => {
    const s = 5 / scale
    return <rect key={key} x={p.x - s} y={p.y - s} width={s * 2} height={s * 2} fill="#fff" stroke="#2563eb" strokeWidth={stroke} />
  }
  return (
    <svg className="gradient-overlay" style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}>
      {handles.shape === 'linear' && (
        <>
          <line x1={handles.start!.x} y1={handles.start!.y} x2={handles.end!.x} y2={handles.end!.y} stroke="#2563eb" strokeWidth={stroke} />
          {dot(handles.start!, 'start')}
          {dot(handles.end!, 'end')}
        </>
      )}
      {handles.shape === 'radial' && (
        <>
          <circle cx={handles.center.x} cy={handles.center.y} r={Math.hypot(handles.radius!.x - handles.center.x, handles.radius!.y - handles.center.y)} fill="none" stroke="#2563eb" strokeWidth={stroke} strokeDasharray={`${3 / scale} ${3 / scale}`} />
          <line x1={handles.center.x} y1={handles.center.y} x2={handles.radius!.x} y2={handles.radius!.y} stroke="#2563eb" strokeWidth={stroke} />
          {square(handles.center, 'center')}
          {dot(handles.radius!, 'radius')}
        </>
      )}
      {handles.shape === 'conic' && (
        <>
          <line x1={handles.center.x} y1={handles.center.y} x2={handles.start!.x} y2={handles.start!.y} stroke="#2563eb" strokeWidth={stroke} />
          {square(handles.center, 'center')}
          {dot(handles.start!, 'angle')}
        </>
      )}
    </svg>
  )
}

function PathOverlay({ node, rect, selected, scale }: { node: DocNode; rect: Rect; selected: number | null; scale: number }) {
  const points = node.points ?? []
  const stroke = 1 / scale
  const anchor = 5 / scale
  const d = vectorPathD(points, node.closed !== false)
  return (
    <svg className="pen-overlay" style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}>
      <path d={d} fill="none" stroke="#2563eb" strokeWidth={stroke} transform={`translate(${rect.x} ${rect.y})`} />
      {points.map((p, i) => (
        <g key={i}>
          {p.handleIn && (
            <>
              <line x1={rect.x + p.x} y1={rect.y + p.y} x2={rect.x + p.handleIn.x} y2={rect.y + p.handleIn.y} stroke="#2563eb" strokeWidth={stroke} opacity={0.6} />
              <circle cx={rect.x + p.handleIn.x} cy={rect.y + p.handleIn.y} r={3 / scale} fill="#fff" stroke="#2563eb" strokeWidth={stroke} />
            </>
          )}
          {p.handleOut && (
            <>
              <line x1={rect.x + p.x} y1={rect.y + p.y} x2={rect.x + p.handleOut.x} y2={rect.y + p.handleOut.y} stroke="#2563eb" strokeWidth={stroke} opacity={0.6} />
              <circle cx={rect.x + p.handleOut.x} cy={rect.y + p.handleOut.y} r={3 / scale} fill="#fff" stroke="#2563eb" strokeWidth={stroke} />
            </>
          )}
          <rect
            x={rect.x + p.x - anchor}
            y={rect.y + p.y - anchor}
            width={anchor * 2}
            height={anchor * 2}
            fill={i === selected ? '#2563eb' : '#fff'}
            stroke="#2563eb"
            strokeWidth={stroke}
          />
        </g>
      ))}
    </svg>
  )
}

function PenOverlay({ draft, hover, scale }: { draft: PenDraft; hover: { x: number; y: number } | null; scale: number }) {
  const points = draft.points
  const d = vectorPathD(points, draft.closed)
  const last = points[points.length - 1]
  const stroke = 1 / scale
  const anchor = 5 / scale
  return (
    <svg className="pen-overlay" style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}>
      {d && <path d={d} fill={draft.closed ? 'rgba(37,99,235,0.08)' : 'none'} stroke="#2563eb" strokeWidth={stroke} />}
      {hover && last && !draft.closed && (
        <line x1={last.x} y1={last.y} x2={hover.x} y2={hover.y} stroke="#2563eb" strokeWidth={stroke} strokeDasharray={`${3 / scale} ${3 / scale}`} />
      )}
      {points.map((p, i) => (
        <g key={i}>
          {p.handleIn && (
            <>
              <line x1={p.x} y1={p.y} x2={p.handleIn.x} y2={p.handleIn.y} stroke="#2563eb" strokeWidth={stroke} opacity={0.6} />
              <circle cx={p.handleIn.x} cy={p.handleIn.y} r={3 / scale} fill="#fff" stroke="#2563eb" strokeWidth={stroke} />
            </>
          )}
          {p.handleOut && (
            <>
              <line x1={p.x} y1={p.y} x2={p.handleOut.x} y2={p.handleOut.y} stroke="#2563eb" strokeWidth={stroke} opacity={0.6} />
              <circle cx={p.handleOut.x} cy={p.handleOut.y} r={3 / scale} fill="#fff" stroke="#2563eb" strokeWidth={stroke} />
            </>
          )}
          <rect x={p.x - anchor} y={p.y - anchor} width={anchor * 2} height={anchor * 2} fill={i === 0 ? '#2563eb' : '#fff'} stroke="#2563eb" strokeWidth={stroke} />
        </g>
      ))}
    </svg>
  )
}
