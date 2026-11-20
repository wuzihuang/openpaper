import type { Doc } from './types'

/** HTTP client for the local OpenPaper server (server/index.mjs → SQLite). */

export interface RemoteMeta {
  id: string
  name: string
  folderId?: string
  trashed: boolean
  updatedAt: number
  rev: number
}

export interface RemoteDoc extends RemoteMeta {
  doc: Doc
}

const SERVER_PORT = '8787'

/** Same origin when the app is served by the API server; absolute localhost otherwise (dev server / proxy). */
export function apiBase(): string {
  const configured = import.meta.env.VITE_API_BASE
  if (configured) return String(configured).replace(/\/+$/, '')
  const { protocol, port } = window.location
  if (port === SERVER_PORT || (protocol === 'http:' && !port)) return ''
  return `http://127.0.0.1:${SERVER_PORT}`
}

async function request<T>(path: string, init: RequestInit & { timeout?: number } = {}): Promise<T> {
  const { timeout, ...rest } = init
  const res = await fetch(`${apiBase()}${path}`, {
    ...rest,
    signal: AbortSignal.timeout(timeout ?? 2500),
    headers: rest.body ? { 'content-type': 'application/json', ...(rest.headers ?? {}) } : rest.headers,
  })
  if (!res.ok) throw new Error(`${res.status} ${path}`)
  return (await res.json()) as T
}

export async function remoteListDocs(): Promise<RemoteMeta[]> {
  const data = await request<{ docs: RemoteMeta[] }>('/api/docs?trashed=1')
  return data.docs ?? []
}

export async function remoteGetDoc(id: string): Promise<RemoteDoc> {
  return request<RemoteDoc>(`/api/docs/${encodeURIComponent(id)}`, { timeout: 8000 })
}

export async function remoteRev(id: string): Promise<{ rev: number; updatedAt: number }> {
  return request<{ rev: number; updatedAt: number }>(`/api/docs/${encodeURIComponent(id)}/rev`, { timeout: 1800 })
}

export async function remotePutDoc(
  id: string,
  body: { name?: string; folderId?: string; trashed?: boolean; doc: Doc },
): Promise<RemoteMeta> {
  return request<RemoteMeta>(`/api/docs/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
    timeout: 15000,
  })
}

export async function remoteDeleteDoc(id: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/docs/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function remoteListFolders(): Promise<{ id: string; name: string }[]> {
  const data = await request<{ folders: { id: string; name: string }[] }>('/api/folders')
  return data.folders ?? []
}

export async function remoteUpsertFolder(folder: { id: string; name: string }): Promise<void> {
  await request('/api/folders', { method: 'POST', body: JSON.stringify(folder) })
}

export async function remoteDeleteFolder(id: string): Promise<void> {
  await request(`/api/folders/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
