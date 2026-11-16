/** Color-space conversions for the color-field copy menu (Paper: Copy RGB/HSL/OKLCH/OKLAB/Display P3). */

export interface Rgb {
  r: number
  g: number
  b: number
}

export function parseHexColor(value: string): Rgb | null {
  const hex = /^#([0-9a-fA-F]{6})$/.exec(value)?.[1] ?? null
  if (!hex) return null
  return {
    r: parseInt(hex.slice(0, 2), 16) / 255,
    g: parseInt(hex.slice(2, 4), 16) / 255,
    b: parseInt(hex.slice(4, 6), 16) / 255,
  }
}

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))

/** Paper color-field input: accepts any CSS color (oklch(), hsl(), rgb(), named),
 * normalized to hex (with alpha suffix when needed). Returns null when unparseable. */
export function normalizeCssColor(value: string): string | null {
  const v = value.trim()
  if (!v) return null
  if (v === 'transparent') return v
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase()
  if (/^#[0-9a-fA-F]{3,8}$/.test(v) || /^[a-zA-Z]+$/.test(v) || /\(|\)/.test(v)) {
    try {
      const ctx = document.createElement('canvas').getContext('2d')
      if (!ctx) return null
      // Sentinel: invalid assignments are ignored and leave fillStyle at the
      // sentinel, which distinguishes "#12345"-style garbage from real colors.
      ctx.fillStyle = '#010203'
      ctx.fillStyle = v
      const parsed = ctx.fillStyle as string
      if (parsed === '#010203' && v.toLowerCase() !== '#010203') return null
      const hex = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.exec(parsed)
      if (hex) return parsed.toLowerCase()
      const rgb = /^rgba?\(([^)]+)\)$/.exec(parsed)?.[1].split(',').map((n) => Number(n.trim()))
      if (rgb && rgb.length >= 3) {
        const h = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0')
        const alpha = rgb[3] !== undefined && rgb[3] < 1 ? h(rgb[3] * 255) : ''
        return `#${h(rgb[0])}${h(rgb[1])}${h(rgb[2])}${alpha}`
      }
    } catch {
      /* fall through */
    }
  }
  return null
}

function toHsl({ r, g, b }: Rgb): string {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return `hsl(0, 0%, ${Math.round(l * 100)}%)`
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`
}

function toOklab({ r, g, b }: Rgb): { l: number; a: number; b: number } {
  const lr = srgbToLinear(r)
  const lg = srgbToLinear(g)
  const lb = srgbToLinear(b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  }
}

const round3 = (n: number) => Math.round(n * 1000) / 1000

export function formatColorFormats(value: string): { label: string; text: string }[] {
  const rgb = parseHexColor(value)
  if (!rgb) return [{ label: 'HEX', text: value }]
  const { l, a, b } = toOklab(rgb)
  const c = Math.sqrt(a * a + b * b)
  let h = (Math.atan2(b, a) * 180) / Math.PI
  if (h < 0) h += 360
  const lr = srgbToLinear(rgb.r)
  const lg = srgbToLinear(rgb.g)
  const lb = srgbToLinear(rgb.b)
  // sRGB -> Display P3 (linear)
  const pr = 0.8224621 * lr + 0.177538 * lg
  const pg = 0.0331941 * lr + 0.9668058 * lg
  const pb = 0.0170827 * lr + 0.0723974 * lg + 0.9105199 * lb
  const toGamma = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055)
  return [
    { label: 'HEX', text: value.toUpperCase() },
    {
      label: 'RGB',
      text: `rgb(${Math.round(rgb.r * 255)}, ${Math.round(rgb.g * 255)}, ${Math.round(rgb.b * 255)})`,
    },
    { label: 'HSL', text: toHsl(rgb) },
    {
      label: 'OKLCH',
      text: `oklch(${round3(l)} ${round3(c)} ${round3(h)})`,
    },
    {
      label: 'OKLAB',
      text: `oklab(${round3(l)} ${round3(a)} ${round3(b)})`,
    },
    {
      label: 'Display P3',
      text: `color(display-p3 ${round3(toGamma(pr))} ${round3(toGamma(pg))} ${round3(toGamma(pb))})`,
    },
  ]
}
