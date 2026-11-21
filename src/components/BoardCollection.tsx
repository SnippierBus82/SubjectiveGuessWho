import { Check, Layers3, Shuffle } from 'lucide-react'
import { BOARDS, previewBoard } from '../game/boards'
import { Portrait } from './CharacterBoard'

export function BoardCollection({
  value,
  busy,
  onChoose,
}: {
  value: string
  busy: boolean
  onChoose: (id: string) => void
}) {
  return (
    <>
      <div className="screen-heading">
        <p className="screen-kicker">YOUR COLLECTION</p>
        <h1>My boards.</h1>
        <p>Pick your cast of characters.</p>
      </div>
      <div className="collection-label">
        <span>
          <Layers3 size={20} /> Available boards
        </span>
        <b>{BOARDS.length}</b>
      </div>
      <div className="collection-grid">
        {BOARDS.map((board) => (
          <article
            className={`collection-card ${value === board.id ? 'is-equipped' : ''}`}
            key={board.id}
          >
            <div className="collection-art" aria-hidden="true">
              {previewBoard(board.id).map((face) => (
                <Portrait key={face.id} character={face} />
              ))}
              <span className="collection-badge">Included</span>
            </div>
            <div className="collection-info">
              <div>
                <h2>{board.name}</h2>
                <p>
                  <Shuffle size={16} /> A fresh 24 every game
                </p>
              </div>
              <button
                className={`button ${value === board.id ? 'equipped-button' : 'primary'}`}
                disabled={busy}
                onClick={() => onChoose(board.id)}
                aria-label={value === board.id ? `Play with ${board.name}` : `Use ${board.name}`}
              >
                {value === board.id && <Check size={20} />}
                {value === board.id ? 'Selected · Play' : 'Use board'}
              </button>
            </div>
          </article>
        ))}
      </div>
      <p className="collection-note">All your boards are ready to play. No purchases needed.</p>
    </>
  )
}
