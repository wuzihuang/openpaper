import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { createDocMeta, setCurrentDocId } from './model/docs'
import './styles.css'

async function seedDocFromUrl(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search)
  const src = params.get('doc')
  if (!src || src.includes('..') || src.includes('://')) return false
  try {
    const res = await fetch(src.startsWith('/') ? src : `/${src}`)
    if (!res.ok) return false
    const doc = await res.json()
    if (doc && typeof doc === 'object' && doc.nodes && (doc.pages || doc.artboards)) {
      const name = src.split('/').pop()?.replace(/\.json$/i, '') || 'Imported'
      const meta = createDocMeta(name, doc)
      setCurrentDocId(meta.id)
      params.delete('doc')
      const next = `${location.pathname}${params.size ? `?${params}` : ''}${location.hash}`
      // Reload so the store boots already bound to the seeded file.
      location.replace(next)
      return true
    }
  } catch {
    /* keep existing doc */
  }
  return false
}

seedDocFromUrl().then((seeded) => {
  if (seeded) return // navigation in flight
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
