import { useEffect, useRef, useState } from 'react'
import type { DocNode, ExportEntry, Fill, FlexLayout, GradientShape, LayoutGuide, NodeFilter, SizingMode } from '../model/types'
import { defaultStops, fillsOf, fillToCss, gradientFill, imageFill, solidFill } from '../model/fills'
import { SHADERS, presetFill, presetMatch, shaderDef } from '../model/shaders'
import { chooseImage, deleteComment, moveNodes, replyToComment, scaleSelection, selectionBounds, updateComment, updateNode, useEditor } from '../model/store'
import { focusComment } from '../model/store'
import { copySelectionAsPng, downloadSelectionPdf, downloadSelectionRaster, downloadSelectionSvg, downloadShaderVideo, exportCombinedPdf, exportNodeEntries } from '../model/export'
import { countPageNodes, pageArtboards } from '../model/doc'
import { openColorFormatMenu, openZoomMenu } from './menuActions'
import { copyProjectLink } from '../model/navigation'
import { Icon } from './Icon'
import { PanelResize } from './PanelResize'

function NumberField({
  label,
  value,
  disabled,
  placeholder,
  decimals = 0,
  onCommit,
}: {
  label: string
  value: number
  disabled?: boolean
  placeholder?: string
  decimals?: number
  onCommit: (value: number) => void
}) {
  const format = (next: number) => !Number.isFinite(next) ? '' : decimals > 0 ? next.toFixed(decimals) : String(Math.round(next))
  const [draft, setDraft] = useState(format(value))
  useEffect(() => {
    setDraft(format(value))
  }, [value, decimals])
  // Paper scrub: drag the field label sideways to scrub the number.
  const scrubRef = useRef<{ x: number; start: number; value: number } | null>(null)
  const onScrubDown = (event: React.PointerEvent) => {
    if (disabled) return
    event.preventDefault()
    scrubRef.current = { x: event.clientX, start: event.clientX, value }
    const el = event.currentTarget as HTMLElement
    el.setPointerCapture(event.pointerId)
    const onMove = (e: PointerEvent) => {
      const s = scrubRef.current
      if (!s) return
      const step = e.shiftKey ? 10 : 1
      const next = s.value + (e.clientX - s.x) * step * (decimals > 0 ? 0.1 : 1)
      s.x = e.clientX
      s.value = next
      setDraft(format(next))
    }
    const onUp = (e: PointerEvent) => {
      const s = scrubRef.current
      scrubRef.current = null
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      if (s && Math.abs(e.clientX - s.start) > 2) onCommit(decimals > 0 ? Math.round(s.value * 10 ** decimals) / 10 ** decimals : Math.round(s.value))
      else setDraft(format(value))
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
  }
  return (
    <label className="chip-field">
      <span className="chip-label" onPointerDown={onScrubDown} style={{ cursor: 'url(/cursors/cursor-scrubbing.webp) 16 16, ew-resize' }}>
        {label}
      </span>
      <input
        className="chip-input"
        value={disabled ? '' : draft}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (disabled) return
          const parsed = Number.parseFloat(draft)
          if (Number.isFinite(parsed)) onCommit(parsed)
          else setDraft(format(value))
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
      />
    </label>
  )
}

function TextField({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <label className="chip-field wide">
      <input
        className="chip-input"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft !== value) onCommit(draft)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
      />
    </label>
  )
}

function ColorField({
  label,
  value,
  fallback,
  onCommit,
}: {
  label: string
  value: string
  fallback: string
  onCommit: (value: string) => void
}) {
  const hex = /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback
  const swatch = value && value !== 'transparent' ? value : 'transparent'
  return (
    <label className="chip-field wide">
      <span className="chip-label">{label}</span>
      <span
        className="swatch"
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
          openColorFormatMenu(event.clientX, event.clientY, value)
        }}
      >
        <span className="swatch-fill" style={{ background: swatch }} />
        <input type="color" value={hex} onChange={(event) => onCommit(event.target.value)} />
      </span>
      <input
        className="chip-input mono"
        value={value}
        onChange={(event) => onCommit(event.target.value)}
        spellCheck={false}
      />
    </label>
  )
}

/** Paper multi-select transform: edit combined bounds — X/Y shift, W/H scale about top-left. */
function MultiTransform({ ids }: { ids: string[] }) {
  useEditor((s) => s.doc)
  const bounds = selectionBounds(ids)
  if (!bounds) return null
  const commitScale = (axis: 'w' | 'h', value: number) => {
    const cur = axis === 'w' ? bounds.width : bounds.height
    if (cur <= 0) return
    const f = Math.max(0.01, value / cur)
    scaleSelection(axis === 'w' ? f : 1, axis === 'h' ? f : 1, bounds.x, bounds.y)
  }
  return (
    <Section title="Position & size">
      <NumberField label="X" value={Math.round(bounds.x)} onCommit={(v) => moveNodes(ids, v - bounds.x, 0, true)} />
      <NumberField label="Y" value={Math.round(bounds.y)} onCommit={(v) => moveNodes(ids, 0, v - bounds.y, true)} />
      <NumberField label="W" value={Math.round(bounds.width)} onCommit={(v) => commitScale('w', v)} />
      <NumberField label="H" value={Math.round(bounds.height)} onCommit={(v) => commitScale('h', v)} />
    </Section>
  )
}

/** Paper "Selection colors": distinct paints in the selection, editable in bulk. */
function SelectionColors({ ids }: { ids: string[] }) {
  const doc = useEditor((s) => s.doc)
  const colors = useRef<string[]>([])
  // Collect every solid paint used by the selection's subtrees.
  const found = new Map<string, number>()
  const walk = (id: string) => {
    const node = doc.nodes[id]
    if (!node) return
    const paints = [node.fill, node.stroke, node.kind === 'text' ? node.color : undefined]
    for (const fill of node.fills ?? []) if (fill.type === 'solid' && fill.isVisible) paints.push(fill.color)
    for (const paint of paints) {
      if (paint && paint !== 'transparent') found.set(paint, (found.get(paint) ?? 0) + 1)
    }
    for (const child of node.children) walk(child)
  }
  for (const id of ids) walk(id)
  colors.current = [...found.keys()]
  if (colors.current.length === 0) return null
  const recolor = (from: string, to: string) => {
    for (const id of ids) {
      const visit = (nid: string) => {
        const node = doc.nodes[nid]
        if (!node) return
        const patch: Partial<DocNode> = {}
        if (node.fill === from) patch.fill = to
        if (node.stroke === from) patch.stroke = to
        if (node.kind === 'text' && node.color === from) patch.color = to
        if (node.fills?.some((f) => f.type === 'solid' && f.color === from)) {
          patch.fills = node.fills.map((f) => (f.type === 'solid' && f.color === from ? { ...f, color: to } : f))
        }
        if (Object.keys(patch).length) updateNode(nid, patch)
        node.children.forEach(visit)
      }
      visit(id)
    }
  }
  return (
    <Section title="Selection colors">
      {colors.current.map((color) => (
        <ColorField key={color} label={`${found.get(color)} layers`} value={color} fallback="#000000" onCommit={(v) => recolor(color, v)} />
      ))}
    </Section>
  )
}

const OT_FEATURES: [string, string][] = [
  ['liga', 'Ligatures'],
  ['calt', 'Contextual alternates'],
  ['case', 'Caps spacing'],
  ['frac', 'Fractions'],
  ['numr', 'Numerator'],
  ['dnom', 'Denominator'],
  ['ordn', 'Ordinals'],
  ['sups', 'Superscript'],
  ['subs', 'Subscript'],
  ['sinf', 'Scientific inferiors'],
  ['zero', 'Slashed zero'],
]

/** OpenType feature toggles — writes font-feature-settings tags onto the text node. */
function OpenTypeSection({ node, patch }: { node: DocNode; patch: (values: Partial<DocNode>) => void }) {
  const active = new Set(node.fontFeatures ?? [])
  const toggle = (tag: string) => {
    const next = new Set(active)
    if (next.has(tag)) next.delete(tag)
    else next.add(tag)
    patch({ fontFeatures: next.size ? [...next] : undefined })
  }
  return (
    <div className="chip-field wide" style={{ flexDirection: 'column', alignItems: 'stretch', height: 'auto', padding: 6, gap: 4 }}>
      <span className="chip-label">OpenType</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {OT_FEATURES.map(([tag, label]) => (
          <button
            key={tag}
            data-active={active.has(tag)}
            title={tag}
            onClick={() => toggle(tag)}
            style={{ fontSize: 10, padding: '2px 6px' }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

function activeFilter(node: DocNode): string {
  const f = node.filter
  if (!f) return ''
  if (f.blur) return 'blur'
  if (f.grayscale) return 'grayscale'
  if (f.invert) return 'invert'
  if (f.sepia) return 'sepia'
  if (f.saturate != null && f.saturate !== 1) return 'saturate'
  if (f.contrast != null && f.contrast !== 1) return 'contrast'
  return ''
}

function filterPreset(name: string): NodeFilter | undefined {
  switch (name) {
    case 'blur': return { blur: 8 }
    case 'grayscale': return { grayscale: 1 }
    case 'invert': return { invert: 1 }
    case 'sepia': return { sepia: 1 }
    case 'saturate': return { saturate: 1.6 }
    case 'contrast': return { contrast: 1.3 }
    default: return undefined
  }
}

/** Paper pin grid: 3×3 constraint control — edge click pins that side; opposite edge → stretch; center → both centered. */
function PinGrid({
  x,
  y,
  onChange,
}: {
  x: NonNullable<DocNode['constraintsX']>
  y: NonNullable<DocNode['constraintsY']>
  onChange: (x: DocNode['constraintsX'], y: DocNode['constraintsY']) => void
}) {
  const active = (col: number, row: number) => {
    const xOn = (col === 0 && (x === 'left' || x === 'stretch')) || (col === 1 && x === 'center') || (col === 2 && (x === 'right' || x === 'stretch'))
    const yOn = (row === 0 && (y === 'top' || y === 'stretch')) || (row === 1 && y === 'center') || (row === 2 && (y === 'bottom' || y === 'stretch'))
    return xOn && yOn
  }
  const edgeX = (v: 'left' | 'right') => onChange(x === v ? 'left' : x === (v === 'left' ? 'right' : 'left') ? 'stretch' : v, y)
  const edgeY = (v: 'top' | 'bottom') => onChange(x, y === v ? 'top' : y === (v === 'top' ? 'bottom' : 'top') ? 'stretch' : v)
  const cells: { col: number; row: number; title: string; onClick: () => void }[] = [
    { col: 0, row: 0, title: 'Top left', onClick: () => onChange('left', 'top') },
    { col: 1, row: 0, title: 'Pin top', onClick: () => edgeY('top') },
    { col: 2, row: 0, title: 'Top right', onClick: () => onChange('right', 'top') },
    { col: 0, row: 1, title: 'Pin left', onClick: () => edgeX('left') },
    { col: 1, row: 1, title: 'Pin center', onClick: () => onChange('center', 'center') },
    { col: 2, row: 1, title: 'Pin right', onClick: () => edgeX('right') },
    { col: 0, row: 2, title: 'Bottom left', onClick: () => onChange('left', 'bottom') },
    { col: 1, row: 2, title: 'Pin bottom', onClick: () => edgeY('bottom') },
    { col: 2, row: 2, title: 'Bottom right', onClick: () => onChange('right', 'bottom') },
  ]
  return (
    <div className="pin-grid" role="group" aria-label="Constraints">
      {cells.map((cell) => (
        <button
          key={`${cell.col}-${cell.row}`}
          type="button"
          className={`pin-cell${active(cell.col, cell.row) ? ' is-active' : ''}`}
          title={cell.title}
          onClick={cell.onClick}
        >
          <span className="pin-mark" />
        </button>
      ))}
    </div>
  )
}

/** Paper layout guides on frames/artboards: Grid/Column/Row track editors. */
function GuidesSection({ node, patch }: { node: DocNode; patch: (values: Partial<DocNode>) => void }) {
  const guides = node.layoutGuides ?? []
  const setGuides = (layoutGuides: LayoutGuide[]) => patch({ layoutGuides })
  const update = (id: string, p: Partial<LayoutGuide>) => setGuides(guides.map((g) => (g.id === id ? { ...g, ...p } : g)))
  const add = (type: LayoutGuide['type']) =>
    setGuides([
      ...guides,
      {
        id: `g_${Math.random().toString(36).slice(2, 8)}`,
        type,
        visible: true,
        trackSize: type === 'grid' ? 8 : 80,
        count: type === 'grid' ? undefined : -1,
        gap: type === 'grid' ? undefined : 20,
        align: 'stretch',
        margin: type === 'grid' ? undefined : 0,
      },
    ])
  return (
    <Section title="Guides">
      {guides.map((guide) => (
        <div key={guide.id} style={{ display: 'contents' }}>
          <div className="guide-row">
            <SelectField
              label="Type"
              value={guide.type}
              options={[
                ['grid', 'Grid'],
                ['column', 'Vertical'],
                ['row', 'Horizontal'],
              ]}
              onChange={(v) => update(guide.id, { type: v as LayoutGuide['type'] })}
            />
            <label className="chip-field">
              <input type="checkbox" checked={guide.visible !== false} onChange={(e) => update(guide.id, { visible: e.target.checked })} />
              <span className="chip-label">Show</span>
            </label>
            <button className="inspector-action" onClick={() => setGuides(guides.filter((g) => g.id !== guide.id))}>
              <Icon name="trash" size={12} />
            </button>
          </div>
          <NumberField label="Track" value={guide.trackSize ?? 0} onCommit={(v) => update(guide.id, { trackSize: Math.max(1, v) })} />
          {guide.type !== 'grid' && (
            <>
              <NumberField label="Count" value={guide.count ?? -1} onCommit={(v) => update(guide.id, { count: Math.max(-1, Math.round(v)) })} />
              <NumberField label="Gap" value={guide.gap ?? 0} onCommit={(v) => update(guide.id, { gap: Math.max(0, v) })} />
              <NumberField label="Padding" value={guide.margin ?? 0} onCommit={(v) => update(guide.id, { margin: Math.max(0, v) })} />
              <SelectField
                label="Align"
                value={guide.align ?? 'stretch'}
                options={[['stretch', 'Stretch'], ['start', 'Start'], ['center', 'Center'], ['end', 'End']]}
                onChange={(v) => update(guide.id, { align: v as LayoutGuide['align'] })}
              />
            </>
          )}
        </div>
      ))}
      <div className="guide-add">
        <button className="inspector-action" onClick={() => add('grid')}><Icon name="plus" size={12} />Grid</button>
        <button className="inspector-action" onClick={() => add('column')}><Icon name="plus" size={12} />Column</button>
        <button className="inspector-action" onClick={() => add('row')}><Icon name="plus" size={12} />Row</button>
      </div>
    </Section>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="section">
      <div className="section-title">{title}</div>
      <div className="field-grid" style={{ padding: '0 12px 10px' }}>
        {children}
      </div>
    </section>
  )
}

function SelectField({
  label,
  value,
  options,
  wide = false,
  onChange,
}: {
  label: string
  value: string
  options: Array<[string, string]>
  wide?: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className={`chip-field${wide ? ' wide' : ''}`}>
      <span className="chip-label">{label}</span>
      <select className="chip-select" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([option, text]) => <option key={option} value={option}>{text}</option>)}
      </select>
    </label>
  )
}

function ExportSection({ node }: { node?: DocNode }) {
  const [scale, setScale] = useState(2)
  const [format, setFormat] = useState<'png' | 'jpg' | 'webp' | 'pdf'>('png')
  const [quality, setQuality] = useState(0.9)
  const entries = node?.exportMeta?.entries ?? []
  const setEntries = (list: ExportEntry[]) => node && updateNode(node.id, { exportMeta: { entries: list } })
  const patchEntry = (i: number, p: Partial<ExportEntry>) => setEntries(entries.map((e, j) => (j === i ? { ...e, ...p } : e)))
  return (
    <Section title="Export">
      {node && (
        <>
          {entries.map((entry, i) => (
            <div key={i} style={{ display: 'contents' }}>
              <div className="guide-row">
                <SelectField
                  label={`${i + 1}`}
                  value={String(entry.scale)}
                  options={[['0.5', '0.5×'], ['1', '1×'], ['2', '2×'], ['3', '3×'], ['4', '4×']]}
                  onChange={(v) => patchEntry(i, { scale: Number(v) })}
                />
                <SelectField
                  label="Format"
                  value={entry.format}
                  options={[['png', 'PNG'], ['jpg', 'JPG'], ['webp', 'WebP'], ['pdf', 'PDF']]}
                  onChange={(v) => patchEntry(i, { format: v as ExportEntry['format'] })}
                />
                <button className="inspector-action" onClick={() => setEntries(entries.filter((_, j) => j !== i))}>
                  <Icon name="trash" size={12} />
                </button>
              </div>
              {entry.format === 'pdf' && (
                <>
                  <SelectField
                    label="Quality"
                    value={String(entry.quality ?? 0.92)}
                    options={[['0.6', 'Low'], ['0.92', 'Center'], ['1', 'H']]}
                    onChange={(v) => patchEntry(i, { quality: Number(v) })}
                  />
                  <SelectField
                    label="Resampling"
                    value={entry.resampling ?? 'smooth'}
                    options={[['smooth', 'Smooth'], ['pixelated', 'Pixelated']]}
                    onChange={(v) => patchEntry(i, { resampling: v as ExportEntry['resampling'] })}
                  />
                </>
              )}
            </div>
          ))}
          <div className="guide-add">
            <button className="inspector-action" onClick={() => setEntries([...entries, { scale: 1, format: 'png' }])}>
              <Icon name="plus" size={12} />Export entries
            </button>
            {entries.length > 0 && (
              <button className="inspector-action" onClick={() => void exportNodeEntries(node.id)}>
                <Icon name="download" size={12} />Export {entries.length}
              </button>
            )}
          </div>
        </>
      )}
      <SelectField
        label="Format"
        value={format}
        options={[['png', 'PNG'], ['jpg', 'JPG'], ['webp', 'WebP'], ['pdf', 'PDF']]}
        onChange={(value) => setFormat(value as 'png' | 'jpg' | 'webp' | 'pdf')}
      />
      <SelectField
        label="Scale"
        value={String(scale)}
        options={[['0.5', '0.5×'], ['1', '1×'], ['2', '2×'], ['3', '3×'], ['4', '4×']]}
        onChange={(value) => setScale(Number(value))}
      />
      {format !== 'png' && format !== 'pdf' && (
        <SelectField
          label="Quality"
          value={String(quality)}
          options={[['0.5', 'Low'], ['0.8', 'Center'], ['0.95', 'H']]}
          onChange={(value) => setQuality(Number(value))}
        />
      )}
      <button className="inspector-action" onClick={() => void (format === 'pdf' ? downloadSelectionPdf(scale) : downloadSelectionRaster(scale, format, quality))}>
        <Icon name="download" size={12} />{format.toUpperCase()}
      </button>
      <button className="inspector-action wide" onClick={downloadSelectionSvg}>
        <Icon name="download" size={12} />Export SVG
      </button>
      <button className="inspector-action wide" onClick={() => void exportCombinedPdf(scale)} data-tooltip="Merge all artboards into one PDF">
        <Icon name="download" size={12} />Export mergedPDF
      </button>
      {node?.fills?.some((f) => f.type === 'shader' && f.isVisible) && (
        <button className="inspector-action wide" onClick={() => void downloadShaderVideo(node.id, 3)} data-tooltip="Record animated shader fill">
          <Icon name="image" size={12} />Export video (3s)
        </button>
      )}
      <button className="inspector-action wide" onClick={() => void copySelectionAsPng()}>
        <Icon name="image" size={12} />Copy asPNG
      </button>
    </Section>
  )
}

const KIND_LABEL: Record<string, string> = {
  frame: 'Container',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  text: 'Text',
  image: 'Image',
  vector: 'Vector',
}

function iconForKind(kind: DocNode['kind']): 'frame' | 'square' | 'circle' | 'text' | 'image' | 'pen' {
  if (kind === 'frame') return 'frame'
  if (kind === 'rect') return 'square'
  if (kind === 'ellipse') return 'circle'
  if (kind === 'image') return 'image'
  if (kind === 'vector') return 'pen'
  return 'text'
}

function GradientBar({ fill, onPatch }: { fill: Fill; onPatch: (p: Partial<Fill>) => void }) {
  const barRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState(0)
  const stops = fill.stops ?? []
  const preview = fillToCss({ ...fill, shape: 'linear', angle: 90 }) ?? undefined

  const commitStops = (next: Fill['stops']) => onPatch({ stops: next })

  const drag = (event: React.PointerEvent, index: number) => {
    event.preventDefault()
    event.stopPropagation()
    const bar = barRef.current
    if (!bar) return
    const rect = bar.getBoundingClientRect()
    const move = (clientX: number) => {
      const position = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      commitStops(stops.map((s, i) => (i === index ? { ...s, position: Math.round(position * 100) / 100 } : s)))
    }
    move(event.clientX)
    const onMove = (e: PointerEvent) => move(e.clientX)
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const stop = stops[selected]
  return (
    <>
      <div
        ref={barRef}
        className="gradient-bar wide"
        onPointerDown={(event) => {
          if (event.target === barRef.current || (event.target as HTMLElement).classList.contains('gradient-bar-inner')) {
            const rect = barRef.current!.getBoundingClientRect()
            const position = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
            const next = [...stops, { color: '#888888', position: Math.round(position * 100) / 100, midpoint: 0.5 }]
            next.sort((a, b) => a.position - b.position)
            commitStops(next)
            setSelected(next.findIndex((s) => Math.abs(s.position - Math.round(position * 100) / 100) < 0.001))
          }
        }}
      >
        <div className="gradient-bar-inner" style={{ background: preview, borderRadius: 'inherit' }}>
          {stops.map((s, i) => (
            <span
              key={i}
              className="gradient-stop"
              data-selected={i === selected}
              style={{ left: `${s.position * 100}%`, background: s.color }}
              onPointerDown={(event) => {
                setSelected(i)
                drag(event, i)
              }}
              onDoubleClick={(event) => {
                event.stopPropagation()
                if (stops.length > 2) commitStops(stops.filter((_, j) => j !== i))
              }}
            />
          ))}
        </div>
      </div>
      {stop && (
        <>
          <ColorField
            label="Stops"
            value={stop.color}
            fallback="#dddddd"
            onCommit={(v) => commitStops(stops.map((s, i) => (i === selected ? { ...s, color: v } : s)))}
          />
          <NumberField
            label="Position"
            value={Math.round(stop.position * 100)}
            onCommit={(v) => {
              const position = Math.min(1, Math.max(0, v / 100))
              const next = stops.map((s, i) => (i === selected ? { ...s, position } : s)).sort((a, b) => a.position - b.position)
              commitStops(next)
            }}
          />
          <NumberField
            label="Transition"
            value={Math.round((stop.midpoint ?? 0.5) * 100)}
            onCommit={(v) => commitStops(stops.map((s, i) => (i === selected ? { ...s, midpoint: Math.min(1, Math.max(0.01, v / 100)) } : s)))}
          />
        </>
      )}
      {stops.length > 2 && (
        <button
          className="inspector-action wide"
          data-tooltip="Distribute colors evenly"
          onClick={() => {
            const sorted = [...stops].sort((a, b) => a.position - b.position)
            const step = 1 / (sorted.length - 1)
            commitStops(sorted.map((s, i) => ({ ...s, position: Math.round(i * step * 100) / 100 })))
          }}
        >
          Distribute stops
        </button>
      )}
    </>
  )
}

function pickFillImage(onPick: (src: string) => void) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.style.display = 'none'
  document.body.appendChild(input)
  input.onchange = () => {
    const file = input.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = () => onPick(String(reader.result))
      reader.readAsDataURL(file)
    }
    input.remove()
  }
  input.click()
}

function FillRow({ fill, index, onPatch }: { fill: Fill; index: number; onPatch: (index: number, patch: Partial<Fill>) => void }) {
  const patchFill = (p: Partial<Fill>) => onPatch(index, p)
  const setType = (v: string) => {
    if (v === 'solid') patchFill({ type: 'solid', color: fill.color ?? '#dddddd' })
    else if (v === 'image') patchFill({ ...imageFill(fill.imageSrc ?? '', fill.imageFit ?? 'fill') })
    else if (v === 'pattern') patchFill({ type: 'pattern', pattern: fill.pattern ?? 'dot-grid', color: fill.color ?? '#000000', patternSize: fill.patternSize ?? 12 })
    else if (v === 'shader') {
      const d = shaderDef(fill.shaderKind) ?? SHADERS[0]
      patchFill(presetFill(d, d.presets[0]))
    }
    else patchFill({ ...gradientFill(v as GradientShape), stops: fill.stops ?? defaultStops() })
  }
  return (
    <>
      <SelectField
        label={index === 0 ? 'Fill' : `Fill ${index + 1}`}
        value={fill.type === 'gradient' ? (fill.shape ?? 'linear') : fill.type}
        options={[
          ['solid', 'Solid'],
          ['linear', 'Linear gradient'],
          ['radial', 'Radial gradient'],
          ['conic', 'Conic gradient'],
          ['image', 'Image'],
          ['pattern', 'Pattern'],
          ['shader', 'Shader'],
        ]}
        onChange={setType}
      />
      {fill.type === 'shader' && <ShaderFillEditor fill={fill} patchFill={patchFill} />}
      {fill.type === 'pattern' && (
        <>
          <SelectField
            label="Pattern"
            value={fill.pattern ?? 'dot-grid'}
            options={[
              ['dot-grid', 'Dot grid'],
              ['halftone', 'Halftone'],
              ['lines', 'Lines'],
              ['noise', 'Noise'],
            ]}
            onChange={(v) => patchFill({ pattern: v as Fill['pattern'] })}
          />
          <ColorField label="Ink" value={fill.color ?? '#000000'} fallback="#000000" onCommit={(v) => patchFill({ color: v })} />
          <NumberField label="Size" value={Math.round(fill.patternSize ?? 12)} onCommit={(v) => patchFill({ patternSize: Math.max(4, v) })} />
        </>
      )}
      {fill.type === 'solid' && (
        <ColorField
          label="Color"
          value={fill.color ?? '#dddddd'}
          fallback="#dddddd"
          onCommit={(v) => patchFill({ color: v })}
        />
      )}
      {fill.type === 'gradient' && (
        <>
          <div
            className="swatch gradient-swatch wide"
            style={{ height: 26, borderRadius: 'var(--radius-control)' }}
          >
            <span className="swatch-fill" style={{ background: fillToCss(fill) ?? undefined }} />
          </div>
          <GradientBar fill={fill} onPatch={patchFill} />
          {(fill.shape === 'linear' || fill.shape === 'conic') && (
            <NumberField label="Angle" value={Math.round(fill.angle ?? 0)} onCommit={(v) => patchFill({ angle: v })} />
          )}
          <SelectField
            label="Interpolation"
            value={fill.interpolation ?? 'oklab'}
            options={[
              ['oklab', 'OKLab'],
              ['oklch', 'OKLCH'],
              ['oklch-longer', 'Longer hue'],
              ['oklch-increasing', 'Increasing hue'],
              ['oklch-decreasing', 'Decreasing hue'],
            ]}
            onChange={(v) => patchFill({ interpolation: v === 'oklab' ? undefined : (v as Fill['interpolation']) })}
          />
          {fill.shape !== 'linear' && (
            <>
              <NumberField
                label="Center X"
                value={Math.round((fill.center?.x ?? 0.5) * 100)}
                onCommit={(v) => patchFill({ center: { x: Math.min(1, Math.max(0, v / 100)), y: fill.center?.y ?? 0.5 } })}
              />
              <NumberField
                label="Center Y"
                value={Math.round((fill.center?.y ?? 0.5) * 100)}
                onCommit={(v) => patchFill({ center: { x: fill.center?.x ?? 0.5, y: Math.min(1, Math.max(0, v / 100)) } })}
              />
            </>
          )}
        </>
      )}
      {fill.type === 'image' && (
        <>
          <SelectField
            label="Fit"
            value={fill.imageFit ?? 'fill'}
            options={[['fill', 'Fill'], ['contain', 'Fit'], ['cover', 'Crop']]}
            onChange={(v) => patchFill({ imageFit: v as Fill['imageFit'] })}
          />
          <button className="inspector-action" onClick={() => pickFillImage((src) => patchFill({ imageSrc: src }))}>
            <Icon name="image" size={12} />{fill.imageSrc ? 'Replace' : 'Select'}
          </button>
        </>
      )}
      <SelectField
        label="Blending"
        value={fill.blendMode ?? 'normal'}
        options={[
          ['normal', 'Normal'], ['multiply', 'Multiply'], ['screen', 'Screen'], ['overlay', 'Overlay'],
          ['darken', 'Darken'], ['lighten', 'Lighten'], ['color-dodge', 'Color dodge'], ['color-burn', 'Color burn'],
          ['hard-light', 'Hard light'], ['soft-light', 'Soft light'], ['difference', 'Difference'], ['exclusion', 'Exclusion'],
          ['hue', 'Hue'], ['saturation', 'Saturation'], ['color', 'Color'], ['luminosity', 'Luminosity'],
        ]}
        onChange={(v) => patchFill({ blendMode: v === 'normal' ? undefined : v })}
      />
    </>
  )
}

/** Official Paper shader fill editor — palette + per-shader params
 * (model/shaders.ts registry over @paper-design/shaders-react). */
function ShaderFillEditor({ fill, patchFill }: { fill: Fill; patchFill: (p: Partial<Fill>) => void }) {
  const def = shaderDef(fill.shaderKind) ?? SHADERS[0]
  const colors = fill.shaderColors ?? []
  const setColor = (i: number, c: string) => patchFill({ shaderColors: colors.map((v, j) => (j === i ? c : v)) })
  const paramDefault = (key: string) => {
    const v = def.defaults[key]
    return typeof v === 'number' ? v : 0
  }
  const numValue = (key: string, fallback: number) => fill.shaderParams?.[key] ?? fallback
  return (
    <>
      <SelectField
        label="Shader"
        value={def.id}
        options={SHADERS.map((s) => [s.id, s.name] as [string, string])}
        onChange={(v) => {
          const next = shaderDef(v)
          if (next) patchFill(presetFill(next, next.presets[0]))
        }}
      />
      {def.presets.length > 1 && (
        <SelectField
          label="Preset"
          value={(() => {
            const i = def.presets.findIndex((p) => presetMatch(fill, def, p))
            return i >= 0 ? String(i) : ''
          })()}
          options={[['', 'Custom'], ...def.presets.map((p, i) => [String(i), p.name] as [string, string])]}
          onChange={(v) => {
            if (v !== '') patchFill(presetFill(def, def.presets[Number(v)]))
          }}
        />
      )}
      {def.maxColors > 0 && (
        <>
          {colors.map((c, i) => (
            <div key={i} className="row-align">
              <ColorField label={`Color ${i + 1}`} value={c} fallback="#888888" onCommit={(v) => setColor(i, v)} />
              <button
                className="inspector-action"
                disabled={colors.length <= 1}
                onClick={() => patchFill({ shaderColors: colors.filter((_, j) => j !== i) })}
                data-tooltip="Remove color"
              >
                <Icon name="minus" size={10} />
              </button>
            </div>
          ))}
          {colors.length < def.maxColors && (
            <button className="inspector-action" onClick={() => patchFill({ shaderColors: [...colors, '#a78bfa'] })}>
              <Icon name="plus" size={10} />Add color
            </button>
          )}
        </>
      )}
      {def.extraColors?.map((c) => (
        <ColorField
          key={c.key}
          label={c.label}
          value={fill.shaderExtraColors?.[c.key] ?? (def.defaults[c.key] as string) ?? '#ffffff'}
          fallback="#ffffff"
          onCommit={(v) => patchFill({ shaderExtraColors: { ...(fill.shaderExtraColors ?? {}), [c.key]: v } })}
        />
      ))}
      {def.hasBack && (
        <ColorField
          label="Background"
          value={fill.shaderBack ?? (def.defaults.colorBack as string) ?? '#111111'}
          fallback="#111111"
          onCommit={(v) => patchFill({ shaderBack: v })}
        />
      )}
      {def.image && (
        <button className="inspector-action" onClick={() => pickFillImage((src) => patchFill({ shaderImage: src }))}>
          <Icon name="image" size={12} />{fill.shaderImage ? 'Replace image' : 'Select image'}
        </button>
      )}
      {def.params.map((p) =>
        p.bool ? (
          <SelectField
            key={p.key}
            label={p.label}
            value={numValue(p.key, (def.defaults[p.key] ? 1 : 0)) === 1 ? '1' : '0'}
            options={[['0', 'Off'], ['1', 'On']]}
            onChange={(v) => patchFill({ shaderParams: { ...(fill.shaderParams ?? {}), [p.key]: Number(v) } })}
          />
        ) : p.enum ? (
          <SelectField
            key={p.key}
            label={p.label}
            value={String(numValue(p.key, p.enum[String(def.defaults[p.key])] ?? 0))}
            options={Object.entries(p.enum).map(([name, v]) => [String(v), name] as [string, string])}
            onChange={(v) => patchFill({ shaderParams: { ...(fill.shaderParams ?? {}), [p.key]: Number(v) } })}
          />
        ) : (
          <NumberField
            key={p.key}
            label={p.label}
            value={numValue(p.key, paramDefault(p.key))}
            decimals={p.step < 1 ? 2 : 0}
            onCommit={(v) => patchFill({ shaderParams: { ...(fill.shaderParams ?? {}), [p.key]: Math.min(p.max, Math.max(p.min, v)) } })}
          />
        ),
      )}
      {def.animated && (
        <NumberField
          label="Speed"
          value={numValue('speed', (def.defaults.speed as number) ?? 1)}
          decimals={2}
          onCommit={(v) =>
            patchFill({
              shaderParams: {
                ...(fill.shaderParams ?? {}),
                speed: Math.min(
                  Math.max(3, ...def.presets.map((pr) => (typeof pr.params.speed === 'number' ? (pr.params.speed as number) : 0))),
                  Math.max(0, v),
                ),
              },
            })
          }
        />
      )}
    </>
  )
}

function FillEditor({ node }: { node: DocNode }) {
  const fills = fillsOf(node)
  const list = fills.length > 0 ? fills : [solidFill('transparent')]
  const commit = (next: Fill[]) => updateNode(node.id, { fills: next, fill: undefined })
  const patchFill = (index: number, patch: Partial<Fill>) => {
    const next = list.map((f, i) => (i === index ? { ...f, ...patch } : f))
    commit(next)
  }
  return (
    <>
      {list.map((fill, index) => (
        <div key={index} className="fill-card wide">
          <div className="fill-card-head">
            <button
              className="icon-button"
              data-tooltip={fill.isVisible === false ? 'Show fill' : 'Hide fill'}
              onClick={() => patchFill(index, { isVisible: fill.isVisible === false })}
            >
              <Icon name={fill.isVisible === false ? 'eyeOff' : 'eye'} size={12} />
            </button>
            <button
              className="icon-button"
              data-tooltip="Delete fill"
              onClick={() => commit(list.filter((_, i) => i !== index))}
            >
              <Icon name="minus" size={12} />
            </button>
          </div>
          <div className="field-grid">
            <FillRow fill={fill} index={index} onPatch={patchFill} />
          </div>
        </div>
      ))}
      <button className="inspector-action wide" onClick={() => commit([solidFill('#dddddd'), ...list])}>
        <Icon name="plus" size={12} />Add fill
      </button>
    </>
  )
}

function NodeInspector({ node, parent }: { node: DocNode; parent: DocNode | null }) {
  const isArtboard = node.parentId === null
  const [strokeSide, setStrokeSide] = useState<'all' | 'top' | 'right' | 'bottom' | 'left'>('all')
  const patch = (values: Partial<DocNode>) => updateNode(node.id, values)
  return (
    <>
      <header className="panel-head">
        <span className="panel-head-label">
          <Icon name={isArtboard ? 'artboard' : iconForKind(node.kind)} size={13} />
          {node.name}
        </span>
        <span className="panel-head-actions">
          <span className="panel-head-meta">{isArtboard ? 'Frame' : KIND_LABEL[node.kind] ?? node.kind}</span>
          <PanelChrome />
          <button
            className="icon-button"
            data-tooltip={node.locked ? 'Unlock (⇧⌘L)' : 'Lock (⇧⌘L)'}
            onClick={() => patch({ locked: !node.locked })}
          >
            <Icon name={node.locked ? 'lock' : 'unlock'} size={12} />
          </button>
        </span>
      </header>
      <PanelCta />

      <Section title="Layout">
        <NumberField label="X" value={node.x} onCommit={(v) => patch({ x: Math.round(v) })} />
        <NumberField label="Y" value={node.y} onCommit={(v) => patch({ y: Math.round(v) })} />
        <NumberField
          label="W"
          value={node.width}
          disabled={!!node.widthAuto}
          placeholder="auto"
          onCommit={(v) => {
            const w = Math.max(1, Math.round(v))
            patch(node.ratioLocked && node.width > 0 ? { width: w, height: Math.max(1, Math.round((w * node.height) / node.width)) } : { width: w })
          }}
        />
        <button
          className={`inspector-action ratio-lock${node.ratioLocked ? ' is-on' : ''}`}
          data-tooltip={node.ratioLocked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
          onClick={() => patch({ ratioLocked: !node.ratioLocked || undefined })}
        >
          <Icon name={node.ratioLocked ? 'lock' : 'unlock'} size={11} />
        </button>
        <NumberField
          label="H"
          value={node.height}
          disabled={!!node.heightAuto}
          placeholder="auto"
          onCommit={(v) => {
            const h = Math.max(1, Math.round(v))
            patch(node.ratioLocked && node.height > 0 ? { height: h, width: Math.max(1, Math.round((h * node.width) / node.height)) } : { height: h })
          }}
        />
        <NumberField label="Rotation" value={node.rotation ?? 0} onCommit={(v) => patch({ rotation: ((v % 360) + 360) % 360 || undefined })} />
        {parent?.layout && (
          <>
            <SelectField
              label="Width mode"
              value={node.sizing?.w ?? 'fixed'}
              options={[['fixed', 'Fixed'], ['fill', 'Fill'], ['hug', 'Fit']]}
              onChange={(v) => patch({ sizing: { ...node.sizing, w: v as SizingMode } })}
            />
            <SelectField
              label="Height mode"
              value={node.sizing?.h ?? 'fixed'}
              options={[['fixed', 'Fixed'], ['fill', 'Fill'], ['hug', 'Fit']]}
              onChange={(v) => patch({ sizing: { ...node.sizing, h: v as SizingMode } })}
            />
            <NumberField
              label="Margin"
              value={node.margin ?? 0}
              onCommit={(v) => patch({ margin: v !== 0 ? v : undefined })}
            />
            <SelectField
              label="Align"
              value={node.alignSelf ?? 'auto'}
              options={[['auto', 'Inherit'], ['start', 'Start'], ['center', 'Center'], ['end', 'End'], ['stretch', 'Stretch']]}
              onChange={(v) => patch({ alignSelf: v === 'auto' ? undefined : (v as DocNode['alignSelf']) })}
            />
            <label className="chip-field wide inspector-toggle">
              <span>Absolute</span>
              <input
                type="checkbox"
                checked={!!node.absoluteInFlex}
                onChange={(event) => patch({ absoluteInFlex: event.target.checked || undefined })}
              />
            </label>
          </>
        )}
        {parent && node.kind !== 'instance' && !parent.layout && (
          <>
            <PinGrid
              x={node.constraintsX ?? 'left'}
              y={node.constraintsY ?? 'top'}
              onChange={(cx, cy) =>
                patch({
                  constraintsX: cx === 'left' ? undefined : cx,
                  constraintsY: cy === 'top' ? undefined : cy,
                })
              }
            />
            <SelectField
              label="Horizontal"
              value={node.constraintsX ?? 'left'}
              options={[['left', 'Left'], ['center', 'Center'], ['right', 'Right'], ['stretch', 'Stretch']]}
              onChange={(v) => patch({ constraintsX: v === 'left' ? undefined : (v as DocNode['constraintsX']) })}
            />
            <SelectField
              label="Vertical"
              value={node.constraintsY ?? 'top'}
              options={[['top', 'Top'], ['center', 'Center'], ['bottom', 'Bottom'], ['stretch', 'Stretch']]}
              onChange={(v) => patch({ constraintsY: v === 'top' ? undefined : (v as DocNode['constraintsY']) })}
            />
          </>
        )}
        {node.kind === 'frame' && (
          <>
            <SelectField
              label="Arrange"
              value={node.layout?.direction ?? 'none'}
              options={[['none', 'Free'], ['row', 'Horizontal'], ['column', 'Vertical']]}
              onChange={(v) =>
                patch({
                  layout:
                    v === 'none'
                      ? undefined
                      : {
                          direction: v as FlexLayout['direction'],
                          gap: node.layout?.gap ?? 8,
                          padding: node.layout?.padding ?? 8,
                          mainAlign: node.layout?.mainAlign ?? 'start',
                          crossAlign: node.layout?.crossAlign ?? 'start',
                        },
                })
              }
            />
            {node.layout && (
              <>
                <NumberField
                  label="Gap"
                  value={node.layout.gap}
                  onCommit={(v) => patch({ layout: { ...node.layout!, gap: Math.max(0, v) } })}
                />
                <NumberField
                  label="Padding"
                  value={node.layout.padding}
                  onCommit={(v) => patch({ layout: { ...node.layout!, padding: Math.max(0, v) } })}
                />
                <NumberField
                  label="H margin"
                  value={node.layout.paddingX ?? node.layout.padding}
                  onCommit={(v) => patch({ layout: { ...node.layout!, paddingX: Math.max(0, v) } })}
                />
                <NumberField
                  label="V margin"
                  value={node.layout.paddingY ?? node.layout.padding}
                  onCommit={(v) => patch({ layout: { ...node.layout!, paddingY: Math.max(0, v) } })}
                />
                <label className="chip-field wide inspector-toggle">
                  <span>Individual margins</span>
                  <input
                    type="checkbox"
                    checked={!!node.layout.paddingSides}
                    onChange={(event) => {
                      const l = node.layout!
                      const px = l.paddingX ?? l.padding
                      const py = l.paddingY ?? l.padding
                      patch({ layout: { ...l, paddingSides: event.target.checked ? { top: py, right: px, bottom: py, left: px } : undefined } })
                    }}
                  />
                </label>
                {node.layout.paddingSides && (
                  <div className="radius-corners">
                    {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
                      <NumberField
                        key={side}
                        label={{ top: 'T', right: 'Right', bottom: 'B', left: 'Left' }[side]}
                        value={node.layout!.paddingSides![side] ?? (side === 'top' || side === 'bottom' ? node.layout!.paddingY ?? node.layout!.padding : node.layout!.paddingX ?? node.layout!.padding)}
                        onCommit={(v) => patch({ layout: { ...node.layout!, paddingSides: { ...node.layout!.paddingSides, [side]: Math.max(0, v) } } })}
                      />
                    ))}
                  </div>
                )}
                <SelectField
                  label="Main axis"
                  value={node.layout.mainAlign}
                  options={[['start', 'Start'], ['center', 'Center'], ['end', 'End'], ['space-between', 'Evenly']]}
                  onChange={(v) => patch({ layout: { ...node.layout!, mainAlign: v as FlexLayout['mainAlign'] } })}
                />
                <SelectField
                  label="Cross axis"
                  value={node.layout.crossAlign}
                  options={[['start', 'Start'], ['center', 'Center'], ['end', 'End'], ['stretch', 'Stretch'], ['baseline', 'Baseline'], ['baseline-last', 'Last baseline']]}
                  onChange={(v) => patch({ layout: { ...node.layout!, crossAlign: v as FlexLayout['crossAlign'] } })}
                />
                <SelectField
                  label="Fit width"
                  value={node.layout.hugW ? 'hug' : 'fixed'}
                  options={[['fixed', 'Fixed'], ['hug', 'Hug contents']]}
                  onChange={(v) => patch({ layout: { ...node.layout!, hugW: v === 'hug' } })}
                />
                <SelectField
                  label="Fit height"
                  value={node.layout.hugH ? 'hug' : 'fixed'}
                  options={[['fixed', 'Fixed'], ['hug', 'Hug contents']]}
                  onChange={(v) => patch({ layout: { ...node.layout!, hugH: v === 'hug' } })}
                />
                <label className="chip-field wide inspector-toggle">
                  <span>Wrap</span>
                  <input
                    type="checkbox"
                    checked={!!node.layout.wrap}
                    onChange={(event) => patch({ layout: { ...node.layout!, wrap: event.target.checked || undefined } })}
                  />
                </label>
                {node.layout.wrap && (
                  <SelectField
                    label="Wrap align"
                    value={node.layout.alignContent ?? 'start'}
                    options={[['start', 'Start'], ['center', 'Center'], ['end', 'End'], ['space-between', 'Evenly'], ['stretch', 'Stretch']]}
                    onChange={(v) => patch({ layout: { ...node.layout!, alignContent: v === 'start' ? undefined : (v as FlexLayout['alignContent']) } })}
                  />
                )}
                <label className="chip-field wide inspector-toggle">
                  <span>Auto height</span>
                  <input
                    type="checkbox"
                    checked={!!node.heightAuto}
                    onChange={(event) => patch({ heightAuto: event.target.checked || undefined })}
                  />
                </label>
              </>
            )}
          </>
        )}
      </Section>

      {node.kind !== 'image' && node.kind !== 'text' && (
        <Section title="Radius">
            <div className="radius-row">
              <NumberField label="Radius" value={node.radius ?? 0} onCommit={(v) => patch({ radius: Math.max(0, Math.round(v)) })} />
              <button
                className="mini-icon"
                data-active={!!node.radiusCorners}
                data-tooltip="Individual corners"
                onClick={() => {
                  const base = node.radius ?? 0
                  patch({ radiusCorners: node.radiusCorners ? undefined : [base, base, base, base] })
                }}
              >
                <Icon name="corners" size={12} />
              </button>
            </div>
            {node.radiusCorners && (
              <div className="radius-corners">
                {(['Top left', 'Top right', 'Bottom right', 'Bottom left'] as const).map((label, i) => (
                  <NumberField
                    key={label}
                    label={label}
                    value={node.radiusCorners![i]}
                    onCommit={(v) => {
                      const corners = [...node.radiusCorners!] as [number, number, number, number]
                      corners[i] = Math.max(0, Math.round(v))
                      patch({ radiusCorners: corners })
                    }}
                  />
                ))}
              </div>
            )}
                  </Section>
      )}
      <Section title="Blending">
<NumberField
          label="Opacity"
          value={Math.round((node.opacity ?? 1) * 100)}
          onCommit={(v) => patch({ opacity: Math.min(1, Math.max(0, v / 100)) })}
        />
        <SelectField
          label="Blending"
          wide
          value={node.blendMode ?? 'normal'}
          options={[
            ['normal', 'Normal'], ['multiply', 'Multiply'], ['screen', 'Screen'], ['overlay', 'Overlay'],
            ['darken', 'Darken'], ['lighten', 'Lighten'], ['color-dodge', 'Color dodge'], ['color-burn', 'Color burn'],
            ['hard-light', 'Hard light'], ['soft-light', 'Soft light'], ['difference', 'Difference'], ['exclusion', 'Exclusion'],
            ['hue', 'Hue'], ['saturation', 'Saturation'], ['color', 'Color'], ['luminosity', 'Luminosity'],
          ]}
          onChange={(value) => patch({ blendMode: value })}
        />
              </Section>
      {node.kind !== 'text' && (
        <Section title="Fill">
          <FillEditor node={node} />
        </Section>
      )}

      {node.kind === 'text' && (
        <Section title="Text">
          <TextField value={node.text ?? ''} onCommit={(v) => patch({ text: v })} />
          <SelectField
            label="Font"
            wide
            value={node.fontFamily ?? 'Inter'}
            options={[
              ['Inter', 'Inter'], ['SF Pro Text', 'SF Pro'], ['system-ui', 'System'],
              ['Arial', 'Arial'], ['Helvetica', 'Helvetica'], ['Helvetica Neue', 'Helvetica Neue'],
              ['Georgia', 'Georgia'], ['Times New Roman', 'Times New Roman'], ['Garamond', 'Garamond'],
              ['Courier New', 'Courier New'], ['monospace', 'Monospace'], ['Menlo', 'Menlo'],
              ['Verdana', 'Verdana'], ['Trebuchet MS', 'Trebuchet'], ['Impact', 'Impact'], ['Comic Sans MS', 'Comic Sans'],
            ]}
            onChange={(value) => patch({ fontFamily: value })}
          />
          <NumberField label="Size" value={node.fontSize ?? 14} onCommit={(v) => patch({ fontSize: Math.max(1, v) })} />
          <label className="chip-field">
            <span className="chip-label">Weight</span>
            <select
              className="chip-select"
              value={node.fontWeight ?? 400}
              onChange={(event) => patch({ fontWeight: Number(event.target.value) })}
            >
              {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((weight) => (
                <option key={weight} value={weight}>{weight}</option>
              ))}
            </select>
          </label>
          <NumberField label="Line height" decimals={2} value={node.lineHeight ?? 1.4} onCommit={(v) => patch({ lineHeight: Math.max(0.5, v) })} />
          <NumberField label="Letter spacing" decimals={1} value={node.letterSpacing ?? 0} onCommit={(v) => patch({ letterSpacing: v })} />
          <NumberField
            label="Max lines"
            value={node.lineClamp ?? 0}
            onCommit={(v) => patch({ lineClamp: v > 0 ? Math.round(v) : undefined })}
          />
          <SelectField
            label="Wrapping"
            value={node.textWrap ?? 'wrap'}
            options={[
              ['wrap', 'Wrap'],
              ['balance', 'Balanced'],
              ['pretty', 'Pretty'],
            ]}
            onChange={(v) => patch({ textWrap: v === 'wrap' ? undefined : (v as DocNode['textWrap']) })}
          />
          <SelectField
            label="Case"
            value={node.textCase ?? 'none'}
            options={[
              ['none', 'None'],
              ['uppercase', 'Uppercase'],
              ['lowercase', 'Lowercase'],
              ['capitalize', 'Capitalize'],
            ]}
            onChange={(v) => patch({ textCase: v === 'none' ? undefined : (v as DocNode['textCase']) })}
          />
          <label className="chip-field wide inspector-toggle">
            <span>Ellipsis</span>
            <input
              type="checkbox"
              checked={!!node.textEllipsis}
              onChange={(event) => patch({ textEllipsis: event.target.checked || undefined })}
            />
          </label>
          <label className="chip-field wide inspector-toggle">
            <span>Keep words</span>
            <input
              type="checkbox"
              checked={!!node.keepWords}
              onChange={(event) => patch({ keepWords: event.target.checked || undefined })}
            />
          </label>
          <div className="chip-field wide" style={{ padding: 1, height: 28 }}>
            <div className="toggle-group" style={{ height: 24, flex: 1 }}>
              <button data-active={(node.fontWeight ?? 400) >= 600} onClick={() => patch({ fontWeight: (node.fontWeight ?? 400) >= 600 ? 400 : 700 })}>B</button>
              <button data-active={node.fontStyle === 'italic'} style={{ fontStyle: 'italic' }} onClick={() => patch({ fontStyle: node.fontStyle === 'italic' ? undefined : 'italic' })}>I</button>
            </div>
          </div>
          <OpenTypeSection node={node} patch={patch} />
          <ColorField
            label="Color"
            value={node.color ?? '#111111'}
            fallback="#111111"
            onCommit={(v) => patch({ color: v })}
          />
          <div className="chip-field wide" style={{ padding: 1, height: 28 }}>
            <div className="toggle-group" style={{ height: 24, flex: 1 }}>
              {(['left', 'center', 'right', 'justify'] as const).map((align) => (
                <button
                  key={align}
                  data-active={node.textAlign === align || (!node.textAlign && align === 'left')}
                  onClick={() => patch({ textAlign: align })}
                >
                  {align === 'left' ? 'Left' : align === 'center' ? 'Center' : align === 'right' ? 'Right' : 'Justify'}
                </button>
              ))}
            </div>
          </div>
          <SelectField
            label="Decoration"
            value={node.textDecoration ?? 'none'}
            options={[['none', 'None'], ['underline', 'Underline'], ['line-through', 'Strikethrough'], ['overline', 'Overline']]}
            onChange={(v) => patch({ textDecoration: v === 'none' ? undefined : (v as DocNode['textDecoration']) })}
          />
          {node.textDecoration && (
            <>
              <SelectField
                label="Style"
                value={node.textDecorationStyle ?? 'solid'}
                options={[['solid', 'Solid'], ['dotted', 'Dotted'], ['dashed', 'Dashed'], ['wavy', 'Wavy']]}
                onChange={(v) => patch({ textDecorationStyle: v === 'solid' ? undefined : (v as DocNode['textDecorationStyle']) })}
              />
              <NumberField
                label="Thickness"
                decimals={1}
                value={node.textDecorationThickness ?? 1}
                onCommit={(v) => patch({ textDecorationThickness: v > 0 && v !== 1 ? v : undefined })}
              />
              <label className="chip-field wide inspector-toggle">
                <span>Skip orphans</span>
                <input
                  type="checkbox"
                  checked={!!node.textDecorationSkipInk}
                  onChange={(event) => patch({ textDecorationSkipInk: event.target.checked || undefined })}
                />
              </label>
              <ColorField
                label="Line color"
                value={node.textDecorationColor ?? node.fill ?? '#000000'}
                fallback={node.fill ?? '#000000'}
                onCommit={(v) => patch({ textDecorationColor: v === node.fill ? undefined : v })}
              />
            </>
          )}
          <SelectField
            label="Case"
            value={node.textTransform ?? 'none'}
            options={[['none', 'Default'], ['uppercase', 'Uppercase'], ['lowercase', 'Lowercase'], ['capitalize', 'Capitalize']]}
            onChange={(v) => patch({ textTransform: v === 'none' ? undefined : (v as DocNode['textTransform']) })}
          />
          <label className="chip-field wide inspector-toggle">
            <span>Text stroke</span>
            <input
              type="checkbox"
              checked={!!node.textStroke}
              onChange={(event) => patch({ textStroke: event.target.checked ? { width: 1, color: '#111111' } : undefined })}
            />
          </label>
          {node.textStroke && (
            <>
              <ColorField label="Color" value={node.textStroke.color} fallback="#111111" onCommit={(v) => patch({ textStroke: { ...node.textStroke!, color: v } })} />
              <NumberField label="Width" value={node.textStroke.width} onCommit={(v) => patch({ textStroke: { ...node.textStroke!, width: Math.max(0, v) } })} />
            </>
          )}
        </Section>
      )}
      {node.kind !== 'text' && (
        <Section title="Outline">
            {node.kind !== 'ellipse' && node.kind !== 'vector' && (
              <SelectField
                label="Sides"
                value={strokeSide}
                options={[['all', 'All'], ['top', 'T'], ['right', 'Right'], ['bottom', 'B'], ['left', 'Left']]}
                onChange={(v) => setStrokeSide(v as typeof strokeSide)}
              />
            )}
            {strokeSide !== 'all' && (
              <label className="chip-field wide inspector-toggle">
                <span>Override this edge</span>
                <input
                  type="checkbox"
                  checked={!!node.strokeSides?.[strokeSide]}
                  onChange={(event) => {
                    const next = { ...node.strokeSides }
                    if (event.target.checked) next[strokeSide] = { width: node.strokeWidth ?? 1, color: node.stroke }
                    else delete next[strokeSide]
                    patch({ strokeSides: Object.keys(next).length ? next : undefined })
                  }}
                />
              </label>
            )}
            {strokeSide === 'all' || !node.strokeSides?.[strokeSide] ? (
              <>
                <ColorField label="Stroke" value={node.stroke ?? 'transparent'} fallback="#111111" onCommit={(v) => patch({ stroke: v })} />
                <NumberField label="Width" value={node.strokeWidth ?? 1} onCommit={(v) => patch({ strokeWidth: Math.max(0, v) })} />
              </>
            ) : (
              <>
                <ColorField
                  label="Stroke"
                  value={node.strokeSides[strokeSide]!.color ?? node.stroke ?? 'transparent'}
                  fallback="#111111"
                  onCommit={(v) => patch({ strokeSides: { ...node.strokeSides, [strokeSide]: { ...node.strokeSides![strokeSide], color: v } } })}
                />
                <NumberField
                  label="Width"
                  value={node.strokeSides[strokeSide]!.width ?? node.strokeWidth ?? 1}
                  onCommit={(v) => patch({ strokeSides: { ...node.strokeSides, [strokeSide]: { ...node.strokeSides![strokeSide], width: Math.max(0, v) } } })}
                />
              </>
            )}
            <SelectField
              label="Style"
              value={!node.strokeDash?.length ? 'solid' : node.strokeDash.join(',') === '6,4' ? 'dash' : node.strokeDash.join(',') === '2,4' ? 'dot' : node.strokeDash.join(',') === '12,6' ? 'long' : 'custom'}
              options={[
                ['solid', 'Solid'],
                ['dash', 'Dashed'],
                ['dot', 'Dotted'],
                ['long', 'Long dash'],
              ]}
              onChange={(v) => patch({ strokeDash: v === 'solid' ? undefined : v === 'dash' ? [6, 4] : v === 'dot' ? [2, 4] : [12, 6] })}
            />
            {node.kind === 'vector' && (
              <>
                <SelectField
                  label="Cap"
                  value={node.strokeCap ?? 'butt'}
                  options={[
                    ['butt', 'Butt'],
                    ['round', 'Round'],
                    ['square', 'Square'],
                  ]}
                  onChange={(v) => patch({ strokeCap: v as DocNode['strokeCap'] })}
                />
                <SelectField
                  label="Corner"
                  value={node.strokeJoin ?? 'miter'}
                  options={[
                    ['miter', 'Miter'],
                    ['round', 'Radius'],
                    ['bevel', 'Bevel'],
                  ]}
                  onChange={(v) => patch({ strokeJoin: v as DocNode['strokeJoin'] })}
                />
              </>
            )}
            {!!node.strokeDash?.length && (
              <NumberField label="Dash offset" decimals={1} value={node.strokeDashOffset ?? 0} onCommit={(v) => patch({ strokeDashOffset: v })} />
            )}
        </Section>
      )}
      {node.kind !== 'text' && (
        <Section title="Outline offset">
          <label className="chip-field wide inspector-toggle">
            <span>Outline</span>
            <input
              type="checkbox"
              checked={!!node.outline}
              onChange={(event) => patch({ outline: event.target.checked ? { width: 1, color: '#111111', offset: 0 } : undefined })}
            />
          </label>
          {node.outline && (
            <>
              <ColorField label="Outline color" value={node.outline.color} fallback="#111111" onCommit={(v) => patch({ outline: { ...node.outline!, color: v } })} />
              <NumberField label="Outline width" value={node.outline.width} onCommit={(v) => patch({ outline: { ...node.outline!, width: Math.max(0, v) } })} />
              <NumberField label="Offset" value={node.outline.offset} onCommit={(v) => patch({ outline: { ...node.outline!, offset: v } })} />
            </>
          )}
        </Section>
      )}
      <Section title="Drop shadow">
        {(() => {
          const list = node.shadows ?? (node.shadow ? [node.shadow] : [])
          const write = (next: typeof list) => patch({ shadows: next.length ? next : undefined, shadow: undefined })
          return (
            <>
              {list.map((sh, i) => (
                <div key={i} className="shadow-entry">
                  <div className="shadow-entry-head">
                    <span className="shadow-entry-title">{sh.inset ? 'Inner shadow' : 'Drop shadow'}</span>
                    <button className="mini-icon" data-tooltip="Delete shadow" onClick={() => write(list.filter((_, j) => j !== i))}>
                      <Icon name="minus" size={11} />
                    </button>
                  </div>
                  <NumberField label="X" value={sh.x} onCommit={(v) => write(list.map((o, j) => (j === i ? { ...o, x: v } : o)))} />
                  <NumberField label="Y" value={sh.y} onCommit={(v) => write(list.map((o, j) => (j === i ? { ...o, y: v } : o)))} />
                  <NumberField label="Blur" value={sh.blur} onCommit={(v) => write(list.map((o, j) => (j === i ? { ...o, blur: Math.max(0, v) } : o)))} />
                  <NumberField label="Spread" value={sh.spread ?? 0} onCommit={(v) => write(list.map((o, j) => (j === i ? { ...o, spread: v } : o)))} />
                  <ColorField label="Color" value={sh.color} fallback="#000000" onCommit={(v) => write(list.map((o, j) => (j === i ? { ...o, color: v } : o)))} />
                  <label className="chip-field wide inspector-toggle">
                    <span>Inner shadow</span>
                    <input
                      type="checkbox"
                      checked={!!sh.inset}
                      onChange={(e) => write(list.map((o, j) => (j === i ? { ...o, inset: e.target.checked } : o)))}
                    />
                  </label>
                </div>
              ))}
              <button
                className="inspector-action wide"
                onClick={() => write([...list, { x: 0, y: 4, blur: 12, color: '#00000033' }])}
              >
                <Icon name="plus" size={11} />
                Add shadow
              </button>
            </>
          )
        })()}
      </Section>

      <Section title="Filters">
        <NumberField label="Backdrop blur" value={node.backdropBlur ?? 0} onCommit={(v) => patch({ backdropBlur: Math.max(0, v) || undefined })} />
        <SelectField
          label="Filters"
          wide
          value={activeFilter(node)}
          options={[
            ['', 'None'],
            ['blur', 'Blur'],
            ['grayscale', 'Grayscale'],
            ['invert', 'Invert'],
            ['sepia', 'Sepia'],
            ['saturate', 'Saturate'],
            ['contrast', 'Contrast'],
          ]}
          onChange={(value) => patch({ filter: filterPreset(value) })}
        />
            </Section>
      {node.kind === 'frame' && (
        <Section title="Other styles">
        
          <label className="chip-field wide inspector-toggle">
            <span>Clip content</span>
            <input type="checkbox" checked={node.clip} onChange={(event) => patch({ clip: event.target.checked })} />
          </label>
                </Section>
      )}
      {node.kind === 'image' && (
        <Section title="Image">
          <SelectField
            label="Fit"
            wide
            value={node.imageFit ?? 'fill'}
            options={[['fill', 'Fill'], ['contain', 'Fit'], ['cover', 'Crop']]}
            onChange={(value) => patch({ imageFit: value as DocNode['imageFit'] })}
          />
          <button className="inspector-action wide" onClick={() => chooseImage(node.id)}>
            <Icon name="image" size={12} />Replace image
          </button>
        </Section>
      )}

      {(node.kind === 'frame' || isArtboard) && <GuidesSection node={node} patch={patch} />}



      <ExportSection node={node} />
    </>
  )
}





import { ARTBOARD_PRESETS } from '../model/types'
import { addArtboard, setTool } from '../model/store'

/** Paper frame-tool panel: device preset list replaces the inspector. */
function FramePanel() {
  return (
    <>
      <header className="panel-head">
        <span className="panel-head-label">
          <Icon name="frame" size={13} />
          Frame
        </span>
        <span className="panel-head-actions">
          <PanelChrome />
        </span>
      </header>
      <PanelCta />
      <Section title="Presets">
        {ARTBOARD_PRESETS.map((group) => (
          <div key={group.category} className="preset-block">
            <div className="preset-group-label">{group.category}</div>
            {group.presets.map((p) => (
              <button
                key={p.label}
                className="preset-row wide"
                onClick={() => {
                  addArtboard(p.width, p.height, p.label)
                  setTool('select')
                }}
              >
                <span className="preset-name">{p.label}</span>
                <span className="preset-size">
                  {p.width} × {p.height}
                </span>
              </button>
            ))}
          </div>
        ))}
      </Section>
    </>
  )
}

/** Paper comment-tool panel: page comment list with sort/filter, resolve and delete. */
function CommentPanel() {
  const doc = useEditor((s) => s.doc)
  const pageId = useEditor((s) => s.ui.pageId)
  const [showResolved, setShowResolved] = useState(false)
  const [sort, setSort] = useState<'new' | 'old'>('new')
  const comments = (doc.comments ?? [])
    .filter((c) => c.pageId === pageId && (showResolved || !c.resolved))
    .sort((a, b) => (sort === 'new' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt))
  return (
    <>
      <header className="panel-head">
        <span className="panel-head-label">
          <Icon name="comment" size={13} />
          Comments
        </span>
        <span className="panel-head-actions">
          <PanelChrome />
        </span>
      </header>
      <PanelCta />
      <Section title={`Page comments (${comments.length})`}>
        <div className="comment-controls">
          <select className="chip-select" value={sort} onChange={(e) => setSort(e.target.value as 'new' | 'old')}>
            <option value="new">Newest first</option>
            <option value="old">Oldest first</option>
          </select>
          <label className="inspector-toggle">
            <span>Show resolved</span>
            <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
          </label>
        </div>
        {comments.length === 0 && <div className="layer-empty">No comments on this page — click the canvas to drop a pin.</div>}
        {comments.map((c) => (
          <div key={c.id} className={`comment-card${c.resolved ? ' is-resolved' : ''}`}>
            <div className="comment-text">{c.text}</div>
            {c.replies?.map((r, i) => (
              <div key={i} className="comment-reply">
                {r.text}
              </div>
            ))}
            <div className="comment-meta">
              {new Date(c.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="comment-actions">
              <button className="mini-btn" onClick={() => focusComment(c.x, c.y)}>
                Show
              </button>
              <button
                className="mini-btn"
                onClick={() => {
                  const text = window.prompt('Reply', '')
                  if (text?.trim()) replyToComment(c.id, text.trim())
                }}
              >
                Reply
              </button>
              <button className="mini-btn" onClick={() => updateComment(c.id, { resolved: !c.resolved })}>
                {c.resolved ? 'Reopen' : 'Resolve'}
              </button>
              <button className="mini-btn danger" onClick={() => deleteComment(c.id)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </Section>
    </>
  )
}

/** Paper right-panel chrome: collaborator avatars + zoom% menu. */
function PanelChrome() {
  const scale = useEditor((s) => s.camera.scale)
  return (
    <>
      <span className="avatar-stack" aria-hidden>
        <span className="avatar">
          <Icon name="user" size={11} />
        </span>
        <span className="avatar avatar-add">
          <Icon name="plus" size={9} />
        </span>
      </span>
      <button
        className="zoom-head"
        data-tooltip="Zoom options"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          openZoomMenu(rect.right - 180, rect.bottom + 4)
        }}
      >
        {Math.round(scale * 100)}%
        <Icon name="chevron-down" size={10} />
      </button>
    </>
  )
}

/** Paper inspector CTA strip below the panel header. */
function PanelCta() {
  return (
    <div className="panel-cta">
      <button className="copy-link" onClick={copyProjectLink}>
        Copy link <span className="kbd-hint">⌘L</span>
      </button>
    </div>
  )
}

function EmptyInspector() {
  const doc = useEditor((s) => s.doc)
  const pageId = useEditor((s) => s.ui.pageId)
  const cameras = useEditor((s) => s.camera)
  const page = doc.pages.find((p) => p.id === pageId) ?? null
  const artboards = pageArtboards(doc, pageId)
  const layers = countPageNodes(doc, pageId) - artboards.length
  return (
    <>
      <header className="panel-head">
        <span className="panel-head-label">
          <Icon name="pages" size={13} />
          {page?.name ?? 'Canvas'}
        </span>
        <span className="panel-head-actions">
          <span className="panel-head-meta">Nothing selected</span>
          <PanelChrome />
        </span>
      </header>
      <PanelCta />

      <Section title="Background">
        <div className="chip-field wide">
          <span className="chip-label">Fill</span>
          <span className="swatch">
            <span className="swatch-fill" style={{ background: '#EEEEEE' }} />
            <span className="swatch-frame" />
          </span>
          <span className="chip-input mono">#EEEEEE</span>
        </div>
      </Section>

      <Section title="Document">
        <div className="chip-field">
          <span className="chip-label">Artboards</span>
          <span className="chip-input">{artboards.length}</span>
        </div>
        <div className="chip-field">
          <span className="chip-label">Layers</span>
          <span className="chip-input">{layers}</span>
        </div>
        <div className="chip-field">
          <span className="chip-label">Pages</span>
          <span className="chip-input">{doc.pages.length}</span>
        </div>
        <div className="chip-field">
          <span className="chip-label">Zoom</span>
          <span className="chip-input">{Math.round(cameras.scale * 100)}%</span>
        </div>
      </Section>
    </>
  )
}

export function Inspector() {
  const tool = useEditor((s) => s.ui.tool)
  const selection = useEditor((s) => s.ui.selection)
  const doc = useEditor((s) => s.doc)
  const node = selection.length === 1 ? doc.nodes[selection[0]] : null
  const parent = node?.parentId ? doc.nodes[node.parentId] : null

  if (selection.length > 1) {
    return (
      <aside className="inspector">
        <header className="panel-head">
          <span className="panel-head-label">Multi-select</span>
          <span className="panel-head-actions">
            <span className="panel-head-meta">{selection.length} objects</span>
            <PanelChrome />
          </span>
        </header>
      <PanelCta />
        <div className="multi-count">
          {selection.length}
          <span> objects</span>
        </div>
        <p className="multi-note">Drag to move; group, duplicate or delete. ⇧-click adds to selection.</p>
        <MultiTransform ids={selection} />
        <SelectionColors ids={selection} />
        <ExportSection />
      <PanelResize side="right" />
      </aside>
    )
  }

  return (
    <aside className="inspector">
      {tool === 'frame' ? (
        <FramePanel />
      ) : tool === 'comment' ? (
        <CommentPanel />
      ) : node ? (
        <NodeInspector node={node} parent={parent} />
      ) : (
        <EmptyInspector />
      )}
      <PanelResize side="right" />
    </aside>
  )
}
