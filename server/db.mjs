import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = process.env.OPENPAPER_DATA_DIR ?? path.join(ROOT, 'data')
fs.mkdirSync(DATA_DIR, { recursive: true })

export const DB_FILE = path.join(DATA_DIR, 'openpaper.db')
const HISTORY_LIMIT = 50

export const db = new DatabaseSync(DB_FILE)
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS docs (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    folder_id  TEXT,
    trashed    INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    rev        INTEGER NOT NULL DEFAULT 1,
    doc_json   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS folders (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS doc_history (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id   TEXT NOT NULL,
    rev      INTEGER NOT NULL,
    saved_at INTEGER NOT NULL,
    doc_json TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS doc_history_doc ON doc_history (doc_id, rev DESC);
`)

const toMeta = (row) => ({
  id: row.id,
  name: row.name,
  folderId: row.folder_id ?? undefined,
  trashed: !!row.trashed,
  updatedAt: row.updated_at,
  rev: row.rev,
})

function pushHistory(docId, rev, savedAt, json) {
  db.prepare('INSERT INTO doc_history (doc_id, rev, saved_at, doc_json) VALUES (?, ?, ?, ?)').run(docId, rev, savedAt, json)
  db.prepare(
    'DELETE FROM doc_history WHERE doc_id = ? AND id NOT IN (SELECT id FROM doc_history WHERE doc_id = ? ORDER BY rev DESC LIMIT ?)',
  ).run(docId, docId, HISTORY_LIMIT)
}

export function listDocs({ includeTrashed = false } = {}) {
  const sql = includeTrashed
    ? 'SELECT id, name, folder_id, trashed, updated_at, rev FROM docs ORDER BY updated_at DESC'
    : 'SELECT id, name, folder_id, trashed, updated_at, rev FROM docs WHERE trashed = 0 ORDER BY updated_at DESC'
  return db.prepare(sql).all().map(toMeta)
}

export function getDoc(id) {
  const row = db
    .prepare('SELECT id, name, folder_id, trashed, updated_at, rev, doc_json FROM docs WHERE id = ?')
    .get(id)
  if (!row) return null
  return { ...toMeta(row), doc: JSON.parse(row.doc_json) }
}

export function getMeta(id) {
  const row = db.prepare('SELECT id, name, folder_id, trashed, updated_at, rev FROM docs WHERE id = ?').get(id)
  return row ? toMeta(row) : null
}

export function saveDoc(id, { name, folderId, trashed, doc } = {}) {
  if (!id || typeof id !== 'string') throw new Error('doc id required')
  if (!doc || !Array.isArray(doc.pages) || typeof doc.nodes !== 'object') throw new Error('invalid doc body')
  const now = Date.now()
  const json = JSON.stringify(doc)
  const existing = db
    .prepare('SELECT name, folder_id, trashed, rev, doc_json FROM docs WHERE id = ?')
    .get(id)

  if (!existing) {
    db.prepare(
      'INSERT INTO docs (id, name, folder_id, trashed, updated_at, rev, doc_json) VALUES (?, ?, ?, ?, ?, 1, ?)',
    ).run(id, name || 'Untitled', folderId ?? null, trashed ? 1 : 0, now, json)
    pushHistory(id, 1, now, json)
    return { ...getMeta(id) }
  }

  const nextName = name ?? existing.name
  const nextFolder = folderId === undefined ? existing.folder_id : (folderId ?? null)
  const nextTrashed = (trashed === undefined ? !!existing.trashed : !!trashed) ? 1 : 0
  // No-op writes (a client echoing back what it just pulled) must not bump rev or spam history.
  if (json === existing.doc_json && nextName === existing.name && nextFolder === existing.folder_id && nextTrashed === existing.trashed) {
    return { ...getMeta(id) }
  }

  const rev = existing.rev + 1
  db.prepare(
    'UPDATE docs SET name = ?, folder_id = ?, trashed = ?, updated_at = ?, rev = ?, doc_json = ? WHERE id = ?',
  ).run(nextName, nextFolder, nextTrashed, now, rev, json, id)
  pushHistory(id, rev, now, json)
  return { ...getMeta(id) }
}

export function deleteDoc(id) {
  db.prepare('DELETE FROM docs WHERE id = ?').run(id)
  db.prepare('DELETE FROM doc_history WHERE doc_id = ?').run(id)
  return true
}

export function listHistory(id, limit = 20) {
  return db
    .prepare('SELECT rev, saved_at FROM doc_history WHERE doc_id = ? ORDER BY rev DESC LIMIT ?')
    .all(id, Math.min(Math.max(limit, 1), HISTORY_LIMIT))
    .map((r) => ({ rev: r.rev, savedAt: r.saved_at }))
}

export function getHistoryDoc(id, rev) {
  const row = db.prepare('SELECT doc_json FROM doc_history WHERE doc_id = ? AND rev = ?').get(id, rev)
  return row ? JSON.parse(row.doc_json) : null
}

export function listFolders() {
  return db.prepare('SELECT id, name FROM folders ORDER BY name').all()
}

export function upsertFolder(id, name) {
  db.prepare(
    'INSERT INTO folders (id, name, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at',
  ).run(id, name, Date.now())
  return { id, name }
}

export function deleteFolder(id) {
  db.prepare('DELETE FROM folders WHERE id = ?').run(id)
  db.prepare('UPDATE docs SET folder_id = NULL WHERE folder_id = ?').run(id)
  return true
}

export function stats() {
  const docs = db.prepare('SELECT COUNT(*) AS n FROM docs').get().n
  const trashed = db.prepare('SELECT COUNT(*) AS n FROM docs WHERE trashed = 1').get().n
  const history = db.prepare('SELECT COUNT(*) AS n FROM doc_history').get().n
  return { docs, trashed, history }
}
