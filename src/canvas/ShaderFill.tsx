import { memo } from 'react'
import type { Fill } from '../model/types'
import { shaderDef, shaderProps } from '../model/shaders'

/** Sample image used by image-sampling shaders (FlutedGlass, Water, Heatmap…)
 * until the user picks a real one. Generated once per session. */
let sampleImage: string | null = null
function defaultShaderImage(): string {
  if (sampleImage) return sampleImage
  const c = document.createElement('canvas')
  c.width = 640
  c.height = 480
  const ctx = c.getContext('2d')
  if (!ctx) return ''
  const sky = ctx.createLinearGradient(0, 0, 0, 480)
  sky.addColorStop(0, '#ffd66e')
  sky.addColorStop(0.45, '#ff7a59')
  sky.addColorStop(0.75, '#b44fd0')
  sky.addColorStop(1, '#3b2d8f')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, 640, 480)
  ctx.fillStyle = '#fff3d6'
  ctx.beginPath()
  ctx.arc(430, 170, 62, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#2a1f6e'
  ctx.beginPath()
  ctx.moveTo(0, 360)
  ctx.lineTo(150, 250)
  ctx.lineTo(320, 355)
  ctx.lineTo(470, 265)
  ctx.lineTo(640, 370)
  ctx.lineTo(640, 480)
  ctx.lineTo(0, 480)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#17123f'
  ctx.beginPath()
  ctx.moveTo(0, 420)
  ctx.lineTo(200, 330)
  ctx.lineTo(400, 425)
  ctx.lineTo(560, 350)
  ctx.lineTo(640, 405)
  ctx.lineTo(640, 480)
  ctx.lineTo(0, 480)
  ctx.closePath()
  ctx.fill()
  sampleImage = c.toDataURL('image/png')
  return sampleImage
}

/** Shader fill layer — the real Paper GLSL via @paper-design/shaders-react. */
export const ShaderFill = memo(function ShaderFill({ fill }: { fill: Fill }) {
  const def = shaderDef(fill.shaderKind)
  if (!def) return null
  const Shader = def.component
  const props = shaderProps(fill, def, def.image ? defaultShaderImage() : undefined)
  return <Shader className="shader-fill" {...props} />
})
