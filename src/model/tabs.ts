/** Paper appBar tabs: ordered open-file tab list persisted in localStorage. */

const TABS_KEY = 'openpaper:tabs'

export function listTabs(): string[] {
  try {
    const raw = localStorage.getItem(TABS_KEY)
    const list = raw ? (JSON.parse(raw) as string[]) : []
    return Array.isArray(list) ? list.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

function writeTabs(ids: string[]) {
  localStorage.setItem(TABS_KEY, JSON.stringify(ids))
  window.dispatchEvent(new Event('openpaper:tabs'))
}

/** Ensure a doc has an open tab; returns the tab list. */
export function ensureTab(docId: string): string[] {
  const tabs = listTabs()
  if (!tabs.includes(docId)) {
    tabs.push(docId)
    writeTabs(tabs)
  }
  return tabs
}

export function closeTab(docId: string): string[] {
  const tabs = listTabs().filter((id) => id !== docId)
  writeTabs(tabs)
  return tabs
}

export function closeOtherTabs(docId: string) {
  writeTabs([docId])
}

export function moveTab(docId: string, toIndex: number) {
  const tabs = listTabs().filter((id) => id !== docId)
  tabs.splice(Math.max(0, Math.min(tabs.length, toIndex)), 0, docId)
  writeTabs(tabs)
}

export function pruneTabs(existingDocIds: Set<string>) {
  const tabs = listTabs().filter((id) => existingDocIds.has(id))
  writeTabs(tabs)
  return tabs
}
