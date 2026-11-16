import { useState } from 'react'
import { setNudgeAmounts, toggleHotkeys, toggleNudgeSettings, useEditor } from '../model/store'

// Groups named after Paper's hotkey-panel categories (Tools / Navigation /
// Panels / Zoom / View / Selection / Edit / Arrange / Alignment / Layout / Export).
const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: 'Tools',
    items: [
      ['V', 'Move'],
      ['H / Space', 'Pan'],
      ['F / A', 'Frame'],
      ['R', 'Rectangle'],
      ['P', 'Pen'],
      ['T', 'Text'],
      ['C', 'Comment'],
      ['Z', 'Zoom'],
      ['S', 'Shaders'],
      ['⇧⌘K', 'Create image'],
      ['I', 'Eyedropper'],
      ['⌥', 'Measure'],
    ],
  },
  {
    title: 'Edit',
    items: [
      ['⌘Z / ⇧⌘Z', 'Undo / redo'],
      ['⌘X / ⌘C / ⌘V', 'Cut / copy / paste'],
      ['⇧⌘V', 'Paste over'],
      ['⌘D', 'Duplicate'],
      ['⌥ drag', 'Duplicate by dragging'],
      ['⌘G / ⇧⌘G', 'Group / ungroup'],
      ['⌫', 'Delete'],
      ['⌘E', 'Export selection'],
    ],
  },
  {
    title: 'Selection',
    items: [
      ['Tab / ⇧Tab', 'Next / previous sibling'],
      ['Enter', 'Enter child'],
      ['Esc', 'Parent / deselect'],
      ['⌘A', 'Select all siblings'],
      ['⇧⌘A', 'Select other siblings'],
      ['N / ⇧N', 'Next / previous artboard'],
      ['PageUp / PageDown', 'Previous / next page'],
      ['Double-click', 'Rename / edit path'],
    ],
  },
  {
    title: 'Arrange',
    items: [
      ['[ / ]', 'To front / back'],
      ['⌘[ / ⌘]', 'Backward / forward'],
      ['⇧⌘L', 'Lock / unlock'],
      ['⌘⇧⌥L', 'Unlock all'],
      ['⌘⇧\'', 'Snap to pixel grid'],
      ['⇧X', 'Swap fill & stroke'],
      ['0–9', 'Opacity'],
    ],
  },
  {
    title: 'Alignment',
    items: [
      ['⌥A/D/W/S', 'Align left / right / top / bottom'],
      ['⌥H / ⌥V', 'Center horizontally / vertically'],
      ['⇧⌘W / ⇧⌘S', 'Align center (H/V)'],
      ['⌥⇧H / ⌥⇧V', 'Distribute horizontally / vertically'],
    ],
  },
  {
    title: 'Layout',
    items: [
      ['⇧A', 'Add auto layout'],
      ['⌥⇧A', 'Remove auto layout'],
      ['⌥⇧⌘R / F', 'Hug / fill'],
    ],
  },
  {
    title: 'Panels',
    items: [
      ['⌘\\', 'Hide / show UI'],
      ['⌘⇧\\', 'Collapse / expand left panel'],
      ['⌘O', 'Browse files'],
      ['⌘N', 'New file'],
      ['⌃⇧?', 'Keyboard shortcuts'],
    ],
  },
  {
    title: 'View',
    items: [
      ['+ / −', 'Zoom in / out'],
      ['⇧0 / ⇧1 / ⇧2', '100% / fit / zoom to selection'],
      ['Space + drag', 'Pan canvas'],
      ['⌥ hover', 'Measure'],
      ['⌥L', 'Collapse all layers'],
      ['⌥⇧C', 'Show / hide comments'],
      ['⌘\\', 'Hide / show UI'],
      ['⌘⇧\\', 'Collapse / expand left panel'],
      ['⌃⇧?', 'Keyboard shortcuts'],
    ],
  },
  {
    title: 'Text',
    items: [
      ['⌘B', 'Bold'],
      ['⌘I', 'Italic'],
      ['⌘⇧. / ,', 'Size +/−'],
      ['⌥⇧. / ,', 'Line height +/−'],
      ['⌥. / ,', 'Letter spacing +/−'],
      ['⌘⌥. / ,', 'Weight +/−'],
    ],
  },
]

export function HotkeysDialog() {
  const visible = useEditor((s) => s.ui.hotkeysVisible)
  const [query, setQuery] = useState('')
  if (!visible) return null
  const q = query.trim().toLowerCase()
  const groups = GROUPS.map((group) => ({
    ...group,
    items: q ? group.items.filter(([keys, label]) => label.toLowerCase().includes(q) || keys.toLowerCase().includes(q)) : group.items,
  })).filter((group) => group.items.length > 0)
  return (
    <div className="hotkeys-overlay" onClick={toggleHotkeys}>
      <div className="hotkeys-panel" onClick={(event) => event.stopPropagation()}>
        <header className="hotkeys-head">
          <span>Keyboard shortcuts</span>
          <input
            className="hotkeys-search"
            placeholder="Search shortcuts"
            value={query}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="hotkeys-close" onClick={toggleHotkeys} aria-label="Close">×</button>
        </header>
        <div className="hotkeys-grid">
          {groups.map((group) => (
            <section key={group.title} className="hotkeys-group">
              <h4>{group.title}</h4>
              <ul>
                {group.items.map(([keys, label]) => (
                  <li key={keys}>
                    <span>{label}</span>
                    <kbd>{keys}</kbd>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Paper "Nudge settings…": custom arrow / ⇧arrow nudge distances. */
export function NudgeDialog() {
  const visible = useEditor((s) => s.ui.nudgeSettingsVisible)
  const amounts = useEditor((s) => s.ui.nudgeAmounts)
  if (!visible) return null
  const commit = (index: 0 | 1, value: number) => {
    const next: [number, number] = [amounts[0], amounts[1]]
    next[index] = value
    setNudgeAmounts(next[0], next[1])
  }
  return (
    <div className="hotkeys-overlay" onClick={toggleNudgeSettings}>
      <div className="hotkeys-panel nudge-panel" onClick={(event) => event.stopPropagation()}>
        <header className="hotkeys-head">
          <span>Nudge amount</span>
          <button className="hotkeys-close" onClick={toggleNudgeSettings} aria-label="Close">×</button>
        </header>
        <div className="nudge-fields">
          <label className="nudge-field">
            <span>Arrow keys (px)</span>
            <input
              type="number"
              min={0.01}
              step={0.5}
              defaultValue={amounts[0]}
              key={`s${amounts[0]}`}
              onBlur={(e) => commit(0, Number(e.target.value) || amounts[0])}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            />
          </label>
          <label className="nudge-field">
            <span>⇧Arrow keys (px)</span>
            <input
              type="number"
              min={0.01}
              step={0.5}
              defaultValue={amounts[1]}
              key={`b${amounts[1]}`}
              onBlur={(e) => commit(1, Number(e.target.value) || amounts[1])}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            />
          </label>
        </div>
      </div>
    </div>
  )
}
