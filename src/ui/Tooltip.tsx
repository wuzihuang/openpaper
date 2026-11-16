import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Side = 'bottom' | 'right' | 'top'

interface TipTarget {
  text: string
  side: Side
  rect: DOMRect
}

const DELAY = 420

export function Tooltip() {
  const [target, setTarget] = useState<TipTarget | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const [placed, setPlaced] = useState<{ target: TipTarget; x: number; y: number } | null>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let current: Element | null = null
    let visible = false

    const read = (el: Element): TipTarget => {
      const side = el.getAttribute('data-tooltip-side')
      return {
        text: el.getAttribute('data-tooltip') || '',
        side: side === 'right' || side === 'top' ? side : 'bottom',
        rect: el.getBoundingClientRect(),
      }
    }
    const clearTimer = () => {
      if (timer) clearTimeout(timer)
      timer = undefined
    }
    const hide = () => {
      clearTimer()
      current = null
      visible = false
      setTarget(null)
    }
    const onOver = (event: PointerEvent) => {
      const el = (event.target as HTMLElement | null)?.closest?.('[data-tooltip]')
      if (!el || !(el instanceof HTMLElement) || el.hasAttribute('disabled')) {
        if (current) hide()
        return
      }
      if (el === current) return
      current = el
      if (visible) {
        setTarget(read(el))
        return
      }
      clearTimer()
      timer = setTimeout(() => {
        if (!current) return
        visible = true
        setTarget(read(current))
      }, DELAY)
    }
    const onOut = (event: PointerEvent) => {
      if (!current) return
      const next = event.relatedTarget as Node | null
      if (next && current.contains(next)) return
      hide()
    }
    document.addEventListener('pointerover', onOver, true)
    document.addEventListener('pointerout', onOut, true)
    document.addEventListener('pointerdown', hide, true)
    document.addEventListener('wheel', hide, true)
    window.addEventListener('blur', hide)
    return () => {
      clearTimer()
      document.removeEventListener('pointerover', onOver, true)
      document.removeEventListener('pointerout', onOut, true)
      document.removeEventListener('pointerdown', hide, true)
      document.removeEventListener('wheel', hide, true)
      window.removeEventListener('blur', hide)
    }
  }, [])

  useLayoutEffect(() => {
    if (!target) {
      setPlaced(null)
      return
    }
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const { rect: anchor, side } = target
    let x = anchor.x + anchor.width / 2 - rect.width / 2
    let y = anchor.bottom + 6
    if (side === 'right') {
      x = anchor.right + 7
      y = anchor.y + anchor.height / 2 - rect.height / 2
    } else if (side === 'top') {
      y = anchor.y - rect.height - 6
    }
    x = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))
    y = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))
    setPlaced({ target, x, y })
  }, [target])

  if (!target) return null
  const position = placed && placed.target === target ? placed : null
  return createPortal(
    <div
      ref={ref}
      className="tooltip-popup"
      role="tooltip"
      style={{
        left: position?.x ?? 0,
        top: position?.y ?? 0,
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      {target.text}
    </div>,
    document.body,
  )
}
