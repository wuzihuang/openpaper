import { useEffect, useState } from 'react'

const TOAST_EVENT = 'paper-toast'

export function showToast(message: string) {
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: message }))
}

export function Toast() {
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let timer: number | undefined
    const onToast = (event: Event) => {
      setMessage((event as CustomEvent<string>).detail)
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(() => setMessage(null), 1600)
    }
    window.addEventListener(TOAST_EVENT, onToast)
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast)
      if (timer) window.clearTimeout(timer)
    }
  }, [])

  return (
    <div className="toast" role="status" aria-live="polite" data-visible={!!message}>
      {message ?? ''}
    </div>
  )
}