import { useLayoutEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import type { Doc, DocNode, Fill } from '../model/types'
import { pageArtboards } from '../model/doc'
import { fillsToCss, fillsBlendMode, filterToCss } from '../model/fills'
import { ShaderFill } from './ShaderFill'
import { vectorPathD } from '../model/vector'
import { setEditing, updateNode, useEditor } from '../model/store'

function svgGradient(fill: Fill, id: string) {
  if (fill.type !== 'gradient') return null
  const stops = fill.stops ?? []
  const shape = fill.shape ?? 'linear'
  const center = fill.center ?? { x: 0.5, y: 0.5 }
  const stopsEls = stops.map((s, i) => (
    <stop key={i} offset={`${s.position * 100}%`} stopColor={s.color} />
  ))
  if (shape === 'linear') {
    const a = (((fill.angle ?? 180) - 90) * Math.PI) / 180
    const dx = Math.cos(a) * 0.5
    const dy = Math.sin(a) * 0.5
    return (
      <linearGradient id={id} x1={center.x - dx} y1={center.y - dy} x2={center.x + dx} y2={center.y + dy} gradientUnits="objectBoundingBox">
        {stopsEls}
      </linearGradient>
    )
  }
  if (shape === 'radial') {
    return (
      <radialGradient id={id} cx={center.x} cy={center.y} r={(fill.length ?? 1) * 0.5} gradientUnits="objectBoundingBox">
        {stopsEls}
      </radialGradient>
    )
  }
  const a = (((fill.angle ?? 0) - 90) * Math.PI) / 180
  return (
    <linearGradient
      id={id}
      x1={center.x}
      y1={center.y}
      x2={center.x + Math.cos(a) * 0.5}
      y2={center.y + Math.sin(a) * 0.5}
      gradientUnits="objectBoundingBox"
      gradientTransform={`rotate(${fill.angle ?? 0} ${center.x} ${center.y})`}
    >
      {stopsEls}
    </linearGradient>
  )
}

function primaryPaint(node: DocNode): { paint?: string; defs?: import('react').ReactNode; fillOpacity?: number } {
  const fills = node.fills?.filter((f) => f.isVisible) ?? []
  const top = fills[0] ?? (node.fill !== undefined ? { type: 'solid' as const, color: node.fill, isVisible: true } : undefined)
  if (!top) return {}
  const fillOpacity = 'opacity' in top && top.opacity !== undefined && top.opacity < 1 ? top.opacity : undefined
  if (top.type === 'solid') return { paint: top.color ?? '#dddddd', fillOpacity }
  if (top.type === 'gradient') {
    const gid = `grad-${node.id}`
    return { paint: `url(#${gid})`, defs: svgGradient(top, gid), fillOpacity }
  }
  return { paint: 'none' }
}

const BORDER_SIDES = ['top', 'right', 'bottom', 'left'] as const

/** Paper per-side borders: each side falls back to the uniform stroke; explicit sides may override width/color or be hidden with width:0. */
function sideBorders(node: DocNode): CSSProperties {
  if (!node.strokeSides || node.kind === 'ellipse' || node.kind === 'vector') return {}
  const baseW = node.strokeWidth ?? 1
  const style = !node.strokeDash?.length ? 'solid' : node.strokeDash[0] === 2 ? 'dotted' : 'dashed'
  const out: Record<string, string> = {}
  for (const side of BORDER_SIDES) {
    const prop = `border${side[0].toUpperCase()}${side.slice(1)}`
    const ss = node.strokeSides[side]
    const w = ss?.width ?? baseW
    const c = ss?.color ?? node.stroke
    out[prop] = w <= 0 || !c ? 'none' : `${w}px ${style} ${c}`
  }
  return out as CSSProperties
}

interface NodeViewProps {
  node: DocNode
  doc: Doc
  isArtboard?: boolean
  readOnly?: boolean
  flowDir?: 'row' | 'column'
}

export function NodeView({ node, doc, isArtboard, readOnly, flowDir }: NodeViewProps) {
  const editingId = useEditor((s) => s.ui.editingId)
  const editing = !readOnly && editingId === node.id
  const lodHide = useEditor((s) => lodThreshold(s.camera.scale))
  const guidesEnabled = useEditor((s) => s.ui.guidesEnabled)
  const textRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (node.kind !== 'text') return
    const el = textRef.current
    if (!el) return
    const value = node.text ?? ''
    if (editing) {
      if (el.textContent !== value) el.textContent = value
      if (document.activeElement !== el) {
        el.focus({ preventScroll: true })
        const range = document.createRange()
        range.selectNodeContents(el)
        range.collapse(false)
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
      }
    } else if (el.textContent !== value) {
      el.textContent = value
    }
  }, [editing, node.kind, node.text])

  // Paper auto-width text: the div hugs content; keep node.width/height synced for hit-testing.
  useLayoutEffect(() => {
    if (node.kind !== 'text' || (!node.widthAuto && !node.heightAuto)) return
    const el = textRef.current
    if (!el) return
    const w = Math.ceil(el.scrollWidth)
    const h = Math.ceil(el.scrollHeight)
    const patch: Partial<DocNode> = {}
    if (node.widthAuto && Math.abs(w - node.width) > 1) patch.width = w
    if (node.heightAuto && Math.abs(h - node.height) > 1) patch.height = h
    if (patch.width || patch.height) updateNode(node.id, patch, false)
  })

  if (!node.visible) return null

  // Paper LOD culling: below 40% zoom, elements under ~3 screen px are skipped.
  if (!isArtboard && lodHide > 0 && Math.max(node.width, node.height) < lodHide) return null

  const mainAlign = node.layout ? { start: 'flex-start', center: 'center', end: 'flex-end', 'space-between': 'space-between' }[node.layout.mainAlign] : undefined
  const crossAlign = node.layout ? ({ start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch', baseline: 'baseline', 'baseline-last': 'last baseline' } as const)[node.layout.crossAlign] : undefined

  // Flex item sizing: main axis = parent direction, cross axis = the other.
  const mainMode = flowDir ? (flowDir === 'row' ? node.sizing?.w : node.sizing?.h) : undefined
  const crossMode = flowDir ? (flowDir === 'row' ? node.sizing?.h : node.sizing?.w) : undefined
  let itemStyle: CSSProperties = {}
  if (flowDir) {
    if (node.margin) itemStyle = { ...itemStyle, margin: node.margin }
    if (node.alignSelf) itemStyle = { ...itemStyle, alignSelf: ({ start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' } as const)[node.alignSelf] }
    if (mainMode === 'fill') itemStyle = { ...itemStyle, flexGrow: 1, flexBasis: 0 }
    if (mainMode === 'hug') itemStyle = { ...itemStyle, [flowDir === 'row' ? 'width' : 'height']: 'fit-content' }
    if (crossMode === 'fill') itemStyle = { ...itemStyle, alignSelf: 'stretch', [flowDir === 'row' ? 'height' : 'width']: 'auto' }
    if (crossMode === 'hug') itemStyle = { ...itemStyle, [flowDir === 'row' ? 'height' : 'width']: 'fit-content' }
  }

  const style: CSSProperties = {
    // Paper `isFreeformChild`: absolutely placed inside a flex parent, removed from flow.
    position: node.absoluteInFlex && flowDir ? 'absolute' : flowDir ? 'relative' : 'absolute',
    left: node.absoluteInFlex && flowDir ? node.x : flowDir ? undefined : node.x,
    top: node.absoluteInFlex && flowDir ? node.y : flowDir ? undefined : node.y,
    display: node.layout ? 'flex' : undefined,
    flexDirection: node.layout?.direction === 'column' ? 'column' : node.layout ? 'row' : undefined,
    gap: node.layout?.gapToken
      ? Number.parseFloat(doc.tokens?.find((t) => t.id === node.layout?.gapToken)?.value ?? '') || node.layout.gap
      : node.layout?.gap,
    padding: node.layout
      ? node.layout.paddingSides
        ? `${node.layout.paddingSides.top ?? node.layout.paddingY ?? node.layout.padding}px ${node.layout.paddingSides.right ?? node.layout.paddingX ?? node.layout.padding}px ${node.layout.paddingSides.bottom ?? node.layout.paddingY ?? node.layout.padding}px ${node.layout.paddingSides.left ?? node.layout.paddingX ?? node.layout.padding}px`
        : `${node.layout.paddingY ?? node.layout.padding}px ${node.layout.paddingX ?? node.layout.padding}px`
      : undefined,
    justifyContent: mainAlign,
    alignItems: crossAlign,
    flexWrap: node.layout?.wrap ? 'wrap' : undefined,
    alignContent: node.layout?.alignContent ? ({ start: 'flex-start', center: 'center', end: 'flex-end', 'space-between': 'space-between', stretch: 'stretch' } as const)[node.layout.alignContent] : undefined,
    width: node.widthAuto ? 'max-content' : node.layout?.hugW ? 'fit-content' : node.width,
    height: node.layout?.hugH ? 'fit-content' : node.heightAuto ? 'auto' : node.height,
    opacity: node.opacity ?? 1,
    boxSizing: 'border-box',
    borderRadius:
      node.kind === 'ellipse'
        ? '50%'
        : node.radiusCorners
          ? node.radiusCorners.map((v) => `${v}px`).join(' ')
          : node.radius
            ? node.radius
            : undefined,
    background: fillsToCss(node),
    backgroundBlendMode: fillsBlendMode(node),
    border: !node.strokeSides && node.stroke && !node.strokeDash?.length ? `${node.strokeWidth ?? 1}px solid ${node.stroke}` : undefined,
    ...sideBorders(node),
    overflow: node.clip ? 'hidden' : 'visible',
    boxShadow: node.shadows?.length
      ? node.shadows.map((sh) => `${sh.inset ? 'inset ' : ''}${sh.x}px ${sh.y}px ${sh.blur}px ${sh.spread ?? 0}px ${sh.color}`).join(', ')
      : node.shadow
      ? `${node.shadow.inset ? 'inset ' : ''}${node.shadow.x}px ${node.shadow.y}px ${node.shadow.blur}px ${node.shadow.spread ?? 0}px ${node.shadow.color}`
      : undefined,
    filter: filterToCss(node.filter),
    backdropFilter: node.backdropBlur ? `blur(${node.backdropBlur}px)` : undefined,
    mixBlendMode: (node.blendMode ?? 'normal') as CSSProperties['mixBlendMode'],
    outline: node.outline ? `${node.outline.width}px solid ${node.outline.color}` : undefined,
    outlineOffset: node.outline?.offset,
    transform: node.rotation ? `rotate(${node.rotation}deg)` : undefined,
    transformOrigin: '50% 50%',
    ...itemStyle,
  }

  const common = {
    'data-node-id': node.id,
    'data-kind': node.kind,
  } as const

  if (node.kind === 'text') {
    return (
      <div
        {...common}
        className={`node node-text${editing ? ' is-editing' : ''}`}
        style={{
          ...style,
          background: undefined,
          border: undefined,
          overflow: 'visible',
          cursor: editing ? 'text' : undefined,
          pointerEvents: editing ? 'auto' : undefined,
          zIndex: editing ? 50 : undefined,
        }}
        onBlur={(event) => {
          if (!editing) return
          const value = event.currentTarget.innerText.replace(/\n$/, '')
          setEditing(null)
          if (value !== (node.text ?? '')) updateNode(node.id, { text: value })
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' || (event.key === 'Enter' && (event.metaKey || event.ctrlKey))) {
            event.preventDefault()
            event.stopPropagation()
            const active = document.activeElement
            if (active instanceof HTMLElement) active.blur()
          }
        }}
      >
        <div
          ref={textRef}
          contentEditable={editing}
          suppressContentEditableWarning
          spellCheck={false}
          onInput={() => {
            // Typing mutates the DOM outside React — sync auto-size dims so bounds/hit-testing stay true.
            if (!node.widthAuto && !node.heightAuto) return
            const el = textRef.current
            if (!el) return
            const w = Math.ceil(el.scrollWidth)
            const h = Math.ceil(el.scrollHeight)
            const patch: Partial<DocNode> = {}
            if (node.widthAuto && Math.abs(w - node.width) > 1) patch.width = w
            if (node.heightAuto && Math.abs(h - node.height) > 1) patch.height = h
            if (patch.width || patch.height) updateNode(node.id, patch, false)
          }}
          style={{
            fontFamily: node.fontFamily ?? 'Inter',
            fontSize: node.fontSize ?? 14,
            fontWeight: node.fontWeight ?? 400,
            fontStyle: node.fontStyle,
            fontFeatureSettings: node.fontFeatures?.length ? node.fontFeatures.map((f) => `"${f}"`).join(', ') : undefined,
            lineHeight: node.lineHeight ?? 1.4,
            letterSpacing: node.letterSpacing ? `${node.letterSpacing}px` : undefined,
            color: node.color ?? '#111111',
            textAlign: node.textAlign ?? 'left',
            textDecoration: node.textDecoration
              ? `${node.textDecoration} ${node.textDecorationStyle ?? 'solid'}${node.textDecorationThickness ? ` ${node.textDecorationThickness}px` : ''}`
              : undefined,
            textDecorationSkipInk: node.textDecorationSkipInk ? 'auto' : undefined,
            textDecorationColor: node.textDecorationColor,
            textTransform: node.textTransform,
            WebkitTextStroke: node.textStroke ? `${node.textStroke.width}px ${node.textStroke.color}` : undefined,
            whiteSpace: node.widthAuto ? 'pre' : 'pre-wrap',
            wordBreak: node.keepWords ? 'keep-all' : 'break-word',
            outline: 'none',
            minHeight: '1em',
            ...(node.lineClamp
              ? { display: '-webkit-box', WebkitBoxOrient: 'vertical' as const, WebkitLineClamp: node.lineClamp, overflow: 'hidden' }
              : {}),
            ...(node.textEllipsis && !node.lineClamp ? { whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' } : {}),
            ...(node.textWrap && node.textWrap !== 'wrap' ? ({ textWrap: node.textWrap } as React.CSSProperties) : {}),
            ...(node.textCase && node.textCase !== 'none' ? { textTransform: node.textCase } : {}),
          }}
        />
      </div>
    )
  }

  if (node.kind === 'vector') {
    const d = vectorPathD(node.points ?? [], node.closed !== false)
    const { paint, defs, fillOpacity } = primaryPaint(node)
    return (
      <div {...common} className="node node-vector" style={{ ...style, background: 'none', border: 'none', boxShadow: 'none', overflow: 'visible' }}>
        <svg width="100%" height="100%" viewBox={`0 0 ${node.width} ${node.height}`} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
          {defs && <defs>{defs}</defs>}
          <path d={d} fill={paint ?? 'none'} fillOpacity={fillOpacity} stroke={node.stroke} strokeWidth={node.strokeWidth ?? 1} strokeDasharray={node.strokeDash?.length ? node.strokeDash.join(' ') : undefined} strokeDashoffset={node.strokeDashOffset || undefined} strokeLinecap={node.strokeCap === 'butt' || !node.strokeCap ? undefined : node.strokeCap} strokeLinejoin={node.strokeJoin === 'miter' || !node.strokeJoin ? undefined : node.strokeJoin} vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
    )
  }

  if (node.kind === 'instance') {
    const comp = doc.nodes[node.instanceOf ?? '']
    const patched = comp ? { ...doc, nodes: { ...doc.nodes } } : doc
    for (const [nid, ov] of Object.entries(node.overrides ?? {})) {
      if (patched.nodes[nid]) patched.nodes[nid] = { ...patched.nodes[nid], ...ov }
    }
    const compAlign = comp?.layout
      ? {
          justifyContent: { start: 'flex-start', center: 'center', end: 'flex-end', 'space-between': 'space-between' }[comp.layout.mainAlign],
          alignItems: ({ start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch', baseline: 'baseline', 'baseline-last': 'last baseline' } as const)[comp.layout.crossAlign],
        }
      : {}
    const style2: CSSProperties = comp?.layout
      ? {
          ...style,
          display: 'flex',
          flexDirection: comp.layout.direction === 'column' ? 'column' : 'row',
          gap: comp.layout.gap,
          padding: comp.layout.padding,
          ...compAlign,
        }
      : style
    return (
      <div {...common} className="node node-instance" style={style2}>
        {comp?.children.map((childId) => {
          const child = patched.nodes[childId]
          return child ? <NodeView key={childId} node={child} doc={patched} readOnly={readOnly} flowDir={comp?.layout?.direction} /> : null
        })}
      </div>
    )
  }

  if (node.kind === 'image') {
    return (
      <div {...common} className="node node-image" style={style}>
        {node.imageSrc && (
          <img
            src={node.imageSrc}
            alt=""
            draggable={false}
            style={{ width: '100%', height: '100%', objectFit: node.imageFit ?? 'fill', pointerEvents: 'none' }}
          />
        )}
      </div>
    )
  }

  return (
    <div
      {...common}
      className={`node node-${node.kind}${isArtboard ? ' artboard' : ''}${node.component ? ' node-component' : ''}`}
      style={style}
    >
      {node.fills?.filter((f) => f.type === 'shader' && f.isVisible).map((f, i) => <ShaderFill key={i} fill={f} />)}
      {node.stroke && !!node.strokeDash?.length && !node.strokeSides && <StrokeOverlay node={node} />}
      {node.children.map((childId) => {
        const child = doc.nodes[childId]
        return child ? <NodeView key={childId} node={child} doc={doc} readOnly={readOnly} flowDir={node.layout?.direction} /> : null
      })}
      {guidesEnabled && node.layoutGuides?.length ? <LayoutGuidesOverlay node={node} /> : null}
    </div>
  )
}

/** Paper `cCe`: track interval computation for column/row layout guides. */
function trackPositions(axis: number, guide: { trackSize?: number; count?: number; gap?: number; align?: string; margin?: number }): [number, number][] {
  const size = guide.trackSize ?? 0
  const gap = guide.gap ?? 0
  let count = guide.count ?? -1
  const align = guide.align ?? 'stretch'
  const margin = guide.margin ?? 0
  let track = size
  let start = margin
  let dir = 1
  if (align === 'stretch') {
    if (count === -1) count = 1
    track = Math.max(0, (axis - margin * 2 - gap * (count - 1)) / count)
  } else if (align === 'center') {
    if (count === -1) {
      count = Math.max(2, Math.ceil(axis / (track + gap)))
      if (count % 2 === 1) count += 1
    }
    start = Math.floor((axis - (gap + count * (track + gap))) / 2) + gap
  } else if (align === 'start') {
    if (count === -1) count = Math.ceil((axis - margin) / (track + gap))
  } else if (align === 'end') {
    if (count === -1) count = Math.ceil((axis - margin) / (track + gap))
    start = axis - margin
    dir = -1
  }
  const out: [number, number][] = []
  for (let i = 0; i < count; i++) {
    let a = start + dir * i * (track + gap)
    let b = a + dir * track
    a = Math.min(Math.max(a, 0), axis)
    b = Math.min(Math.max(b, 0), axis)
    if (dir === -1) [a, b] = [b, a]
    out.push([Math.round(a), Math.round(b)])
  }
  return out
}

const GUIDE_COLOR = 'rgba(255,77,121,0.12)'

/** Paper layout guides: translucent track bands inside frames/artboards (Grid/Column/Row). */
function LayoutGuidesOverlay({ node }: { node: DocNode }) {
  const w = Math.max(node.width, 1)
  const h = Math.max(node.height, 1)
  const grid = node.layoutGuides?.filter((g) => g.visible !== false && g.type === 'grid') ?? []
  const tracks = node.layoutGuides?.filter((g) => g.visible !== false && g.type !== 'grid') ?? []
  const gridBg = grid
    .map((g) => {
      const s = Math.max(2, g.trackSize ?? 8)
      return `repeating-linear-gradient(0deg, ${GUIDE_COLOR} 0 1px, transparent 1px ${s}px), repeating-linear-gradient(90deg, ${GUIDE_COLOR} 0 1px, transparent 1px ${s}px)`
    })
    .join(',')
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 40, background: gridBg || undefined }}>
      {tracks.map((g) => {
        const vertical = g.type === 'column'
        const axis = vertical ? w : h
        return trackPositions(axis, g).map(([a, b], i) => (
          <div
            key={`${g.id}-${i}`}
            style={{
              position: 'absolute',
              left: vertical ? a : 0,
              width: vertical ? Math.max(0, b - a) : '100%',
              top: vertical ? 0 : a,
              height: vertical ? '100%' : Math.max(0, b - a),
              background: GUIDE_COLOR,
            }}
          />
        ))
      })}
    </div>
  )
}

/** Dashed/capped strokes for rect/ellipse/frame nodes (CSS borders can't do custom dash arrays). */
function StrokeOverlay({ node }: { node: DocNode }) {
  const w = Math.max(node.width, 1)
  const h = Math.max(node.height, 1)
  const half = (node.strokeWidth ?? 1) / 2
  const corners = node.radiusCorners
  const rx = node.radius ?? 0
  const shapeProps = {
    fill: 'none',
    stroke: node.stroke,
    strokeWidth: node.strokeWidth ?? 1,
    strokeDasharray: node.strokeDash?.join(' '),
    strokeDashoffset: node.strokeDashOffset || undefined,
    strokeLinecap: node.strokeCap === 'butt' || !node.strokeCap ? undefined : node.strokeCap,
    strokeLinejoin: node.strokeJoin === 'miter' || !node.strokeJoin ? undefined : node.strokeJoin,
    vectorEffect: 'non-scaling-stroke',
  } as const
  const pad = node.strokeWidth ?? 1
  return (
    <svg
      viewBox={`0 0 ${w + pad} ${h + pad}`}
      preserveAspectRatio="none"
      style={{ position: 'absolute', left: -half, top: -half, width: w + pad, height: h + pad, overflow: 'visible', pointerEvents: 'none' }}
    >
      {node.kind === 'ellipse' ? (
        <ellipse cx={half + w / 2} cy={half + h / 2} rx={Math.max(w / 2, 0.5)} ry={Math.max(h / 2, 0.5)} {...shapeProps} />
      ) : corners ? (
        <path
          d={`M ${half + corners[0]} ${half} H ${half + w - corners[1]} Q ${half + w} ${half} ${half + w} ${half + corners[1]} V ${half + h - corners[2]} Q ${half + w} ${half + h} ${half + w - corners[2]} ${half + h} H ${half + corners[3]} Q ${half} ${half + h} ${half} ${half + h - corners[3]} V ${half + corners[0]} Q ${half} ${half} ${half + corners[0]} ${half} Z`}
          {...shapeProps}
        />
      ) : (
        <rect x={half} y={half} width={w} height={h} rx={rx} {...shapeProps} />
      )}
    </svg>
  )
}

/** Paper's hideUnderWorldPx ladder: elements smaller than this in world px are culled. */
const LOD_STEPS: Array<[number, number]> = [
  [0.4, 7.5],
  [0.2, 15],
  [0.1, 30],
  [0.05, 60],
  [0.025, 120],
]

function lodThreshold(scale: number): number {
  let hide = 0
  for (const [s, px] of LOD_STEPS) if (scale < s) hide = px
  return hide
}

export function DocumentTree({ doc, pageId }: { doc: Doc; pageId: string }) {
  return (
    <>
      {pageArtboards(doc, pageId).map((id) => {
        const node = doc.nodes[id]
        return node ? <NodeView key={id} node={node} doc={doc} isArtboard /> : null
      })}
    </>
  )
}
