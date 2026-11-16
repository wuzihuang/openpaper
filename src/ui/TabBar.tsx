import { useEffect, useState } from 'react'
import { closeOtherTabs, closeTab, ensureTab, listTabs, moveTab, pruneTabs } from '../model/tabs'
import { currentDocId, listDocs } from '../model/docs'
import { createFile, duplicateFile, openFile, renameFile, toggleFileBrowser, useEditor } from '../model/store'
import { fileHash, projectLink, copyText } from '../model/links'
import { openMenu } from './menuStore'
import { showToast } from './Toast'
import { Icon } from './Icon'

function useTabs(): string[] {
  const [tabs, setTabs] = useState<string[]>(() => listTabs())
  useEffect(() => {
    const sync = () => setTabs(listTabs())
    window.addEventListener('openpaper:tabs', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('openpaper:tabs', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return tabs
}

/** Paper appBar: fixed Home tab + one tab per open file + new-tab button. */
export function TabBar() {
  const fileBrowserVisible = useEditor((s) => s.ui.fileBrowserVisible)
  const uiVisible = useEditor((s) => s.ui.uiVisible)
  const tabs = useTabs()
  const docs = listDocs()
  const active = currentDocId()

  useEffect(() => {
    pruneTabs(new Set(docs.map((d) => d.id)))
    ensureTab(active)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!uiVisible) return null

  const openTabMenu = (event: React.MouseEvent, id: string) => {
    event.preventDefault()
    const meta = docs.find((d) => d.id === id)
    openMenu(event.clientX, event.clientY, [
      {
        type: 'item',
        label: 'Rename tab',
        onSelect: () => {
          const name = window.prompt('Rename file', meta?.name ?? '')
          if (name?.trim()) renameFile(id, name.trim())
        },
      },
      { type: 'item', label: 'Duplicate file', onSelect: () => duplicateFile(id) },
      {
        type: 'item',
        label: 'Copy link',
        onSelect: () => void copyText(`${projectLink()}${fileHash(id)}`).then((ok) => showToast(ok ? 'Link copied' : 'Copy failed')),
      },
      { type: 'separator' },
      { type: 'item', label: 'Reload tab', onSelect: () => (id === active ? location.reload() : openFile(id)) },
      { type: 'separator' },
      {
        type: 'item',
        label: 'Close tab',
        disabled: tabs.length <= 1,
        onSelect: () => {
          const rest = closeTab(id)
          if (id === active && rest.length) openFile(rest[rest.length - 1])
        },
      },
      {
        type: 'item',
        label: 'Close other tabs',
        disabled: tabs.length <= 1,
        onSelect: () => {
          closeOtherTabs(id)
          if (id !== active) openFile(id)
        },
      },
    ])
  }

  return (
    <div className="tab-bar" role="tablist">
      <button
        className="tab home-tab"
        role="tab"
        aria-selected={fileBrowserVisible}
        data-active={fileBrowserVisible}
        data-tooltip="Home"
        onClick={() => toggleFileBrowser(true)}
      >
        <Icon name="menu" size={13} />
      </button>
      {tabs.map((id, index) => {
        const meta = docs.find((d) => d.id === id)
        if (!meta) return null
        return (
          <div
            key={id}
            className="tab file-tab"
            role="tab"
            aria-selected={id === active && !fileBrowserVisible}
            data-active={id === active && !fileBrowserVisible}
            draggable
            onDragStart={(e) => e.dataTransfer.setData('text/plain', String(index))}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const from = Number(e.dataTransfer.getData('text/plain'))
              if (Number.isInteger(from) && tabs[from]) moveTab(tabs[from], index)
            }}
            onClick={() => openFile(id)}
            onAuxClick={(e) => {
              if (e.button === 1) {
                const rest = closeTab(id)
                if (id === active && rest.length) openFile(rest[rest.length - 1])
              }
            }}
            onDoubleClick={() => {
              const name = window.prompt('Rename file', meta.name)
              if (name?.trim()) renameFile(id, name.trim())
            }}
            onContextMenu={(e) => openTabMenu(e, id)}
          >
            <Icon name="doc" size={12} />
            <span className="tab-name">{meta.name}</span>
            {tabs.length > 1 && (
              <button
                className="tab-close"
                data-tooltip="Close tab"
                onClick={(e) => {
                  e.stopPropagation()
                  const rest = closeTab(id)
                  if (id === active && rest.length) openFile(rest[rest.length - 1])
                }}
              >
                <Icon name="close" size={10} />
              </button>
            )}
          </div>
        )
      })}
      <button className="tab new-tab" data-tooltip="New file (⌘N)" onClick={() => createFile()}>
        <Icon name="plus" size={13} />
      </button>
    </div>
  )
}
