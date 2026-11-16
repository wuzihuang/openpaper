import { useEffect } from 'react'
import { Canvas } from './canvas/Canvas'
import { setUI, startPersistence, useEditor } from './model/store'
import { installPaperApi, projectName, startLinkSync } from './model/navigation'
import { ContextMenu } from './ui/ContextMenu'
import { FileBrowser } from './ui/FileBrowser'
import { Inspector } from './ui/Inspector'
import { HotkeysDialog, NudgeDialog } from './ui/Hotkeys'
import { LayersPanel } from './ui/LayersPanel'
import { TabBar } from './ui/TabBar'
import { Icon } from './ui/Icon'
import { openProjectMenu, openZoomMenu } from './ui/menuActions'
import { ToolRail } from './ui/Toolbar'
import { Toast } from './ui/Toast'
import { Tooltip } from './ui/Tooltip'

/** Paper panelsCollapsed: floating mini bars at the top corners. */
function CollapsedBars() {
  const scale = useEditor((s) => s.camera.scale)
  return (
    <>
      <div className="collapsed-bar left">
        <button
          className="icon-button"
          data-tooltip="Menu"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            openProjectMenu(r.left, r.bottom + 4)
          }}
        >
          <Icon name="menu" size={14} />
        </button>
        <span className="doc-title">{projectName()}</span>
        <button
          className="icon-button"
          data-tooltip="Expand panels (⌘⇧\)"
          onClick={() => setUI({ leftPanelVisible: true })}
        >
          <Icon name="chevron-right" size={12} />
        </button>
      </div>
      <div className="collapsed-bar right">
        <button
          className="icon-button"
          data-tooltip="Zoom options"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            openZoomMenu(r.left, r.bottom + 4)
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 500, minWidth: 36, textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
        </button>
        <button
          className="icon-button"
          data-tooltip="Expand panels (⌘⇧\)"
          onClick={() => setUI({ leftPanelVisible: true })}
        >
          <Icon name="chevron-left" size={12} />
        </button>
      </div>
    </>
  )
}

export default function App() {
  const uiVisible = useEditor((s) => s.ui.uiVisible)
  const leftPanelVisible = useEditor((s) => s.ui.leftPanelVisible)
  const leftPanelWidth = useEditor((s) => s.ui.leftPanelWidth)
  const rightPanelWidth = useEditor((s) => s.ui.rightPanelWidth)
  const theme = useEditor((s) => s.ui.theme)
  useEffect(() => {
    startPersistence()
    installPaperApi()
    return startLinkSync()
  }, [])

  return (
    <div
      className="app"
      data-theme={theme}
      data-ui={uiVisible ? undefined : 'hidden'}
      data-left={uiVisible && !leftPanelVisible ? 'collapsed' : undefined}
      style={{ '--lw': `${leftPanelWidth}px`, '--rw': `${rightPanelWidth}px` } as React.CSSProperties}
      onContextMenu={(event) => {
        const target = event.target as HTMLElement
        if (target.closest('input, textarea, [contenteditable="true"]')) return
        event.preventDefault()
      }}
    >
      <div className="workspace">
        <Canvas />
      </div>
      {uiVisible && <TabBar />}
      {uiVisible && leftPanelVisible && <LayersPanel />}
      {uiVisible && <ToolRail />}
      {uiVisible && leftPanelVisible && <Inspector />}
      {uiVisible && !leftPanelVisible && <CollapsedBars />}
      <HotkeysDialog />
      <NudgeDialog />
      <FileBrowser />
      <ContextMenu />
      <Tooltip />
      <Toast />
    </div>
  )
}
