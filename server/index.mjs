import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as store from './db.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.OPENPAPER_PORT ?? 8787)
const DIST = path.join(ROOT, 'dist')
const MAX_BODY = 64 * 1024 * 1024

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
}

function json(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(payload)
}

function cors(res) {
  res.setHeader('access-control-allow-origin', '*')
  res.setHeader('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.setHeader('access-control-allow-headers', 'content-type')
  res.setHeader('access-control-max-age', '600')
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('invalid json body'))
      }
    })
    req.on('error', reject)
  })
}

function serveStatic(req, res, urlPath) {
  if (!fs.existsSync(DIST)) return false
  const decoded = decodeURIComponent(urlPath)
  const rel = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '')
  const file = path.resolve(DIST, rel)
  if (!file.startsWith(DIST)) return false
  const target = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(DIST, 'index.html')
  if (!fs.existsSync(target)) return false
  res.writeHead(200, {
    'content-type': MIME[path.extname(target)] ?? 'application/octet-stream',
    'cache-control': target.endsWith('.html') ? 'no-store' : 'public, max-age=3600',
  })
  fs.createReadStream(target).pipe(res)
  return true
}

const server = http.createServer(async (req, res) => {
  cors(res)
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    return res.end()
  }

  const url = new URL(req.url ?? '/', 'http://localhost')
  const parts = url.pathname.split('/').filter(Boolean)
  const api = parts[0] === 'api'

  try {
    if (api) {
      if (parts[1] === 'health' && req.method === 'GET') {
        return json(res, 200, { ok: true, db: store.DB_FILE, ...store.stats() })
      }

      if (parts[1] === 'docs') {
        const id = parts[2] ? decodeURIComponent(parts[2]) : null

        if (!id && req.method === 'GET') {
          return json(res, 200, { docs: store.listDocs({ includeTrashed: url.searchParams.get('trashed') === '1' }) })
        }
        if (!id && req.method === 'POST') {
          const body = await readBody(req)
          const docId = body.id || `doc_${Math.random().toString(36).slice(2, 9)}`
          return json(res, 200, store.saveDoc(docId, body))
        }

        if (id && parts[3] === 'rev' && req.method === 'GET') {
          const meta = store.getMeta(id)
          return meta ? json(res, 200, { rev: meta.rev, updatedAt: meta.updatedAt }) : json(res, 404, { error: 'not found' })
        }
        if (id && parts[3] === 'history' && !parts[4] && req.method === 'GET') {
          return json(res, 200, { history: store.listHistory(id, Number(url.searchParams.get('limit') ?? 20)) })
        }
        if (id && parts[3] === 'history' && parts[4] && req.method === 'GET') {
          const doc = store.getHistoryDoc(id, Number(parts[4]))
          return doc ? json(res, 200, { rev: Number(parts[4]), doc }) : json(res, 404, { error: 'not found' })
        }
        if (id && !parts[3] && req.method === 'GET') {
          const doc = store.getDoc(id)
          return doc ? json(res, 200, doc) : json(res, 404, { error: 'not found' })
        }
        if (id && !parts[3] && req.method === 'PUT') {
          const body = await readBody(req)
          return json(res, 200, store.saveDoc(id, body))
        }
        if (id && !parts[3] && req.method === 'PATCH') {
          const body = await readBody(req)
          const meta = store.getMeta(id)
          if (!meta) return json(res, 404, { error: 'not found' })
          const doc = store.getDoc(id)
          return json(res, 200, store.saveDoc(id, { ...body, doc: body.doc ?? doc.doc }))
        }
        if (id && !parts[3] && req.method === 'DELETE') {
          store.deleteDoc(id)
          return json(res, 200, { ok: true })
        }
      }

      if (parts[1] === 'folders') {
        const id = parts[2] ? decodeURIComponent(parts[2]) : null
        if (!id && req.method === 'GET') return json(res, 200, { folders: store.listFolders() })
        if (!id && req.method === 'POST') {
          const body = await readBody(req)
          return json(res, 200, store.upsertFolder(body.id || `fld_${Math.random().toString(36).slice(2, 9)}`, body.name))
        }
        if (id && req.method === 'PATCH') {
          const body = await readBody(req)
          return json(res, 200, store.upsertFolder(id, body.name))
        }
        if (id && req.method === 'DELETE') {
          store.deleteFolder(id)
          return json(res, 200, { ok: true })
        }
      }

      return json(res, 404, { error: 'unknown endpoint' })
    }

    if (req.method === 'GET' && serveStatic(req, res, url.pathname)) return
    return json(res, 404, { error: 'not found' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return json(res, 400, { error: message })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  const hasDist = fs.existsSync(DIST)
  console.log(`openpaper api  http://127.0.0.1:${PORT}/api/health`)
  console.log(`sqlite         ${store.DB_FILE}`)
  console.log(hasDist ? `static         ${DIST} (http://127.0.0.1:${PORT}/)` : 'static         dist/ not built yet')
})
