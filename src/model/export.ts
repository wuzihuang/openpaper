import type { Doc, DocNode, Rect } from './types'
import { fillsOf, fillsToCss, fillsBlendMode, filterToCss, svgStops } from './fills'

function shadowToCss(shadow: NonNullable<DocNode['shadow']>): string {
  return `${shadow.inset ? 'inset ' : ''}${shadow.x}px ${shadow.y}px ${shadow.blur}px ${shadow.spread ?? 0}px ${shadow.color}`
}
import { currentPage, documentRect, getState } from './store'
import { pageArtboards } from './doc'
import { copyText } from './links'
import { vectorPathD } from './vector'
import { topLevelOnly } from '../canvas/hitTest'
import { measureMap } from '../canvas/measure'
import { showToast } from '../ui/Toast'

/** Paper per-side borders → CSS borderTop/Right/Bottom/Left declarations. */
function sideBorderCss(node: DocNode): Record<string, string> {
  if (!node.strokeSides) return {}
  const baseW = node.strokeWidth ?? 1
  const style = node.strokeDash?.length ? 'dashed' : 'solid'
  const out: Record<string, string> = {}
  for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
    const ss = node.strokeSides[side.toLowerCase() as 'top']
    const w = ss?.width ?? baseW
    const c = ss?.color ?? node.stroke
    out[`border${side}`] = w <= 0 || !c ? 'none' : `${w}px ${style} ${c}`
  }
  return out
}

function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char] ?? char)
}

function exportIds() {
  const { doc, ui } = getState()
  return topLevelOnly(doc, ui.selection).filter((id) => doc.nodes[id]?.visible)
}

function boundsFor(ids: string[], docOverride?: Doc) {
  const doc = docOverride ?? getState().doc
  const rects = ids.map((id) => measureMap.get(id) ?? documentRect(doc, id)).filter((rect): rect is Rect => !!rect)
  if (rects.length === 0) return null
  const x = Math.min(...rects.map((rect) => rect.x))
  const y = Math.min(...rects.map((rect) => rect.y))
  const right = Math.max(...rects.map((rect) => rect.x + rect.width))
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height))
  return { x, y, width: right - x, height: bottom - y }
}

function makeSvg(ids: string[], docOverride?: Doc) {
  const doc = docOverride ?? getState().doc
  const bounds = boundsFor(ids, doc)
  if (!bounds) return null
  const defs: string[] = []

  const paint = (node: DocNode) => {
    const stroke = node.stroke
      ? ` stroke="${escapeXml(node.stroke)}" stroke-width="${node.strokeWidth ?? 1}"${node.strokeDash?.length ? ` stroke-dasharray="${node.strokeDash.join(' ')}"` : ''}${node.strokeDashOffset ? ` stroke-dashoffset="${node.strokeDashOffset}"` : ''}${node.strokeCap && node.strokeCap !== 'butt' ? ` stroke-linecap="${node.strokeCap}"` : ''}${node.strokeJoin && node.strokeJoin !== 'miter' ? ` stroke-linejoin="${node.strokeJoin}"` : ''}`
      : ''
    const shadow = node.shadow
      ? ` filter="drop-shadow(${node.shadow.x}px ${node.shadow.y}px ${node.shadow.blur}px ${escapeXml(node.shadow.color)})"`
      : ''
    return { stroke, shadow }
  }

  let gradientSeq = 0
  const fillAttr = (node: DocNode): string => {
    const fills = fillsOf(node).filter((fill) => fill.isVisible)
    const top = fills[0]
    if (!top) return 'transparent'
    if (top.type === 'solid') return top.color ?? '#dddddd'
    if (top.type === 'image') return 'transparent'
    if (top.type === 'pattern') return top.color ?? 'transparent'
    const stops = svgStops(top)
    const shape = top.shape ?? 'linear'
    const center = top.center ?? { x: 0.5, y: 0.5 }
    const id = `grad-${node.id.replace(/[^a-zA-Z0-9_-]/g, '')}-${gradientSeq++}`
    const stopEls = stops
      .map((stop) => `<stop offset="${stop.position * 100}%" stop-color="${escapeXml(stop.color)}"/>`)
      .join('')
    if (shape === 'linear') {
      const a = (((top.angle ?? 180) - 90) * Math.PI) / 180
      const dx = Math.cos(a) * 0.5
      const dy = Math.sin(a) * 0.5
      defs.push(
        `<linearGradient id="${id}" x1="${center.x - dx}" y1="${center.y - dy}" x2="${center.x + dx}" y2="${center.y + dy}" gradientUnits="objectBoundingBox">${stopEls}</linearGradient>`,
      )
    } else if (shape === 'radial') {
      defs.push(
        `<radialGradient id="${id}" cx="${center.x}" cy="${center.y}" r="${(top.length ?? 1) * 0.5}" gradientUnits="objectBoundingBox">${stopEls}</radialGradient>`,
      )
    } else {
      defs.push(
        `<linearGradient id="${id}" x1="${center.x}" y1="${center.y}" x2="${center.x + Math.cos((((top.angle ?? 0) - 90) * Math.PI) / 180) * 0.5}" y2="${center.y + Math.sin((((top.angle ?? 0) - 90) * Math.PI) / 180) * 0.5}" gradientUnits="objectBoundingBox">${stopEls}</linearGradient>`,
      )
    }
    return `url(#${id})`
  }

  const nodes = { ...doc.nodes }
  for (const inst of Object.values(nodes)) {
    if (inst.kind !== 'instance' || !inst.overrides) continue
    for (const [nid, ov] of Object.entries(inst.overrides)) {
      if (nodes[nid]) nodes[nid] = { ...nodes[nid], ...ov }
    }
  }

  const render = (id: string): string => {
    const node = nodes[id]
    const rect = measureMap.get(id) ?? documentRect(doc, id)
    if (!node || !rect || !node.visible) return ''
    const x = rect.x - bounds.x
    const y = rect.y - bounds.y
    const { stroke, shadow } = paint(node)
    const opacity = node.opacity !== undefined && node.opacity !== 1 ? ` opacity="${node.opacity}"` : ''
    const blend = node.blendMode && node.blendMode !== 'normal' ? ` style="mix-blend-mode:${escapeXml(node.blendMode)}"` : ''
    let clip = ''
    if (node.clip) {
      const clipId = `clip-${id.replace(/[^a-zA-Z0-9_-]/g, '')}`
      defs.push(`<clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${rect.width}" height="${rect.height}" rx="${node.kind === 'ellipse' ? rect.width / 2 : node.radius ?? 0}"/></clipPath>`)
      clip = ` clip-path="url(#${clipId})"`
    }
    let content = ''
    if (node.kind === 'ellipse') {
      content = `<ellipse cx="${x + rect.width / 2}" cy="${y + rect.height / 2}" rx="${rect.width / 2}" ry="${rect.height / 2}" fill="${escapeXml(fillAttr(node))}"${stroke}${shadow}/>`
    } else if (node.kind === 'vector') {
      const d = vectorPathD(node.points ?? [], node.closed !== false)
      // Points are stored in node-local coordinates; translate to export origin.
      content = `<g transform="translate(${x} ${y})"><path d="${escapeXml(d)}" fill="${escapeXml(fillAttr(node))}"${stroke}${shadow}/></g>`
    } else if (node.kind === 'text') {
      const fontSize = node.fontSize ?? 14
      const lineHeight = node.lineHeight ?? 1.4
      const align = node.textAlign ?? 'left'
      const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start'
      const textX = align === 'center' ? x + rect.width / 2 : align === 'right' ? x + rect.width : x
      const lines = (node.text ?? '').split('\n')
      const spans = lines.map((line, index) => `<tspan x="${textX}" y="${y + fontSize + index * fontSize * lineHeight}">${escapeXml(line)}</tspan>`).join('')
      content = `<text fill="${escapeXml(node.color ?? '#111111')}" font-family="${escapeXml(node.fontFamily ?? 'Inter')}" font-size="${fontSize}" font-weight="${node.fontWeight ?? 400}" letter-spacing="${node.letterSpacing ?? 0}" text-anchor="${anchor}"${shadow}>${spans}</text>`
    } else {
      content = `<rect x="${x}" y="${y}" width="${rect.width}" height="${rect.height}" rx="${node.radius ?? 0}" fill="${escapeXml(fillAttr(node))}"${stroke}${shadow}/>`
      if (node.kind === 'image' && node.imageSrc) {
        const fit = node.imageFit === 'cover' ? 'xMidYMid slice' : node.imageFit === 'contain' ? 'xMidYMid meet' : 'none'
        content += `<image href="${escapeXml(node.imageSrc)}" x="${x}" y="${y}" width="${rect.width}" height="${rect.height}" preserveAspectRatio="${fit}"${clip}/>`
      }
    }
    const childIds = node.kind === 'instance' ? (nodes[node.instanceOf ?? '']?.children ?? []) : node.children
    const children = childIds.map(render).join('')
    return `<g${opacity}${blend}${node.kind === 'image' ? '' : clip}>${content}${children}</g>`
  }

  const body = ids.map(render).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(bounds.width)}" height="${Math.ceil(bounds.height)}" viewBox="0 0 ${bounds.width} ${bounds.height}"><defs>${defs.join('')}</defs>${body}</svg>`
  return { svg, bounds }
}

/** Renders a file card thumbnail (Paper FileThumbnail): first page's artboards as SVG. */
export function docThumbnailSvg(doc: Doc): string | null {
  const page = doc.pages[0]
  const ids = (page?.artboards ?? []).filter((id) => doc.nodes[id]?.visible)
  if (ids.length === 0) return null
  return makeSvg(ids, doc)?.svg ?? null
}

function filename(extension: string) {
  const { doc, ui } = getState()
  const name = ui.selection.length === 1 ? doc.nodes[ui.selection[0]]?.name : 'selection'
  return `${(name || 'selection').replace(/[\\/:*?"<>|]/g, '-')}.${extension}`
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Serializes a node subtree to JSX with inline styles (Paper "copy as JSX"). */
function nodeToJsx(doc: { nodes: Record<string, DocNode> }, id: string, root = false): string {
  const node = doc.nodes[id]
  if (!node) return ''
  const style: Record<string, string | number> = {
    position: root ? 'relative' : 'absolute',
    left: root ? 0 : node.x,
    top: root ? 0 : node.y,
    width: node.width,
    height: node.height,
  }
  const css = (v: string | number | undefined) => (v === undefined ? undefined : v)
  if (node.opacity !== undefined && node.opacity !== 1) style.opacity = node.opacity
  const bg = fillsToCss(node)
  if (bg) style.background = bg
  const bgBlend = fillsBlendMode(node)
  if (bgBlend) style.backgroundBlendMode = bgBlend
  if (node.kind === 'ellipse') style.borderRadius = '50%'
  else if (node.radiusCorners) style.borderRadius = node.radiusCorners.map((v) => `${v}px`).join(' ')
  else if (node.radius) style.borderRadius = node.radius
  if (node.kind === 'ellipse') style.borderRadius = '50%'
  if (node.strokeSides) Object.assign(style, sideBorderCss(node))
  else if (node.stroke) style.border = `${node.strokeWidth ?? 1}px ${node.strokeDash?.length ? 'dashed' : 'solid'} ${node.stroke}`
  if (node.outline) {
    style.outline = `${node.outline.width}px solid ${node.outline.color}`
    if (node.outline.offset) style.outlineOffset = `${node.outline.offset}px`
  }
  if (node.textStroke) style.WebkitTextStroke = `${node.textStroke.width}px ${node.textStroke.color}`
  if (node.shadow) style.boxShadow = shadowToCss(node.shadow)
  const cssFilter = filterToCss(node.filter)
  if (cssFilter) style.filter = cssFilter
  if (node.backdropBlur) style.backdropFilter = `blur(${node.backdropBlur}px)`
  if (node.rotation) style.transform = `rotate(${node.rotation}deg)`
  if (node.layout) {
    style.display = 'flex'
    style.flexDirection = node.layout.direction
    style.gap = node.layout.gap
    style.padding = node.layout.padding
  }
  const styleStr = Object.entries(style)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${typeof v === 'number' ? v : `'${css(v)}'`}`)
    .join(', ')

  if (node.kind === 'text') {
    const textStyle = [
      node.fontFamily ? `fontFamily: '${node.fontFamily}'` : null,
      node.fontSize ? `fontSize: ${node.fontSize}` : null,
      node.fontWeight ? `fontWeight: ${node.fontWeight}` : null,
      node.fontStyle ? `fontStyle: '${node.fontStyle}'` : null,
      node.fontFeatures?.length ? `fontFeatureSettings: '${node.fontFeatures.map((f) => `"${f}"`).join(', ')}'` : null,
      node.color ? `color: '${node.color}'` : null,
      node.textAlign ? `textAlign: '${node.textAlign}'` : null,
      node.textDecoration ? `textDecoration: '${node.textDecoration}${node.textDecorationStyle && node.textDecorationStyle !== 'solid' ? ` ${node.textDecorationStyle}` : ''}'` : null,
      node.textTransform ? `textTransform: '${node.textTransform}'` : null,
    ].filter(Boolean).join(', ')
    return `<div style={{${styleStr}${textStyle ? `, ${textStyle}` : ''}}}>{'${(node.text ?? '').replace(/'/g, "\\'")}'}</div>`
  }
  if (node.kind === 'vector') {
    const d = vectorPathD(node.points ?? [], node.closed !== false)
    return `<svg width={${node.width}} height={${node.height}} viewBox="0 0 ${node.width} ${node.height}" style={{${styleStr}}}><path d="${d}" fill="${node.fill ?? 'none'}"${node.stroke ? ` stroke="${node.stroke}" strokeWidth={${node.strokeWidth ?? 1}}` : ''} /></svg>`
  }
  if (node.kind === 'image' && node.imageSrc) {
    return `<img src="${node.imageSrc}" alt="${node.name}" style={{${styleStr}, objectFit: '${node.imageFit ?? 'fill'}'}} />`
  }
  const children = node.children.map((childId) => nodeToJsx(doc, childId)).filter(Boolean).join('')
  return `<div style={{${styleStr}}}>${children}</div>`
}

export async function copySelectionAsJsx() {
  const { doc, ui } = getState()
  const ids = topLevelOnly(doc, ui.selection)
  if (ids.length === 0) {
    showToast('Select a layer to export')
    return
  }
  const jsx = ids.map((id) => nodeToJsx(doc, id, true)).join('')
  await copyText(jsx)
  showToast('JSX copied')
}

/** Paper "Copy React CSS": selection → JS style-object literal. */
export async function copySelectionAsReactCss() {
  const { doc, ui } = getState()
  const ids = topLevelOnly(doc, ui.selection)
  if (ids.length === 0) {
    showToast('Select a layer to export')
    return
  }
  const out = ids.map((id) => {
    const node = doc.nodes[id]
    if (!node) return ''
    const style: Record<string, string | number> = {
      width: node.width,
      height: node.height,
    }
    const bg = fillsToCss(node)
    if (bg) style.background = bg
    const bgBlend = fillsBlendMode(node)
    if (bgBlend) style.backgroundBlendMode = bgBlend
    if (node.opacity !== undefined && node.opacity !== 1) style.opacity = node.opacity
    if (node.kind === 'ellipse') style.borderRadius = '50%'
    else if (node.radiusCorners) style.borderRadius = node.radiusCorners.map((v) => `${v}px`).join(' ')
    else if (node.radius) style.borderRadius = node.radius
    if (node.strokeSides) Object.assign(style, sideBorderCss(node))
    else if (node.stroke) style.border = `${node.strokeWidth ?? 1}px ${node.strokeDash?.length ? 'dashed' : 'solid'} ${node.stroke}`
    if (node.outline) {
      style.outline = `${node.outline.width}px solid ${node.outline.color}`
      if (node.outline.offset) style.outlineOffset = `${node.outline.offset}px`
    }
    if (node.textStroke) style.WebkitTextStroke = `${node.textStroke.width}px ${node.textStroke.color}`
    if (node.shadow) style.boxShadow = shadowToCss(node.shadow)
    const cssFilter = filterToCss(node.filter)
    if (cssFilter) style.filter = cssFilter
    if (node.backdropBlur) style.backdropFilter = `blur(${node.backdropBlur}px)`
    if (node.rotation) style.transform = `rotate(${node.rotation}deg)`
    if (node.layout) {
      style.display = 'flex'
      style.flexDirection = node.layout.direction === 'column' ? 'column' : 'row'
      if (node.layout.gap) style.gap = node.layout.gap
      if (node.layout.padding) style.padding = node.layout.padding
    }
    if (node.kind === 'text') {
      if (node.fontFamily) style.fontFamily = node.fontFamily
      if (node.fontSize) style.fontSize = node.fontSize
      if (node.fontWeight) style.fontWeight = node.fontWeight
      if (node.fontStyle) style.fontStyle = node.fontStyle
      if (node.fontFeatures?.length) style.fontFeatureSettings = node.fontFeatures.map((f) => `"${f}"`).join(', ')
      if (node.lineHeight) style.lineHeight = node.lineHeight
      if (node.letterSpacing) style.letterSpacing = `${node.letterSpacing}px`
      if (node.color) style.color = node.color
      if (node.textAlign) style.textAlign = node.textAlign
      if (node.textDecoration) style.textDecoration = `${node.textDecoration}${node.textDecorationStyle && node.textDecorationStyle !== 'solid' ? ` ${node.textDecorationStyle}` : ''}${node.textDecorationThickness ? ` ${node.textDecorationThickness}px` : ''}`
      if (node.textDecorationSkipInk) style.textDecorationSkipInk = 'auto'
      if (node.textDecorationColor) style.textDecorationColor = node.textDecorationColor
      if (node.textTransform) style.textTransform = node.textTransform
      if (node.lineClamp) {
        style.display = '-webkit-box'
        style.WebkitBoxOrient = 'vertical'
        style.WebkitLineClamp = node.lineClamp
        style.overflow = 'hidden'
      }
    }
    const body = Object.entries(style)
      .map(([k, v]) => `  ${k}: ${typeof v === 'number' ? v : `'${v}'`}`)
      .join(',\n')
    return `{\n${body}\n}`
  }).filter(Boolean).join(',\n\n')
  await copyText(out)
  showToast('React CSS copied')
}

const tw = (cls: (string | false | null | undefined)[]) => cls.filter(Boolean).join(' ')

function nodeToTailwind(doc: { nodes: Record<string, DocNode> }, id: string, root = false): string {
  const node = doc.nodes[id]
  if (!node) return ''
  const solid = fillsOf(node).find((f) => f.isVisible && f.type === 'solid')?.color ?? (fillsOf(node).length === 0 ? node.fill : undefined)
  const cls = tw([
    root ? 'relative' : 'absolute',
    !root && `left-[${node.x}px]`,
    !root && `top-[${node.y}px]`,
    `w-[${node.width}px]`,
    `h-[${node.height}px]`,
    node.opacity !== undefined && node.opacity !== 1 && `opacity-[${node.opacity}]`,
    solid && `bg-[${solid}]`,
    fillsOf(node).some((f) => f.isVisible && f.type === 'gradient') && 'bg-gradient-to-b',
    node.kind === 'ellipse'
      ? 'rounded-full'
      : node.radiusCorners
        ? `rounded-[${node.radiusCorners.join('px_')}px]`
        : node.radius
          ? `rounded-[${node.radius}px]`
          : null,
    node.stroke && `border-[${node.strokeWidth ?? 1}px]`,
    node.stroke && `border-[${node.stroke}]`,
    node.shadow && `shadow-[${node.shadow.x}px_${node.shadow.y}px_${node.shadow.blur}px_${node.shadow.color}]`,
    node.layout && 'flex',
    node.layout && (node.layout.direction === 'row' ? 'flex-row' : 'flex-col'),
    node.layout && node.layout.gap ? `gap-[${node.layout.gap}px]` : null,
    node.layout && node.layout.padding ? `p-[${node.layout.padding}px]` : null,
    node.layout?.mainAlign === 'center' && 'justify-center',
    node.layout?.crossAlign === 'center' && 'items-center',
    node.kind === 'text' && node.fontSize != null && `text-[${node.fontSize}px]`,
    node.kind === 'text' && node.fontWeight != null && `font-[${node.fontWeight}]`,
    node.kind === 'text' && node.color && `text-[${node.color}]`,
    node.kind === 'text' && node.textAlign && node.textAlign !== 'left' && `text-${node.textAlign}`,
    node.kind === 'text' && node.fontFamily && `font-[${node.fontFamily.replace(/ /g, '_')}]`,
    node.clip && 'overflow-hidden',
  ])
  if (node.kind === 'text') return `<div className="${cls}">${node.text ?? ''}</div>`
  const children = node.children.map((childId) => nodeToTailwind(doc, childId)).filter(Boolean).join('')
  return `<div className="${cls}">${children}</div>`
}

export async function copySelectionAsTailwind() {
  const { doc, ui } = getState()
  const ids = topLevelOnly(doc, ui.selection)
  if (ids.length === 0) {
    showToast('Select a layer to export')
    return
  }
  const html = ids.map((id) => nodeToTailwind(doc, id, true)).join('')
  await copyText(html)
  showToast('Tailwind copied')
}

export function downloadSelectionSvg() {
  const result = makeSvg(exportIds())
  if (!result) {
    showToast('Select a layer to export')
    return false
  }
  download(new Blob([result.svg], { type: 'image/svg+xml;charset=utf-8' }), filename('svg'))
  showToast('SVG exported')
  return true
}

/** Paper "Copy as SVG": copies the SVG markup to the clipboard. */
export async function copySelectionAsSvg() {
  const result = makeSvg(exportIds())
  if (!result) {
    showToast('Select a layer to export')
    return false
  }
  await copyText(result.svg)
  showToast('SVG copied')
  return true
}

type RasterFormat = 'png' | 'jpg' | 'webp'

function rasterizeSvg(svg: string, w: number, h: number, format: RasterFormat, quality: number, resampling?: 'smooth' | 'pixelated'): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.ceil(w))
      canvas.height = Math.max(1, Math.ceil(h))
      const context = canvas.getContext('2d')
      if (!context) {
        URL.revokeObjectURL(url)
        resolve(null)
        return
      }
      if (format === 'jpg') {
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, canvas.width, canvas.height)
      }
      context.imageSmoothingEnabled = resampling !== 'pixelated'
      context.imageSmoothingQuality = 'high'
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url)
        resolve(blob)
      }, `image/${format === 'jpg' ? 'jpeg' : format}`, format === 'png' ? undefined : quality)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    image.src = url
  })
}

function renderRaster(scale: number, format: RasterFormat, quality = 1): Promise<Blob | null> {
  const result = makeSvg(exportIds())
  if (!result) return Promise.resolve(null)
  return rasterizeSvg(result.svg, result.bounds.width * scale, result.bounds.height * scale, format, quality)
}

export async function downloadSelectionPng(scale = 2) {
  const blob = await renderRaster(scale, 'png')
  if (!blob) {
    showToast('Select a layer to export')
    return false
  }
  download(blob, filename('png'))
  showToast('PNG exported')
  return true
}

/** Paper export formats: PNG / JPG / WebP with 0.5x–4x scale and quality. */
export async function downloadSelectionRaster(scale: number, format: RasterFormat, quality = 0.9) {
  const blob = await renderRaster(scale, format, quality)
  if (!blob) {
    showToast('Select a layer to export')
    return false
  }
  download(blob, filename(format === 'jpg' ? 'jpg' : format))
  showToast(`${format.toUpperCase()} exported`)
  return true
}

/** Minimal PDF container wrapping a JPEG image stream (Paper "Export as PDF"). */
function buildPdfFromJpeg(jpeg: Uint8Array, w: number, h: number): Blob {
  const enc = (s: string) => new TextEncoder().encode(s)
  const parts: Uint8Array[] = []
  const offsets: number[] = []
  let len = 0
  const push = (u: Uint8Array) => {
    parts.push(u)
    len += u.length
  }
  push(enc('%PDF-1.4\n'))
  const offsetsOf = (id: number) => {
    offsets[id] = len
    push(enc(`${id} 0 obj\n`))
  }
  const endObj = () => push(enc('\nendobj\n'))
  offsetsOf(1)
  push(enc('<< /Type /Catalog /Pages 2 0 R >>'))
  endObj()
  offsetsOf(2)
  push(enc('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'))
  endObj()
  offsetsOf(3)
  push(enc(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`))
  endObj()
  offsetsOf(4)
  push(enc(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`))
  push(jpeg)
  push(enc('\nendstream\nendobj\n'))
  const contents = enc(`q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`)
  offsetsOf(5)
  push(enc(`<< /Length ${contents.length} >>\nstream\n`))
  push(contents)
  push(enc('\nendstream\nendobj\n'))
  const xrefPos = len
  push(enc('xref\n0 6\n0000000000 65535 f \n'))
  for (let i = 1; i <= 5; i++) push(enc(`${offsets[i].toString().padStart(10, '0')} 00000 n \n`))
  push(enc(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`))
  return new Blob(parts.map((p) => p.buffer as ArrayBuffer), { type: 'application/pdf' })
}

/** Paper per-node exportMeta.entries: run all preset entries for one node. */
export async function exportNodeEntries(nodeId: string) {
  const node = getState().doc.nodes[nodeId]
  const entries = node?.exportMeta?.entries ?? []
  if (!node || entries.length === 0) {
    showToast('No export entries')
    return false
  }
  const result = makeSvg([nodeId])
  if (!result) {
    showToast('Cannot export this layer')
    return false
  }
  const base = (node.name || 'export').replace(/[\\/:*?"<>|]/g, '-')
  for (const entry of entries) {
    const suffix = entry.suffix ?? (entry.scale === 1 ? '' : `@${entry.scale}x`)
    const w = Math.max(1, Math.ceil(result.bounds.width * entry.scale))
    const h = Math.max(1, Math.ceil(result.bounds.height * entry.scale))
    if (entry.format === 'pdf') {
      const blob = await rasterizeSvg(result.svg, w, h, 'jpg', entry.quality ?? 0.92, entry.resampling)
      if (blob) download(buildPdfFromJpeg(new Uint8Array(await blob.arrayBuffer()), w, h), `${base}${suffix}.pdf`)
    } else {
      const blob = await rasterizeSvg(result.svg, w, h, entry.format, entry.quality ?? 0.92, entry.resampling)
      if (blob) download(blob, `${base}${suffix}.${entry.format === 'jpg' ? 'jpg' : entry.format}`)
    }
  }
  showToast(`Exported ${entries.length} entries`)
  return true
}

/** Paper "Export as PDF": rasterize the selection and embed it on a single PDF page. */
export async function downloadSelectionPdf(scale = 2) {
  const result = makeSvg(exportIds())
  if (!result) {
    showToast('Select a layer to export')
    return false
  }
  const blob = await renderRaster(scale, 'jpg', 0.92)
  if (!blob) {
    showToast('PDF export failed')
    return false
  }
  const jpeg = new Uint8Array(await blob.arrayBuffer())
  const w = Math.max(1, Math.ceil(result.bounds.width * scale))
  const h = Math.max(1, Math.ceil(result.bounds.height * scale))
  download(buildPdfFromJpeg(jpeg, w, h), filename('pdf'))
  showToast('PDF exported')
  return true
}

/** Paper "Export combined PDF": one PDF page per artboard of the current page. */
export async function exportCombinedPdf(scale = 2) {
  const { doc } = getState()
  const page = currentPage()
  const boards = page ? pageArtboards(doc, page.id).filter((id) => doc.nodes[id]?.visible) : []
  if (boards.length === 0) {
    showToast('No artboards on this page')
    return false
  }
  const pages: { jpeg: Uint8Array; w: number; h: number }[] = []
  for (const id of boards) {
    const result = makeSvg([id])
    if (!result) continue
    const w = Math.max(1, Math.ceil(result.bounds.width * scale))
    const h = Math.max(1, Math.ceil(result.bounds.height * scale))
    const blob = await rasterizeSvg(result.svg, w, h, 'jpg', 0.92)
    if (blob) pages.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), w, h })
  }
  if (pages.length === 0) {
    showToast('PDF export failed')
    return false
  }
  download(buildMultiPagePdf(pages), filename('pdf'))
  showToast(`Exported ${pages.length}-page PDF`)
  return true
}

/** Minimal multi-page PDF container: one DCTDecode image per page. */
function buildMultiPagePdf(pages: { jpeg: Uint8Array; w: number; h: number }[]): Blob {
  const enc = (s: string) => new TextEncoder().encode(s)
  const parts: Uint8Array[] = []
  const offsets: number[] = []
  let len = 0
  const push = (u: Uint8Array) => {
    parts.push(u)
    len += u.length
  }
  push(enc('%PDF-1.4\n'))
  const obj = (id: number) => {
    offsets[id] = len
    push(enc(`${id} 0 obj\n`))
  }
  const endObj = () => push(enc('\nendobj\n'))
  obj(1)
  push(enc('<< /Type /Catalog /Pages 2 0 R >>'))
  endObj()
  obj(2)
  push(enc(`<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] /Count ${pages.length} >>`))
  endObj()
  pages.forEach(({ jpeg, w, h }, i) => {
    const pageId = 3 + i * 3
    const imgId = pageId + 1
    const contentsId = pageId + 2
    obj(pageId)
    push(enc(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im${i} ${imgId} 0 R >> >> /Contents ${contentsId} 0 R >>`))
    endObj()
    obj(imgId)
    push(enc(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`))
    push(jpeg)
    push(enc('\nendstream\nendobj\n'))
    const contents = enc(`q ${w} 0 0 ${h} 0 0 cm /Im${i} Do Q`)
    obj(contentsId)
    push(enc(`<< /Length ${contents.length} >>\nstream\n`))
    push(contents)
    push(enc('\nendstream\nendobj\n'))
  })
  const count = 3 + pages.length * 3
  const xrefPos = len
  push(enc(`xref\n0 ${count}\n0000000000 65535 f \n`))
  for (let i = 1; i < count; i++) push(enc(`${offsets[i].toString().padStart(10, '0')} 00000 n \n`))
  push(enc(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`))
  return new Blob(parts.map((p) => p.buffer as ArrayBuffer), { type: 'application/pdf' })
}

export async function copySelectionAsPng() {
  const blob = await renderRaster(2, 'png')
  if (!blob) {
    showToast('Select a layer to copy')
    return false
  }
  try {
    if (!navigator.clipboard || typeof ClipboardItem === 'undefined') throw new Error('unsupported')
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    showToast('PNG copied')
    return true
  } catch {
    download(blob, filename('png'))
    showToast('Clipboard blocked — downloaded PNG instead')
    return false
  }
}

/** Paper Video export — records a node's WebGL shader fill to WebM via
 * canvas.captureStream + MediaRecorder (animated shader fills only). */
export async function downloadShaderVideo(nodeId: string, seconds = 3) {
  const host = document.querySelector(`[data-node-id="${nodeId}"]`)
  const canvas = host?.querySelector('canvas.shader-fill') as HTMLCanvasElement | null
  if (!canvas || !('captureStream' in canvas) || typeof MediaRecorder === 'undefined') {
    showToast('Video export needs an animated shader fill')
    return
  }
  const stream = (canvas as HTMLCanvasElement).captureStream(30)
  const mime = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm'
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 })
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  const done = new Promise<void>((resolve) => (rec.onstop = () => resolve()))
  rec.start(250)
  showToast(`Recording ${seconds}s video…`)
  await new Promise((r) => setTimeout(r, seconds * 1000))
  rec.stop()
  await done
  const blob = new Blob(chunks, { type: mime })
  download(blob, `${filename('webm').replace(/\.\w+$/, '')}.${mime === 'video/mp4' ? 'mp4' : 'webm'}`)
  showToast('Video exported')
}
