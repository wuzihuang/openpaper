import type { DocNode, Fill, GradientStop } from './types'
import { SHADER_PRESETS as WEBGL_SHADER_PRESETS } from './shaders'

export function defaultStops(): GradientStop[] {
  return [
    { color: '#dddddd', position: 0, midpoint: 0.5 },
    { color: '#a4a4a4', position: 1, midpoint: 0.5 },
  ]
}

export function solidFill(color = '#dddddd'): Fill {
  return { type: 'solid', color, isVisible: true }
}

export function gradientFill(shape: 'linear' | 'radial' | 'conic' = 'linear'): Fill {
  return {
    type: 'gradient',
    stops: defaultStops(),
    interpolation: 'oklab',
    shape,
    center: { x: 0.5, y: 0.5 },
    angle: shape === 'linear' ? 180 : 0,
    length: 1,
    isVisible: true,
  }
}

export function fillsOf(node: DocNode): Fill[] {
  if (node.fills && node.fills.length > 0) return node.fills
  if (node.fill !== undefined) return [solidFill(node.fill)]
  return []
}

/** CSS `<color-hint>` interpolation hint between two stops, matching Paper's midpoint. */
function stopSequence(stops: GradientStop[]): string {
  const parts: string[] = []
  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i]
    parts.push(`${stop.color} ${round(stop.position * 100)}%`)
    const next = stops[i + 1]
    if (next && stop.midpoint !== 0.5) {
      const hint = stop.position + (next.position - stop.position) * stop.midpoint
      parts.push(`${round(hint * 100)}%`)
    }
  }
  return parts.join(', ')
}

function round(value: number) {
  return Math.round(value * 100) / 100
}

/** Paper gradient interpolation → CSS `in <space>` / `in oklch <dir> hue`. */
function interpolationCss(fill: Fill): string {
  const i = fill.interpolation
  if (!i || i === 'oklab') return ''
  if (i === 'oklch') return ' in oklch'
  return ` in oklch ${i.slice(6)} hue`
}

export function fillToCss(fill: Fill): string | null {
  if (!fill.isVisible) return null
  if (fill.type === 'solid') return `linear-gradient(${fill.color ?? '#dddddd'} 0 0)`
  if (fill.type === 'gradient') {
    const stops = stopSequence(fill.stops ?? [])
    const shape = fill.shape ?? 'linear'
    const interp = interpolationCss(fill)
    if (shape === 'linear') return `linear-gradient(${fill.angle ?? 180}deg${interp}, ${stops})`
    const center = fill.center ?? { x: 0.5, y: 0.5 }
    const at = `at ${round(center.x * 100)}% ${round(center.y * 100)}%`
    if (shape === 'radial') return `radial-gradient(${fill.length === 1 ? 'circle' : 'ellipse'} ${at}${interp}, ${stops})`
    return `conic-gradient(from ${fill.angle ?? 0}deg ${at}${interp}, ${stops})`
  }
  if (fill.type === 'image' && fill.imageSrc) {
    const fit = fill.imageFit ?? 'fill'
    const size = fit === 'cover' ? 'cover' : fit === 'contain' ? 'contain' : '100% 100%'
    return `url("${fill.imageSrc.replace(/"/g, '%22')}") center / ${size} no-repeat`
  }
  if (fill.type === 'pattern') return patternCss(fill)
  return null
}

const noiseSvg = (color: string) =>
  `url("data:image/svg+xml;utf8,` +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.7 0'/><feFlood flood-color='${color}'/><feComposite in2='SourceGraphic' operator='in'/></filter><rect width='120' height='120' filter='url(#n)'/></svg>`,
  ).replace(/'/g, '%27') +
  `")`

/** Paper shader approximations: tiling pattern fills rendered via CSS backgrounds. */
function patternCss(fill: Fill): string {
  const c = fill.color ?? '#000000'
  const s = Math.max(4, fill.patternSize ?? 12)
  switch (fill.pattern ?? 'dot-grid') {
    case 'lines':
      return `repeating-linear-gradient(0deg, transparent 0 ${s - 1.5}px, ${c} ${s - 1.5}px ${s}px)`
    case 'halftone': {
      const r = round(s * 0.35)
      return `radial-gradient(circle at center, ${c} ${r}px, transparent ${r + 0.6}px) 0 0/${s}px ${s}px repeat`
    }
    case 'noise':
      return `${noiseSvg(c)} 0 0/120px repeat`
    default: {
      const r = Math.max(0.8, round(s * 0.14))
      return `radial-gradient(circle at center, ${c} ${r}px, transparent ${r + 0.6}px) 0 0/${s}px ${s}px repeat`
    }
  }
}

export function imageFill(imageSrc: string, imageFit: Fill['imageFit'] = 'fill'): Fill {
  return { type: 'image', imageSrc, imageFit, isVisible: true }
}

/** Shader menu presets: real WebGL shader fills (GLSL in model/shaders.ts) plus
 * CSS pattern fills kept as lightweight tiling options. */
export const SHADER_PRESETS: { name: string; base?: string; fills: Fill[] }[] = [
  ...WEBGL_SHADER_PRESETS.map((p) => ({
    name: p.name,
    fills: [
      {
        type: 'shader',
        shaderKind: p.kind,
        shaderColors: p.colors,
        shaderBack: p.back,
        shaderParams: p.params,
        isVisible: true,
      } satisfies Fill,
    ],
  })),
  {
    name: 'Dot grid',
    base: '#f8fafc',
    fills: [{ type: 'pattern', pattern: 'dot-grid', color: '#94a3b8', patternSize: 14, isVisible: true }],
  },
  {
    name: 'Halftone',
    base: '#111827',
    fills: [{ type: 'pattern', pattern: 'halftone', color: '#e5e7eb', patternSize: 10, isVisible: true }],
  },
  {
    name: 'Stripes',
    base: '#ffffff',
    fills: [{ type: 'pattern', pattern: 'lines', color: '#cbd5e1', patternSize: 12, isVisible: true }],
  },
  {
    name: 'Noise',
    base: '#1e293b',
    fills: [{ type: 'pattern', pattern: 'noise', color: '#64748b', isVisible: true }],
  },
]

/** Combined CSS `background` value for all visible fills (top-most layer first). */
export function fillsToCss(node: DocNode): string | undefined {
  // Shader fills render via a WebGL canvas layer, not CSS.
  const fills = fillsOf(node)
  if (fills.length === 0) return undefined
  const layers = fills.map(fillToCss).filter((layer): layer is string => !!layer)
  return layers.length > 0 ? layers.join(', ') : 'transparent'
}

/** Per-fill blend modes → CSS background-blend-mode (one entry per rendered layer). */
export function fillsBlendMode(node: DocNode): string | undefined {
  const fills = fillsOf(node)
  const modes = fills.map((f) => (fillToCss(f) ? f.blendMode ?? 'normal' : null)).filter((m): m is string => m !== null)
  if (modes.length < 2) return undefined
  return modes.some((m) => m !== 'normal') ? modes.join(', ') : undefined
}

/** CSS `filter` value for a node's image effects (blur/brightness/contrast/etc.). */
export function filterToCss(filter?: DocNode['filter']): string | undefined {
  if (!filter) return undefined
  const parts: string[] = []
  if (filter.blur) parts.push(`blur(${filter.blur}px)`)
  if (filter.brightness != null && filter.brightness !== 1) parts.push(`brightness(${filter.brightness})`)
  if (filter.contrast != null && filter.contrast !== 1) parts.push(`contrast(${filter.contrast})`)
  if (filter.grayscale) parts.push(`grayscale(${filter.grayscale})`)
  if (filter.invert) parts.push(`invert(${filter.invert})`)
  if (filter.sepia) parts.push(`sepia(${filter.sepia})`)
  if (filter.saturate != null && filter.saturate !== 1) parts.push(`saturate(${filter.saturate})`)
  if (filter.hueRotate) parts.push(`hue-rotate(${filter.hueRotate}deg)`)
  return parts.length ? parts.join(' ') : undefined
}

function hexToRgb(color: string): [number, number, number, number] | null {
  const hex = color.match(/^#([0-9a-fA-F]{3,8})$/)?.[1]
  if (!hex) return null
  const full = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex
  const n = parseInt(full.slice(0, 6), 16)
  const a = full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a]
}

function lerpColor(a: string, b: string, t: number): string {
  const ca = hexToRgb(a)
  const cb = hexToRgb(b)
  if (!ca || !cb) return t < 0.5 ? a : b
  const mix = (i: number) => Math.round(ca[i] + (cb[i] - ca[i]) * t)
  const alpha = ca[3] + (cb[3] - ca[3]) * t
  const rgb = `#${((1 << 24) | (mix(0) << 16) | (mix(1) << 8) | mix(2)).toString(16).slice(1)}`
  if (alpha >= 1) return rgb
  const aHex = Math.round(alpha * 255).toString(16).padStart(2, '0')
  return rgb + aHex
}

/** Expand midpoint hints into flat SVG stops (SVG has no interpolation hints). */
export function svgStops(fill: Fill): GradientStop[] {
  const stops = [...(fill.stops ?? [])].sort((a, b) => a.position - b.position)
  const out: GradientStop[] = []
  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i]
    const next = stops[i + 1]
    out.push(stop)
    if (next && stop.midpoint !== 0.5 && next.position > stop.position) {
      const midPos = stop.position + (next.position - stop.position) * stop.midpoint
      // A CSS color hint marks where the 50% blend lands; approximating with a
      // stop at that position yields two linear segments through the midpoint.
      out.push({ color: lerpColor(stop.color, next.color, 0.5), position: midPos, midpoint: 0.5 })
    }
  }
  return out.sort((a, b) => a.position - b.position)
}
