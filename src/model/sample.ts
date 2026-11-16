import type { Doc, DocNode } from './types'

let counter = 0
export function uid(prefix = 'n') {
  counter += 1
  return `${prefix}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

function base(partial: Partial<DocNode> & Pick<DocNode, 'id' | 'kind' | 'name'>): DocNode {
  return {
    parentId: null,
    children: [],
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    visible: true,
    clip: false,
    ...partial,
  }
}

function text(
  id: string,
  name: string,
  parent: DocNode,
  x: number,
  y: number,
  width: number,
  content: string,
  opts: Partial<DocNode> = {},
): DocNode {
  const fontSize = opts.fontSize ?? 14
  const lineHeight = opts.lineHeight ?? 1.4
  return base({
    id,
    kind: 'text',
    name,
    parentId: parent.id,
    x,
    y,
    width,
    height: Math.round(fontSize * lineHeight),
    heightAuto: true,
    text: content,
    fontSize,
    lineHeight,
    fontWeight: 400,
    color: '#111111',
    ...opts,
  })
}

function rect(
  id: string,
  name: string,
  parent: DocNode,
  x: number,
  y: number,
  width: number,
  height: number,
  opts: Partial<DocNode> = {},
): DocNode {
  return base({ id, kind: 'rect', name, parentId: parent.id, x, y, width, height, fill: '#DDDDDD', ...opts })
}

function frame(
  id: string,
  name: string,
  parent: DocNode | null,
  x: number,
  y: number,
  width: number,
  height: number,
  opts: Partial<DocNode> = {},
): DocNode {
  return base({ id, kind: 'frame', name, parentId: parent?.id ?? null, x, y, width, height, fill: '#FFFFFF', clip: true, ...opts })
}

function ellipse(
  id: string,
  name: string,
  parent: DocNode,
  x: number,
  y: number,
  width: number,
  height: number,
  opts: Partial<DocNode> = {},
): DocNode {
  return base({ id, kind: 'ellipse', name, parentId: parent.id, x, y, width, height, fill: '#DDDDDD', ...opts })
}

function attach(nodes: Record<string, DocNode>, node: DocNode) {
  nodes[node.id] = node
  if (node.parentId) nodes[node.parentId].children.push(node.id)
  return node.id
}

export function buildSampleDoc(): Doc {
  counter = 0
  const nodes: Record<string, DocNode> = {}

  const home = frame('art_home', 'Home', null, 0, 0, 390, 844, { fill: '#FFFFFF' })
  attach(nodes, home)

  attach(nodes, text('h_time', 'Time', home, 24, 14, 80, '9:41', { fontSize: 14, fontWeight: 600 }))
  attach(nodes, rect('h_batt', 'Battery', home, 322, 20, 44, 12, { radius: 4, fill: '#111111' }))

  attach(
    nodes,
    text('h_title', 'Title', home, 24, 76, 280, 'A-Ran', {
      fontSize: 34,
      fontWeight: 600,
      letterSpacing: -0.6,
      lineHeight: 1.15,
      color: '#111111',
    }),
  )
  attach(
    nodes,
    text('h_sub', 'Subtitle', home, 24, 126, 320, 'Good evening — what would you like to hear?', {
      fontSize: 14,
      color: '#8C8C8C',
    }),
  )

  const hero = frame('h_hero', 'Hero Card', home, 24, 170, 342, 196, { radius: 22, fill: '#141414' })
  attach(nodes, hero)
  attach(nodes, text('h_hero_t', 'Card Title', hero, 22, 22, 220, 'Night Drive', {
    fontSize: 24,
    fontWeight: 600,
    color: '#FFFFFF',
  }))
  attach(nodes, text('h_hero_s', 'Card Meta', hero, 22, 56, 220, 'Lo-fi · 32 tracks', {
    fontSize: 13,
    color: 'rgba(255,255,255,0.58)',
  }))
  attach(nodes, ellipse('h_hero_c', 'Cover', hero, 240, 22, 80, 80, { fill: '#2A2A2E' }))

  attach(nodes, text('h_sec', 'Section', home, 24, 396, 200, 'For you', {
    fontSize: 15,
    fontWeight: 600,
  }))
  const cardA = frame('h_card_a', 'Card A', home, 24, 424, 164, 180, { radius: 18, fill: '#EFE6DA' })
  attach(nodes, cardA)
  attach(nodes, text('h_card_a_t', 'Card A Label', cardA, 16, 16, 120, 'Relax', {
    fontSize: 14,
    fontWeight: 500,
    color: '#5C4B39',
  }))
  const cardB = frame('h_card_b', 'Card B', home, 204, 424, 162, 180, { radius: 18, fill: '#DDE7F0' })
  attach(nodes, cardB)
  attach(nodes, text('h_card_b_t', 'Card B Label', cardB, 16, 16, 120, 'Focus', {
    fontSize: 14,
    fontWeight: 500,
    color: '#3C4E5C',
  }))

  const nav = frame('h_nav', 'Tab Bar', home, 0, 764, 390, 80, { fill: '#FFFFFF' })
  attach(nodes, nav)
  const dotX = [47, 148, 244, 343]
  dotX.forEach((dx, i) => {
    attach(nodes, ellipse(`h_dot_${i}`, `Tab ${i + 1}`, nav, dx, 24, 22, 22, {
      fill: i === 0 ? '#111111' : '#D8D8D8',
    }))
  })
  attach(nodes, rect('h_home_ind', 'Home Indicator', home, 141, 826, 108, 5, { radius: 3, fill: '#111111' }))

  const player = frame('art_player', 'Player', null, 470, 0, 390, 844, { fill: '#0E0E10' })
  attach(nodes, player)
  attach(nodes, text('p_label', 'Label', player, 24, 64, 300, 'Now playing', {
    fontSize: 12,
    letterSpacing: 1.2,
    color: 'rgba(255,255,255,0.45)',
  }))
  const cover = frame('p_cover', 'Cover', player, 40, 104, 310, 310, { radius: 26, fill: '#232327' })
  attach(nodes, cover)
  attach(nodes, text('p_title', 'Track', player, 40, 448, 310, 'Paper Planes', {
    fontSize: 30,
    fontWeight: 600,
    letterSpacing: -0.4,
    color: '#FFFFFF',
  }))
  attach(nodes, text('p_meta', 'Artist', player, 40, 492, 310, 'M.I.A. · Kala', {
    fontSize: 14,
    color: 'rgba(255,255,255,0.45)',
  }))
  attach(nodes, rect('p_track', 'Progress Track', player, 40, 556, 310, 3, {
    radius: 2,
    fill: 'rgba(255,255,255,0.16)',
  }))
  attach(nodes, rect('p_fill', 'Progress Fill', player, 40, 556, 120, 3, { radius: 2, fill: '#FFFFFF' }))

  attach(nodes, ellipse('p_prev', 'Prev', player, 62, 600, 44, 44, { fill: 'rgba(255,255,255,0.12)' }))
  attach(nodes, ellipse('p_play', 'Play', player, 163, 590, 64, 64, { fill: '#FFFFFF' }))
  attach(nodes, ellipse('p_next', 'Next', player, 284, 600, 44, 44, { fill: 'rgba(255,255,255,0.12)' }))

  return {
    pages: [
      { id: 'page_main', name: 'UI', artboards: [home.id, player.id] },
      { id: 'page_scratch', name: 'Draft', artboards: [] },
    ],
    nodes,
  }
}
