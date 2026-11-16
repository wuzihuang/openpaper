import { useEffect, useMemo, useState } from 'react'
import type { Doc, DocNode, DocPage } from '../model/types'
import {
  addPage,
  applyTokenToSelection,
  createTokenFromSelection,
  createSpacingToken,
  createToken,
  deleteToken,
  renameNode,
  renamePage,
  reparentNode,
  select,
  setRenamingNode,
  setRenamingPage,
  setUI,
  startRenamingPage,
  switchPage,
  toggleFileBrowser,
  toggleSelect,
  updateNode,
  updateToken,
  useEditor,
} from '../model/store'
import { countPageNodes, firstArtboardOf, pageArtboards } from '../model/doc'
import { NodeView } from '../canvas/NodeView'
import { Icon } from './Icon'
import { openNodeMenu, openPageMenu, openProjectMenu } from './menuActions'
import { PanelResize } from './PanelResize'
import { projectName } from '../model/navigation'

function iconFor(node: DocNode): 'artboard' | 'frame' | 'square' | 'circle' | 'text' | 'image' | 'component' | 'instance' | 'pen' {
  if (node.kind === 'instance') return 'instance'
  if (node.component) return 'component'
  if (node.kind === 'vector') return 'pen'
  if (node.parentId === null) return 'artboard'
  if (node.kind === 'frame') return 'frame'
  if (node.kind === 'rect') return 'square'
  if (node.kind === 'ellipse') return 'circle'
  if (node.kind === 'image') return 'image'
  return 'text'
}

interface RowProps {
  node: DocNode
  depth: number
  selection: string[]
  query: string
}

function subtreeMatches(doc: { nodes: Record<string, DocNode> }, node: DocNode, query: string): boolean {
  if (!query) return true
  if (node.name.toLowerCase().includes(query)) return true
  return node.children.some((id) => {
    const child = doc.nodes[id]
    return child ? subtreeMatches(doc, child, query) : false
  })
}

function LayerRow({ node, depth, selection, query }: RowProps) {
  const doc = useEditor((s) => s.doc)
  const renaming = useEditor((s) => s.ui.renamingNodeId === node.id)
  const epoch = useEditor((s) => s.ui.layersEpoch)
  const [open, setOpen] = useState(true)
  useEffect(() => {
    if (epoch > 0) setOpen(false)
  }, [epoch])
  const selected = selection.includes(node.id)
  const hasChildren = node.children.length > 0
  const expanded = query ? true : open
  const [dropZone, setDropZone] = useState<'' | 'before' | 'after' | 'into'>('')

  return (
    <div className="layer-group">
      <div
        className={`layer-row${depth === 0 ? ' depth-0' : ''}${node.visible ? '' : ' is-hidden'}${node.locked ? ' is-locked' : ''}`}
        style={{ paddingLeft: 4 + depth * 12 }}
        draggable={!renaming}
        data-drop={dropZone || undefined}
        onDragStart={(event) => {
          event.dataTransfer.setData('text/plain', node.id)
          event.dataTransfer.effectAllowed = 'move'
          event.stopPropagation()
        }}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes('text/plain')) return
          event.preventDefault()
          event.stopPropagation()
          const rect = event.currentTarget.getBoundingClientRect()
          const rel = (event.clientY - rect.top) / rect.height
          const zone = rel < 0.3 ? 'before' : rel > 0.7 ? 'after' : node.kind === 'frame' ? 'into' : rel < 0.5 ? 'before' : 'after'
          setDropZone(zone)
          event.dataTransfer.dropEffect = 'move'
        }}
        onDragLeave={() => setDropZone('')}
        onDrop={(event) => {
          event.preventDefault()
          event.stopPropagation()
          const dragId = event.dataTransfer.getData('text/plain')
          setDropZone('')
          if (!dragId || dragId === node.id) return
          const rect = event.currentTarget.getBoundingClientRect()
          const rel = (event.clientY - rect.top) / rect.height
          const zone = rel < 0.3 ? 'before' : rel > 0.7 ? 'after' : node.kind === 'frame' ? 'into' : rel < 0.5 ? 'before' : 'after'
          if (zone === 'into') reparentNode(dragId, node.id, node.children.length)
          else {
            const parentId = node.parentId
            const list = parentId ? doc.nodes[parentId]?.children ?? [] : (doc.pages.find((p) => p.artboards.includes(node.id))?.artboards ?? [])
            const siblings = list.filter((c) => c !== dragId)
            const at = siblings.indexOf(node.id)
            reparentNode(dragId, parentId, at < 0 ? siblings.length : zone === 'before' ? at : at + 1)
          }
        }}
        onClick={(event) => {
          if (event.shiftKey) toggleSelect(node.id)
          else select([node.id])
        }}
        onDoubleClick={(event) => {
          event.stopPropagation()
          setRenamingNode(node.id)
        }}
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
          openNodeMenu(event.clientX, event.clientY, node.id)
        }}
        role="treeitem"
        aria-selected={selected}
        aria-expanded={hasChildren ? expanded : undefined}
        tabIndex={-1}
      >
        {hasChildren ? (
          <button
            className="layer-caret"
            data-open={expanded}
            onClick={(event) => {
              event.stopPropagation()
              setOpen(!open)
            }}
          >
            <Icon name="chevron" size={10} />
          </button>
        ) : (
          <span className="layer-caret" aria-hidden />
        )}
        <span className="layer-icon">
          <Icon name={iconFor(node)} size={12} />
        </span>
        {renaming ? (
          <input
            className="layer-rename"
            autoFocus
            defaultValue={node.name}
            onBlur={(event) => {
              renameNode(node.id, event.target.value)
              setRenamingNode(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
              if (event.key === 'Escape') setRenamingNode(null)
            }}
            onClick={(event) => event.stopPropagation()}
          />
        ) : (
          <span className="layer-name">{node.name}</span>
        )}
        <button
          className="layer-eye layer-lock"
          data-locked={!!node.locked}
          data-tooltip={node.locked ? 'Unlock' : 'Lock'}
          onClick={(event) => {
            event.stopPropagation()
            updateNode(node.id, { locked: !node.locked })
          }}
        >
          <Icon name={node.locked ? 'lock' : 'unlock'} size={12} />
        </button>
        <button
          className="layer-eye"
          data-tooltip={node.visible ? 'Hide' : 'Show'}
          onClick={(event) => {
            event.stopPropagation()
            updateNode(node.id, { visible: !node.visible })
          }}
        >
          <Icon name={node.visible ? 'eye' : 'eyeOff'} size={12} />
        </button>
      </div>
      {expanded &&
        node.children.map((childId) => {
          const child = doc.nodes[childId]
          if (!child || !subtreeMatches(doc, child, query)) return null
          return (
            <LayerRow key={childId} node={child} depth={depth + 1} selection={selection} query={query} />
          )
        })}
    </div>
  )
}

function PageThumb({ page, doc }: { page: DocPage; doc: Doc }) {
  const id = page.thumbnailId && doc.nodes[page.thumbnailId] ? page.thumbnailId : firstArtboardOf(doc, page)
  const node = id ? doc.nodes[id] : null
  if (!node) return <span className="page-thumb is-empty" aria-hidden />
  const scale = 22 / node.width
  return (
    <span className="page-thumb" aria-hidden style={{ background: node.fill ?? '#fff' }}>
      <span
        className="page-thumb-stage"
        style={{ width: node.width, height: node.height, transform: `scale(${scale})` }}
      >
        <NodeView node={node} doc={doc} isArtboard readOnly />
      </span>
    </span>
  )
}



/** Paper Theme tab: tokens grouped by type with per-type create + inline edit. */
const TOKEN_GROUPS: { type: string; label: string; def: string }[] = [
  { type: 'color', label: 'Colors', def: '#888888' },
  { type: 'spacing', label: 'Spacing', def: '8' },
  { type: 'radius', label: 'Radius', def: '8' },
  { type: 'opacity', label: 'Opacity', def: '1' },
  { type: 'fontSize', label: 'Font size', def: '14' },
  { type: 'fontWeight', label: 'Font weight', def: '400' },
  { type: 'lineHeight', label: 'Line height', def: '1.4' },
  { type: 'letterSpacing', label: 'Letter spacing', def: '0' },
  { type: 'fontFamily', label: 'Font family', def: 'Inter' },
  { type: 'breakpoint', label: 'Breakpoints', def: '768' },
  { type: 'container', label: 'Containers', def: '1200' },
]

function TokenList({ query }: { query: string }) {
  const tokens = useEditor((s) => s.doc.tokens) ?? []
  const selection = useEditor((s) => s.ui.selection)
  const [editingId, setEditingId] = useState<string | null>(null)
  const visible = tokens.filter((t) => !query || t.name.toLowerCase().includes(query))
  const byType = (type: string) => visible.filter((t) => (t.type ?? 'color') === type)
  const numeric = (type?: string) => type !== 'color' && type !== 'fontFamily' && type !== 'breakpoint' && type !== 'container'
  return (
    <div>
      {TOKEN_GROUPS.map((group) => {
        const items = byType(group.type)
        if (items.length === 0 && query) return null
        return (
          <div key={group.type} className="token-group">
            <div className="token-group-head">
              <span>{group.label}</span>
              <button
                className="mini-icon"
                data-tooltip={`New ${group.label.toLowerCase()} token`}
                onClick={() => createToken(group.type as never, group.def)}
              >
                <Icon name="plus" size={11} />
              </button>
            </div>
            {items.map((token) => (
              <div
                key={token.id}
                className="page-row component-row"
                onClick={() => applyTokenToSelection(token.id)}
                onDoubleClick={(event) => {
                  event.stopPropagation()
                  setEditingId(token.id)
                }}
                data-tooltip="Click to apply, double-click to rename"
              >
                <span className="layer-icon">
                  {(token.type ?? 'color') === 'color' ? (
                    <span className="token-swatch" style={{ background: token.value }}>
                      <input
                        type="color"
                        value={/^#[0-9a-fA-F]{6}$/.test(token.value) ? token.value : '#000000'}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => updateToken(token.id, { value: event.target.value })}
                      />
                    </span>
                  ) : (
                    <span className="token-swatch token-swatch-num">{(token.type ?? 'color').slice(0, 2)}</span>
                  )}
                </span>
                {editingId === token.id ? (
                  <input
                    className="layer-rename"
                    autoFocus
                    defaultValue={token.name}
                    onClick={(event) => event.stopPropagation()}
                    onBlur={(event) => {
                      updateToken(token.id, { name: event.currentTarget.value })
                      setEditingId(null)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        updateToken(token.id, { name: event.currentTarget.value })
                        setEditingId(null)
                      }
                      if (event.key === 'Escape') setEditingId(null)
                    }}
                  />
                ) : (
                  <span className="page-name">{token.name}</span>
                )}
                {numeric(token.type) ? (
                  <input
                    className="token-value-input"
                    type="number"
                    defaultValue={Number.parseFloat(token.value) || 0}
                    onClick={(event) => event.stopPropagation()}
                    onBlur={(event) => updateToken(token.id, { value: event.currentTarget.value })}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur()
                    }}
                  />
                ) : (token.type as string) === 'fontFamily' ? (
                  <input
                    className="token-value-input"
                    defaultValue={token.value}
                    onClick={(event) => event.stopPropagation()}
                    onBlur={(event) => updateToken(token.id, { value: event.currentTarget.value })}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur()
                    }}
                  />
                ) : (
                  <span className="page-count">{token.value}</span>
                )}
                <button
                  className="mini-icon"
                  data-tooltip="Delete token"
                  onClick={(event) => {
                    event.stopPropagation()
                    deleteToken(token.id)
                  }}
                >
                  <Icon name="trash" size={11} />
                </button>
              </div>
            ))}
            {items.length === 0 && !query && <div className="token-group-empty">—</div>}
          </div>
        )
      })}
      <button className="page-add" onClick={() => createSpacingToken()} data-tooltip="Create spacing token (binds flex gap)">
        <Icon name="plus" size={11} />
        New spacing token
      </button>
      <button className="page-add" onClick={() => createTokenFromSelection()} disabled={selection.length === 0}>
        <Icon name="plus" size={12} />
        New token from selection
      </button>
    </div>
  )
}

/** Paper pageList: collapsible, drag-resizable Pages section inside the Design tab. */
function PagesSection({ pageId, renamingPageId, doc }: { pageId: string; renamingPageId: string | null; doc: Doc }) {
  const open = useEditor((s) => s.ui.pageListOpen)
  const height = useEditor((s) => s.ui.pageListHeight)
  return (
    <div className="pages-section" style={{ height: open ? height : undefined }} data-open={open}>
      <div className="pages-head" onClick={() => setUI({ pageListOpen: !open })}>
        <Icon name="chevron" size={10} />
        <span>Pages</span>
        <button
          className="mini-icon pages-add"
          data-tooltip="New page"
          onClick={(event) => {
            event.stopPropagation()
            const id = addPage()
            startRenamingPage(id)
          }}
        >
          <Icon name="plus" size={11} />
        </button>
      </div>
      {open && (
        <div className="pages-list">
          {doc.pages.map((item) =>
            item.divider ? (
              <div
                key={item.id}
                className="page-divider"
                onContextMenu={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  openPageMenu(event.clientX, event.clientY, item.id)
                }}
              />
            ) : (
              <div
                key={item.id}
                className="page-row"
                data-current={item.id === pageId}
                aria-selected={item.id === pageId}
                onClick={() => switchPage(item.id)}
                onDoubleClick={(event) => {
                  event.stopPropagation()
                  startRenamingPage(item.id)
                }}
                onContextMenu={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  openPageMenu(event.clientX, event.clientY, item.id)
                }}
              >
                {item.icon ? <span className="page-icon">{item.icon}</span> : <PageThumb page={item} doc={doc} />}
                {renamingPageId === item.id ? (
                  <input
                    className="page-rename"
                    autoFocus
                    defaultValue={item.name}
                    onBlur={(event) => {
                      renamePage(item.id, event.target.value)
                      setRenamingPage(null)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur()
                      if (event.key === 'Escape') setRenamingPage(null)
                    }}
                    onClick={(event) => event.stopPropagation()}
                  />
                ) : (
                  <span className="page-name">{item.name}</span>
                )}
              </div>
            ),
          )}
        </div>
      )}
      {open && (
        <div
          className="pages-resize"
          onPointerDown={(e) => {
            e.preventDefault()
            const startY = e.clientY
            const startH = height
            const onMove = (ev: PointerEvent) =>
              setUI({ pageListHeight: Math.round(Math.min(320, Math.max(48, startH + ev.clientY - startY))) })
            const onUp = () => {
              window.removeEventListener('pointermove', onMove)
              window.removeEventListener('pointerup', onUp)
            }
            window.addEventListener('pointermove', onMove)
            window.addEventListener('pointerup', onUp)
          }}
        />
      )}
    </div>
  )
}

export function LayersPanel() {
  const doc = useEditor((s) => s.doc)
  const selection = useEditor((s) => s.ui.selection)
  const pageId = useEditor((s) => s.ui.pageId)
  const tab = useEditor((s) => s.ui.panelTab)
  const renamingPageId = useEditor((s) => s.ui.renamingPageId)
  const page = doc.pages.find((p) => p.id === pageId) ?? doc.pages[0]
  const [query, setQuery] = useState('')

  const normalized = query.trim().toLowerCase()
  const artboards = useMemo(
    () => pageArtboards(doc, pageId).map((id) => doc.nodes[id]).filter(Boolean),
    [doc, pageId],
  )
  const layerCount = countPageNodes(doc, pageId) - artboards.length
  const layersMatch = artboards.some((node) => subtreeMatches(doc, node, normalized))

  return (
    <aside className="left-panel">
      <header
        className="doc-header"
        onContextMenu={(event) => {
          event.preventDefault()
          openProjectMenu(event.clientX, event.clientY)
        }}
      >
        <button
          className="doc-mark doc-menu-btn"
          data-tooltip="Menu"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect()
            openProjectMenu(rect.left, rect.bottom + 4)
          }}
        />
        <span
          className="doc-title"
          data-tooltip="Files"
          onClick={() => toggleFileBrowser()}
        >
          {projectName()}
        </span>
        <span className="doc-sub">{page?.name ?? 'Canvas'}</span>
        <span className="doc-actions">
          <button
            className="icon-button"
            data-tooltip="More"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              openProjectMenu(rect.left, rect.bottom + 4)
            }}
          >
            <Icon name="more" size={15} />
          </button>
        </span>
      </header>

      <div className="left-body">
        <div className="left-controls">
          <div className="toggle-group" role="tablist">
            <button
              role="tab"
              aria-selected={tab === 'design'}
              data-active={tab === 'design'}
              onClick={() => setUI({ panelTab: 'design' })}
            >
              <Icon name="layers" size={12} />
              Design
            </button>
            <button
              role="tab"
              aria-selected={tab === 'theme'}
              data-active={tab === 'theme'}
              onClick={() => setUI({ panelTab: 'theme' })}
            >
              <Icon name="palette" size={12} />
              Theme
            </button>
          </div>

          <label className="search-chip">
            <Icon name="search" size={12} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={tab === 'design' ? 'Search layers' : 'Search tokens'}
              spellCheck={false}
            />
          </label>
        </div>

        <div
          className="layer-scroll"
          onContextMenu={(event) => {
            const target = event.target as HTMLElement
            if (target.closest('.layer-row, .page-row, .page-add')) return
            event.preventDefault()
            openProjectMenu(event.clientX, event.clientY)
          }}
        >
          {tab === 'theme' ? (
            <TokenList query={normalized} />
          ) : (
            <>
              <PagesSection pageId={pageId} renamingPageId={renamingPageId} doc={doc} />
              <div role="tree">
                {artboards.map((node) => (
                  <LayerRow key={node.id} node={node} depth={0} selection={selection} query={normalized} />
                ))}
                {artboards.length === 0 && (
                  <div className="layer-empty">No artboards in "{page?.name ?? 'Current page'}" — use the Frame tool to create one</div>
                )}
                {artboards.length > 0 && normalized && !layersMatch && (
                  <div className="layer-empty">No layers match "{query.trim()}"</div>
                )}
              </div>
            </>
          )}
        </div>

        <footer className="left-footer">
          <span>
            {artboards.length} artboards · {layerCount} Layers
          </span>
          <span>{doc.pages.length} pages</span>
        </footer>
      </div>
      <PanelResize side="left" />
    </aside>
  )
}