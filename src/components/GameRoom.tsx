import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronDown,
  Copy,
  Flag,
  HelpCircle,
  History,
  LoaderCircle,
  LockKeyhole,
  MessageCircle,
  RotateCcw,
  Send,
  Share2,
  Shuffle,
  Sparkles,
  Trophy,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { characterById, characters } from '../game/characters'
import { canAnswer, canAsk, characterCount, secondsRemaining, trimQuestion } from '../game/rules'
import { REACTIONS, type RoomState } from '../game/types'
import type { GameController } from '../hooks/useGame'
import { copyText, invitation, navigateRoom, shareRoom, storage } from '../lib/platform'
import { CharacterBoard, Portrait } from './CharacterBoard'
import { Logo } from './Home'

function useClock() {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(timer)
  }, [])
  return now
}
function Timer({ state, offset }: { state: RoomState; offset: number }) {
  const now = useClock()
  const seconds = secondsRemaining(state.game.deadline, offset, now)
  const duration = state.game.phase === 'answer' ? 15 : 30
  return (
    <div
      className={`turn-timer ${seconds <= 5 ? 'urgent' : ''}`}
      role="timer"
      aria-live="off"
      aria-label={`${seconds} seconds remaining`}
    >
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="20" className="timer-track" />
        <circle
          cx="24"
          cy="24"
          r="20"
          className="timer-progress"
          strokeDasharray="125.66"
          strokeDashoffset={125.66 * (1 - Math.min(1, seconds / duration))}
        />
      </svg>
      <span>
        {seconds}
        <small>s</small>
      </span>
    </div>
  )
}
function RulesDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  return (
    <dialog
      ref={dialog}
      className="game-dialog rules-dialog"
      onCancel={onClose}
      aria-labelledby="rules-title"
    >
      <button className="icon-button dialog-close" onClick={onClose} aria-label="Close rules">
        <X size={20} />
      </button>
      <span className="dialog-symbol">
        <HelpCircle size={30} />
      </span>
      <h2 id="rules-title">Trust your gut.</h2>
      <ol>
        <li>Pick a secret character. Your friend picks one too.</li>
        <li>You have 30 seconds to ask a yes-or-no question, up to 50 characters.</li>
        <li>Your friend has 15 seconds to answer. Missed answers stay unanswered.</li>
        <li>
          Tap faces to eliminate them. Tap again to bring them back. Only you see your eliminations.
        </li>
        <li>
          During your question turn, guess instead of asking. A correct guess wins; a wrong guess
          loses.
        </li>
      </ol>
      <button className="button primary" onClick={onClose}>
        Got it <Check size={18} />
      </button>
    </dialog>
  )
}
export function GameRoom({ controller }: { controller: GameController }) {
  const state = controller.state!
  const [showRules, setShowRules] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const me = state.players.find((p) => p.id === state.you)!
  const other = state.players.find((p) => p.id !== state.you)
  const mySecret = characterById(state.myCharacter)
  const connectionText = controller.preview
    ? 'Local preview'
    : controller.connection === 'online'
      ? 'Connected'
      : controller.connection === 'offline'
        ? 'Offline'
        : 'Reconnecting…'
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2500)
    return () => clearTimeout(timer)
  }, [copied])
  async function copyInvite(share = false) {
    try {
      if (share) await shareRoom(state.code)
      else await copyText(invitation(state.code))
      setCopied(true)
      setCopyError(false)
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setCopyError(true)
    }
  }
  return (
    <>
      {controller.preview && (
        <div className="preview-banner">
          <span>
            <strong>Local preview</strong>
            <span className="preview-description">
              {' '}
              · two seats on this device. No online connection.
            </span>
          </span>
          <button onClick={() => void controller.switchSeat()} disabled={controller.busy}>
            <Shuffle size={14} /> Switch seat
          </button>
        </div>
      )}
      <header className="site-header room-header">
        <Logo />
        <div className="room-header-center">
          <span className="room-label">ROOM</span>
          <span className="room-code">{state.code}</span>
          {!controller.preview && (
            <button
              className="icon-button"
              onClick={() => void copyInvite()}
              aria-label="Copy invitation link"
            >
              {copied ? <Check size={17} /> : <Copy size={17} />}
            </button>
          )}
        </div>
        <button
          className="icon-button rules-button"
          onClick={() => setShowRules(true)}
          aria-label="How to play"
        >
          <HelpCircle size={22} />
        </button>
      </header>
      <main
        className={`room-main ${state.game.phase === 'lobby' ? 'is-lobby' : ''} ${state.game.phase === 'finished' ? 'is-finished' : ''}`}
      >
        <div className="players-strip">
          <div
            className={`player-pill ${state.game.activePlayer === me.id ? 'active-player' : ''}`}
          >
            <span className="player-avatar you-avatar">
              {mySecret ? <Portrait character={mySecret} /> : me.name.slice(0, 1).toUpperCase()}
            </span>
            <span>
              <b>
                {me.name} <small>(you)</small>
              </b>
              <span className="player-subtitle">
                {mySecret ? (
                  <>
                    <LockKeyhole size={11} /> Your secret: {mySecret.name}
                  </>
                ) : (
                  'Pick your secret person'
                )}
              </span>
            </span>
            {me.ready && state.game.phase === 'lobby' && (
              <CheckCheck size={18} className="ready-icon" />
            )}
          </div>
          <span className="versus">vs</span>
          <div
            className={`player-pill opponent-pill ${state.game.activePlayer === other?.id ? 'active-player' : ''}`}
          >
            <span className="player-avatar friend-avatar">
              {other ? other.name.slice(0, 1).toUpperCase() : <Users size={20} />}
            </span>
            <span>
              <b>{other?.name ?? 'Your friend'}</b>
              <span className="player-subtitle">
                {!other ? (
                  'Waiting to join…'
                ) : state.game.phase === 'lobby' ? (
                  other.ready ? (
                    <>
                      <Check size={12} /> Ready to go
                    </>
                  ) : (
                    'Choosing a person…'
                  )
                ) : (
                  <>
                    <span
                      className={`status-dot ${controller.onlinePlayers.includes(other.id) ? 'connected' : ''}`}
                    />
                    {controller.onlinePlayers.includes(other.id)
                      ? 'Here for the judgment'
                      : 'Reconnecting…'}
                  </>
                )}
              </span>
            </span>
          </div>
          <span
            className={`connection-pill ${controller.connection === 'online' || controller.preview ? '' : 'connection-warning'}`}
          >
            {controller.connection === 'online' || controller.preview ? (
              <Wifi size={13} />
            ) : (
              <WifiOff size={13} />
            )}
            {connectionText}
          </span>
        </div>
        {state.game.phase === 'finished' ? (
          <GameOver key={state.game.id + state.you} controller={controller} />
        ) : (
          <Round
            key={state.game.id + state.you}
            controller={controller}
            copyInvite={copyInvite}
            copied={copied}
            copyError={copyError}
          />
        )}
        <footer className="room-footer">
          <button onClick={() => navigateRoom()}>
            <ArrowLeft size={13} /> Home
          </button>
          <span>
            THE ORIGINAL 24 <span aria-hidden="true">✳</span> Keep it kind. Keep it subjective.
          </span>
        </footer>
      </main>
      {showRules && <RulesDialog onClose={() => setShowRules(false)} />}
    </>
  )
}
function Round({
  controller,
  copyInvite,
  copied,
  copyError,
}: {
  controller: GameController
  copyInvite: (share?: boolean) => Promise<void>
  copied: boolean
  copyError: boolean
}) {
  const state = controller.state!
  const game = state.game,
    lobby = game.phase === 'lobby'
  const me = state.players.find((p) => p.id === state.you)!
  const other = state.players.find((p) => p.id !== state.you)
  const mySecret = characterById(state.myCharacter)
  const storageKey = `${state.roomId}:${game.id}:${state.you}`
  const [eliminated, setEliminated] = useState<string[]>(() => {
    const saved = storage.read<unknown>(`eliminated:${storageKey}`, [])
    return Array.isArray(saved)
      ? saved.filter(
          (id): id is string => typeof id === 'string' && characters.some((c) => c.id === id),
        )
      : []
  })
  const [draft, setDraft] = useState(() => {
    const saved = storage.read<unknown>(`draft:${storageKey}`, '')
    return typeof saved === 'string' ? trimQuestion(saved) : ''
  })
  const draftRef = useRef(draft)
  const [guessMode, setGuessMode] = useState(false)
  const [guess, setGuess] = useState<string | null>(null)
  const [saveError, setSaveError] = useState(false)
  const guessAllowed = canAsk(state)
  const displayGuessMode = guessMode && guessAllowed
  useEffect(() => {
    if (!guessAllowed) {
      setGuessMode(false)
      setGuess(null)
    }
  }, [guessAllowed])
  const currentQuestion = state.history.find((q) => q.turn === game.turn && q.status === 'pending')
  const lastQuestion = [...state.history].reverse().find((q) => q.status !== 'pending')
  function changeDraft(text: string) {
    const next = trimQuestion(text)
    draftRef.current = next
    setDraft(next)
    if (!storage.write(`draft:${storageKey}`, next)) setSaveError(true)
  }
  function changeEliminated(next: string[]) {
    setEliminated(next)
    if (!storage.write(`eliminated:${storageKey}`, next)) setSaveError(true)
  }
  function pick(id: string) {
    if (lobby) {
      void controller.act('select', { characterId: id })
      return
    }
    if (displayGuessMode) {
      setGuess(id)
      return
    }
    changeEliminated(
      eliminated.includes(id) ? eliminated.filter((item) => item !== id) : [...eliminated, id],
    )
  }
  async function sendQuestion() {
    const sent = draft
    const ok = await controller.act('question', { text: sent.trim() })
    if (ok && draftRef.current === sent) changeDraft('')
  }
  return (
    <div className="game-layout">
      <section className="board-area">
        <div className="board-heading">
          <div>
            <p className="eyebrow">THE ORIGINAL PACK</p>
            <h1>
              {lobby
                ? 'Who’s your person?'
                : displayGuessMode
                  ? 'Make your call.'
                  : 'Read the room.'}
              <span className="heading-star" aria-hidden="true">
                ✳
              </span>
            </h1>
          </div>
          {!lobby && (
            <div className="remaining-count">
              <strong>
                {24 - eliminated.length}
                <span>/ 24</span>
              </strong>
              <span>still in the running</span>
            </div>
          )}
        </div>
        <div className="board-toolbar">
          <p>
            {lobby
              ? 'Pick a secret character. Your friend won’t see.'
              : displayGuessMode
                ? 'Tap the person you think they picked.'
                : 'Tap a face to rule them out. Tap again to undo.'}
          </p>
          {!lobby && (
            <button onClick={() => changeEliminated([])} disabled={!eliminated.length}>
              <RotateCcw size={13} /> Reset
            </button>
          )}
        </div>
        <CharacterBoard
          mode={lobby ? 'select' : displayGuessMode ? 'guess' : 'eliminate'}
          selected={lobby ? state.myCharacter : guess}
          eliminated={eliminated}
          disabled={lobby && (controller.busy || me.ready)}
          onPick={pick}
        />
        {saveError && (
          <p className="field-error" role="status">
            This browser can’t save drafts or eliminations. Keep this tab open.
          </p>
        )}
        {!lobby && (
          <div className="board-note">
            <LockKeyhole size={13} /> Your eliminations are just for you. No one else can see them.
          </div>
        )}
      </section>
      <aside className="game-sidebar">
        {lobby ? (
          <section className="lobby-panel turn-panel">
            <span className="panel-eyebrow">
              <span className="status-dot connected" /> THE PRE-GAME
            </span>
            <h2>
              {me.ready
                ? 'Excellent choice.'
                : mySecret
                  ? `Hello, ${mySecret.name}.`
                  : 'Every face has a vibe.'}
            </h2>
            <p className="panel-description">
              {me.ready
                ? other?.ready
                  ? 'Let the questionable questions begin.'
                  : 'Your person is locked in. Waiting for your friend.'
                : mySecret
                  ? 'This is your secret person. Ready to see what your friend thinks of them?'
                  : 'Choose someone on the board. Then let your friend’s assumptions do the work.'}
            </p>
            <div className={`secret-preview ${mySecret ? 'has-secret' : ''}`}>
              {mySecret ? (
                <>
                  <Portrait character={mySecret} />
                  <div>
                    <span>YOUR SECRET PERSON</span>
                    <strong>{mySecret.name}</strong>
                    <small>
                      <LockKeyhole size={11} /> For your eyes only
                    </small>
                  </div>
                </>
              ) : (
                <>
                  <span className="secret-question">?</span>
                  <span>
                    A mysterious someone.
                    <br />
                    <small>They’re out there. Pick a face.</small>
                  </span>
                </>
              )}
            </div>
            <button
              className="button primary"
              disabled={!mySecret || controller.busy}
              onClick={() => void controller.act(me.ready ? 'unready' : 'ready')}
            >
              {controller.busy ? (
                <LoaderCircle className="spin" size={18} />
              ) : me.ready ? (
                <RotateCcw size={18} />
              ) : (
                <Check size={18} />
              )}
              {me.ready ? 'Change my person' : 'I’m ready'}
              {!me.ready && <ArrowRight size={18} />}
            </button>
            {controller.preview && (
              <p className="local-seat-hint">
                <Shuffle size={14} /> Ready? Use <b>Switch seat</b> above to pick for the other
                player.
              </p>
            )}
            {!other && (
              <div className="invite-section">
                <div className="invite-heading">
                  <Users size={16} />
                  <b>Bring your other half.</b>
                </div>
                <p>Send a friend your invitation or this room code.</p>
                <div className="invite-code">{state.code}</div>
                <div className="invite-actions">
                  <button className="button secondary" onClick={() => void copyInvite()}>
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                    {copied ? 'Copied!' : 'Copy link'}
                  </button>
                  {typeof navigator.share === 'function' && (
                    <button
                      className="icon-button share-button"
                      onClick={() => void copyInvite(true)}
                      aria-label="Share invitation"
                    >
                      <Share2 size={18} />
                    </button>
                  )}
                </div>
                {copyError && (
                  <p className="field-error">Copy unavailable. Share the room code instead.</p>
                )}
              </div>
            )}
            {other && (
              <div className="lobby-friend">
                <span className={`status-dot ${other.ready ? 'connected' : ''}`} />
                <span>
                  {other.name} is {other.ready ? 'ready to play' : 'choosing a person'}.
                </span>
              </div>
            )}
          </section>
        ) : (
          <section className={`turn-panel ${canAsk(state) || canAnswer(state) ? 'your-turn' : ''}`}>
            <div className="turn-panel-top">
              <span className="panel-eyebrow">
                ROUND {game.turn}
                <span className="turn-dot">·</span>
                {canAsk(state) ? 'YOUR QUESTION' : canAnswer(state) ? 'YOUR ANSWER' : 'THEIR TURN'}
              </span>
              <Timer state={state} offset={controller.clockOffset} />
            </div>
            <h2>
              {canAsk(state)
                ? 'Go on. Judge a little.'
                : canAnswer(state)
                  ? 'What do you reckon?'
                  : game.phase === 'answer'
                    ? 'Let them think…'
                    : `${other?.name ?? 'Your friend'} is thinking…`}
            </h2>
            {currentQuestion ? (
              <div className="current-question">
                <MessageCircle size={20} />
                <p>“{currentQuestion.text}”</p>
              </div>
            ) : (
              <p className="panel-description">
                {canAsk(state)
                  ? 'Ask a yes-or-no question about their secret person.'
                  : 'Draft your next question while they make their assumptions.'}
              </p>
            )}
            {canAnswer(state) && (
              <div className="answer-buttons">
                <button
                  className="button yes-button"
                  disabled={controller.busy}
                  onClick={() => void controller.act('answer', { answer: true })}
                >
                  <Check size={23} /> YES
                </button>
                <button
                  className="button no-button"
                  disabled={controller.busy}
                  onClick={() => void controller.act('answer', { answer: false })}
                >
                  <X size={23} /> NO
                </button>
              </div>
            )}
            {game.phase === 'answer' && !canAnswer(state) && (
              <div className="waiting-answer">
                <span className="thinking-dots">
                  <i />
                  <i />
                  <i />
                </span>{' '}
                Waiting for {other?.name ?? 'your friend'}’s verdict
              </div>
            )}
            {
              <form
                className="question-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (canAsk(state) && draft.trim()) void sendQuestion()
                }}
              >
                <div className="question-label">
                  <label htmlFor="question-input">
                    {canAsk(state) ? 'YOUR QUESTION' : 'YOUR NEXT QUESTION'}
                  </label>
                  <span className={characterCount(draft) >= 45 ? 'near-limit' : ''}>
                    {characterCount(draft)} / 50
                  </span>
                </div>
                <div className="question-input-wrap">
                  <textarea
                    id="question-input"
                    placeholder="Would they start a podcast?"
                    rows={2}
                    value={draft}
                    onChange={(event) => changeDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (
                        event.key === 'Enter' &&
                        !event.shiftKey &&
                        !event.nativeEvent.isComposing
                      ) {
                        event.preventDefault()
                        if (canAsk(state) && draft.trim() && !controller.busy) void sendQuestion()
                      }
                    }}
                    aria-describedby="draft-hint"
                  />
                  <button
                    className="send-button"
                    type="submit"
                    aria-label="Ask question"
                    disabled={!canAsk(state) || !draft.trim() || controller.busy}
                  >
                    <Send size={18} />
                  </button>
                </div>
                <span className="draft-hint" id="draft-hint">
                  {canAsk(state)
                    ? 'Go with your gut. You have 30 seconds.'
                    : 'Your draft stays here until you send it.'}
                </span>
              </form>
            }
            {canAsk(state) && (
              <button
                className={`button guess-button ${displayGuessMode ? 'guess-active' : ''}`}
                onClick={() => setGuessMode((value) => !value)}
                disabled={controller.busy}
              >
                <Flag size={17} />
                {displayGuessMode ? 'Cancel final guess' : 'I know who it is'}
                {!displayGuessMode && <ArrowRight size={16} />}
              </button>
            )}
            {lastQuestion && game.phase === 'question' && (
              <div className="last-answer">
                <span>LAST VERDICT</span>
                <span
                  className={`answer-badge ${lastQuestion.status === 'unanswered' ? 'unanswered' : lastQuestion.answer ? 'yes' : 'no'}`}
                >
                  {lastQuestion.status === 'unanswered'
                    ? 'No answer'
                    : lastQuestion.answer
                      ? 'YES'
                      : 'NO'}
                </span>
                <p>“{lastQuestion.text}”</p>
              </div>
            )}
          </section>
        )}
        <ReactionBar controller={controller} />
        {!lobby && (
          <details className="history-panel" open>
            <summary>
              <span>
                <History size={16} /> The paper trail{' '}
                <span className="history-count">{state.history.length}</span>
              </span>
              <ChevronDown size={15} />
            </summary>
            <div className="history-entries">
              {state.history.length ? (
                [...state.history].reverse().map((q) => (
                  <div className="history-entry" key={q.id}>
                    <div>
                      <span>
                        {q.asker === state.you ? 'YOU' : (other?.name.toUpperCase() ?? 'THEM')}{' '}
                        <small>· {q.turn}</small>
                      </span>
                      <span
                        className={`answer-badge ${q.status === 'pending' ? 'pending' : q.status === 'unanswered' ? 'unanswered' : q.answer ? 'yes' : 'no'}`}
                      >
                        {q.status === 'pending'
                          ? 'Thinking…'
                          : q.status === 'unanswered'
                            ? 'No answer'
                            : q.answer
                              ? 'YES'
                              : 'NO'}
                      </span>
                    </div>
                    <p>{q.text}</p>
                  </div>
                ))
              ) : (
                <div className="history-empty">
                  <MessageCircle size={20} />
                  <p>
                    No assumptions on record.
                    <br />
                    Yet.
                  </p>
                </div>
              )}
            </div>
          </details>
        )}
        <div className="sidebar-signoff">
          Good friends. Questionable instincts.
          <Sparkles size={16} />
        </div>
      </aside>
      {guess && displayGuessMode && (
        <GuessDialog
          id={guess}
          busy={controller.busy}
          onCancel={() => setGuess(null)}
          onConfirm={async () => {
            if (await controller.act('guess', { characterId: guess })) {
              setGuess(null)
              setGuessMode(false)
            }
          }}
        />
      )}
    </div>
  )
}
function ReactionBar({ controller }: { controller: GameController }) {
  const [cooldown, setCooldown] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const state = controller.state!
  function send(emoji: string) {
    if (cooldown) return
    setCooldown(true)
    void controller.react(emoji)
    timer.current = setTimeout(() => setCooldown(false), 1250)
  }
  return (
    <section className="reaction-panel">
      <span className="eyebrow">A FACE SAYS A THOUSAND WORDS.</span>
      <div className="reaction-stage" role="log" aria-live="polite" aria-label="Reactions">
        {controller.reactions.map((reaction, i) => (
          <span
            key={reaction.id}
            role="img"
            className="floating-reaction"
            style={{ '--drift': `${i * 24 - 36}px` } as React.CSSProperties}
            aria-label={`${reaction.from === state.you ? 'You' : (state.players.find((p) => p.id === reaction.from)?.name ?? 'Your friend')} reacted ${reaction.emoji}`}
          >
            {reaction.emoji}
          </span>
        ))}
      </div>
      <div className="reaction-buttons">
        {REACTIONS.map((emoji) => (
          <button
            key={emoji}
            aria-label={`React ${emoji}`}
            onClick={() => send(emoji)}
            disabled={cooldown || (controller.connection !== 'online' && !controller.preview)}
          >
            {emoji}
          </button>
        ))}
      </div>
    </section>
  )
}
function GuessDialog({
  id,
  busy,
  onCancel,
  onConfirm,
}: {
  id: string
  busy: boolean
  onCancel: () => void
  onConfirm: () => Promise<void>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const character = characterById(id)!
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  return (
    <dialog
      ref={dialog}
      className="game-dialog guess-dialog"
      onCancel={(event) => {
        if (busy) event.preventDefault()
        else onCancel()
      }}
      aria-labelledby="guess-title"
    >
      <span className="eyebrow">ONE FACE. ONE FINAL CALL.</span>
      <div className="guess-portrait">
        <Portrait character={character} />
      </div>
      <h2 id="guess-title">Is it {character.name}?</h2>
      <p>
        A correct guess wins the game.
        <br />
        Get it wrong and your friend wins.
      </p>
      <button className="button primary" disabled={busy} onClick={() => void onConfirm()}>
        <Flag size={17} />
        {busy ? 'Making the call…' : 'That’s my final guess'}
      </button>
      <button className="button text-button" disabled={busy} onClick={onCancel}>
        I’m still thinking
      </button>
    </dialog>
  )
}
function GameOver({ controller }: { controller: GameController }) {
  const state = controller.state!
  const me = state.players.find((p) => p.id === state.you)!,
    other = state.players.find((p) => p.id !== state.you)!
  const won = state.game.winner === state.you,
    winner = state.players.find((p) => p.id === state.game.winner)!
  const guesser = state.players.find((p) => p.id === state.game.guesser)!
  const guessedCharacter = characterById(state.game.guessCharacter)!
  return (
    <section className={`game-over ${won ? 'won' : ''}`}>
      <div className="confetti" aria-hidden="true">
        {Array.from({ length: 18 }, (_, i) => (
          <i key={i} style={{ '--i': i } as React.CSSProperties} />
        ))}
      </div>
      <span className="victory-symbol">
        <Trophy size={38} />
      </span>
      <p className="eyebrow">
        {won ? 'IMMACULATE INSTINCTS.' : 'A RESPECTABLE AMOUNT OF JUDGMENT.'}
      </p>
      <h1>{won ? 'You know the type.' : `${winner.name} knows the type.`}</h1>
      <p className="result-description">
        {guesser.id === state.you ? 'You' : guesser.name} guessed {guessedCharacter.name}.{' '}
        {state.game.result === 'correct'
          ? 'Absolutely spot on.'
          : 'A bold guess. A different person.'}
        <br />
        <strong>{won ? 'The glory is all yours.' : 'There’s always the next round.'}</strong>
      </p>
      <div className="revealed-characters">
        {[me, other].map((player) => {
          const character = characterById(state.reveals?.[player.id])
          return (
            character && (
              <div className="reveal-card" key={player.id}>
                <div className="reveal-portrait">
                  <Portrait character={character} />
                  {player.id === state.game.winner && (
                    <span className="reveal-crown">
                      <Trophy size={18} />
                    </span>
                  )}
                </div>
                <span>
                  {player.id === state.you
                    ? 'YOUR PERSON'
                    : `${player.name.toUpperCase()}’S PERSON`}
                </span>
                <h2>{character.name}</h2>
              </div>
            )
          )
        })}
        <span className="reveal-plus" aria-hidden="true">
          &
        </span>
      </div>
      <div className="rematch-controls">
        <button
          className="button primary"
          disabled={controller.busy || me.rematchReady}
          onClick={() => void controller.act('rematch')}
        >
          <RotateCcw size={19} />
          {me.rematchReady ? 'Waiting for your friend…' : 'One more round?'}
          <ArrowRight size={19} />
        </button>
        {other.rematchReady && !me.rematchReady && (
          <p className="rematch-note">{other.name} is up for another round!</p>
        )}
        {controller.preview && me.rematchReady && (
          <p className="rematch-note">Switch seats above to accept the rematch.</p>
        )}
        <button className="button text-button" onClick={() => navigateRoom()}>
          Back to home
        </button>
      </div>
      <ReactionBar controller={controller} />
    </section>
  )
}
