import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { closeMenu, useMenuState, type MenuItem, type MenuState } from './menuStore'

const MARGIN = 8

function actionableIndexes(menu: MenuState) {
  const out: number[] = []
  menu.items.forEach((entry, index) => {
    if (entry.type === 'item' && !entry.disabled) out.push(index)
  })
  return out
}

export function ContextMenu() {
  const menu = useMenuState()
  const ref = useRef<HTMLDivElement>(null)
  const activeRef = useRef(-1)
  const [active, setActive] = useState(-1)
  const [placed, setPlaced] = useState<{ menu: MenuState; x: number; y: number } | null>(null)

  const position = placed && placed.menu === menu ? placed : null

  useLayoutEffect(() => {
    activeRef.current = -1
    setActive(-1)
    if (!menu) return
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = Math.max(MARGIN, Math.min(menu.x, window.innerWidth - rect.width - MARGIN))
    const y = Math.max(MARGIN, Math.min(menu.y, window.innerHeight - rect.height - MARGIN))
    setPlaced({ menu, x, y })
    el.focus({ preventScroll: true })
  }, [menu])

  useEffect(() => {
    if (!menu) return
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current?.contains(event.target as Node)) return
      closeMenu()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        closeMenu()
        return
      }
      const indexes = actionableIndexes(menu)
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        event.stopImmediatePropagation()
        if (indexes.length === 0) return
        const at = indexes.indexOf(activeRef.current)
        const next =
          event.key === 'ArrowDown'
            ? indexes[(at + 1) % indexes.length]
            : indexes[(at - 1 + indexes.length) % indexes.length]
        activeRef.current = next
        setActive(next)
        return
      }
      if (event.key === 'Enter') {
        const entry = menu.items[activeRef.current]
        if (entry?.type === 'item' && !entry.disabled) {
          event.preventDefault()
          event.stopImmediatePropagation()
          closeMenu()
          entry.onSelect()
        }
      }
    }
    const onDismiss = () => closeMenu()
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('wheel', onDismiss, true)
    window.addEventListener('resize', onDismiss)
    window.addEventListener('blur', onDismiss)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('wheel', onDismiss, true)
      window.removeEventListener('resize', onDismiss)
      window.removeEventListener('blur', onDismiss)
    }
  }, [menu])

  if (!menu) return null

  const run = (item: MenuItem) => {
    if (item.disabled) return
    closeMenu()
    item.onSelect()
  }

  return createPortal(
    <div
      ref={ref}
      className="menu-popup"
      role="menu"
      tabIndex={-1}
      data-menu
      style={{
        left: position?.x ?? menu.x,
        top: position?.y ?? menu.y,
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      {menu.items.map((entry, index) => {
        if (entry.type === 'separator') {
          return <div key={`sep-${index}`} className="menu-separator" role="separator" />
        }
        return (
          <button
            key={`item-${index}`}
            type="button"
            className="menu-item"
            role="menuitem"
            data-active={active === index}
            disabled={entry.disabled}
            onMouseEnter={() => {
              activeRef.current = index
              setActive(index)
            }}
            onMouseLeave={() => {
              activeRef.current = -1
              setActive(-1)
            }}
            onClick={() => run(entry)}
          >
            <span className="menu-check">{entry.checked ? '✓' : ''}</span>
            <span className="menu-label">{entry.label}</span>
            {entry.hotkey && <span className="menu-hotkey">{entry.hotkey}</span>}
          </button>
        )
      })}
    </div>,
    document.body,
  )
}