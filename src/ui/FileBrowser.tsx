import { useMemo, useState } from 'react'
import type { Doc } from '../model/types'
import {
  createFile,
  duplicateFile,
  importFileJson,
  openFile,
  purgeFile,
  renameFile,
  restoreFile,
  deleteFile,
  setUI,
  toggleFileBrowser,
  useEditor,
} from '../model/store'
import { buildWechatDoc } from '../model/wechat'
import {
  createFolder,
  currentDocId,
  listDocs,
  listFolders,
  moveDocToFolder,
  readDocRaw,
  renameFolder,
  deleteFolder,
  type DocMeta,
} from '../model/docs'
import { openMenu } from './menuStore'
import { docThumbnailSvg } from '../model/export'
import { Icon } from './Icon'

const fmtDate = (ts: number) =>
  new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

function parseDoc(id: string): Doc | null {
  try {
    const doc = JSON.parse(readDocRaw(id) ?? 'null')
    return doc && doc.nodes ? doc : null
  } catch {
    return null
  }
}

function docStats(doc: Doc | null): string {
  if (!doc) return ''
  const nodes = Object.keys(doc.nodes).length
  const boards = doc.pages?.reduce((n, p) => n + p.artboards.length, 0) ?? 0
  return `${boards} frames · ${nodes} layers`
}

function Thumb({ meta }: { meta: DocMeta }) {
  const svg = useMemo(() => {
    const doc = parseDoc(meta.id)
    return doc ? docThumbnailSvg(doc) : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.id, meta.updatedAt])
  if (!svg) {
    return (
      <div className="fb-thumb fb-thumb-empty">
        <Icon name="doc" size={22} />
      </div>
    )
  }
  return <div className="fb-thumb" dangerouslySetInnerHTML={{ __html: svg }} />
}

type Section = 'recents' | 'files' | 'archive'
type Sort = 'recent' | 'name'

export function FileBrowser() {
  const ui = useEditor((s) => s.ui)
  const [section, setSection] = useState<Section>('recents')
  const [folderId, setFolderId] = useState<string | null>(null)
  const [view, setView] = useState<'grid' | 'list'>(
    () => (localStorage.getItem('openpaper:view-mode') as 'grid' | 'list') || 'grid',
  )
  const [sort, setSort] = useState<Sort>('recent')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  if (!ui.fileBrowserVisible) return null

  const all = listDocs()
  const files = all.filter((d) => !d.trashed)
  const trashed = all.filter((d) => d.trashed)
  const folders = listFolders()
  const shown = (section === 'archive'
    ? trashed
    : section === 'files'
      ? files.filter((d) => (folderId ? d.folderId === folderId : !d.folderId))
      : files
  ).sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : b.updatedAt - a.updatedAt))
  const cur = currentDocId()

  const switchView = (v: 'grid' | 'list') => {
    setView(v)
    localStorage.setItem('openpaper:view-mode', v)
  }

  const ops = (doc: DocMeta) =>
    section === 'archive'
      ? [
          { icon: 'undo', tip: 'Restore', run: () => restoreFile(doc.id) },
          {
            icon: 'trash',
            tip: 'Delete forever',
            run: () => window.confirm(`Permanently delete "${doc.name}"? This cannot be undone.`) && purgeFile(doc.id),
          },
        ]
      : [
          {
            icon: 'pen',
            tip: 'Rename',
            run: () => {
              setRenaming(doc.id)
              setDraft(doc.name)
            },
          },
          { icon: 'duplicate', tip: 'Copy', run: () => duplicateFile(doc.id) },
          {
            icon: 'trash',
            tip: 'Move to archive',
            run: () => deleteFile(doc.id),
          },
        ]

  return (
    <div className="file-browser-overlay" onClick={() => toggleFileBrowser(false)}>
      <div className="file-browser" onClick={(e) => e.stopPropagation()}>
        <nav className="fb-side">
          <div className="fb-brand">
            <span className="doc-mark" aria-hidden />
            <span>OpenPaper</span>
          </div>
          <button
            className={`fb-nav${section === 'recents' ? ' is-on' : ''}`}
            onClick={() => {
              setSection('recents')
              setFolderId(null)
            }}
          >
            <Icon name="fit" size={14} /> Recents
            <span className="fb-count">{files.length}</span>
          </button>
          <div className="fb-nav-group">
            <button
              className={`fb-nav${section === 'files' && !folderId ? ' is-on' : ''}`}
              onClick={() => {
                setSection('files')
                setFolderId(null)
              }}
            >
              <Icon name="doc" size={14} /> Files
            </button>
            <button
              className="fb-folder-add"
              data-tooltip="New folder"
              onClick={() => {
                const name = window.prompt('Folder name', 'New folder')
                if (name?.trim()) createFolder(name)
                setUI({})
              }}
            >
              <Icon name="plus" size={11} />
            </button>
          </div>
          {folders.map((f) => (
            <button
              key={f.id}
              className={`fb-nav fb-folder${section === 'files' && folderId === f.id ? ' is-on' : ''}`}
              onClick={() => {
                setSection('files')
                setFolderId(f.id)
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                openMenu(e.clientX, e.clientY, [
                  {
                    type: 'item',
                    label: 'Rename folder',
                    onSelect: () => {
                      const name = window.prompt('Folder name', f.name)
                      if (name?.trim()) {
                        renameFolder(f.id, name)
                        setUI({})
                      }
                    },
                  },
                  {
                    type: 'item',
                    label: 'Delete folder',
                    onSelect: () => {
                      deleteFolder(f.id)
                      if (folderId === f.id) setFolderId(null)
                      setUI({})
                    },
                  },
                ])
              }}
            >
              <Icon name="pages" size={14} /> {f.name}
              <span className="fb-count">{files.filter((d) => d.folderId === f.id).length || ''}</span>
            </button>
          ))}
          <button className={`fb-nav${section === 'archive' ? ' is-on' : ''}`} onClick={() => setSection('archive')}>
            <Icon name="trash" size={14} /> Archive
            <span className="fb-count">{trashed.length || ''}</span>
          </button>
        </nav>

        <div className="fb-main">
          <header className="fb-head">
            <span className="fb-title">{section === 'archive' ? 'Archive' : section === 'files' ? (folderId ? (folders.find((f) => f.id === folderId)?.name ?? 'Files') : 'Files') : 'Recents'}</span>
            <div className="fb-controls">
              <select className="fb-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="recent">Last modified</option>
                <option value="name">Name</option>
              </select>
              <div className="fb-view">
                <button className={view === 'grid' ? 'is-on' : ''} data-tooltip="Grid" onClick={() => switchView('grid')}>
                  <Icon name="grid" size={13} />
                </button>
                <button className={view === 'list' ? 'is-on' : ''} data-tooltip="List" onClick={() => switchView('list')}>
                  <Icon name="list" size={13} />
                </button>
              </div>
              {section !== 'archive' && (
                <>
                  <button className="ghost-button" onClick={() => void importFileJson()}>
                    <Icon name="import" size={12} /> Import
                  </button>
                  <button
                    className="ghost-button"
                    data-tooltip="Create the WeChat design template"
                    onClick={() => createFile('微信', buildWechatDoc())}
                  >
                    <Icon name="plus" size={12} /> 微信 demo
                  </button>
                  <button className="ghost-button accent" onClick={() => createFile()}>
                    <Icon name="plus" size={12} /> New file
                  </button>
                </>
              )}
              <button className="icon-button" data-tooltip="Close" onClick={() => toggleFileBrowser(false)}>
                <Icon name="close" size={14} />
              </button>
            </div>
          </header>

          <div className={`fb-body fb-${view}`}>
            {shown.length === 0 && (
              <div className="fb-empty">{section === 'archive' ? 'Archive is empty' : 'No files yet'}</div>
            )}
            {shown.map((doc) => {
              const parsed = parseDoc(doc.id)
              const isCur = doc.id === cur
              return view === 'grid' ? (
                <div
                  key={doc.id}
                  className={`fb-card${isCur ? ' is-current' : ''}`}
                  onClick={() => section !== 'archive' && openFile(doc.id)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    openMenu(e.clientX, e.clientY, [
                      { type: 'item', label: 'Open', onSelect: () => openFile(doc.id) },
                      { type: 'item', label: 'Duplicate file', onSelect: () => duplicateFile(doc.id) },
                      {
                        type: 'item',
                        label: 'Rename',
                        onSelect: () => {
                          setRenaming(doc.id)
                          setDraft(doc.name)
                        },
                      },
                      { type: 'separator' },
                      { type: 'item', label: 'Move to root', disabled: !doc.folderId, onSelect: () => { moveDocToFolder(doc.id, undefined); setUI({}) } },
                      ...folders.map((f) => ({
                        type: 'item' as const,
                        label: `Move to ${f.name}`,
                        disabled: doc.folderId === f.id,
                        onSelect: () => { moveDocToFolder(doc.id, f.id); setUI({}) },
                      })),
                      { type: 'separator' },
                      { type: 'item', label: 'Move to archive', onSelect: () => deleteFile(doc.id) },
                    ])
                  }}
                >
                  <div className="fb-thumb-wrap">
                    <Thumb meta={doc} />
                    {isCur && <span className="file-badge">Current</span>}
                    <div className="fb-ops" onClick={(e) => e.stopPropagation()}>
                      {ops(doc).map((op) => (
                        <button key={op.tip} data-tooltip={op.tip} onClick={op.run}>
                          <Icon name={op.icon as never} size={12} />
                        </button>
                      ))}
                    </div>
                  </div>
                  {renaming === doc.id ? (
                    <input
                      className="file-rename"
                      autoFocus
                      value={draft}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={() => {
                        renameFile(doc.id, draft)
                        setRenaming(null)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                        if (e.key === 'Escape') setRenaming(null)
                      }}
                    />
                  ) : (
                    <div className="file-name">{doc.name}</div>
                  )}
                  <div className="file-meta">
                    {docStats(parsed)} · {fmtDate(doc.updatedAt)}
                  </div>
                </div>
              ) : (
                <div
                  key={doc.id}
                  className={`fb-row${isCur ? ' is-current' : ''}`}
                  onClick={() => section !== 'archive' && openFile(doc.id)}
                >
                  <div className="fb-row-thumb">
                    <Thumb meta={doc} />
                  </div>
                  <div className="fb-row-main">
                    <div className="file-name">
                      {doc.name}
                      {isCur && <span className="file-badge inline">Current</span>}
                    </div>
                    <div className="file-meta">
                      {docStats(parsed)} · {fmtDate(doc.updatedAt)}
                    </div>
                  </div>
                  <div className="fb-ops static" onClick={(e) => e.stopPropagation()}>
                    {ops(doc).map((op) => (
                      <button key={op.tip} data-tooltip={op.tip} onClick={op.run}>
                        <Icon name={op.icon as never} size={12} />
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
