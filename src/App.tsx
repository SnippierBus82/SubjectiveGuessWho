import { AlertCircle, ArrowLeft, LoaderCircle, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Home, Privacy } from './components/Home'
import { LogoMark } from './components/LogoMark'
import { GameRoom } from './components/GameRoom'
import { useGame } from './hooks/useGame'
import { storage, type AppPage } from './lib/platform'

export default function App() {
  const [search, setSearch] = useState(() => {
    const active = storage.read<string>('active-room', '')
    if (active && new URLSearchParams(location.search).get('room') !== active)
      history.replaceState(null, '', `/?room=${encodeURIComponent(active)}`)
    return location.search
  })
  useEffect(() => {
    const update = () => {
      const active = storage.read<string>('active-room', '')
      if (active && new URLSearchParams(location.search).get('room') !== active) {
        history.replaceState(null, '', `/?room=${encodeURIComponent(active)}`)
        dispatchEvent(new Event('sgw:open-game-menu'))
      }
      setSearch(location.search)
    }
    window.addEventListener('popstate', update)
    return () => window.removeEventListener('popstate', update)
  }, [])
  const params = new URLSearchParams(search)
  const roomId = params.get('room')
  const controller = useGame(roomId)
  const requestedPage = params.get('page') ?? 'play'
  const pages: AppPage[] = ['play', 'create', 'join', 'find', 'boards', 'profile', 'privacy']
  const page = pages.includes(requestedPage as AppPage) ? (requestedPage as AppPage) : 'play'
  return (
    <>
      {page === 'privacy' && !roomId ? (
        <Privacy />
      ) : controller.loading ? (
        <main className="loading-page">
          <span className="brand-icon">
            <LogoMark />
          </span>
          <LoaderCircle className="spin" size={25} />
          <h1>Getting your game…</h1>
          <p>One moment.</p>
        </main>
      ) : roomId && controller.state?.roomId === roomId ? (
        <GameRoom controller={controller} />
      ) : roomId ? (
        <main className="loading-page room-recovery">
          <LogoMark />
          <h1>Can’t open this game.</h1>
          <p>Check your connection and try again.</p>
          <button className="button primary" onClick={() => location.reload()}>
            Try again
          </button>
          <button className="button secondary" onClick={() => void controller.leave()}>
            Leave game
          </button>
        </main>
      ) : (
        <Home
          controller={controller}
          page={params.has('join') ? 'join' : page}
          joinCode={params.get('join')?.toUpperCase() ?? ''}
        />
      )}
      {controller.error && (
        <div className="error-toast" role="alert">
          <AlertCircle size={20} />
          <p>{controller.error}</p>
          {roomId && !controller.state && (
            <button
              onClick={() => {
                controller.clearError()
                void controller.leave()
              }}
            >
              <ArrowLeft size={15} /> Home
            </button>
          )}
          <button
            className="icon-button"
            aria-label="Dismiss error"
            onClick={controller.clearError}
          >
            <X size={18} />
          </button>
        </div>
      )}
    </>
  )
}
