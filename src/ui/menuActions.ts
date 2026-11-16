import {
  extractImageColors,
  setPageIcon,
  addPageDivider,
  addArtboard,
  addPage,
  alignSelection,
  applyShaderPreset,
  arrangeSelection,
  chooseImage,
  collapseAllLayers,
  copySelection,
  copyStyles,
  createFile,
  deletePage,
  deleteSelection,
  distributeSelection,
  duplicateFile,
  duplicatePage,
  duplicateSelection,
  frameSelection,
  wrapInFlex,
  movePage,
  switchPage,
  getState,
  hasClipboard,
  hasCopiedStyles,
  importFileJson,
  pasteSelection,
  pasteStyles,
  resizeToFill,
  resizeToFit,
  select,
  selectAll,
  selectChildren,
  selectInverse,
  selectParent,
  setPageThumbnail,
  setPref,
  setRenamingPage,
  startRenamingNode,
  startRenamingPage,
  swapFillAndStroke,
  toggleFileBrowser,
  toggleNudgeSettings,
  toggleSelectionLock,
  toggleSelectionVisibility,
  ungroupSelection,
  zoomByStep,
  zoomTo,
  zoomToFit,
  zoomToSelection,
} from '../model/store'
import { copySelectionAsJsx, copySelectionAsPng, copySelectionAsReactCss, copySelectionAsSvg, copySelectionAsTailwind, downloadSelectionPng, downloadSelectionSvg } from '../model/export'
import { SHADER_PRESETS } from '../model/fills'
import { copyNodeLink, copyPageLink, copyProjectLink } from '../model/navigation'
import { currentDocId } from '../model/docs'
import { formatColorFormats } from '../model/color'
import { openMenu, type MenuEntry } from './menuStore'

const SEP: MenuEntry = { type: 'separator' }

export function openNodeMenu(clientX: number, clientY: number, nodeId: string) {
  const state = getState()
  const target = state.doc.nodes[nodeId]
  if (!target) return
  if (!state.ui.selection.includes(nodeId)) select([nodeId])

  const { doc, ui } = getState()
  const node = doc.nodes[nodeId]
  if (!node) return
  const count = ui.selection.length
  const single = count === 1
  const items: MenuEntry[] = [
    { type: 'item', label: 'Copy', hotkey: '⌘C', onSelect: () => void copySelection() },
    { type: 'item', label: 'Cut', hotkey: '⌘X', onSelect: () => void copySelection(true) },
    { type: 'item', label: 'Paste', hotkey: '⌘V', disabled: !hasClipboard(), onSelect: () => void pasteSelection() },
    { type: 'item', label: 'Paste in place', hotkey: '⇧⌘V', disabled: !hasClipboard(), onSelect: () => void pasteSelection('over') },
    { type: 'item', label: 'Paste to replace', hotkey: '⇧⌘R', disabled: !hasClipboard(), onSelect: () => void pasteSelection('replace') },
    { type: 'item', label: 'Paste (without images)', disabled: !hasClipboard(), onSelect: () => void pasteSelection('noImages') },
    { type: 'item', label: count > 1 ? `Duplicate ${count} layers` : 'Duplicate', hotkey: '⌘D', onSelect: duplicateSelection },
    SEP,
    { type: 'item', label: 'Select parent', hotkey: 'Esc', disabled: !node.parentId, onSelect: selectParent },
    { type: 'item', label: 'Select children', hotkey: 'Enter', disabled: node.children.length === 0, onSelect: selectChildren },
    { type: 'item', label: 'Select inverse', onSelect: selectInverse },
    { type: 'item', label: 'Select all', hotkey: '⌘A', onSelect: selectAll },
    SEP,
    { type: 'item', label: 'Group selection', hotkey: '⌘G', disabled: count < 1, onSelect: () => frameSelection() },
    { type: 'item', label: 'Frame selection', hotkey: '⇧F', onSelect: frameSelection },
    { type: 'item', label: 'Wrap in flex', disabled: count < 2, onSelect: wrapInFlex },
    { type: 'item', label: 'Ungroup', hotkey: '⇧⌘G', disabled: node.kind !== 'frame' || node.parentId === null, onSelect: ungroupSelection },
    SEP,
  ]
  if (single) {
    items.push(SEP)
    items.push({ type: 'item', label: 'Copy link', hotkey: '⌘L', onSelect: () => copyNodeLink(nodeId) })
    items.push({ type: 'item', label: 'Rename', hotkey: '⌘R', onSelect: () => startRenamingNode(nodeId) })
    if (node.parentId === null) items.push({ type: 'item', label: 'Set as page thumbnail', onSelect: () => setPageThumbnail(nodeId) })
    if (node.kind === 'image' && node.imageSrc) {
      items.push({ type: 'item', label: 'Extract colors', onSelect: () => void extractImageColors(nodeId) })
    }
  }
  items.push(
    SEP,
    { type: 'item', label: 'Copy style', hotkey: '⌥⌘C', onSelect: copyStyles },
    { type: 'item', label: 'Paste style', hotkey: '⌥⌘V', disabled: !hasCopiedStyles(), onSelect: pasteStyles },
    SEP,
    { type: 'item', label: 'Bring to front', hotkey: ']', onSelect: () => arrangeSelection('front') },
    { type: 'item', label: 'Send to back', hotkey: '[', onSelect: () => arrangeSelection('back') },
    { type: 'item', label: 'Bring forward', hotkey: '⌘]', onSelect: () => arrangeSelection('forward') },
    { type: 'item', label: 'Send backward', hotkey: '⌘[', onSelect: () => arrangeSelection('backward') },
    SEP,
    { type: 'item', label: 'Align left', hotkey: '⌥A', disabled: count < 2, onSelect: () => alignSelection('left') },
    { type: 'item', label: 'Align right', hotkey: '⌥D', disabled: count < 2, onSelect: () => alignSelection('right') },
    { type: 'item', label: 'Align top', hotkey: '⌥W', disabled: count < 2, onSelect: () => alignSelection('top') },
    { type: 'item', label: 'Align bottom', hotkey: '⌥S', disabled: count < 2, onSelect: () => alignSelection('bottom') },
    { type: 'item', label: 'Align horizontal centers', hotkey: '⌥H', disabled: count < 2, onSelect: () => alignSelection('h-center') },
    { type: 'item', label: 'Align vertical centers', hotkey: '⌥V', disabled: count < 2, onSelect: () => alignSelection('v-center') },
    { type: 'item', label: 'Distribute horizontally', hotkey: '⌥⇧H', disabled: count < 3, onSelect: () => distributeSelection('x') },
    { type: 'item', label: 'Distribute vertically', hotkey: '⌥⇧V', disabled: count < 3, onSelect: () => distributeSelection('y') },
    SEP,
    { type: 'item', label: 'Swap fill and stroke', hotkey: '⇧X', onSelect: swapFillAndStroke },
    { type: 'item', label: 'Resize to fit', hotkey: '⌥⇧⌘R', onSelect: resizeToFit },
    { type: 'item', label: 'Fill container', hotkey: '⌥⇧⌘F', disabled: !node.parentId || !doc.nodes[node.parentId]?.layout, onSelect: resizeToFill },
    { type: 'item', label: 'Collapse all', hotkey: '⌥L', onSelect: collapseAllLayers },
    { type: 'item', label: 'Copy as JSX', onSelect: () => void copySelectionAsJsx() },
    { type: 'item', label: 'Copy as Tailwind', onSelect: () => void copySelectionAsTailwind() },
    { type: 'item', label: 'Copy as React CSS', onSelect: () => void copySelectionAsReactCss() },
    SEP,
    { type: 'item', label: node.visible ? 'Hide' : 'Show', hotkey: '⇧⌘H', onSelect: toggleSelectionVisibility },
    { type: 'item', label: node.locked ? 'Unlock' : 'Lock', hotkey: '⇧⌘L', onSelect: toggleSelectionLock },
    SEP,
    { type: 'item', label: 'Copy as SVG', onSelect: () => void copySelectionAsSvg() },
    { type: 'item', label: 'Copy as PNG', hotkey: '⇧⌘C', onSelect: () => void copySelectionAsPng() },
    { type: 'item', label: 'Export PNG…', onSelect: () => void downloadSelectionPng() },
    { type: 'item', label: 'Export SVG…', onSelect: downloadSelectionSvg },
    SEP,
    { type: 'item', label: count > 1 ? `Delete ${count} layers` : 'Delete', hotkey: '⌫', onSelect: deleteSelection },
  )
  openMenu(clientX, clientY, items)
}

export function openPageMenu(clientX: number, clientY: number, pageId: string) {
  const state = getState()
  const page = state.doc.pages.find((item) => item.id === pageId)
  if (!page) return
  openMenu(clientX, clientY, [
    { type: 'item', label: 'Copy link', hotkey: '⌘L', onSelect: () => copyPageLink(pageId) },
    { type: 'item', label: 'Rename page', onSelect: () => startRenamingPage(pageId) },
    {
      type: 'item',
      label: 'Page icon…',
      onSelect: () => {
        const icon = window.prompt('Page icon (emoji or short text)', page.icon ?? '')
        if (icon !== null) setPageIcon(pageId, icon.trim())
      },
    },
    { type: 'item', label: 'Add divider', onSelect: () => addPageDivider(pageId) },
    SEP,
    {
      type: 'item',
      label: 'New page',
      onSelect: () => {
        const id = addPage()
        startRenamingPage(id)
      },
    },
    {
      type: 'item',
      label: 'Duplicate page',
      onSelect: () => {
        const id = duplicatePage(pageId)
        if (id) switchPage(id)
      },
    },
    {
      type: 'item',
      label: 'Move page up',
      disabled: state.doc.pages.findIndex((p) => p.id === pageId) <= 0,
      onSelect: () => movePage(pageId, -1),
    },
    {
      type: 'item',
      label: 'Move page down',
      disabled: state.doc.pages.findIndex((p) => p.id === pageId) >= state.doc.pages.length - 1,
      onSelect: () => movePage(pageId, 1),
    },
    SEP,
    {
      type: 'item',
      label: 'Delete page',
      disabled: state.doc.pages.length <= 1,
      onSelect: () => {
        deletePage(pageId)
        setRenamingPage(null)
      },
    },
  ])
}

export function openProjectMenu(clientX: number, clientY: number) {
  const state = getState()
  const page = state.doc.pages.find((item) => item.id === state.ui.pageId)
  openMenu(clientX, clientY, [
    { type: 'item', label: 'Browse files…', hotkey: '⌘O', onSelect: () => toggleFileBrowser() },
    { type: 'item', label: 'New file', hotkey: '⌘N', onSelect: () => createFile() },
    { type: 'item', label: 'Duplicate this file', onSelect: () => duplicateFile(currentDocId()) },
    { type: 'item', label: 'Import JSON…', onSelect: () => void importFileJson() },
    SEP,
    { type: 'item', label: 'Copy project link', hotkey: '⌘L', onSelect: copyProjectLink },
    {
      type: 'item',
      label: 'Copy page link',
      disabled: !page,
      onSelect: () => {
        if (page) copyPageLink(page.id)
      },
    },
    SEP,
    { type: 'item', label: 'New artboard', hotkey: 'F', onSelect: () => addArtboard() },
    { type: 'item', label: 'Create image', hotkey: '⇧⌘K', onSelect: () => chooseImage() },
    SEP,
    { type: 'item', label: 'Select all', hotkey: '⌘A', onSelect: selectAll },
    SEP,
    { type: 'item', label: 'Zoom to fit', hotkey: '⇧1', onSelect: zoomToFit },
    { type: 'item', label: 'Zoom to 100%', hotkey: '⇧0', onSelect: () => zoomTo(1) },
    { type: 'item', label: 'Zoom to selection', hotkey: '⇧2', onSelect: zoomToSelection },
  ])
}

export function openCanvasMenu(clientX: number, clientY: number) {
  const { ui, doc } = getState()
  const page = doc.pages.find((item) => item.id === ui.pageId)
  openMenu(clientX, clientY, [
    { type: 'item', label: 'Paste', hotkey: '⌘V', disabled: !hasClipboard(), onSelect: () => void pasteSelection() },
    { type: 'item', label: 'Paste in place', hotkey: '⇧⌘V', disabled: !hasClipboard(), onSelect: () => void pasteSelection('over') },
    { type: 'item', label: 'Select all', hotkey: '⌘A', onSelect: selectAll },
    SEP,
    { type: 'item', label: 'New artboard', hotkey: 'F', onSelect: () => addArtboard() },
    { type: 'item', label: 'Create image', hotkey: '⇧⌘K', onSelect: () => chooseImage() },
    SEP,
    {
      type: 'item',
      label: 'Copy page link',
      hotkey: '⌘L',
      disabled: !page,
      onSelect: () => {
        if (page) copyPageLink(page.id)
      },
    },
    { type: 'item', label: 'Copy project link', onSelect: copyProjectLink },
    SEP,
    { type: 'item', label: 'Zoom to fit', hotkey: '⇧1', onSelect: zoomToFit },
    { type: 'item', label: 'Zoom to 100%', hotkey: '⇧0', onSelect: () => zoomTo(1) },
    { type: 'item', label: 'Zoom to selection', hotkey: '⇧2', onSelect: zoomToSelection },
    SEP,
    { type: 'item', label: 'Nudge amount…', onSelect: () => toggleNudgeSettings() },
  ])
}

export function openZoomMenu(clientX: number, clientY: number) {
  openMenu(clientX, clientY, [
    { type: 'item', label: 'Zoom in', hotkey: '+', onSelect: () => zoomByStep(1) },
    { type: 'item', label: 'Zoom out', hotkey: '-', onSelect: () => zoomByStep(-1) },
    SEP,
    { type: 'item', label: 'Zoom to 100%', hotkey: '⇧0', onSelect: () => zoomTo(1) },
    { type: 'item', label: 'Zoom to fit', hotkey: '⇧1', onSelect: zoomToFit },
    { type: 'item', label: 'Zoom to selection', hotkey: '⇧2', onSelect: zoomToSelection },
    SEP,
    ...(
      [
        ['wheelZooms', 'Zoom on scroll wheel'],
        ['invertZoom', 'Invert zoom direction'],
        ['rightClickPan', 'Pan on right-click drag'],
        ['zoomCentersSelection', 'Center selection when zooming'],
        ['deepSelection', 'Deep select'],
      ] as const
    ).map(([key, label]) => ({
      type: 'item' as const,
      label,
      checked: !!getState().ui.prefs?.[key],
      onSelect: () => setPref(key, !getState().ui.prefs?.[key]),
    })),
  ])
}

/** Paper `S`: shader presets — layered mesh gradients applied as fills. */
export function openShadersMenu(clientX: number, clientY: number) {
  openMenu(clientX, clientY, [
    ...SHADER_PRESETS.map((preset, index) => ({
      type: 'item' as const,
      label: preset.name,
      disabled: getState().ui.selection.length === 0,
      onSelect: () => applyShaderPreset(index),
    })),
  ])
}
/** Paper color-field formats: Copy RGB / HSL / OKLCH / OKLAB / Display P3. */
export function openColorFormatMenu(clientX: number, clientY: number, value: string) {
  openMenu(
    clientX,
    clientY,
    formatColorFormats(value).map((format) => ({
      type: 'item' as const,
      label: `Copy as ${format.label}`,
      onSelect: () => void navigator.clipboard.writeText(format.text),
    })),
  )
}
