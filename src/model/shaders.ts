// Paper WebGL shader fills — rendered by the official @paper-design/shaders-react
// components (paper.design's published GLSL, installed as npm packages). This
// registry maps Fill.shaderKind to a component plus inspector metadata.
import type { ComponentType } from 'react'
import {
  ColorPanels,
  Dithering,
  DotGrid,
  DotOrbit,
  FlutedGlass,
  GemSmoke,
  GodRays,
  GrainGradient,
  HalftoneCmyk,
  HalftoneDots,
  Heatmap,
  ImageDithering,
  LensDistortion,
  LiquidMetal,
  MeshGradient,
  Metaballs,
  NeuroNoise,
  PaperTexture,
  PerlinNoise,
  PulsingBorder,
  SimplexNoise,
  SmokeRing,
  Spiral,
  StaticMeshGradient,
  StaticRadialGradient,
  Swirl,
  Voronoi,
  Warp,
  Water,
  Waves,
  colorPanelsPresets,
  ditheringPresets,
  dotGridPresets,
  dotOrbitPresets,
  flutedGlassPresets,
  gemSmokePresets,
  godRaysPresets,
  grainGradientPresets,
  halftoneCmykPresets,
  halftoneDotsPresets,
  heatmapPresets,
  imageDitheringPresets,
  lensDistortionPresets,
  liquidMetalPresets,
  meshGradientPresets,
  metaballsPresets,
  neuroNoisePresets,
  paperTexturePresets,
  perlinNoisePresets,
  pulsingBorderPresets,
  simplexNoisePresets,
  smokeRingPresets,
  spiralPresets,
  staticMeshGradientPresets,
  staticRadialGradientPresets,
  swirlPresets,
  voronoiPresets,
  warpPresets,
  waterPresets,
  wavesPresets,
} from '@paper-design/shaders-react'
import {
  DitheringShapes,
  DitheringTypes,
  DotGridShapes,
  GemSmokeShapes,
  GlassDistortionShapes,
  GlassGridShapes,
  GrainGradientShapes,
  HalftoneCmykTypes,
  HalftoneDotsGrids,
  HalftoneDotsTypes,
  LiquidMetalShapes,
  PulsingBorderAspectRatios,
  ShaderFitOptions,
  WarpPatterns,
} from '@paper-design/shaders'
import type { Fill } from './types'

type EnumMap = Record<string, number>
type ShaderComponent = ComponentType<any>
export interface ShaderPresetParams {
  [key: string]: unknown
}
export interface ShaderPreset {
  name: string
  params: ShaderPresetParams
}

export interface ShaderParam {
  /** Component prop name — also the key stored in Fill.shaderParams. */
  key: string
  label: string
  min: number
  max: number
  step: number
  /** Component takes a boolean; the model stores 0/1. */
  bool?: boolean
  /** Component takes an enum key string; the model stores its numeric value. */
  enum?: EnumMap
}

export interface ShaderDef {
  id: string
  name: string
  component: ShaderComponent
  presets: ShaderPreset[]
  /** Params of the first (Default) preset — used as field fallbacks. */
  defaults: ShaderPresetParams
  /** Max entries in Fill.shaderColors the shader samples (0 = no palette). */
  maxColors: number
  /** Shader has a colorBack uniform. */
  hasBack?: boolean
  /** Extra named color props (colorFront/colorBloom/…) beyond colors+colorBack. */
  extraColors?: { key: string; label: string }[]
  /** Shader samples an image: 'required' renders nothing useful without one. */
  image?: 'optional' | 'required'
  /** Shader has u_time — exposes the speed param. */
  animated?: boolean
  params: ShaderParam[]
}

const P = (key: string, label: string, min: number, max: number, step: number, extra?: Partial<ShaderParam>): ShaderParam => ({
  key,
  label,
  min,
  max,
  step,
  ...extra,
})

function def(
  id: string,
  name: string,
  component: ShaderComponent,
  presets: readonly { name: string; params: ShaderPresetParams }[],
  opts: Partial<Omit<ShaderDef, 'id' | 'name' | 'component' | 'presets' | 'defaults'>> = {},
): ShaderDef {
  const out: ShaderDef = { id, name, component, presets: presets as ShaderPreset[], defaults: presets[0]?.params ?? {}, maxColors: 0, params: [], ...opts }
  // Official presets sometimes exceed the documented ranges or use finer
  // granularity than the documented step — widen so inspector edits of an
  // untouched preset never snap its values.
  for (const p of out.params) {
    for (const preset of out.presets) {
      const v = preset.params[p.key]
      if (typeof v !== 'number') continue
      if (v < p.min) p.min = v
      if (v > p.max) p.max = v
      while (p.step > 0.001 && Math.abs(v / p.step - Math.round(v / p.step)) > 1e-9) p.step /= 10
    }
  }
  return out
}

/** All 30 shaders published by paper.design, in canvas-picker order. */
export const SHADERS: ShaderDef[] = [
  def('mesh-gradient', 'Mesh gradient', MeshGradient as ShaderComponent, meshGradientPresets, {
    maxColors: 10,
    animated: true,
    params: [
      P('distortion', 'Distortion', 0, 1, 0.01),
      P('swirl', 'Swirl', 0, 1, 0.01),
      P('grainMixer', 'Grain mixer', 0, 1, 0.01),
      P('grainOverlay', 'Grain overlay', 0, 1, 0.01),
    ],
  }),
  def('static-mesh-gradient', 'Static mesh gradient', StaticMeshGradient as ShaderComponent, staticMeshGradientPresets, {
    maxColors: 10,
    animated: true,
    params: [
      P('positions', 'Positions', 0, 100, 1),
      P('waveX', 'Wave X', 0, 1, 0.01),
      P('waveXShift', 'Wave X shift', 0, 1, 0.01),
      P('waveY', 'Wave Y', 0, 1, 0.01),
      P('waveYShift', 'Wave Y shift', 0, 1, 0.01),
      P('mixing', 'Mixing', 0, 1, 0.01),
      P('grainMixer', 'Grain mixer', 0, 1, 0.01),
      P('grainOverlay', 'Grain overlay', 0, 1, 0.01),
    ],
  }),
  def('static-radial-gradient', 'Static radial gradient', StaticRadialGradient as ShaderComponent, staticRadialGradientPresets, {
    maxColors: 10,
    hasBack: true,
    animated: true,
    params: [
      P('radius', 'Radius', 0, 3, 0.01),
      P('focalDistance', 'Focal distance', 0, 3, 0.01),
      P('focalAngle', 'Focal angle', 0, 360, 1),
      P('falloff', 'Falloff', -1, 1, 0.01),
      P('mixing', 'Mixing', 0, 1, 0.01),
      P('distortion', 'Distortion', 0, 1, 0.01),
      P('distortionShift', 'Distortion shift', -1, 1, 0.01),
      P('distortionFreq', 'Distortion freq', 0, 20, 0.1),
      P('grainMixer', 'Grain mixer', 0, 1, 0.01),
      P('grainOverlay', 'Grain overlay', 0, 1, 0.01),
    ],
  }),
  def('grain-gradient', 'Grain gradient', GrainGradient as ShaderComponent, grainGradientPresets, {
    maxColors: 7,
    hasBack: true,
    animated: true,
    params: [
      P('softness', 'Softness', 0, 1, 0.01),
      P('intensity', 'Intensity', 0, 1, 0.01),
      P('noise', 'Noise', 0, 1, 0.01),
      P('shape', 'Shape', 0, 7, 1, { enum: GrainGradientShapes }),
    ],
  }),
  def('swirl', 'Swirl', Swirl as ShaderComponent, swirlPresets, {
    maxColors: 10,
    hasBack: true,
    animated: true,
    params: [
      P('bandCount', 'Bands', 0, 15, 1),
      P('twist', 'Twist', 0, 1, 0.01),
      P('center', 'Center', 0, 1, 0.01),
      P('proportion', 'Proportion', 0, 1, 0.01),
      P('softness', 'Softness', 0, 1, 0.01),
      P('noiseFrequency', 'Noise freq', 0, 1, 0.01),
      P('noise', 'Noise', 0, 1, 0.01),
    ],
  }),
  def('smoke-ring', 'Smoke ring', SmokeRing as ShaderComponent, smokeRingPresets, {
    maxColors: 10,
    hasBack: true,
    animated: true,
    params: [
      P('noiseScale', 'Noise scale', 0.01, 5, 0.01),
      P('thickness', 'Thickness', 0.01, 1, 0.01),
      P('radius', 'Radius', 0, 1, 0.01),
      P('innerShape', 'Inner shape', 0, 4, 0.01),
      P('noiseIterations', 'Noise iterations', 1, 8, 1),
    ],
  }),
  def('god-rays', 'God rays', GodRays as ShaderComponent, godRaysPresets, {
    maxColors: 5,
    hasBack: true,
    extraColors: [{ key: 'colorBloom', label: 'Bloom color' }],
    animated: true,
    params: [
      P('spotty', 'Spotty', 0, 1, 0.01),
      P('midSize', 'Mid size', 0, 1, 0.01),
      P('midIntensity', 'Mid intensity', 0, 1, 0.01),
      P('density', 'Density', 0, 1, 0.01),
      P('intensity', 'Intensity', 0, 1, 0.01),
      P('bloom', 'Bloom', 0, 1, 0.01),
    ],
  }),
  def('metaballs', 'Metaballs', Metaballs as ShaderComponent, metaballsPresets, {
    maxColors: 8,
    hasBack: true,
    animated: true,
    params: [P('count', 'Count', 1, 20, 1), P('size', 'Size', 0, 1, 0.01)],
  }),
  def('dot-orbit', 'Dot orbit', DotOrbit as ShaderComponent, dotOrbitPresets, {
    maxColors: 10,
    hasBack: true,
    animated: true,
    params: [
      P('size', 'Size', 0, 1, 0.01),
      P('sizeRange', 'Size range', 0, 1, 0.01),
      P('spreading', 'Spreading', 0, 1, 0.01),
      P('stepsPerColor', 'Steps per color', 1, 4, 1),
    ],
  }),
  def('simplex-noise', 'Simplex noise', SimplexNoise as ShaderComponent, simplexNoisePresets, {
    maxColors: 10,
    animated: true,
    params: [P('stepsPerColor', 'Steps per color', 1, 10, 1), P('softness', 'Softness', 0, 1, 0.01)],
  }),
  def('neuro-noise', 'Neuro noise', NeuroNoise as ShaderComponent, neuroNoisePresets, {
    hasBack: true,
    extraColors: [
      { key: 'colorFront', label: 'Foreground' },
      { key: 'colorMid', label: 'Mid' },
    ],
    animated: true,
    params: [P('brightness', 'Brightness', 0, 1, 0.01), P('contrast', 'Contrast', 0, 1, 0.01)],
  }),
  def('perlin-noise', 'Perlin noise', PerlinNoise as ShaderComponent, perlinNoisePresets, {
    hasBack: true,
    extraColors: [{ key: 'colorFront', label: 'Foreground' }],
    animated: true,
    params: [
      P('proportion', 'Proportion', 0, 1, 0.01),
      P('softness', 'Softness', 0, 1, 0.01),
      P('octaveCount', 'Octaves', 1, 8, 1),
      P('persistence', 'Persistence', 0.3, 1, 0.01),
      P('lacunarity', 'Lacunarity', 1.5, 10, 0.1),
    ],
  }),
  def('waves', 'Waves', Waves as ShaderComponent, wavesPresets, {
    hasBack: true,
    extraColors: [{ key: 'colorFront', label: 'Foreground' }],
    params: [
      P('rotation', 'Rotation', 0, 360, 1),
      P('shape', 'Shape', 0, 3, 0.01),
      P('frequency', 'Frequency', 0, 2, 0.01),
      P('amplitude', 'Amplitude', 0, 1, 0.01),
      P('spacing', 'Spacing', 0, 2, 0.01),
      P('proportion', 'Proportion', 0, 1, 0.01),
      P('softness', 'Softness', 0, 1, 0.01),
    ],
  }),
  def('voronoi', 'Voronoi', Voronoi as ShaderComponent, voronoiPresets, {
    maxColors: 5,
    extraColors: [
      { key: 'colorGap', label: 'Gap' },
      { key: 'colorGlow', label: 'Glow' },
    ],
    animated: true,
    params: [
      P('stepsPerColor', 'Steps per color', 1, 3, 1),
      P('distortion', 'Distortion', 0, 0.5, 0.01),
      P('gap', 'Gap', 0, 0.1, 0.005),
      P('glow', 'Glow', 0, 1, 0.01),
    ],
  }),
  def('warp', 'Warp', Warp as ShaderComponent, warpPresets, {
    maxColors: 10,
    animated: true,
    params: [
      P('proportion', 'Proportion', 0, 1, 0.01),
      P('softness', 'Softness', 0, 1, 0.01),
      P('shape', 'Pattern', 0, 2, 1, { enum: WarpPatterns }),
      P('shapeScale', 'Pattern scale', 0, 1, 0.01),
      P('distortion', 'Distortion', 0, 1, 0.01),
      P('swirl', 'Swirl', 0, 1, 0.01),
      P('swirlIterations', 'Swirl iterations', 2, 20, 1),
    ],
  }),
  def('spiral', 'Spiral', Spiral as ShaderComponent, spiralPresets, {
    hasBack: true,
    extraColors: [{ key: 'colorFront', label: 'Foreground' }],
    animated: true,
    params: [
      P('density', 'Density', 0, 1, 0.01),
      P('distortion', 'Distortion', 0, 1, 0.01),
      P('strokeWidth', 'Stroke width', 0, 1, 0.01),
      P('strokeTaper', 'Stroke taper', 0, 1, 0.01),
      P('strokeCap', 'Stroke cap', 0, 1, 0.01),
      P('noise', 'Noise', 0, 1, 0.01),
      P('noiseFrequency', 'Noise freq', 0, 1, 0.01),
      P('softness', 'Softness', 0, 1, 0.01),
    ],
  }),
  def('color-panels', 'Color panels', ColorPanels as ShaderComponent, colorPanelsPresets, {
    maxColors: 7,
    hasBack: true,
    animated: true,
    params: [
      P('angle1', 'Angle 1', -1, 1, 0.01),
      P('angle2', 'Angle 2', -1, 1, 0.01),
      P('length', 'Length', 0, 3, 0.01),
      P('edges', 'Edge highlight', 0, 1, 1, { bool: true }),
      P('blur', 'Blur', 0, 0.5, 0.01),
      P('fadeIn', 'Fade in', 0, 1, 0.01),
      P('fadeOut', 'Fade out', 0, 1, 0.01),
      P('density', 'Density', 0.25, 7, 0.05),
      P('gradient', 'Gradient', 0, 1, 0.01),
    ],
  }),
  def('pulsing-border', 'Pulsing border', PulsingBorder as ShaderComponent, pulsingBorderPresets, {
    maxColors: 5,
    hasBack: true,
    animated: true,
    params: [
      P('roundness', 'Roundness', 0, 1, 0.01),
      P('thickness', 'Thickness', 0, 1, 0.01),
      P('margin', 'Margin', 0, 1, 0.01),
      P('aspectRatio', 'Aspect ratio', 0, 1, 1, { enum: PulsingBorderAspectRatios }),
      P('softness', 'Softness', 0, 1, 0.01),
      P('intensity', 'Intensity', 0, 1, 0.01),
      P('bloom', 'Bloom', 0, 1, 0.01),
      P('spots', 'Spots', 1, 4, 1),
      P('spotSize', 'Spot size', 0, 1, 0.01),
      P('pulse', 'Pulse', 0, 1, 0.01),
      P('smoke', 'Smoke', 0, 1, 0.01),
      P('smokeSize', 'Smoke size', 0, 1, 0.01),
    ],
  }),
  def('dithering', 'Dithering', Dithering as ShaderComponent, ditheringPresets, {
    hasBack: true,
    extraColors: [{ key: 'colorFront', label: 'Foreground' }],
    animated: true,
    params: [
      P('shape', 'Shape', 0, 7, 1, { enum: DitheringShapes }),
      P('type', 'Type', 0, 4, 1, { enum: DitheringTypes }),
      P('size', 'Pixel size', 0.5, 20, 0.1),
    ],
  }),
  def('dot-grid', 'Dot grid', DotGrid as ShaderComponent, dotGridPresets, {
    hasBack: true,
    extraColors: [
      { key: 'colorFill', label: 'Fill' },
      { key: 'colorStroke', label: 'Stroke' },
    ],
    params: [
      P('size', 'Dot size', 1, 100, 1),
      P('gapX', 'Gap X', 2, 500, 1),
      P('gapY', 'Gap Y', 2, 500, 1),
      P('strokeWidth', 'Stroke width', 0, 50, 0.5),
      P('sizeRange', 'Size range', 0, 1, 0.01),
      P('opacityRange', 'Opacity range', 0, 1, 0.01),
      P('shape', 'Shape', 0, 3, 1, { enum: DotGridShapes }),
    ],
  }),
  def('halftone-dots', 'Halftone dots', HalftoneDots as ShaderComponent, halftoneDotsPresets, {
    hasBack: true,
    extraColors: [{ key: 'colorFront', label: 'Foreground' }],
    image: 'optional',
    animated: true,
    params: [
      P('size', 'Cell size', 0, 1, 0.01),
      P('grid', 'Grid', 0, 1, 1, { enum: HalftoneDotsGrids }),
      P('radius', 'Dot radius', 0, 2, 0.01),
      P('contrast', 'Contrast', 0, 1, 0.01),
      P('originalColors', 'Original colors', 0, 1, 1, { bool: true }),
      P('inverted', 'Inverted', 0, 1, 1, { bool: true }),
      P('grainMixer', 'Grain mixer', 0, 1, 0.01),
      P('grainOverlay', 'Grain overlay', 0, 1, 0.01),
      P('grainSize', 'Grain size', 0, 1, 0.01),
      P('type', 'Type', 0, 3, 1, { enum: HalftoneDotsTypes }),
    ],
  }),
  def('halftone-cmyk', 'Halftone CMYK', HalftoneCmyk as ShaderComponent, halftoneCmykPresets, {
    hasBack: true,
    extraColors: [
      { key: 'colorC', label: 'Cyan' },
      { key: 'colorM', label: 'Magenta' },
      { key: 'colorY', label: 'Yellow' },
      { key: 'colorK', label: 'Black' },
    ],
    image: 'optional',
    animated: true,
    params: [
      P('size', 'Cell size', 0, 1, 0.01),
      P('contrast', 'Contrast', 0, 1, 0.01),
      P('softness', 'Softness', 0, 1, 0.01),
      P('grainSize', 'Grain size', 0, 1, 0.01),
      P('grainMixer', 'Grain mixer', 0, 1, 0.01),
      P('grainOverlay', 'Grain overlay', 0, 1, 0.01),
      P('gridNoise', 'Grid noise', 0, 1, 0.01),
      P('floodC', 'Cyan flood', 0, 1, 0.01),
      P('floodM', 'Magenta flood', 0, 1, 0.01),
      P('floodY', 'Yellow flood', 0, 1, 0.01),
      P('floodK', 'Black flood', 0, 1, 0.01),
      P('gainC', 'Cyan gain', -1, 1, 0.01),
      P('gainM', 'Magenta gain', -1, 1, 0.01),
      P('gainY', 'Yellow gain', -1, 1, 0.01),
      P('gainK', 'Black gain', -1, 1, 0.01),
      P('type', 'Type', 0, 2, 1, { enum: HalftoneCmykTypes }),
    ],
  }),
  def('image-dithering', 'Image dithering', ImageDithering as ShaderComponent, imageDitheringPresets, {
    hasBack: true,
    extraColors: [
      { key: 'colorFront', label: 'Foreground' },
      { key: 'colorHighlight', label: 'Highlight' },
    ],
    image: 'required',
    animated: true,
    params: [
      P('type', 'Type', 0, 4, 1, { enum: DitheringTypes }),
      P('size', 'Pixel size', 0.5, 20, 0.1),
      P('colorSteps', 'Color steps', 1, 7, 1),
      P('originalColors', 'Original colors', 0, 1, 1, { bool: true }),
      P('inverted', 'Inverted', 0, 1, 1, { bool: true }),
    ],
  }),
  def('paper-texture', 'Paper texture', PaperTexture as ShaderComponent, paperTexturePresets, {
    hasBack: true,
    extraColors: [
      { key: 'colorPaper', label: 'Paper' },
      { key: 'colorShadow', label: 'Shadow' },
    ],
    image: 'optional',
    animated: true,
    params: [
      P('blending', 'Blending', 0, 1, 0.01),
      P('distortion', 'Distortion', -1, 1, 0.01),
      P('clip', 'Clip to image', 0, 1, 1, { bool: true }),
      P('angle', 'Light angle', 0, 360, 1),
      P('seed', 'Seed', 0, 1000, 1),
      P('roughness', 'Roughness', 0, 1, 0.01),
      P('roughnessSize', 'Roughness size', 0, 1, 0.01),
      P('roughnessRows', 'Roughness rows', 0, 1, 0.01),
      P('fiber', 'Fiber', 0, 1, 0.01),
      P('fiberSize', 'Fiber size', 0, 1, 0.01),
      P('folds', 'Folds', 0, 1, 0.01),
      P('foldSizeX', 'Fold size X', 0, 1, 0.01),
      P('foldSizeY', 'Fold size Y', 0, 1, 0.01),
      P('wrinkles', 'Wrinkles', 0, 1, 0.01),
      P('wrinkleSize', 'Wrinkle size', 0, 1, 0.01),
      P('crumples', 'Crumples', 0, 1, 0.01),
      P('crumpleCount', 'Crumple count', 2, 15, 1),
      P('drops', 'Drops', 0, 1, 0.01),
    ],
  }),
  def('fluted-glass', 'Fluted glass', FlutedGlass as ShaderComponent, flutedGlassPresets, {
    hasBack: true,
    extraColors: [
      { key: 'colorShadow', label: 'Shadow' },
      { key: 'colorHighlight', label: 'Highlight' },
    ],
    image: 'optional',
    animated: true,
    params: [
      P('shadows', 'Shadows', 0, 1, 0.01),
      P('size', 'Grid size', 0, 1, 0.01),
      P('angle', 'Angle', 0, 180, 1),
      P('distortion', 'Distortion', 0, 1, 0.01),
      P('shift', 'Shift', -1, 1, 0.01),
      P('blur', 'Blur', 0, 1, 0.01),
      P('edges', 'Edges', 0, 1, 0.01),
      P('margin', 'Margin', 0, 1, 0.01),
      P('stretch', 'Stretch', 0, 1, 0.01),
      P('distortionShape', 'Distortion shape', 0, 5, 1, { enum: GlassDistortionShapes }),
      P('highlights', 'Highlights', 0, 1, 0.01),
      P('shape', 'Grid shape', 0, 5, 1, { enum: GlassGridShapes }),
      P('grainMixer', 'Grain mixer', 0, 1, 0.01),
      P('grainOverlay', 'Grain overlay', 0, 1, 0.01),
    ],
  }),
  def('lens-distortion', 'Lens distortion', LensDistortion as ShaderComponent, lensDistortionPresets, {
    image: 'optional',
    animated: true,
    params: [
      P('spread', 'Spread', 0, 1, 0.01),
      P('bias', 'Bias', -1, 1, 0.01),
      P('angle', 'Angle', 0, 360, 1),
      P('perspective', 'Perspective', 0, 1, 0.01),
      P('count', 'Layers', 2, 50, 1),
      P('dispersion', 'Dispersion', 0, 1, 0.01),
      P('dispersionShift', 'Dispersion shift', -1, 1, 0.01),
      P('dispersionColor', 'Dispersion hue', 0, 1, 0.01),
      P('focusCenter', 'Focus center', 0, 1, 0.01),
      P('focusEdges', 'Focus edges', 0, 1, 0.01),
      P('swirl', 'Swirl', -1, 1, 0.01),
      P('noise', 'Noise', 0, 1, 0.01),
      P('noiseFrequency', 'Noise freq', 0, 1, 0.01),
      P('noiseOffset', 'Noise offset', 0, 1, 0.01),
      P('lensBulge', 'Lens bulge', -1, 1, 0.01),
      P('lensCircle', 'Lens circle', 0, 1, 0.01),
      P('grainMixer', 'Grain mixer', 0, 1, 0.01),
      P('grainOverlay', 'Grain overlay', 0, 1, 0.01),
      P('imageX', 'Image X', -1, 1, 0.01),
      P('imageY', 'Image Y', -1, 1, 0.01),
    ],
  }),
  def('liquid-metal', 'Liquid metal', LiquidMetal as ShaderComponent, liquidMetalPresets, {
    hasBack: true,
    extraColors: [{ key: 'colorTint', label: 'Tint' }],
    image: 'optional',
    animated: true,
    params: [
      P('repetition', 'Repetition', 1, 10, 1),
      P('shiftRed', 'Red shift', -1, 1, 0.01),
      P('shiftBlue', 'Blue shift', -1, 1, 0.01),
      P('contour', 'Contour', 0, 1, 0.01),
      P('softness', 'Softness', 0, 1, 0.01),
      P('distortion', 'Distortion', 0, 1, 0.01),
      P('angle', 'Angle', 0, 360, 1),
      P('shape', 'Shape', 0, 4, 1, { enum: LiquidMetalShapes }),
    ],
  }),
  def('water', 'Water', Water as ShaderComponent, waterPresets, {
    hasBack: true,
    extraColors: [{ key: 'colorHighlight', label: 'Highlight' }],
    image: 'optional',
    animated: true,
    params: [
      P('highlights', 'Highlights', 0, 1, 0.01),
      P('layering', 'Layering', 0, 1, 0.01),
      P('edges', 'Edges', 0, 1, 0.01),
      P('caustic', 'Caustic', 0, 1, 0.01),
      P('waves', 'Waves', 0, 1, 0.01),
      P('size', 'Size', 0.01, 7, 0.01),
    ],
  }),
  def('heatmap', 'Heatmap', Heatmap as ShaderComponent, heatmapPresets, {
    maxColors: 10,
    hasBack: true,
    image: 'required',
    animated: true,
    params: [
      P('contour', 'Contour', 0, 1, 0.01),
      P('angle', 'Angle', 0, 360, 1),
      P('noise', 'Noise', 0, 1, 0.01),
      P('innerGlow', 'Inner glow', 0, 1, 0.01),
      P('outerGlow', 'Outer glow', 0, 1, 0.01),
    ],
  }),
  def('gem-smoke', 'Gem smoke', GemSmoke as ShaderComponent, gemSmokePresets, {
    maxColors: 6,
    hasBack: true,
    extraColors: [{ key: 'colorInner', label: 'Inner' }],
    image: 'optional',
    animated: true,
    params: [
      P('innerDistortion', 'Inner distortion', 0, 1, 0.01),
      P('outerDistortion', 'Outer distortion', 0, 1, 0.01),
      P('outerGlow', 'Outer glow', 0, 1, 0.01),
      P('innerGlow', 'Inner glow', 0, 1, 0.01),
      P('offset', 'Offset', -1, 1, 0.01),
      P('angle', 'Angle', 0, 360, 1),
      P('size', 'Size', 0, 1, 0.01),
      P('shape', 'Shape', 0, 4, 1, { enum: GemSmokeShapes }),
    ],
  }),
]

const SHADER_BY_ID = new Map(SHADERS.map((s) => [s.id, s]))

/** Legacy shader ids from the hand-ported GLSL era → official component. */
const LEGACY_KINDS: Record<string, string> = {
  'bloom-dots': 'god-rays',
  'grainy-radial': 'static-radial-gradient',
  'spiral-bands': 'swirl',
  'sun-rays': 'color-panels',
}

export function shaderDef(kind: string | undefined): ShaderDef | undefined {
  return SHADER_BY_ID.get(LEGACY_KINDS[kind ?? ''] ?? kind ?? '')
}

/** Migrates a stored shader fill to the official-package model: legacy kind ids
 * and `u_`-prefixed uniform keys become component prop names. */
export function migrateShaderFill(fill: Fill): Fill {
  if (fill.type !== 'shader') return fill
  let next = fill
  const kind = LEGACY_KINDS[fill.shaderKind ?? '']
  if (kind && kind !== fill.shaderKind) next = { ...next, shaderKind: kind }
  if (next.shaderParams && Object.keys(next.shaderParams).some((k) => k.startsWith('u_'))) {
    next = {
      ...next,
      shaderParams: Object.fromEntries(Object.entries(next.shaderParams).map(([k, v]) => [k.replace(/^u_/, ''), v])),
    }
  }
  if (next.shaderExtraColors && Object.keys(next.shaderExtraColors).some((k) => k.startsWith('u_'))) {
    next = {
      ...next,
      shaderExtraColors: Object.fromEntries(Object.entries(next.shaderExtraColors).map(([k, v]) => [k.replace(/^u_/, ''), v])),
    }
  }
  return next
}

function enumKey(map: EnumMap, value: number): string {
  for (const [k, v] of Object.entries(map)) if (v === Math.round(value)) return k
  return Object.keys(map)[0]
}

/** Sizing props shared by every official component (ShaderSizingParams). */
const SIZING_KEYS = ['scale', 'rotation', 'offsetX', 'offsetY', 'originX', 'originY', 'worldWidth', 'worldHeight'] as const

/** Named color props carried on Fill.shaderExtraColors (keyed by prop name). */
const EXTRA_COLOR_KEYS = [
  'colorFront',
  'colorMid',
  'colorBloom',
  'colorInner',
  'colorShadow',
  'colorHighlight',
  'colorPaper',
  'colorTint',
  'colorGap',
  'colorGlow',
  'colorFill',
  'colorStroke',
  'colorC',
  'colorM',
  'colorY',
  'colorK',
]

/** Builds the official component's props from a shader fill. */
export function shaderProps(fill: Fill, def: ShaderDef, image?: string): Record<string, unknown> {
  const stored = fill.shaderParams ?? {}
  const props: Record<string, unknown> = {}
  if (def.maxColors > 0) {
    const colors = (fill.shaderColors ?? []).filter(Boolean).slice(0, def.maxColors)
    if (colors.length > 0) props.colors = colors
  }
  if (def.hasBack && fill.shaderBack !== undefined) props.colorBack = fill.shaderBack
  for (const c of def.extraColors ?? []) {
    const v = fill.shaderExtraColors?.[c.key]
    if (v !== undefined) props[c.key] = v
  }
  for (const p of def.params) {
    const v = stored[p.key]
    if (v === undefined) continue
    props[p.key] = p.bool ? v !== 0 : p.enum ? enumKey(p.enum, v) : v
  }
  if (stored.speed !== undefined) props.speed = stored.speed
  for (const k of SIZING_KEYS) if (stored[k] !== undefined) props[k] = stored[k]
  if (stored.fit !== undefined) props.fit = enumKey(ShaderFitOptions, stored.fit)
  if (def.image) props.image = fill.shaderImage ?? image
  return props
}

/** Converts an official preset into a shader Fill. */
export function presetFill(def: ShaderDef, preset: ShaderPreset): Fill {
  const params: Record<string, number> = {}
  for (const p of def.params) {
    const v = preset.params[p.key]
    if (v === undefined) continue
    if (p.bool) params[p.key] = v ? 1 : 0
    else if (p.enum) params[p.key] = p.enum[String(v)] ?? (typeof v === 'number' ? v : 0)
    else if (typeof v === 'number') params[p.key] = v
  }
  for (const k of SIZING_KEYS) if (typeof preset.params[k] === 'number') params[k] = preset.params[k] as number
  if (typeof preset.params.speed === 'number') params.speed = preset.params.speed as number
  if (preset.params.fit !== undefined) params.fit = ShaderFitOptions[preset.params.fit as keyof typeof ShaderFitOptions] ?? 0
  const extraColors: Record<string, string> = {}
  for (const key of EXTRA_COLOR_KEYS) {
    const v = preset.params[key]
    if (typeof v === 'string') extraColors[key] = v
  }
  return {
    type: 'shader',
    shaderKind: def.id,
    shaderColors: Array.isArray(preset.params.colors) ? (preset.params.colors as string[]).slice(0, def.maxColors || 10) : undefined,
    shaderBack: typeof preset.params.colorBack === 'string' ? preset.params.colorBack : undefined,
    shaderExtraColors: Object.keys(extraColors).length > 0 ? extraColors : undefined,
    shaderParams: params,
    isVisible: true,
  }
}

/** True when the fill's stored params/colors still match an official preset exactly. */
export function presetMatch(fill: Fill, def: ShaderDef, preset: ShaderPreset): boolean {
  const expected = presetFill(def, preset)
  const sameList = (a?: string[], b?: string[]) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
  if (!sameList(fill.shaderColors, expected.shaderColors)) return false
  if ((fill.shaderBack ?? null) !== (expected.shaderBack ?? null)) return false
  if (!sameList(Object.entries(fill.shaderExtraColors ?? {}).flat() as string[], Object.entries(expected.shaderExtraColors ?? {}).flat() as string[])) return false
  const a = fill.shaderParams ?? {}
  const b = expected.shaderParams ?? {}
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (Math.abs((a[k] ?? 0) - (b[k] ?? 0)) > 1e-6) return false
  }
  return true
}

