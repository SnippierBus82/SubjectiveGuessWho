import { useState } from 'react'
import { ChevronLeft, HelpCircle, LogOut, Play } from 'lucide-react'
import { Sheet } from './Sheet'
import type { GameController } from '../hooks/useGame'
import { boardInfo } from '../game/boards'
import { timeLabel, DEFAULT_TIMINGS } from '../game/timings'

export function GameMenu({
  controller,
  onClose,
}: {
  controller: GameController
  onClose: () => void
}) {
  const [view, setView] = useState<'menu' | 'leave' | 'rules'>('menu')
  const state = controller.state!
  const settings = state.settings ?? DEFAULT_TIMINGS
  return (
    <Sheet
      title={view === 'leave' ? 'Leave this game?' : view === 'rules' ? 'How to play' : 'Game menu'}
      onClose={onClose}
    >
      {view === 'leave' ? (
        <div className="leave-confirm">
          <span className="leave-symbol">
            <LogOut size={30} />
          </span>
          <p>
            {state.game.phase === 'finished'
              ? 'Ready to head back to Play?'
              : 'Your friend will be told you left. This game will end.'}
          </p>
          {controller.error && (
            <p className="form-error" role="alert">
              {controller.error}
            </p>
          )}
          <button className="button primary" onClick={onClose}>
            Keep playing
          </button>
          <button
            className="button danger-button"
            disabled={controller.busy}
            onClick={() => void controller.leave()}
          >
            {controller.busy ? 'Leaving…' : 'Yes, leave game'}
          </button>
        </div>
      ) : view === 'rules' ? (
        <>
          <ol className="play-rules">
            <li>Pick a secret face. Don’t tell your friend!</li>
            <li>Take turns asking yes-or-no questions.</li>
            <li>Tap faces to cross them out. Tap again to undo.</li>
            <li>Answer questions about your own secret.</li>
            <li>Guess their secret to win. A wrong guess loses!</li>
          </ol>
          <button className="button secondary" onClick={() => setView('menu')}>
            <ChevronLeft size={21} /> Game menu
          </button>
        </>
      ) : (
        <div className="game-menu-content">
          <p className="menu-room-label">
            ROOM <strong>{state.code}</strong>
          </p>
          <button className="button primary" onClick={onClose}>
            <Play size={22} fill="currentColor" /> Keep playing
          </button>
          <button className="button secondary" onClick={() => setView('rules')}>
            <HelpCircle size={23} /> How to play
          </button>
          <details className="game-details">
            <summary>Game details</summary>
            <p>{state.boardLabel || boardInfo(state.boardId).name}</p>
            <p>
              Ask: {timeLabel(settings.question)} · Answer: {timeLabel(settings.answer)} · Review:{' '}
              {timeLabel(settings.review)}
            </p>
          </details>
          <button className="button danger-button" onClick={() => setView('leave')}>
            <LogOut size={21} /> Leave game
          </button>
        </div>
      )}
    </Sheet>
  )
}
