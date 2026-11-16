/** Font catalog for the text font picker — system fonts plus a Paper-like
 * Google Fonts set, loaded on demand via the fonts.googleapis.com stylesheet. */

export const FONT_FAMILIES: { family: string; google?: boolean }[] = [
  { family: 'Inter', google: true },
  { family: 'SF Pro Text' },
  { family: 'system-ui' },
  { family: 'Roboto', google: true },
  { family: 'Roboto Condensed', google: true },
  { family: 'Roboto Mono', google: true },
  { family: 'Open Sans', google: true },
  { family: 'Lato', google: true },
  { family: 'Montserrat', google: true },
  { family: 'Poppins', google: true },
  { family: 'Source Sans 3', google: true },
  { family: 'Source Serif 4', google: true },
  { family: 'Source Code Pro', google: true },
  { family: 'IBM Plex Sans', google: true },
  { family: 'IBM Plex Mono', google: true },
  { family: 'Nunito', google: true },
  { family: 'Raleway', google: true },
  { family: 'Work Sans', google: true },
  { family: 'DM Sans', google: true },
  { family: 'DM Serif Display', google: true },
  { family: 'Manrope', google: true },
  { family: 'Outfit', google: true },
  { family: 'Space Grotesk', google: true },
  { family: 'Space Mono', google: true },
  { family: 'JetBrains Mono', google: true },
  { family: 'Fira Code', google: true },
  { family: 'Playfair Display', google: true },
  { family: 'Merriweather', google: true },
  { family: 'Lora', google: true },
  { family: 'PT Serif', google: true },
  { family: 'Libre Baskerville', google: true },
  { family: 'Oswald', google: true },
  { family: 'Archivo', google: true },
  { family: 'Rubik', google: true },
  { family: 'Karla', google: true },
  { family: 'Inconsolata', google: true },
  { family: 'Caveat', google: true },
  { family: 'Permanent Marker', google: true },
  { family: 'Arial' },
  { family: 'Helvetica' },
  { family: 'Helvetica Neue' },
  { family: 'Georgia' },
  { family: 'Times New Roman' },
  { family: 'Garamond' },
  { family: 'Courier New' },
  { family: 'Menlo' },
  { family: 'Verdana' },
  { family: 'Trebuchet MS' },
  { family: 'Impact' },
  { family: 'Comic Sans MS' },
  { family: 'monospace' },
]

const loaded = new Set<string>()

/** Lazy-load a font family (all weights, italics) exactly once. System/catalog
 * entries flagged `google: false` are skipped; anything else is tried against
 * Google Fonts (harmless when the family doesn't exist there). */
export function ensureFontLoaded(family: string) {
  const entry = FONT_FAMILIES.find((f) => f.family === family)
  if (entry && !entry.google) return
  if (loaded.has(family)) return
  loaded.add(family)
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  // Variable-axis request first; static fonts (e.g. Permanent Marker) have no
  // wght range/ital axis and return HTTP 400 — fall back to the default cut.
  link.onerror = () => {
    if (link.dataset.retry) return
    link.dataset.retry = '1'
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}&display=swap`
  }
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:ital,wght@0,100..900;1,100..900&display=swap`
  document.head.appendChild(link)
}

/** css2 stylesheet URL for catalog Google fonts used by a set of text nodes.
 * Unknown/non-catalog families are dropped so they can't 404 the whole sheet. */
export function googleFontsUrl(families: string[]): string | null {
  const ok = families.filter((f) => FONT_FAMILIES.find((e) => e.family === f)?.google)
  if (!ok.length) return null
  return `https://fonts.googleapis.com/css2?${ok.map((f) => `family=${encodeURIComponent(f)}`).join('&')}&display=swap`
}

/** Fetch a Google Fonts stylesheet and inline every woff2 as a data URI, for
 * SVGs rasterized via <img> (external resources are blocked there). */
export async function embeddedFontCss(families?: string[]): Promise<string> {
  const url = googleFontsUrl(families ?? [])
  if (!url) return ''
  try {
    let css = await (await fetch(url)).text()
    for (const m of [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/g)]) {
      try {
        const buf = new Uint8Array(await (await fetch(m[1])).arrayBuffer())
        let bin = ''
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
        css = css.replaceAll(m[0], `url(data:font/woff2;base64,${btoa(bin)})`)
      } catch {
        /* keep remote url for that subset */
      }
    }
    return css
  } catch {
    return ''
  }
}

/** Preload every Google font in the catalog (called when the font menu opens). */
export function ensureAllFontsLoaded() {
  for (const f of FONT_FAMILIES) if (f.google) ensureFontLoaded(f.family)
}
