export type NodeKind = 'frame' | 'rect' | 'ellipse' | 'text' | 'image' | 'vector' | 'instance'

export type FillType = 'solid' | 'gradient' | 'image' | 'pattern' | 'shader'
export type PatternKind = 'dot-grid' | 'halftone' | 'lines' | 'noise'
export type GradientShape = 'linear' | 'radial' | 'conic'
/** Paper gradient interpolation: OKLab / OKLCH + hue-direction variants (CSS `in oklch <dir> hue`). */
export type GradientInterpolation = 'oklab' | 'oklch' | 'oklch-longer' | 'oklch-increasing' | 'oklch-decreasing'

export interface GradientStop {
  color: string
  position: number
  midpoint: number
}

export interface Fill {
  type: FillType
  isVisible: boolean
  color?: string
  stops?: GradientStop[]
  shape?: GradientShape
  interpolation?: GradientInterpolation
  angle?: number
  center?: { x: number; y: number }
  length?: number
  imageSrc?: string
  imageFit?: 'fill' | 'contain' | 'cover'
  /** Paper shader fills — CSS-approximated tiling patterns. `color` is the pattern ink. */
  pattern?: PatternKind
  /** Tile size in px for pattern fills. */
  patternSize?: number
  /** Paper WebGL shader fills: shader id in model/shaders.ts. */
  shaderKind?: string
  /** Palette colors bound to the shader's u_colors uniform. */
  shaderColors?: string[]
  /** Background color for shaders with u_colorBack. */
  shaderBack?: string
  /** Numeric shader uniforms (u_distortion, u_swirl, u_count…). */
  shaderParams?: Record<string, number>
  /** Extra color uniforms keyed by uniform name (e.g. u_colorBloom). */
  shaderExtraColors?: Record<string, string>
  /** Paper per-fill blend — composited via CSS background-blend-mode. */
  blendMode?: string
}

/** Paper exportMeta.entries — per-node export presets (scale + format + filename suffix). */
export interface ExportEntry {
  scale: number
  format: 'png' | 'jpg' | 'webp' | 'pdf'
  suffix?: string
  /** Paper PDF-export quality (JPEG compression inside the PDF). */
  quality?: number
  /** Paper PDF-export resampling mode. */
  resampling?: 'smooth' | 'pixelated'
}

export interface LayoutGuide {
  id: string
  type: 'grid' | 'column' | 'row'
  visible?: boolean
  /** Track size (column width / row height / grid cell) in px. */
  trackSize?: number
  /** Track count; -1 = auto-fill the axis. */
  count?: number
  gap?: number
  align?: 'stretch' | 'center' | 'start' | 'end'
  margin?: number
}

export interface VectorPoint {
  x: number
  y: number
  handleIn?: { x: number; y: number }
  handleOut?: { x: number; y: number }
}

export interface NodeShadow {
  x: number
  y: number
  blur: number
  color: string
  spread?: number
  inset?: boolean
}

/** CSS-filter style node effects (Paper Filter/Backdrop sections). */
export interface NodeFilter {
  blur?: number
  brightness?: number
  contrast?: number
  grayscale?: number
  invert?: number
  sepia?: number
  saturate?: number
  hueRotate?: number
}

export type SizingMode = 'fixed' | 'fill' | 'hug'

export interface FlexLayout {
  direction: 'row' | 'column'
  gap: number
  /** Bound spacing token id — gap follows the token's numeric value. */
  gapToken?: string
  padding: number
  /** Paper per-axis padding (falls back to `padding` when unset). */
  paddingX?: number
  paddingY?: number
  /** Paper Individual padding — per-side overrides (falls back to paddingX/Y → padding). */
  paddingSides?: { top?: number; right?: number; bottom?: number; left?: number }
  mainAlign: 'start' | 'center' | 'end' | 'space-between'
  crossAlign: 'start' | 'center' | 'end' | 'stretch' | 'baseline' | 'baseline-last'
  /** Paper flexWrap + alignContent for wrapped lines. */
  wrap?: boolean
  alignContent?: 'start' | 'center' | 'end' | 'space-between' | 'stretch'
  hugW?: boolean
  hugH?: boolean
}

export interface DocNode {
  id: string
  kind: NodeKind
  name: string
  parentId: string | null
  children: string[]
  x: number
  y: number
  width: number
  height: number
  heightAuto?: boolean
  /** Paper click-created text: width hugs content (no wrapping); manual resize clears it. */
  widthAuto?: boolean
  /** Locked aspect ratio — inspector chain toggle; resize/W-H edits preserve proportions. */
  ratioLocked?: boolean
  layout?: FlexLayout
  sizing?: { w?: SizingMode; h?: SizingMode }
  /** Paper `isFreeformChild`: absolutely positioned inside a flex parent (removed from flow). */
  absoluteInFlex?: boolean
  /** Paper flex-item margin (uniform px). */
  margin?: number
  /** Paper flex-item alignSelf — overrides parent crossAlign. */
  alignSelf?: 'start' | 'center' | 'end' | 'stretch'
  component?: boolean
  instanceOf?: string
  /** Paper layout guides (Grid/Column/Row tracks) on frames/artboards — overlay bands. */
  layoutGuides?: LayoutGuide[]
  /** Paper exportMeta — per-node export preset entries. */
  exportMeta?: { entries: ExportEntry[] }
  overrides?: Record<string, { text?: string; color?: string; fill?: string; visible?: boolean }>
  fill?: string
  /** Bound design token id — node fill follows the token value. */
  fillToken?: string
  /** Bound token ids for numeric fields (Paper token references). */
  radiusToken?: string
  opacityToken?: string
  fontSizeToken?: string
  fontWeightToken?: string
  lineHeightToken?: string
  letterSpacingToken?: string
  fontFamilyToken?: string
  fills?: Fill[]
  points?: VectorPoint[]
  closed?: boolean
  stroke?: string
  strokeWidth?: number
  /** Paper svgStroke dashArray: [on, off, ...] pattern. */
  strokeDash?: number[]
  /** Paper svgStroke lineCap. */
  strokeCap?: 'butt' | 'round' | 'square'
  /** Paper svgStroke lineJoin + dashOffset. */
  strokeJoin?: 'miter' | 'round' | 'bevel'
  strokeDashOffset?: number
  /** Paper per-side borders (border{Top,Right,Bottom,Left}{Width,Color}). Overrides `stroke` for that side; `width:0` hides the side. */
  strokeSides?: Partial<Record<'top' | 'right' | 'bottom' | 'left', { width?: number; color?: string }>>
  /** Paper outline: CSS outline outside the border box. */
  outline?: { width: number; color: string; offset: number }
  /** Paper textStroke: WebKit text stroke. */
  textStroke?: { width: number; color: string }
  radius?: number
  /** Per-corner radii [top-left, top-right, bottom-right, bottom-left] (Paper cornerRadius split). */
  radiusCorners?: [number, number, number, number]
  /** Layout constraints when the parent frame resizes. */
  constraintsX?: 'left' | 'center' | 'right' | 'stretch'
  constraintsY?: 'top' | 'center' | 'bottom' | 'stretch'
  /** Rotation in degrees around the node center. */
  rotation?: number
  textDecoration?: 'underline' | 'line-through' | 'overline'
  textDecorationStyle?: 'solid' | 'dotted' | 'dashed' | 'wavy'
  /** Paper textDecoration.thickness — px. */
  textDecorationThickness?: number
  /** Paper textDecoration.skipInk — underline skips glyph descenders. */
  textDecorationSkipInk?: boolean
  /** Paper text-decoration-color — independent from text color. */
  textDecorationColor?: string
  /** Paper "Keep words": CSS word-break: keep-all (don't split words at line ends). */
  keepWords?: boolean
  /** Paper "Truncation": single-line ellipsis overflow. */
  textEllipsis?: boolean
  textTransform?: 'uppercase' | 'lowercase' | 'capitalize'
  opacity?: number
  visible: boolean
  locked?: boolean
  clip: boolean
  shadow?: NodeShadow
  /** Paper drop/box shadow lists — multiple entries, each toggled. */
  shadows?: NodeShadow[]
  blendMode?: string
  filter?: NodeFilter
  backdropBlur?: number
  imageSrc?: string
  imageFit?: 'fill' | 'contain' | 'cover'
  text?: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: number
  lineHeight?: number
  letterSpacing?: number
  /** Paper `lineClamp`: max rendered lines before ellipsis truncation (undefined = unclamped). */
  lineClamp?: number
  /** Paper text wrapping: default wrap, balanced, or pretty (avoids orphans). */
  textWrap?: 'wrap' | 'balance' | 'pretty'
  /** Paper case transform. */
  textCase?: 'none' | 'uppercase' | 'lowercase' | 'capitalize'
  textAlign?: 'left' | 'center' | 'right' | 'justify'
  fontStyle?: 'italic'
  /** OpenType feature tags (font-feature-settings), e.g. 'liga', 'frac', 'ss01'. */
  fontFeatures?: string[]
  color?: string
}

export interface DocPage {
  id: string
  name: string
  artboards: string[]
  thumbnailId?: string
  /** Paper page icon — short glyph/emoji shown before the name. */
  icon?: string
  /** Paper page separator — a non-selectable divider row in the page list. */
  divider?: boolean
}

export interface DocComment {
  id: string
  pageId: string
  x: number
  y: number
  text: string
  author?: string
  resolved?: boolean
  createdAt: number
  /** Paper comment threads. */
  replies?: { text: string; author?: string; createdAt: number }[]
}

/** Paper design token: a named reusable value — color fills or spacing numbers. */
export interface DesignToken {
  id: string
  name: string
  value: string
  /** Paper tokenState types — full Paper set. `color` binds fills; numeric
   * types bind node fields via TOKEN_BINDINGS; breakpoint/container are
   * organizational-only (no node field to bind). */
  type?: 'color' | 'spacing' | 'radius' | 'opacity' | 'fontSize' | 'fontWeight' | 'lineHeight' | 'letterSpacing' | 'fontFamily' | 'breakpoint' | 'container'
}

export interface Doc {
  pages: DocPage[]
  nodes: Record<string, DocNode>
  comments?: DocComment[]
  tokens?: DesignToken[]
}

/** Artboard size presets — extracted from Paper's shipped bundle. */
export const ARTBOARD_PRESETS: { category: string; presets: { label: string; width: number; height: number }[] }[] = [
  {
    category: 'Phone',
    presets: [
      { label: 'iPhone 18 Pro', width: 402, height: 874 },
      { label: 'iPhone 18 Pro Max', width: 440, height: 956 },
      { label: 'iPhone Duo', width: 466, height: 678 },
      { label: 'iPhone Duo unfolded', width: 890, height: 626 },
      { label: 'iPhone 17', width: 402, height: 874 },
      { label: 'iPhone Air', width: 420, height: 912 },
      { label: 'iPhone 16', width: 393, height: 852 },
      { label: 'iPhone 16 Plus', width: 430, height: 932 },
      { label: 'iPhone 16e', width: 390, height: 844 },
      { label: 'iPhone 13 mini', width: 375, height: 812 },
      { label: 'iPhone SE', width: 375, height: 667 },
      { label: 'Google Pixel 11', width: 412, height: 924 },
      { label: 'Google Pixel 11 Pro', width: 410, height: 914 },
      { label: 'Google Pixel 11 Pro XL', width: 448, height: 997 },
      { label: 'Google Pixel 11 Pro Fold', width: 791, height: 820 },
    ],
  },
  {
    category: 'Tablet',
    presets: [
      { label: 'iPad mini 8.3″', width: 744, height: 1133 },
      { label: 'iPad Air 11″', width: 820, height: 1180 },
      { label: 'iPad Air 13″', width: 1024, height: 1366 },
      { label: 'iPad Pro 11″', width: 834, height: 1210 },
      { label: 'iPad Pro 13″', width: 1032, height: 1376 },
      { label: 'Google Pixel Tablet', width: 1280, height: 800 },
      { label: 'Surface Pro 11', width: 1440, height: 960 },
    ],
  },
  {
    category: 'Desktop',
    presets: [
      { label: 'MacBook Air', width: 1280, height: 832 },
      { label: 'MacBook Pro 14″', width: 1512, height: 982 },
      { label: 'MacBook Pro 16″', width: 1728, height: 1117 },
      { label: 'iMac 24″', width: 2240, height: 1260 },
      { label: 'Studio Display 27″', width: 2560, height: 1440 },
      { label: 'Full HD', width: 1920, height: 1080 },
      { label: 'Wireframe', width: 1440, height: 1024 },
    ],
  },
  {
    category: 'Presentation',
    presets: [
      { label: 'Slide 16:9', width: 1920, height: 1080 },
      { label: 'Slide 4:3', width: 1024, height: 768 },
    ],
  },
  {
    category: 'Smartwatch',
    presets: [
      { label: 'Apple Watch Ultra 3', width: 211, height: 257 },
      { label: 'Apple Watch 46mm', width: 208, height: 248 },
      { label: 'Apple Watch 45mm', width: 198, height: 242 },
      { label: 'Apple Watch 44mm', width: 184, height: 224 },
      { label: 'Apple Watch 42mm', width: 187, height: 223 },
      { label: 'Apple Watch 41mm', width: 176, height: 215 },
      { label: 'Apple Watch 40mm', width: 162, height: 197 },
    ],
  },
  {
    category: 'Paper',
    presets: [
      { label: 'A4', width: 595, height: 842 },
      { label: 'A5', width: 420, height: 595 },
      { label: 'A6', width: 297, height: 420 },
      { label: 'Letter', width: 612, height: 792 },
      { label: 'Tabloid', width: 792, height: 1224 },
    ],
  },
  {
    category: 'Social media',
    presets: [
      { label: 'X post', width: 1200, height: 675 },
      { label: 'X header', width: 1500, height: 500 },
      { label: 'Facebook post', width: 1200, height: 630 },
      { label: 'Facebook cover', width: 820, height: 312 },
      { label: 'Instagram post', width: 1080, height: 1350 },
      { label: 'Instagram square', width: 1080, height: 1080 },
      { label: 'Instagram story', width: 1080, height: 1920 },
      { label: 'Dribbble shot', width: 1600, height: 1200 },
      { label: 'LinkedIn cover', width: 1584, height: 396 },
      { label: 'YouTube thumbnail', width: 1280, height: 720 },
    ],
  },
]

export interface Camera {
  x: number
  y: number
  scale: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export type Tool = 'select' | 'hand' | 'frame' | 'rect' | 'ellipse' | 'text' | 'pen' | 'comment' | 'zoom'

export interface Guides {
  x: number[]
  y: number[]
}

export const emptyRect: Rect = { x: 0, y: 0, width: 0, height: 0 }
