import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import * as store from './db.mjs'

const docShape = z.record(z.any())

const text = (value) => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
})

const summaryOf = (doc) => {
  const nodes = Object.values(doc.nodes ?? {})
  return {
    pages: (doc.pages ?? []).map((page) => ({
      id: page.id,
      name: page.name,
      artboards: page.artboards?.length ?? 0,
    })),
    nodes: nodes.length,
    topLevel: nodes.filter((n) => !n.parentId).length,
    comments: doc.comments?.length ?? 0,
    tokens: doc.tokens?.length ?? 0,
  }
}

function loadDocOrThrow(id) {
  const record = store.getDoc(id)
  if (!record) throw new Error(`document not found: ${id}`)
  return record
}

function collectSubtree(doc, id) {
  const ids = []
  const walk = (nodeId) => {
    ids.push(nodeId)
    for (const child of doc.nodes[nodeId]?.children ?? []) walk(child)
  }
  walk(id)
  return ids
}

const server = new McpServer({
  name: 'openpaper',
  version: '1.0.0',
})

server.registerTool(
  'list_documents',
  {
    title: 'List documents',
    description: 'List design files stored in the OpenPaper SQLite database (id, name, page count, updatedAt, rev).',
    inputSchema: {
      includeTrashed: z.boolean().optional().describe('Include soft-deleted files'),
    },
  },
  async ({ includeTrashed }) => {
    const docs = store.listDocs({ includeTrashed: !!includeTrashed }).map((meta) => {
      const record = store.getDoc(meta.id)
      return { ...meta, ...summaryOf(record.doc) }
    })
    return text(docs)
  },
)

server.registerTool(
  'get_document',
  {
    title: 'Get document',
    description:
      'Read a design file. Returns the full doc JSON, or a structural summary when `summary` is true. Use nodeIds/pageId to narrow the payload.',
    inputSchema: {
      id: z.string(),
      summary: z.boolean().optional(),
      pageId: z.string().optional(),
      nodeIds: z.array(z.string()).optional(),
    },
  },
  async ({ id, summary, pageId, nodeIds }) => {
    const record = loadDocOrThrow(id)
    if (summary) return text({ meta: { ...record, doc: undefined }, ...summaryOf(record.doc) })
    if (pageId || nodeIds) {
      const page = pageId ? record.doc.pages.find((p) => p.id === pageId) : undefined
      const ids = new Set(nodeIds ?? [])
      if (page) for (const root of page.artboards) for (const n of collectSubtree(record.doc, root)) ids.add(n)
      const nodes = {}
      for (const nid of ids) if (record.doc.nodes[nid]) nodes[nid] = record.doc.nodes[nid]
      return text({ meta: { id: record.id, name: record.name, rev: record.rev }, pages: page ? [page] : record.doc.pages, nodes })
    }
    return text(record)
  },
)

server.registerTool(
  'create_document',
  {
    title: 'Create document',
    description: 'Create a new design file. Pass a doc ({pages, nodes}) to seed content; otherwise an empty page is created.',
    inputSchema: {
      name: z.string(),
      id: z.string().optional().describe('Explicit document id (defaults to generated)'),
      doc: docShape.optional(),
    },
  },
  async ({ name, id, doc }) => {
    const docId = id || `doc_${Math.random().toString(36).slice(2, 9)}`
    const body = doc ?? {
      pages: [{ id: `page_${Math.random().toString(36).slice(2, 7)}`, name: 'Page 1', artboards: [] }],
      nodes: {},
    }
    return text(store.saveDoc(docId, { name, doc: body }))
  },
)

server.registerTool(
  'replace_document',
  {
    title: 'Replace document',
    description: 'Overwrite the whole doc JSON of a design file (last write wins, previous revision kept in history).',
    inputSchema: { id: z.string(), doc: docShape },
  },
  async ({ id, doc }) => text(store.saveDoc(id, { doc })),
)

server.registerTool(
  'patch_node',
  {
    title: 'Patch node',
    description:
      'Shallow-merge fields into one node (text, fill, x/y, width/height, visible, opacity, fontSize…). Arrays such as fills/children are replaced wholesale.',
    inputSchema: {
      id: z.string(),
      nodeId: z.string(),
      patch: z.record(z.any()),
    },
  },
  async ({ id, nodeId, patch }) => {
    const record = loadDocOrThrow(id)
    const node = record.doc.nodes[nodeId]
    if (!node) throw new Error(`node not found: ${nodeId}`)
    const next = { ...node, ...patch, id: nodeId }
    const doc = { ...record.doc, nodes: { ...record.doc.nodes, [nodeId]: next } }
    const meta = store.saveDoc(id, { doc })
    return text({ ok: true, rev: meta.rev, node: next })
  },
)

server.registerTool(
  'upsert_node',
  {
    title: 'Insert or replace node',
    description:
      'Insert a node (or replace an existing one by id). Pass parentId to append into that frame children, or pageId for a top-level artboard.',
    inputSchema: {
      id: z.string(),
      node: z.record(z.any()),
      parentId: z.string().nullable().optional(),
      pageId: z.string().optional(),
    },
  },
  async ({ id, node, parentId, pageId }) => {
    const record = loadDocOrThrow(id)
    const doc = { ...record.doc, pages: record.doc.pages.map((p) => ({ ...p, artboards: [...p.artboards] })), nodes: { ...record.doc.nodes } }
    const nodeId = node.id || `n_${Math.random().toString(36).slice(2, 9)}`
    const parent = parentId ?? node.parentId ?? null
    const next = {
      kind: 'frame',
      name: nodeId,
      children: [],
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      visible: true,
      clip: false,
      ...node,
      id: nodeId,
      parentId: parent,
    }
    doc.nodes[nodeId] = next

    if (parent) {
      const p = doc.nodes[parent]
      if (!p) throw new Error(`parent not found: ${parent}`)
      p.children = p.children.includes(nodeId) ? p.children : [...p.children, nodeId]
    } else if (pageId) {
      const page = doc.pages.find((p) => p.id === pageId)
      if (!page) throw new Error(`page not found: ${pageId}`)
      if (!page.artboards.includes(nodeId)) page.artboards = [...page.artboards, nodeId]
    }

    const meta = store.saveDoc(id, { doc })
    return text({ ok: true, rev: meta.rev, nodeId })
  },
)

server.registerTool(
  'delete_node',
  {
    title: 'Delete node',
    description: 'Remove a node and its descendants from the document.',
    inputSchema: { id: z.string(), nodeId: z.string() },
  },
  async ({ id, nodeId }) => {
    const record = loadDocOrThrow(id)
    const doc = { ...record.doc, pages: record.doc.pages.map((p) => ({ ...p, artboards: p.artboards.filter((a) => a !== nodeId) })), nodes: { ...record.doc.nodes } }
    const target = doc.nodes[nodeId]
    if (!target) throw new Error(`node not found: ${nodeId}`)
    if (target.parentId && doc.nodes[target.parentId]) {
      const parent = doc.nodes[target.parentId]
      doc.nodes[target.parentId] = { ...parent, children: parent.children.filter((c) => c !== nodeId) }
    }
    for (const nid of collectSubtree(record.doc, nodeId)) delete doc.nodes[nid]
    const meta = store.saveDoc(id, { doc })
    return text({ ok: true, rev: meta.rev })
  },
)

server.registerTool(
  'rename_document',
  {
    title: 'Rename document',
    description: 'Rename a design file without touching its content.',
    inputSchema: { id: z.string(), name: z.string() },
  },
  async ({ id, name }) => {
    const record = loadDocOrThrow(id)
    return text(store.saveDoc(id, { name, doc: record.doc }))
  },
)

server.registerTool(
  'delete_document',
  {
    title: 'Delete document',
    description: 'Permanently delete a design file and its revision history.',
    inputSchema: { id: z.string() },
  },
  async ({ id }) => {
    store.deleteDoc(id)
    return text({ ok: true, deleted: id })
  },
)

server.registerTool(
  'list_history',
  {
    title: 'List revisions',
    description: 'List saved revisions for a file (newest first). Use restore_revision to roll back.',
    inputSchema: { id: z.string(), limit: z.number().int().min(1).max(50).optional() },
  },
  async ({ id, limit }) => text({ history: store.listHistory(id, limit ?? 20) }),
)

server.registerTool(
  'restore_revision',
  {
    title: 'Restore revision',
    description: 'Restore a revision as the new current content (history is preserved).',
    inputSchema: { id: z.string(), rev: z.number().int().min(1) },
  },
  async ({ id, rev }) => {
    const doc = store.getHistoryDoc(id, rev)
    if (!doc) throw new Error(`revision not found: ${id}@${rev}`)
    const meta = store.saveDoc(id, { doc })
    return text({ ok: true, restoredFrom: rev, rev: meta.rev })
  },
)

server.registerTool(
  'list_folders',
  {
    title: 'List folders',
    description: 'List folders used by the file browser.',
    inputSchema: {},
  },
  async () => text({ folders: store.listFolders() }),
)

const transport = new StdioServerTransport()
await server.connect(transport)
console.error(`openpaper mcp ready (db: ${store.DB_FILE})`)
