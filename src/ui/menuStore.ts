import { useSyncExternalStore } from 'react'

export interface MenuItem {
  type: 'item'
  label: string
  hotkey?: string
  disabled?: boolean
  checked?: boolean
  onSelect: () => void
}

export interface MenuSeparator {
  type: 'separator'
}

export type MenuEntry = MenuItem | MenuSeparator

export interface MenuState {
  x: number
  y: number
  items: MenuEntry[]
}

let menu: MenuState | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function openMenu(x: number, y: number, items: MenuEntry[]) {
  menu = { x, y, items }
  emit()
}

export function closeMenu() {
  if (!menu) return
  menu = null
  emit()
}

export function useMenuState() {
  return useSyncExternalStore(subscribe, () => menu)
}