import * as remote from './remote'
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

const revKey = (id: string) => `openpaper:rev:${id}`

const uid = () => `doc_${Math.random().toString(36).slice(2, 9)}`

function localRev(id: string): number {
  return Number(localStorage.getItem(revKey(id))) || 0
}

function setLocalRev(id: string, rev: number) {
  localStorage.setItem(revKey(id), String(rev))
}

function forgetLocalRev(id: string) {
  localStorage.removeItem(revKey(id))
}

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
  queuePush(id)
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
  if (doc) {
    localStorage.setItem(docKey(meta.id), JSON.stringify(doc))
    queuePush(meta.id)
  }
  return meta
}

export function renameDocMeta(id: string, name: string) {
  const list = ensureIndex()
  const meta = list.find((d) => d.id === id)
  if (meta) {
    meta.name = name.trim() || meta.name
    meta.updatedAt = Date.now()
    writeIndex(list)
    queuePush(id)
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
  queuePush(meta.id)
  return meta
}

/** Soft-delete → Trash; returns fallback id when the trashed file was current. */
export function trashDocMeta(id: string): string | null {
  const list = ensureIndex()
  const meta = list.find((d) => d.id === id)
  if (!meta) return null
  meta.trashed = true
  writeIndex(list)
  queuePush(id)
  return list.find((d) => !d.trashed)?.id ?? null
}

export function restoreDocMeta(id: string) {
  const list = ensureIndex()
  const meta = list.find((d) => d.id === id)
  if (meta) {
    delete meta.trashed
    meta.updatedAt = Date.now()
    writeIndex(list)
    queuePush(id)
  }
}

/** Permanent delete — only valid for trashed files. */
export function purgeDocMeta(id: string) {
  const list = ensureIndex().filter((d) => d.id !== id)
  localStorage.removeItem(docKey(id))
  forgetLocalRev(id)
  writeIndex(list)
  void remote.remoteDeleteDoc(id).catch(() => {})
}

/** Removes the file; returns the id to fall back to (null when nothing left). */
export function deleteDocMeta(id: string): string | null {
  const list = ensureIndex().filter((d) => d.id !== id)
  localStorage.removeItem(docKey(id))
  forgetLocalRev(id)
  void remote.remoteDeleteDoc(id).catch(() => {})
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

/* ---------- server sync (SQLite via server/index.mjs) ---------- */

const PUSH_DELAY = 900
const pushTimers = new Map<string, number>()
const lastLocalWrite = new Map<string, number>()
let serverOnline: boolean | null = null

export function isServerOnline() {
  return serverOnline === true
}

/** Debounced push of one file to the SQLite store; silently stays local when the server is down. */
function queuePush(id: string) {
  lastLocalWrite.set(id, Date.now())
  const timer = pushTimers.get(id)
  if (timer) window.clearTimeout(timer)
  pushTimers.set(
    id,
    window.setTimeout(() => {
      pushTimers.delete(id)
      void pushDoc(id)
    }, PUSH_DELAY),
  )
}

const lastPushed = new Map<string, string>()

async function pushDoc(id: string): Promise<void> {
  const meta = readIndex().find((d) => d.id === id)
  const raw = localStorage.getItem(docKey(id))
  if (!meta || !raw) return
  const fingerprint = `${meta.name}\u0000${meta.folderId ?? ''}\u0000${meta.trashed ? 1 : 0}\u0000${raw}`
  if (lastPushed.get(id) === fingerprint) return
  try {
    const saved = await remote.remotePutDoc(id, {
      name: meta.name,
      folderId: meta.folderId,
      trashed: !!meta.trashed,
      doc: JSON.parse(raw) as Doc,
    })
    setLocalRev(id, saved.rev)
    lastPushed.set(id, fingerprint)
    serverOnline = true
  } catch {
    serverOnline = false
  }
}

export function flushPendingPushes() {
  for (const id of [...pushTimers.keys()]) {
    const timer = pushTimers.get(id)
    if (timer) window.clearTimeout(timer)
    pushTimers.delete(id)
    void pushDoc(id)
  }
}

async function pullDocBody(meta: { id: string }): Promise<{ meta: DocMeta; doc: Doc } | null> {
  try {
    const record = await remote.remoteGetDoc(meta.id)
    localStorage.setItem(docKey(record.id), JSON.stringify(record.doc))
    setLocalRev(record.id, record.rev)
    return {
      meta: {
        id: record.id,
        name: record.name,
        updatedAt: record.updatedAt,
        folderId: record.folderId,
        trashed: record.trashed || undefined,
      },
      doc: record.doc,
    }
  } catch {
    serverOnline = false
    return null
  }
}

/** Merge the SQLite store into localStorage before boot; local-only files get uploaded. */
export async function hydrateFromServer(): Promise<boolean> {
  let remoteDocs: remote.RemoteMeta[]
  let remoteFolders: { id: string; name: string }[]
  try {
    remoteDocs = await remote.remoteListDocs()
    remoteFolders = await remote.remoteListFolders()
    serverOnline = true
  } catch {
    serverOnline = false
    return false
  }

  const localFolders = listFolders()
  const knownFolders = new Set(localFolders.map((f) => f.id))
  const newFolders = remoteFolders.filter((f) => !knownFolders.has(f.id))
  if (newFolders.length) localStorage.setItem(FOLDERS_KEY, JSON.stringify([...localFolders, ...newFolders]))

  const localList = readIndex()
  const localById = new Map(localList.map((d) => [d.id, d]))
  const remoteIds = new Set<string>()
  const merged: DocMeta[] = []

  for (const meta of remoteDocs) {
    remoteIds.add(meta.id)
    const local = localById.get(meta.id)
    if (!local) {
      const pulled = meta.trashed ? null : await pullDocBody(meta)
      merged.push(pulled?.meta ?? { ...meta, trashed: meta.trashed || undefined })
      continue
    }
    // A local copy that never synced here is another origin's cache: the DB copy wins unless
    // the local one is clearly newer (real offline work).
    const localWins = localRev(local.id) > 0 && local.updatedAt > meta.updatedAt + 5000
    if (!localWins && (localRev(local.id) === 0 || meta.updatedAt > local.updatedAt + 1000)) {
      const pulled = await pullDocBody(meta)
      merged.push(pulled?.meta ?? { ...local, name: meta.name, updatedAt: meta.updatedAt })
    } else {
      merged.push(local)
      if (local.updatedAt > meta.updatedAt + 1000 || localRev(local.id) !== meta.rev) queuePush(local.id)
    }
  }

  for (const local of localList) {
    if (remoteIds.has(local.id)) continue
    merged.push(local)
    queuePush(local.id)
  }

  if (merged.length) {
    writeIndex(merged)
    const current = localStorage.getItem(CURRENT_KEY)
    if (!current || !merged.some((d) => d.id === current && !d.trashed)) {
      const first = merged.find((d) => !d.trashed)
      if (first) localStorage.setItem(CURRENT_KEY, first.id)
    }
  }
  return true
}

/** Poll rev while the tab is visible so MCP / other tabs edits show up without a reload. */
export function startRemoteWatch(apply: (doc: Doc) => void) {
  let busy = false
  const tick = async () => {
    if (busy || document.visibilityState !== 'visible' || pushTimers.size > 0) return
    const id = currentDocId()
    if ((lastLocalWrite.get(id) ?? 0) > Date.now() - 2000) return
    busy = true
    try {
      const state = await remote.remoteRev(id)
      if (state.rev === localRev(id)) return
      const pulled = await pullDocBody({ id })
      if (pulled) apply(pulled.doc)
    } catch {
      serverOnline = false
    } finally {
      busy = false
    }
  }
  window.setInterval(() => void tick(), 4000)
  window.addEventListener('focus', () => void tick())
  window.addEventListener('beforeunload', flushPendingPushes)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPendingPushes()
  })
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
  void remote.remoteUpsertFolder(folder).catch(() => {})
  return folder
}

export function renameFolder(id: string, name: string) {
  localStorage.setItem(FOLDERS_KEY, JSON.stringify(listFolders().map((f) => (f.id === id ? { ...f, name } : f))))
  const folder = listFolders().find((f) => f.id === id)
  if (folder) void remote.remoteUpsertFolder(folder).catch(() => {})
}

export function deleteFolder(id: string) {
  localStorage.setItem(FOLDERS_KEY, JSON.stringify(listFolders().filter((f) => f.id !== id)))
  // files inside move back to root
  const moved = listDocs().filter((d) => d.folderId === id)
  writeIndex(listDocs().map((d) => (d.folderId === id ? { ...d, folderId: undefined } : d)))
  for (const doc of moved) queuePush(doc.id)
  void remote.remoteDeleteFolder(id).catch(() => {})
}

export function moveDocToFolder(docId: string, folderId: string | undefined) {
  writeIndex(listDocs().map((d) => (d.id === docId ? { ...d, folderId } : d)))
  queuePush(docId)
}
