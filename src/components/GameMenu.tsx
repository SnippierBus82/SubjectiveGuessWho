import { useState } from 'react'
import { Check, ChevronDown, ChevronLeft, Copy, HelpCircle, LogOut, Play } from 'lucide-react'
import { Sheet } from './Sheet'
import type { GameController } from '../hooks/useGame'
import { boardInfo } from '../game/boards'
import { paceName, timeLabel } from '../game/timings'

export function GameMenu({
  controller,
  onClose,
  onCopyInvite,
  inviteStatus,
}: {
  controller: GameController
  onClose: () => void
  onCopyInvite: () => Promise<void>
  inviteStatus: 'copied' | 'failed' | null
}) {
  const [view, setView] = useState<'menu' | 'leave' | 'rules'>('menu')
  const state = controller.state!
  const settings = state.settings
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
            <li>Cross out faces at any time during play. Tap again to restore them.</li>
            <li>Answer questions about your own secret.</li>
            <li>Guess their secret to win. A wrong guess loses!</li>
          </ol>
          <button className="button secondary" onClick={() => setView('menu')}>
            <ChevronLeft size={21} /> Game menu
          </button>
        </>
      ) : (
        <div className="game-menu-content">
          <div className="menu-room-card">
            <div className="menu-room-header">
              <p className="menu-room-label">
                Room code: <strong>{state.code}</strong>
              </p>
              {!controller.preview && state.mode !== 'match' && (
                <button
                  className="menu-copy"
                  aria-label={inviteStatus === 'copied' ? 'Link copied' : 'Copy invitation link'}
                  onClick={() => void onCopyInvite()}
                >
                  {inviteStatus === 'copied' ? <Check size={17} /> : <Copy size={17} />}
                  {inviteStatus === 'copied' ? 'Copied' : 'Copy link'}
                </button>
              )}
            </div>
            {inviteStatus === 'failed' && (
              <p className="menu-copy-status" role="status">
                Share the room code above.
              </p>
            )}
            <div className="menu-board-summary">
              <b>{state.boardLabel || boardInfo(state.boardId).name}</b>
              <span className="soft-chip">{paceName(settings)}</span>
            </div>
            <details className="game-details">
              <summary>
                Game details <ChevronDown size={17} aria-hidden="true" />
              </summary>
              <dl>
                <div>
                  <dt>Write</dt>
                  <dd>{timeLabel(settings.question)}</dd>
                </div>
                <div>
                  <dt>Answer</dt>
                  <dd>{timeLabel(settings.answer)}</dd>
                </div>
                <div>
                  <dt>Review</dt>
                  <dd>{timeLabel(settings.review)}</dd>
                </div>
              </dl>
            </details>
          </div>
          <button className="button primary" onClick={onClose}>
            <Play size={20} fill="currentColor" /> Keep playing
          </button>
          <div className="game-menu-links">
            <button onClick={() => setView('rules')}>
              <HelpCircle size={19} /> How to play
            </button>
            <button className="menu-leave" onClick={() => setView('leave')}>
              <LogOut size={19} /> Leave game
            </button>
          </div>
        </div>
      )}
    </Sheet>
  )
}
