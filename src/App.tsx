import { AlertCircle, ArrowLeft, LoaderCircle, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Home, Privacy } from './components/Home'
import { GameRoom } from './components/GameRoom'
import { useGame } from './hooks/useGame'
import { navigateRoom } from './lib/platform'

export default function App() {
  const [search, setSearch] = useState(location.search)
  useEffect(() => {
    const update = () => setSearch(location.search)
    window.addEventListener('popstate', update)
    return () => window.removeEventListener('popstate', update)
  }, [])
  const params = new URLSearchParams(search)
  const roomId = params.get('room')
  const controller = useGame(roomId)
  return (
    <>
      {params.get('page') === 'privacy' ? (
        <Privacy />
      ) : controller.loading ? (
        <main className="loading-page">
          <span className="brand-icon">?</span>
          <LoaderCircle className="spin" size={25} />
          <h1>Finding your people…</h1>
          <p>Restoring your room and secret person.</p>
        </main>
      ) : roomId && controller.state?.roomId === roomId ? (
        <GameRoom controller={controller} />
      ) : (
        <Home controller={controller} joinCode={params.get('join')?.toUpperCase() ?? ''} />
      )}
      {controller.error && (
        <div className="error-toast" role="alert">
          <AlertCircle size={20} />
          <p>{controller.error}</p>
          {roomId && !controller.state && (
            <button
              onClick={() => {
                controller.clearError()
                navigateRoom()
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
