import { useEditor, setUI } from '../model/store'

/** Paper panel drag-resize: thin hit zone on a panel's inner edge updating its width. */
export function PanelResize({ side }: { side: 'left' | 'right' }) {
  const width = useEditor((s) => (side === 'left' ? s.ui.leftPanelWidth : s.ui.rightPanelWidth))
  return (
    <div
      className="panel-resize"
      onPointerDown={(e) => {
        e.preventDefault()
        const startX = e.clientX
        const startW = width
        const onMove = (ev: PointerEvent) => {
          const dx = side === 'left' ? ev.clientX - startX : startX - ev.clientX
          const w = Math.round(Math.min(480, Math.max(180, startW + dx)))
          setUI(side === 'left' ? { leftPanelWidth: w } : { rightPanelWidth: w })
        }
        const onUp = () => {
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', onUp)
        }
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
      }}
    />
  )
}
