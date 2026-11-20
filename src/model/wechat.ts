import type { Doc, DocNode } from './types'

let counter = 0
const uid = (prefix = 'w') => `${prefix}${(++counter).toString(36)}${Math.random().toString(36).slice(2, 5)}`

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
  const lineHeight = opts.lineHeight ?? 1.35
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

function attach(nodes: Record<string, DocNode>, node: DocNode): DocNode {
  nodes[node.id] = node
  if (node.parentId) nodes[node.parentId].children.push(node.id)
  return node
}

/* ---------------- WeChat palette ---------------- */
const WX_GREEN = '#07C160'
const WX_BUBBLE = '#95EC69'
const WX_BG = '#EDEDED'
const WX_NAV = '#F6F6F6'
const WX_SEP = '#DCDCDC'
const WX_TAB_INACTIVE = '#999999'
const WX_BADGE = '#FA5151'

function statusBar(nodes: Record<string, DocNode>, parent: DocNode) {
  attach(nodes, text(uid('sb'), 'Time', parent, 24, 17, 60, '9:41', {
    fontSize: 15, fontWeight: 600, lineHeight: 1.2,
  }))
  attach(nodes, text(uid('sb'), 'Cellular', parent, 288, 18, 22, '5G', { fontSize: 12, fontWeight: 600 }))
  attach(nodes, text(uid('sb'), 'WiFi', parent, 312, 18, 20, '📶', { fontSize: 12 }))
  attach(nodes, rect(uid('sb'), 'Battery Shell', parent, 340, 18, 22, 11, {
    radius: 3, fill: 'transparent', stroke: 'rgba(0,0,0,0.35)', strokeWidth: 1,
  }))
  attach(nodes, rect(uid('sb'), 'Battery Fill', parent, 342, 20, 15, 7, { radius: 1.5, fill: '#111111' }))
}

function tabBar(nodes: Record<string, DocNode>, parent: DocNode, active: string) {
  const bar = attach(nodes, rect(uid('tb'), 'Tab Bar', parent, 0, 778, 390, 66, { fill: WX_NAV }))
  attach(nodes, rect(uid('tb'), 'Tab Separator', bar, 0, 0, 390, 0.5, { fill: WX_SEP }))
  const tabs: Array<[string, string]> = [['微信', '💬'], ['通讯录', '👥'], ['发现', '🧭'], ['我', '👤']]
  tabs.forEach(([label, glyph], i) => {
    const cx = i * 97.5
    const on = label === active
    attach(nodes, text(uid('tb'), `Tab ${label}`, bar, cx, 6, 97.5, glyph, {
      fontSize: 24, textAlign: 'center', lineHeight: 1.1,
      color: on ? WX_GREEN : WX_TAB_INACTIVE,
    }))
    attach(nodes, text(uid('tb'), `Label ${label}`, bar, cx, 34, 97.5, label, {
      fontSize: 10, textAlign: 'center', lineHeight: 1.2,
      color: on ? WX_GREEN : WX_TAB_INACTIVE,
    }))
  })
  const badge = attach(nodes, ellipse(uid('tb'), 'Badge', bar, 60, 4, 18, 18, { fill: WX_BADGE }))
  attach(nodes, text(uid('tb'), 'Badge Count', badge, 0, 1, 18, '3', {
    fontSize: 11, fontWeight: 600, textAlign: 'center', color: '#FFFFFF', lineHeight: 1.35,
  }))
  attach(nodes, rect(uid('tb'), 'Home Indicator', parent, 141, 831, 108, 5, { radius: 3, fill: '#111111' }))
}

function chatRow(
  nodes: Record<string, DocNode>,
  parent: DocNode,
  y: number,
  name: string,
  preview: string,
  time: string,
  avatarColor: string,
  avatarGlyph: string,
  badge?: string,
  muted?: boolean,
) {
  const row = attach(nodes, frame(uid('row'), `Chat · ${name}`, parent, 0, y, 390, 72, { fill: '#FFFFFF', clip: true }))
  const avatar = attach(nodes, rect(uid('av'), 'Avatar', row, 12, 12, 48, 48, { radius: 5, fill: avatarColor }))
  attach(nodes, text(uid('av'), 'Avatar Glyph', avatar, 0, 0, 48, avatarGlyph, {
    fontSize: 22, textAlign: 'center', lineHeight: 2.2, color: 'rgba(255,255,255,0.92)',
  }))
  attach(nodes, text(uid('nm'), 'Name', row, 72, 13, 200, name, {
    fontSize: 16, fontWeight: 400, color: '#111111', textEllipsis: true,
  }))
  attach(nodes, text(uid('pv'), 'Preview', row, 72, 36, 270, preview, {
    fontSize: 14, color: '#999999', textEllipsis: true,
  }))
  attach(nodes, text(uid('tm'), 'Time', row, 330, 15, 48, time, {
    fontSize: 12, color: '#B2B2B2', textAlign: 'right',
  }))
  if (badge) {
    const b = attach(nodes, ellipse(uid('bg'), 'Unread Badge', row, 50, 8, 18, 18, { fill: WX_BADGE }))
    attach(nodes, text(uid('bg'), 'Count', b, 0, 1, 18, badge, {
      fontSize: 11, fontWeight: 600, textAlign: 'center', color: '#FFFFFF', lineHeight: 1.4,
    }))
  }
  if (muted) attach(nodes, text(uid('mt'), 'Muted', row, 352, 38, 22, '🔕', { fontSize: 13, color: '#C5C5C5' }))
  attach(nodes, rect(uid('sp'), 'Separator', row, 72, 71.5, 318, 0.5, { fill: WX_SEP }))
}

function bubbleIn(
  nodes: Record<string, DocNode>,
  parent: DocNode,
  y: number,
  avatarColor: string,
  glyph: string,
  content: string,
  width: number,
) {
  const avatar = attach(nodes, rect(uid('av'), 'Peer Avatar', parent, 12, y, 40, 40, { radius: 5, fill: avatarColor }))
  attach(nodes, text(uid('av'), 'Glyph', avatar, 0, 0, 40, glyph, {
    fontSize: 18, textAlign: 'center', lineHeight: 2.2, color: 'rgba(255,255,255,0.92)',
  }))
  const b = attach(nodes, rect(uid('bb'), 'Bubble In', parent, 60, y, width, 44, { radius: 5, fill: '#FFFFFF' }))
  attach(nodes, text(uid('bb'), 'Text', b, 10, 9, width - 20, content, {
    fontSize: 15, color: '#111111', lineHeight: 1.35,
  }))
}

function bubbleOut(
  nodes: Record<string, DocNode>,
  parent: DocNode,
  y: number,
  content: string,
  width: number,
) {
  const avatar = attach(nodes, rect(uid('av'), 'My Avatar', parent, 338, y, 40, 40, { radius: 5, fill: '#576B95' }))
  attach(nodes, text(uid('av'), 'Glyph', avatar, 0, 0, 40, '我', {
    fontSize: 17, textAlign: 'center', lineHeight: 2.3, color: '#FFFFFF',
  }))
  const b = attach(nodes, rect(uid('bb'), 'Bubble Out', parent, 330 - width, y, width, 44, { radius: 5, fill: WX_BUBBLE }))
  attach(nodes, text(uid('bb'), 'Text', b, 10, 9, width - 20, content, {
    fontSize: 15, color: '#111111', lineHeight: 1.35,
  }))
}

export function buildWechatDoc(): Doc {
  counter = 0
  const nodes: Record<string, DocNode> = {}

  /* ================= artboard 1: 微信 聊天列表 ================= */
  const chats = frame('wx_chats', '微信 · 聊天列表', null, 0, 0, 390, 844, { fill: '#FFFFFF' })
  attach(nodes, chats)
  statusBar(nodes, chats)

  const nav = attach(nodes, rect(uid('nv'), 'Nav Bar', chats, 0, 44, 390, 52, { fill: WX_NAV }))
  attach(nodes, rect(uid('nv'), 'Nav Separator', nav, 0, 51.5, 390, 0.5, { fill: WX_SEP }))
  attach(nodes, text(uid('nv'), 'Title', nav, 0, 14, 390, '微信', {
    fontSize: 17, fontWeight: 500, textAlign: 'center',
  }))
  attach(nodes, text(uid('nv'), 'Add', nav, 352, 13, 26, '⊕', {
    fontSize: 22, textAlign: 'center', color: '#111111', lineHeight: 1.1,
  }))

  const search = attach(nodes, rect(uid('sc'), 'Search Field', chats, 8, 104, 374, 36, { radius: 7, fill: WX_NAV }))
  attach(nodes, text(uid('sc'), 'Placeholder', search, 0, 9, 374, '🔍 搜索', {
    fontSize: 15, textAlign: 'center', color: '#B2B2B2',
  }))

  chatRow(nodes, chats, 148, '文件传输助手', '[图片]', '12:30', '#576B95', '文')
  chatRow(nodes, chats, 220, '微信支付', '你有一笔转账待确认', '11:45', '#07C160', '支', '2')
  chatRow(nodes, chats, 292, '张三', '晚上一起吃饭吗？', '10:18', '#576B95', '张', '1')
  chatRow(nodes, chats, 364, '产品交流群', '李雷: 新版设计稿已上传', '昨天', '#FA9D3B', '群', '9', true)
  chatRow(nodes, chats, 436, '妈妈', '记得吃饭', '昨天', '#4C9AFF', '妈')
  chatRow(nodes, chats, 508, '李四', '好的，明天见', '周二', '#576B95', '李')
  chatRow(nodes, chats, 580, '公众号', '微信派: 本周更新亮点', '周一', '#576B95', '订')

  tabBar(nodes, chats, '微信')

  /* ================= artboard 2: 聊天详情 ================= */
  const chat = frame('wx_chat', '微信 · 聊天', null, 470, 0, 390, 844, { fill: WX_BG })
  attach(nodes, chat)
  statusBar(nodes, chat)

  const nav2 = attach(nodes, rect(uid('nv'), 'Nav Bar', chat, 0, 44, 390, 52, { fill: WX_NAV }))
  attach(nodes, rect(uid('nv'), 'Nav Separator', nav2, 0, 51.5, 390, 0.5, { fill: WX_SEP }))
  attach(nodes, text(uid('nv'), 'Back', nav2, 12, 13, 30, '‹', { fontSize: 28, color: '#111111', lineHeight: 0.95 }))
  attach(nodes, text(uid('nv'), 'Title', nav2, 0, 14, 390, '张三', {
    fontSize: 17, fontWeight: 500, textAlign: 'center',
  }))
  attach(nodes, text(uid('nv'), 'More', nav2, 352, 15, 26, '···', {
    fontSize: 18, textAlign: 'center', color: '#111111', lineHeight: 0.6,
  }))

  attach(nodes, text(uid('ts'), 'Time Stamp', chat, 0, 116, 390, '10:15', {
    fontSize: 12, textAlign: 'center', color: '#B2B2B2',
  }))
  bubbleIn(nodes, chat, 148, '#576B95', '张', '在吗？', 76)
  bubbleOut(nodes, chat, 204, '在的，刚看到消息', 130)
  bubbleIn(nodes, chat, 260, '#576B95', '张', '晚上一起吃饭吗？我知道一家不错的粤菜', 240)
  bubbleOut(nodes, chat, 316, '好啊，几点？', 96)
  attach(nodes, text(uid('ts'), 'Time Stamp', chat, 0, 372, 390, '10:22', {
    fontSize: 12, textAlign: 'center', color: '#B2B2B2',
  }))
  bubbleIn(nodes, chat, 404, '#576B95', '张', '七点，珠江新城那家', 150)
  bubbleOut(nodes, chat, 460, 'OK 👌', 76)

  const input = attach(nodes, rect(uid('in'), 'Input Bar', chat, 0, 778, 390, 66, { fill: WX_NAV }))
  attach(nodes, rect(uid('in'), 'Input Separator', input, 0, 0, 390, 0.5, { fill: WX_SEP }))
  attach(nodes, text(uid('in'), 'Voice', input, 14, 16, 30, '🎤', { fontSize: 24, color: '#595959' }))
  attach(nodes, rect(uid('in'), 'Field', input, 56, 14, 240, 36, { radius: 6, fill: '#FFFFFF' }))
  attach(nodes, text(uid('in'), 'Emoji', input, 304, 16, 30, '😊', { fontSize: 24, color: '#595959' }))
  attach(nodes, text(uid('in'), 'Add', input, 342, 16, 30, '➕', { fontSize: 24, color: '#595959' }))
  attach(nodes, rect(uid('in'), 'Home Indicator', input, 141, 53, 108, 5, { radius: 3, fill: '#111111' }))

  /* ================= artboard 3: 发现 ================= */
  const find = frame('wx_find', '微信 · 发现', null, 940, 0, 390, 844, { fill: WX_BG })
  attach(nodes, find)
  statusBar(nodes, find)
  const nav3 = attach(nodes, rect(uid('nv'), 'Nav Bar', find, 0, 44, 390, 52, { fill: WX_NAV }))
  attach(nodes, rect(uid('nv'), 'Nav Separator', nav3, 0, 51.5, 390, 0.5, { fill: WX_SEP }))
  attach(nodes, text(uid('nv'), 'Title', nav3, 0, 14, 390, '发现', {
    fontSize: 17, fontWeight: 500, textAlign: 'center',
  }))

  const findRows: Array<[string, string, string, string]> = [
    ['朋友圈', '🖼️', '#FFD60A', ''],
    ['视频号', '📺', '#FA9D3B', ''],
    ['扫一扫', '🔳', '#4C9AFF', 'sep'],
    ['摇一摇', '📱', '#4C9AFF', ''],
    ['看一看', '👀', '#FFD60A', 'sep'],
    ['搜一搜', '🔍', '#FA5151', ''],
    ['小程序', '🧩', '#576B95', 'sep'],
  ]
  let fy = 108
  findRows.forEach(([label, glyph, color, gap]) => {
    const row = attach(nodes, frame(uid('fr'), `Find · ${label}`, find, 0, fy, 390, 56, { fill: '#FFFFFF', clip: true }))
    const icon = attach(nodes, rect(uid('fr'), 'Icon', row, 16, 12, 32, 32, { radius: 7, fill: color }))
    attach(nodes, text(uid('fr'), 'Glyph', icon, 0, 1, 32, glyph, {
      fontSize: 17, textAlign: 'center', lineHeight: 1.8, color: '#FFFFFF',
    }))
    attach(nodes, text(uid('fr'), 'Label', row, 60, 17, 200, label, { fontSize: 16, color: '#111111' }))
    attach(nodes, text(uid('fr'), 'Chevron', row, 356, 15, 22, '›', {
      fontSize: 22, textAlign: 'right', color: '#C5C5C5', lineHeight: 1.1,
    }))
    if (gap === 'sep') {
      attach(nodes, rect(uid('fr'), 'Separator', row, 60, 55.5, 330, 0.5, { fill: WX_SEP }))
      fy += 8
    } else {
      attach(nodes, rect(uid('fr'), 'Separator', row, 60, 55.5, 330, 0.5, { fill: WX_SEP }))
    }
    fy += 56
    if (gap === 'sep') fy += 16
  })

  tabBar(nodes, find, '发现')

  return {
    pages: [
      { id: 'page_wechat', name: '微信', icon: '💬', artboards: [chats.id, chat.id, find.id] },
      { id: 'page_draft', name: 'Draft', artboards: [] },
    ],
    nodes,
  }
}
