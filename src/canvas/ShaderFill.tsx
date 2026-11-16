import { memo, useEffect, useRef } from 'react'
import type { Fill } from '../model/types'
import { SHADER_VERT, shaderDef } from '../model/shaders'

/** One shared WebGL2 context per page would be ideal; a per-fill canvas with a
 * cached program is simple and sufficient at design-tool node counts. */
interface GlState {
  gl: WebGL2RenderingContext
  prog: WebGLProgram
  loc: Record<string, WebGLUniformLocation | null>
  noiseTex?: WebGLTexture
  raf: number
  start: number
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type)
  if (!sh) return null
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn('[shader]', gl.getShaderInfoLog(sh))
    gl.deleteShader(sh)
    return null
  }
  return sh
}

function initGl(canvas: HTMLCanvasElement, kind: string): GlState | null {
  const def = shaderDef(kind)
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, alpha: true, antialias: false, preserveDrawingBuffer: true })
  if (!def || !gl) return null
  const vs = compile(gl, gl.VERTEX_SHADER, SHADER_VERT)
  const fs = compile(gl, gl.FRAGMENT_SHADER, def.frag)
  if (!vs || !fs) return null
  const prog = gl.createProgram()
  if (!prog) return null
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn('[shader]', gl.getProgramInfoLog(prog))
    return null
  }
  gl.useProgram(prog)
  // Fullscreen quad.
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const pos = gl.getAttribLocation(prog, 'a_pos')
  gl.enableVertexAttribArray(pos)
  gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0)

  const loc: GlState['loc'] = {}
  for (const u of ['u_time', 'u_colors', 'u_colorsCount', 'u_colorBack', 'u_noiseTexture']) {
    loc[u] = gl.getUniformLocation(prog, u)
  }
  for (const p of def.params) loc[p.key] = gl.getUniformLocation(prog, p.key)
  for (const c of def.extraColorUniforms ?? []) loc[c.key] = gl.getUniformLocation(prog, c.key)

  let noiseTex: WebGLTexture | undefined
  if (def.hasNoise) {
    noiseTex = gl.createTexture() ?? undefined
    const size = 128
    const data = new Uint8Array(size * size)
    for (let i = 0; i < data.length; i++) data[i] = Math.floor(Math.random() * 256)
    gl.bindTexture(gl.TEXTURE_2D, noiseTex ?? null)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, size, size, 0, gl.RED, gl.UNSIGNED_BYTE, data)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
  }
  return { gl, prog, loc, noiseTex, raf: 0, start: performance.now() }
}

/** CSS color → 0..1 rgba tuple for shader uniforms. */
function rgbaTuple(value: string): [number, number, number, number] {
  const m = /^rgba?\(([^)]+)\)$/.exec(value.trim())
  if (m) {
    const parts = m[1].split(',').map((p) => parseFloat(p.trim()))
    return [(parts[0] ?? 0) / 255, (parts[1] ?? 0) / 255, (parts[2] ?? 0) / 255, parts[3] ?? 1]
  }
  const hex = /^#([0-9a-fA-F]{3,8})$/.exec(value.trim())?.[1]
  if (!hex) return [0, 0, 0, 1]
  const full = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex
  const n = parseInt(full.slice(0, 6), 16)
  const a = full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, a]
}

export const ShaderFill = memo(function ShaderFill({ fill }: { fill: Fill }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<GlState | null>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const st = initGl(canvas, fill.shaderKind ?? '')
    stateRef.current = st
    return () => {
      // Note: do NOT loseContext() here — React StrictMode remounts effects on
      // the same canvas element, and a lost context would stay dead. The GL
      // context is released when the canvas is garbage-collected.
      stateRef.current = null
      if (st) cancelAnimationFrame(st.raf)
    }
  }, [fill.shaderKind])

  useEffect(() => {
    const st = stateRef.current
    const canvas = ref.current
    if (!st || !canvas) return
    const def = shaderDef(fill.shaderKind ?? '')
    if (!def) return

    const render = () => {
      const { gl, loc } = st
      if (gl.isContextLost()) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr))
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      gl.viewport(0, 0, w, h)
      gl.useProgram(st.prog)
      if (loc.u_time) gl.uniform1f(loc.u_time, (performance.now() - st.start) / 1000)

      const colors = fill.shaderColors ?? []
      const flat = new Float32Array(40)
      colors.slice(0, 10).forEach((c, i) => flat.set(rgbaTuple(c), i * 4))
      if (loc.u_colors) gl.uniform4fv(loc.u_colors, flat)
      if (loc.u_colorsCount) gl.uniform1f(loc.u_colorsCount, Math.max(1, Math.min(10, colors.length)))

      if (def.hasBack && loc.u_colorBack) {
        gl.uniform4fv(loc.u_colorBack, rgbaTuple(fill.shaderBack ?? '#00000000'))
      }
      if (def.hasNoise && st.noiseTex && loc.u_noiseTexture) {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, st.noiseTex)
        gl.uniform1i(loc.u_noiseTexture, 0)
      }
      for (const c of def.extraColorUniforms ?? []) {
        const l = loc[c.key]
        if (l) gl.uniform4fv(l, rgbaTuple(fill.shaderExtraColors?.[c.key] ?? '#ffffff'))
      }
      for (const p of def.params) {
        const l = loc[p.key]
        if (l) {
          const v = fill.shaderParams?.[p.key] ?? p.default
          if (p.bool) gl.uniform1i(l, Math.round(v))
          else gl.uniform1f(l, v)
        }
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      st.raf = requestAnimationFrame(render)
    }
    // Draw a first frame synchronously — RAF doesn't fire in hidden/occluded
    // tabs, which would otherwise leave the canvas blank until visible.
    render()
    return () => cancelAnimationFrame(st.raf)
  }, [fill.shaderKind, fill.shaderColors, fill.shaderBack, fill.shaderParams, fill.shaderExtraColors])

  return <canvas ref={ref} className="shader-fill" />
})
