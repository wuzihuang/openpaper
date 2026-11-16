import {
  canRedo,
  canUndo,
  chooseImage,
  insertSvgFromClipboard,
  redo,
  setTool,
  undo,
  useEditor,
  zoomByStep,
  zoomToFit,
} from '../model/store'
import { Icon } from './Icon'
import { openShadersMenu, openZoomMenu } from './menuActions'

/** Paper toolbar order: Move, Pan | Frame, Rectangle, Pen, Text, Comment | Shaders, Create image, Create SVG. */
export function ToolRail() {
  const tool = useEditor((s) => s.ui.tool)
  useEditor((s) => s.doc)
  const undoable = canUndo()
  const redoable = canRedo()

  return (
    <nav className="tool-rail" aria-label="Tools">
      <div className="rail-group">
        <button
          className="tool-btn"
          data-active={tool === 'select'}
          data-tooltip="Move (V)"
          data-tooltip-side="right"
          onClick={() => setTool('select')}
        >
          <Icon name="cursor" size={16} />
        </button>
        <button
          className="tool-btn"
          data-active={tool === 'hand'}
          data-tooltip="Pan (Space)"
          data-tooltip-side="right"
          onClick={() => setTool('hand')}
        >
          <Icon name="hand" size={16} />
        </button>

        <span className="rail-sep" />

        <button
          className="tool-btn"
          data-active={tool === 'frame'}
          data-tooltip="Frame (F)"
          data-tooltip-side="right"
          onClick={() => setTool('frame')}
        >
          <Icon name="frame" size={16} />
        </button>
        <button
          className="tool-btn"
          data-active={tool === 'rect'}
          data-tooltip="Rectangle (R)"
          data-tooltip-side="right"
          onClick={() => setTool('rect')}
        >
          <Icon name="square" size={16} />
        </button>
        <button
          className="tool-btn"
          data-active={tool === 'pen'}
          data-tooltip="Pen (P)"
          data-tooltip-side="right"
          onClick={() => setTool('pen')}
        >
          <Icon name="pen" size={16} />
        </button>
        <button
          className="tool-btn"
          data-active={tool === 'text'}
          data-tooltip="Text (T)"
          data-tooltip-side="right"
          onClick={() => setTool('text')}
        >
          <Icon name="text" size={16} />
        </button>
        <button
          className="tool-btn"
          data-active={tool === 'comment'}
          data-tooltip="Comment (C)"
          data-tooltip-side="right"
          onClick={() => setTool('comment')}
        >
          <Icon name="comment" size={16} />
        </button>

        <span className="rail-sep" />

        <button
          className="tool-btn"
          data-tooltip="Shaders (S)"
          data-tooltip-side="right"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            openShadersMenu(r.right + 8, r.top)
          }}
        >
          <Icon name="shader" size={16} />
        </button>
        <button
          className="tool-btn"
          data-tooltip="Create image (⇧⌘K)"
          data-tooltip-side="right"
          onClick={() => chooseImage()}
        >
          <Icon name="image" size={16} />
        </button>
        <button
          className="tool-btn"
          data-tooltip="Create SVG — paste SVG markup"
          data-tooltip-side="right"
          onClick={() => void insertSvgFromClipboard()}
        >
          <Icon name="wand" size={16} />
        </button>
      </div>

      <div className="rail-group">
        <button
          className="tool-btn"
          data-tooltip="Undo (⌘Z)"
          data-tooltip-side="right"
          disabled={!undoable}
          onClick={() => undo()}
        >
          <Icon name="undo" size={16} />
        </button>
        <button
          className="tool-btn"
          data-tooltip="Redo (⇧⌘Z)"
          data-tooltip-side="right"
          disabled={!redoable}
          onClick={() => redo()}
        >
          <Icon name="redo" size={16} />
        </button>

        <span className="rail-sep" />

        <button className="tool-btn" data-tooltip="Zoom to fit (⇧1)" data-tooltip-side="right" onClick={() => zoomToFit()}>
          <Icon name="fit" size={16} />
        </button>
      </div>
    </nav>
  )
}


export function ZoomChip() {
  const scale = useEditor((s) => s.camera.scale)
  return (
    <div className="zoom-chip">
      <button className="zoom-btn" data-tooltip="Zoom out (-)" data-tooltip-side="top" onClick={() => zoomByStep(-1)}>
        <Icon name="minus" size={14} />
      </button>
      <button
        className="zoom-label"
        data-tooltip="Zoom options"
        data-tooltip-side="top"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          openZoomMenu(rect.left, rect.top - 4)
        }}
      >
        {Math.round(scale * 100)}%
      </button>
      <button className="zoom-btn" data-tooltip="Zoom in (+)" data-tooltip-side="top" onClick={() => zoomByStep(1)}>
        <Icon name="plus" size={14} />
      </button>
      <span className="zoom-sep" />
      <button className="zoom-btn" data-tooltip="Zoom to fit (⇧1)" data-tooltip-side="top" onClick={() => zoomToFit()}>
        <Icon name="fit" size={14} />
      </button>
    </div>
  )
}
