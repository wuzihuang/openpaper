import type { Doc } from './types'

/** Multi-file project layer: doc index + per-doc storage, mirroring Paper's file list. */

export interface DocMeta {
  id: string
  name: string
  updatedAt: number
  /** Paper Trash: soft-deleted files live here until restored or purged. */
  trashed?: boolean
  /** Paper folder tree membership. */
  folderId?: string
}

const INDEX_KEY = 'openpaper:docs'
const CURRENT_KEY = 'openpaper:current-doc'
const LEGACY_KEY = 'paper-canvas-doc-v2'
const LEGACY_V1_KEY = 'paper-canvas-doc-v1'

export const docKey = (id: string) => `openpaper:doc:${id}`

const uid = () => `doc_${Math.random().toString(36).slice(2, 9)}`

function readIndex(): DocMeta[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    const list = raw ? (JSON.parse(raw) as DocMeta[]) : []
    return Array.isArray(list) ? list.filter((d) => d && d.id && d.name) : []
  } catch {
    return []
  }
}

function writeIndex(list: DocMeta[]) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(list))
}

/** One-time migration: legacy single-doc storage becomes the first file in the index. */
export function ensureIndex(): DocMeta[] {
  let list = readIndex()
  if (list.length > 0) return list
  const legacy = localStorage.getItem(LEGACY_KEY) ?? localStorage.getItem(LEGACY_V1_KEY)
  const meta: DocMeta = { id: uid(), name: 'Untitled', updatedAt: Date.now() }
  if (legacy) localStorage.setItem(docKey(meta.id), legacy)
  list = [meta]
  writeIndex(list)
  localStorage.setItem(CURRENT_KEY, meta.id)
  return list
}

export function listDocs(): DocMeta[] {
  return ensureIndex().slice().sort((a, b) => b.updatedAt - a.updatedAt)
}

export function currentDocId(): string {
  const list = ensureIndex()
  const cur = localStorage.getItem(CURRENT_KEY)
  return list.some((d) => d.id === cur) ? cur! : list[0].id
}

export function currentDocName(): string {
  const id = currentDocId()
  return ensureIndex().find((d) => d.id === id)?.name ?? 'Untitled'
}

export function readDocRaw(id: string): string | null {
  return localStorage.getItem(docKey(id))
}

export function writeDocRaw(id: string, json: string) {
  localStorage.setItem(docKey(id), json)
  touchDoc(id)
}

export function touchDoc(id: string) {
  const list = ensureIndex()
  const meta = list.find((d) => d.id === id)
  if (meta) {
    meta.updatedAt = Date.now()
    writeIndex(list)
  }
}

export function createDocMeta(name: string, doc?: Doc): DocMeta {
  const list = ensureIndex()
  const meta: DocMeta = { id: uid(), name, updatedAt: Date.now() }
  list.push(meta)
  writeIndex(list)
  if (doc) localStorage.setItem(docKey(meta.id), JSON.stringify(doc))
  return meta
}

export function renameDocMeta(id: string, name: string) {
  const list = ensureIndex()
  const meta = list.find((d) => d.id === id)
  if (meta) {
    meta.name = name.trim() || meta.name
    meta.updatedAt = Date.now()
    writeIndex(list)
  }
}

export function duplicateDocMeta(id: string): DocMeta | null {
  const list = ensureIndex()
  const src = list.find((d) => d.id === id)
  const raw = readDocRaw(id)
  if (!src || !raw) return null
  const meta: DocMeta = { id: uid(), name: `${src.name} copy`, updatedAt: Date.now() }
  list.push(meta)
  writeIndex(list)
  localStorage.setItem(docKey(meta.id), raw)
  return meta
}

/** Soft-delete → Trash; returns fallback id when the trashed file was current. */
export function trashDocMeta(id: string): string | null {
  const list = ensureIndex()
  const meta = list.find((d) => d.id === id)
  if (!meta) return null
  meta.trashed = true
  writeIndex(list)
  return list.find((d) => !d.trashed)?.id ?? null
}

export function restoreDocMeta(id: string) {
  const list = ensureIndex()
  const meta = list.find((d) => d.id === id)
  if (meta) {
    delete meta.trashed
    meta.updatedAt = Date.now()
    writeIndex(list)
  }
}

/** Permanent delete — only valid for trashed files. */
export function purgeDocMeta(id: string) {
  const list = ensureIndex().filter((d) => d.id !== id)
  localStorage.removeItem(docKey(id))
  writeIndex(list)
}

/** Removes the file; returns the id to fall back to (null when nothing left). */
export function deleteDocMeta(id: string): string | null {
  const list = ensureIndex().filter((d) => d.id !== id)
  localStorage.removeItem(docKey(id))
  if (list.filter((d) => !d.trashed).length === 0) {
    const meta: DocMeta = { id: uid(), name: 'Untitled', updatedAt: Date.now() }
    list.push(meta)
  }
  writeIndex(list)
  return list.find((d) => !d.trashed)?.id ?? list[0].id
}

export function setCurrentDocId(id: string) {
  localStorage.setItem(CURRENT_KEY, id)
}

/* ---------- folders (Paper file tree) ---------- */

export interface FolderMeta {
  id: string
  name: string
}

const FOLDERS_KEY = 'openpaper:folders'

export function listFolders(): FolderMeta[] {
  try {
    const raw = localStorage.getItem(FOLDERS_KEY)
    const list = raw ? (JSON.parse(raw) as FolderMeta[]) : []
    return Array.isArray(list) ? list.filter((f) => f && f.id && f.name) : []
  } catch {
    return []
  }
}

export function createFolder(name: string): FolderMeta {
  const folder = { id: `fld_${Math.random().toString(36).slice(2, 9)}`, name: name.trim() || 'New folder' }
  localStorage.setItem(FOLDERS_KEY, JSON.stringify([...listFolders(), folder]))
  return folder
}

export function renameFolder(id: string, name: string) {
  localStorage.setItem(FOLDERS_KEY, JSON.stringify(listFolders().map((f) => (f.id === id ? { ...f, name } : f))))
}

export function deleteFolder(id: string) {
  localStorage.setItem(FOLDERS_KEY, JSON.stringify(listFolders().filter((f) => f.id !== id)))
  // files inside move back to root
  writeIndex(listDocs().map((d) => (d.folderId === id ? { ...d, folderId: undefined } : d)))
}

export function moveDocToFolder(docId: string, folderId: string | undefined) {
  writeIndex(listDocs().map((d) => (d.id === docId ? { ...d, folderId } : d)))
}
