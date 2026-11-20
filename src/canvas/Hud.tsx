import { useLayoutEffect, useRef } from 'react'
import type { Rect } from '../model/types'
import { useEditor } from '../model/store'
import { useMeasuresVersion, measureMap } from './measure'

const ACCENT = '#4C94FB' // --color-blue-3: oklch(67% .17 258)
const ACCENT_SOFT = 'rgba(134, 185, 255, 0.5)' // --color-selection: oklch(78% .12 258 / .5)
const GUIDE = '#FF2D6F'
const HUD_FONT = '_Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif'

function crisp(value: number) {
  return Math.round(value) + 0.5
}

export function Hud() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const doc = useEditor((s) => s.doc)
  const ui = useEditor((s) => s.ui)
  const camera = useEditor((s) => s.camera)
  const guides = useEditor((s) => s.guides)
  useMeasuresVersion()

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    const parent = canvas?.parentElement
    if (!canvas || !parent) return
    const dpr = Math.max(window.devicePixelRatio || 1, 2)
    const width = parent.clientWidth
    const height = parent.clientHeight
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
    }
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    const toViewport = (rect: Rect): Rect => ({
      x: rect.x * camera.scale + camera.x,
      y: rect.y * camera.scale + camera.y,
      width: rect.width * camera.scale,
      height: rect.height * camera.scale,
    })

    const selection = new Set(ui.selection)

    // artboard labels render as DOM (ArtboardLabels) — interactive click/double-click rename

    // hover outline
    if (ui.hoverId && !selection.has(ui.hoverId) && ui.hoverId !== ui.editingId) {
      const rect = measureMap.get(ui.hoverId)
      if (rect) {
        const view = toViewport(rect)
        ctx.strokeStyle = ACCENT_SOFT
        ctx.lineWidth = 1
        ctx.strokeRect(crisp(view.x), crisp(view.y), Math.round(view.width), Math.round(view.height))
      }
    }

    // drop-target highlight (Paper: container glow while dragging a layer into it)
    if (ui.dropTargetId) {
      const rect = measureMap.get(ui.dropTargetId)
      if (rect) {
        const view = toViewport(rect)
        ctx.strokeStyle = ACCENT
        ctx.lineWidth = 2
        ctx.strokeRect(crisp(view.x) - 1, crisp(view.y) - 1, Math.round(view.width) + 2, Math.round(view.height) + 2)
      }
    }

    // selection outlines
    let bounds: Rect | null = null
    const selectedRects: Rect[] = []
    const selected = ui.editingId ? [] : ui.selection
    for (const id of selected) {
      const rect = measureMap.get(id)
      if (!rect) continue
      selectedRects.push(rect)
      const view = toViewport(rect)
      ctx.strokeStyle = ACCENT
      ctx.lineWidth = 1.5
      ctx.strokeRect(Math.round(view.x), Math.round(view.y), Math.round(view.width), Math.round(view.height))
    }
    if (selectedRects.length > 1) {
      const x1 = Math.min(...selectedRects.map((r) => r.x))
      const y1 = Math.min(...selectedRects.map((r) => r.y))
      const x2 = Math.max(...selectedRects.map((r) => r.x + r.width))
      const y2 = Math.max(...selectedRects.map((r) => r.y + r.height))
      bounds = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
    } else if (selectedRects.length === 1) {
      bounds = selectedRects[0]
    }

    // resize handles
    if (ui.selection.length === 1 && ui.editingId === null && bounds && !doc.nodes[ui.selection[0]]?.locked) {
      const view = toViewport(bounds)
      const points: Array<[number, number]> = [
        [view.x, view.y],
        [view.x + view.width / 2, view.y],
        [view.x + view.width, view.y],
        [view.x + view.width, view.y + view.height / 2],
        [view.x + view.width, view.y + view.height],
        [view.x + view.width / 2, view.y + view.height],
        [view.x, view.y + view.height],
        [view.x, view.y + view.height / 2],
      ]
      for (const [px, py] of points) {
        const cx = Math.round(px)
        const cy = Math.round(py)
        ctx.fillStyle = '#FFFFFF'
        ctx.strokeStyle = ACCENT
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.roundRect(cx - 4, cy - 4, 8, 8, 2)
        ctx.fill()
        ctx.stroke()
      }
    }

    // size chip
    if (bounds) {
      const label = `${Math.round(bounds.width)} × ${Math.round(bounds.height)}`
      ctx.font = `500 10px ${HUD_FONT}`
      const textWidth = ctx.measureText(label).width
      const chipWidth = Math.round(textWidth) + 14
      const chipHeight = 19
      const view = toViewport(bounds)
      let cx = view.x + view.width / 2 - chipWidth / 2
      let cy = view.y + view.height + 8
      if (cy + chipHeight > height - 8) cy = view.y - chipHeight - 8
      cx = Math.max(6, Math.min(width - chipWidth - 6, cx))
      ctx.fillStyle = 'rgba(0, 0, 0, 0.76)'
      ctx.beginPath()
      ctx.roundRect(Math.round(cx), Math.round(cy), chipWidth, chipHeight, 4)
      ctx.fill()
      ctx.fillStyle = '#FFFFFF'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, Math.round(cx) + 7, Math.round(cy) + chipHeight / 2 + 0.5)
      ctx.textBaseline = 'alphabetic'
    }

    // snapping guides
    if (guides.x.length || guides.y.length) {
      ctx.strokeStyle = GUIDE
      ctx.lineWidth = 1
      for (const gx of guides.x) {
        const x = crisp(gx * camera.scale + camera.x)
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
        ctx.stroke()
      }
      for (const gy of guides.y) {
        const y = crisp(gy * camera.scale + camera.y)
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()
      }
    }

    // marquee
    if (ui.marquee) {
      const view = toViewport(ui.marquee)
      ctx.fillStyle = 'rgba(77,138,228,0.08)'
      ctx.fillRect(view.x, view.y, view.width, view.height)
      ctx.strokeStyle = ACCENT
      ctx.lineWidth = 1
      ctx.strokeRect(crisp(view.x), crisp(view.y), Math.round(view.width), Math.round(view.height))
    }
  })

  return <canvas ref={canvasRef} className="hud" />
}
