import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import {
  ArrowRight,
  Check,
  CheckCheck,
  Clock3,
  Copy,
  Expand,
  Flag,
  History,
  LoaderCircle,
  LockKeyhole,
  MessageCircle,
  Menu,
  RotateCcw,
  Send,
  Shuffle,
  Smile,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import type { Character } from '../game/board-model'
import { timeLabel } from '../game/timings'
import { boardInfo } from '../game/boards'
import { REACTIONS } from '../game/types'
import type { GameController } from '../hooks/useGame'
import { copyText, invitation, storage } from '../lib/platform'
import { CharacterBoard, Portrait } from './CharacterBoard'
import { Logo } from './Home'
import { LogoMark } from './LogoMark'
import { QuestionIdeas } from './QuestionIdeas'
import { Sheet } from './Sheet'
import { GameMenu } from './GameMenu'

function useNow() {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])
  return now
}
function Clock({ deadline, now, label }: { deadline: string | null; now: number; label: string }) {
  const left = deadline ? Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1000)) : null
  return (
    <span
      className={`phase-clock ${left !== null && left <= 10 ? 'clock-soon' : ''}`}
      role="timer"
      aria-label={`${label}: ${left === null ? 'unlimited' : `${left} seconds remaining`}`}
    >
      <Clock3 size={15} />
      {left === null ? '∞' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}
    </span>
  )
}
export function GameRoom({ controller }: { controller: GameController }) {
  const [menu, setMenu] = useState(false)
  useEffect(() => {
    const open = () => setMenu(true)
    window.addEventListener('sgw:open-game-menu', open)
    return () => window.removeEventListener('sgw:open-game-menu', open)
  }, [])
  return (
    <>
      <Room
        key={controller.state!.game.id + controller.state!.you}
        controller={controller}
        onMenu={() => setMenu(true)}
      />
      {menu && <GameMenu controller={controller} onClose={() => setMenu(false)} />}
    </>
  )
}
function Room({ controller, onMenu }: { controller: GameController; onMenu: () => void }) {
  const s = controller.state!,
    g = s.game,
    flow = g.flow,
    me = s.players.find((p) => p.id === s.you)!,
    other = s.players.find((p) => p.id !== s.you)
  const { board, settings } = s
  const waitingForBoard = s.boardStatus === 'pending' || s.boardStatus === 'error'
  const now = useNow() + controller.clockOffset
  const key = `${s.roomId}:${g.id}:${s.you}`
  const boardRef = useRef<HTMLDivElement>(null)
  const boardPosition = useRef(storage.read<number>(`board-scroll:${key}`, 0))
  const [eliminated, setEliminated] = useState<string[]>(
    () => storage.read<unknown>(`eliminated:${key}`, []) as string[],
  )
  const safeEliminated = Array.isArray(eliminated)
    ? eliminated.filter((id) => board.some((c) => c.id === id))
    : []
  const [draft, setDraft] = useState(() => storage.read<string>(`draft:${key}`, ''))
  const [sheet, setSheet] = useState<'history' | 'emoji' | 'rules' | 'portrait' | 'guess' | null>(
    null,
  )
  const [inspected, setInspected] = useState<Character | null>(null)
  const [inspect, setInspect] = useState(false),
    [guessMode, setGuessMode] = useState(false)
  const [keyboard, setKeyboard] = useState(false)
  const viewportSize = useRef({
    height: window.visualViewport?.height ?? window.innerHeight,
    width: window.innerWidth,
  })
  const [focused, setFocused] = useState(false),
    [copied, setCopied] = useState(false),
    [copyFailed, setCopyFailed] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false),
    [cooldown, setCooldown] = useState(false)
  const reactionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const mySecret = board.find((c) => c.id === s.myCharacter)
  const writer = g.activePlayer === s.you
  const canWrite = g.phase === 'question' && writer && !flow.submitted
  const latest = [...s.history].reverse().find((q) => q.status === 'answered')
  const pending = s.history.find((q) => q.turn === g.turn && q.status === 'pending')
  const canAnswer = g.phase === 'answer' && !writer
  const lobby = g.phase === 'lobby',
    finished = g.phase === 'finished',
    paused = g.phase === 'paused'
  const round = Math.max(1, Math.ceil(g.turn / 2))
  useLayoutEffect(() => {
    if (!keyboard && boardRef.current) boardRef.current.scrollTop = boardPosition.current
  }, [keyboard])
  useEffect(() => () => clearTimeout(reactionTimer.current), [])
  useEffect(() => {
    if (!canWrite) setGuessMode(false)
  }, [canWrite])
  useEffect(() => {
    window.scrollTo(0, 0)
    document.body.classList.add('is-playing')
    const viewport = window.visualViewport
    const resize = () => {
      const height = viewport?.height ?? window.innerHeight,
        width = window.innerWidth
      if (width !== viewportSize.current.width) viewportSize.current = { width, height }
      viewportSize.current.height = Math.max(viewportSize.current.height, height)
      setKeyboard(height < viewportSize.current.height * 0.75)
      document.documentElement.style.setProperty('--play-height', `${height}px`)
    }
    resize()
    viewport?.addEventListener('resize', resize)
    window.addEventListener('resize', resize)
    return () => {
      viewport?.removeEventListener('resize', resize)
      window.removeEventListener('resize', resize)
      document.documentElement.style.removeProperty('--play-height')
      document.body.classList.remove('is-playing')
    }
  }, [])
  function changeDraft(value: string) {
    const text = Array.from(value.replace(/[\r\n\t]/g, ' '))
      .slice(0, 50)
      .join('')
    setDraft(text)
    if (!storage.write(`draft:${key}`, text)) setSaveFailed(true)
  }
  function changeEliminated(next: string[]) {
    setEliminated(next)
    if (!storage.write(`eliminated:${key}`, next)) setSaveFailed(true)
  }
  async function ask() {
    if (await controller.act('question', { text: draft.trim() })) changeDraft('')
  }
  function pick(id: string) {
    const character = board.find((c) => c.id === id)!
    if (guessMode) {
      setInspected(character)
      setSheet('guess')
      return
    }
    if (lobby) {
      void controller.act('select', { characterId: id })
      return
    }
    changeEliminated(
      safeEliminated.includes(id)
        ? safeEliminated.filter((c) => c !== id)
        : [...safeEliminated, id],
    )
  }
  async function copy() {
    try {
      await copyText(invitation(s.code))
      setCopied(true)
      setCopyFailed(false)
    } catch {
      setCopyFailed(true)
    }
  }
  const reviewBase =
    flow.startedAt && settings.review !== null
      ? new Date(Date.parse(flow.startedAt) + settings.review * 1000).toISOString()
      : null
  const reviewClock = flow.reviewDeadline ?? reviewBase
  const extraReview = !flow.submitted && reviewBase && now >= Date.parse(reviewBase)
  return (
    <div className={`play-app ${keyboard ? 'keyboard-open' : ''}`}>
      {controller.preview && (
        <div className="play-preview">
          <span>Local preview</span>
          <button onClick={() => void controller.switchSeat()} disabled={controller.busy}>
            <Shuffle size={14} /> Switch seat
          </button>
        </div>
      )}
      <header className="play-header">
        <Logo onClick={onMenu} />
        <div className="play-room-id">
          <span>{s.mode === 'match' ? 'QUICK MATCH' : 'ROOM'}</span>
          <b>{s.code}</b>
          {!controller.preview && (
            <button
              className="icon-button"
              aria-label="Copy invitation link"
              onClick={() => void copy()}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          )}
        </div>
        <button className="game-menu-button" aria-label="Game menu" onClick={onMenu}>
          <Menu size={23} />
          <span>Menu</span>
        </button>
      </header>
      <div className="play-status">
        <div>
          <span
            className={`live-dot ${controller.connection === 'online' || controller.preview ? 'is-live' : ''}`}
          />
          <b>{me.name}</b>
          <span>vs</span>
          <b>{other?.name ?? 'Waiting for a friend'}</b>
        </div>
        <span className="play-connection">
          {controller.connection === 'online' || controller.preview ? (
            <Wifi size={13} />
          ) : (
            <WifiOff size={13} />
          )}
          <span>
            {controller.preview
              ? 'Preview'
              : controller.connection === 'online'
                ? 'Connected'
                : 'Reconnecting'}
          </span>
        </span>
      </div>
      {finished ? (
        <main className="play-result">
          <div className={`result-symbol ${g.winner === s.you ? 'won' : ''}`}>
            {g.winner ? <Trophy size={35} /> : <Users size={35} />}
          </div>
          <p className="eyebrow">{g.winner ? 'THAT’S A GOOD READ' : 'TAKE YOUR TIME'}</p>
          <h1>
            {!g.winner ? 'Game ended.' : g.winner === s.you ? 'You called it.' : 'Good game.'}
          </h1>
          <p>
            {g.endReason === 'no_show'
              ? 'The other player didn’t get ready. Find someone else to play.'
              : !g.winner
                ? 'This game ended without a winner.'
                : g.result === 'correct'
                  ? `${s.players.find((p) => p.id === g.winner)?.name} found the secret character.`
                  : 'The final guess missed. The other player wins.'}
          </p>
          <div className="result-cast">
            {s.players.map((p) => {
              const c = board.find((c) => c.id === s.reveals?.[p.id])
              return c ? (
                <div key={p.id}>
                  <Portrait character={c} />
                  <span>{p.id === s.you ? 'Your character' : `${p.name}’s character`}</span>
                  <b>{c.name}</b>
                </div>
              ) : null
            })}
          </div>
          <div className="result-actions">
            {controller.search ? (
              <>
                <p role="status">Finding another player…</p>
                <button
                  className="button secondary"
                  disabled={controller.busy}
                  onClick={() => void controller.cancelSearch()}
                >
                  Cancel search
                </button>
              </>
            ) : (
              <>
                <button
                  className="button primary"
                  disabled={controller.busy || me.rematchReady}
                  onClick={() => void controller.act('rematch')}
                >
                  <RotateCcw size={18} />
                  {me.rematchReady
                    ? 'Waiting for the other player…'
                    : boardInfo(s.boardId).shuffle
                      ? 'Play again with a fresh cast'
                      : 'Play again with this board'}
                </button>
                {s.mode === 'match' && (
                  <button
                    className="button secondary"
                    onClick={async () => {
                      if (await controller.leave()) await controller.findPlayer(me.name)
                    }}
                  >
                    Find another player <Users size={18} />
                  </button>
                )}
              </>
            )}
            <button className="text-button" onClick={() => void controller.leave()}>
              Back to Play
            </button>
          </div>
        </main>
      ) : (
        <>
          <section className="play-phase" aria-live="polite">
            <div className="phase-title">
              <div>
                <p className="eyebrow">
                  {lobby
                    ? 'CHOOSE YOUR SECRET'
                    : paused
                      ? 'A MOMENT TO RECONNECT'
                      : `ROUND ${round} · QUESTION ${g.turn % 2 === 1 ? '1' : '2'} OF 2`}
                </p>
                <h1>
                  {lobby
                    ? waitingForBoard
                      ? 'Preparing your faces.'
                      : 'Pick your person.'
                    : paused
                      ? 'Let’s pause here.'
                      : g.phase === 'answer'
                        ? canAnswer
                          ? 'Your answer.'
                          : 'Their answer.'
                        : writer
                          ? flow.submitted
                            ? 'Question ready.'
                            : 'Your next good question.'
                          : flow.reviewReady
                            ? 'You’re ready.'
                            : 'Make your eliminations.'}
                </h1>
              </div>
              {(g.phase === 'answer' || (lobby && s.mode === 'match')) && (
                <Clock
                  deadline={g.deadline}
                  now={now}
                  label={lobby ? 'Character selection time' : 'Answer time'}
                />
              )}
            </div>
            {g.phase === 'question' && (
              <div className="activity-pair">
                <div className={`activity-chip ${writer ? 'your-activity' : ''}`}>
                  <span>
                    {writer ? 'You' : other?.name} · {flow.submitted ? 'submitted' : 'writing'}
                  </span>
                  {flow.submitted ? (
                    <CheckCheck size={18} />
                  ) : (
                    <Clock deadline={flow.writingDeadline} now={now} label="Writing time" />
                  )}
                </div>
                <div className={`activity-chip ${!writer ? 'your-activity' : ''}`}>
                  <span>
                    {!writer ? 'You' : other?.name} · {flow.reviewReady ? 'ready' : 'reviewing'}
                  </span>
                  {flow.reviewReady ? (
                    <CheckCheck size={18} />
                  ) : extraReview ? (
                    <small>Extra review</small>
                  ) : (
                    <Clock deadline={reviewClock} now={now} label="Review time" />
                  )}
                </div>
              </div>
            )}
            {lobby && (
              <p className="phase-guidance">
                {s.mode === 'match'
                  ? 'You’ve been paired. Pick a secret and get ready within two minutes.'
                  : 'Your choice stays secret until the game ends.'}
              </p>
            )}
          </section>
          <div className="play-workspace">
            <section className="play-board" aria-label="Character board">
              <div className="play-board-tools">
                <span>
                  {lobby ? 'Tap a face to choose' : `${24 - safeEliminated.length} of 24 remaining`}
                </span>
                <div>
                  <button
                    className={inspect ? 'selected-tool' : ''}
                    aria-pressed={inspect}
                    onClick={() => setInspect((v) => !v)}
                  >
                    <Expand size={14} />
                    {inspect ? 'Inspecting' : 'Inspect'}
                  </button>
                  {!lobby && (
                    <button
                      aria-label="Reset eliminations"
                      disabled={!safeEliminated.length}
                      onClick={() => changeEliminated([])}
                    >
                      <RotateCcw size={15} />
                    </button>
                  )}
                </div>
              </div>
              <div
                className="play-board-scroll"
                ref={boardRef}
                onScroll={(e) => {
                  if (!keyboard) {
                    boardPosition.current = e.currentTarget.scrollTop
                    storage.write(`board-scroll:${key}`, boardPosition.current)
                  }
                }}
              >
                <CharacterBoard
                  board={board}
                  inspect={inspect}
                  onInspect={(id) => {
                    setInspected(board.find((c) => c.id === id)!)
                    setSheet('portrait')
                  }}
                  mode={lobby ? 'select' : guessMode ? 'guess' : 'eliminate'}
                  selected={lobby ? s.myCharacter : null}
                  eliminated={safeEliminated}
                  disabled={lobby && (controller.busy || me.ready || waitingForBoard)}
                  onPick={pick}
                />
              </div>
            </section>
            <section className="play-action" aria-label="Current activity">
              {waitingForBoard && lobby ? (
                <div className="board-preparing" role="status">
                  <LogoMark />
                  <h2>
                    {s.boardStatus === 'error' || controller.boardPreparationError
                      ? 'Let’s try those faces again.'
                      : 'Preparing faces…'}
                  </h2>
                  <p>
                    {controller.boardPreparationError ||
                      s.boardError ||
                      'Getting the same 24 faces for both players.'}
                  </p>
                  {(s.boardStatus === 'error' || controller.boardPreparationError) && (
                    <button
                      className="button primary"
                      disabled={controller.preparingBoard}
                      onClick={() => void controller.prepareBoard()}
                    >
                      Retry preparing faces
                    </button>
                  )}
                </div>
              ) : paused ? (
                <div className="paused-activity">
                  <div className="pause-icon">
                    <Clock3 size={26} />
                  </div>
                  <h2>
                    {g.pause?.reason === 'disconnect'
                      ? 'Waiting for a player to return.'
                      : 'Time ran out. No rush.'}
                  </h2>
                  <p>
                    {g.pause?.missing === s.you
                      ? 'Let the other player know you’re back.'
                      : `${s.players.find((p) => p.id === g.pause?.missing)?.name ?? 'The other player'} may need a moment.`}{' '}
                    Your board and question are saved.
                  </p>
                  {pending && <blockquote className="paused-question">“{pending.text}”</blockquote>}
                  <button
                    className="button primary"
                    disabled={controller.busy || g.pause?.resumeReady.includes(s.you)}
                    onClick={() => void controller.act('resume')}
                  >
                    {g.pause?.resumeReady.includes(s.you)
                      ? 'Waiting for the other player…'
                      : 'I’m back · ready to continue'}
                  </button>
                  {g.pause && now - Date.parse(g.pause.since) >= 120000 ? (
                    <>
                      <p>You can keep waiting or end without a winner.</p>
                      <button
                        className="button secondary"
                        onClick={() => void controller.act('end')}
                      >
                        End game without a winner
                      </button>
                    </>
                  ) : (
                    <p className="pause-grace">
                      You can end without a winner after the two-minute return window.
                    </p>
                  )}
                </div>
              ) : lobby ? (
                <>
                  <div className="picked-secret">
                    {mySecret ? (
                      <>
                        <Portrait character={mySecret} />
                        <div>
                          <span>
                            <LockKeyhole size={12} /> YOUR SECRET
                          </span>
                          <h2>{mySecret.name}</h2>
                          <p>Only you can see your choice.</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <span className="empty-secret">?</span>
                        <div>
                          <h2>Who’s your secret?</h2>
                          <p>Tap a face above.</p>
                        </div>
                      </>
                    )}
                  </div>
                  <button
                    className="button primary"
                    disabled={!mySecret || controller.busy}
                    onClick={() => void controller.act(me.ready ? 'unready' : 'ready')}
                  >
                    <Check size={18} />
                    {me.ready ? 'Change my person' : 'I’m ready'}
                  </button>
                  <p className="ready-status" role="status">
                    {other
                      ? `${other.name} is ${other.ready ? 'ready' : 'choosing a character'}.`
                      : 'Invite a friend to choose their secret.'}
                  </p>
                  {!other && !controller.preview && (
                    <div className="lobby-invite">
                      <b>{s.code}</b>
                      <button className="button secondary" onClick={() => void copy()}>
                        <Copy size={16} />
                        {copied ? 'Copied!' : 'Copy invitation'}
                      </button>
                      {copyFailed && <p>Copy unavailable. Share the room code above.</p>}
                    </div>
                  )}
                  {s.boardSource === 'cache' && (
                    <p className="cache-note">Playing with saved faces.</p>
                  )}
                </>
              ) : g.phase === 'answer' ? (
                <>
                  <div className="answer-activity">
                    {canAnswer && mySecret && (
                      <button
                        className="answer-secret"
                        aria-label={`Enlarge your secret ${mySecret.name}`}
                        onClick={() => {
                          setInspected(mySecret)
                          setSheet('portrait')
                        }}
                      >
                        <Portrait character={mySecret} />
                        <span>
                          <LockKeyhole size={11} /> {mySecret.name}
                        </span>
                      </button>
                    )}
                    <div>
                      <p className="eyebrow">
                        {canAnswer ? 'ANSWER ABOUT YOUR SECRET' : 'YOUR QUESTION'}
                      </p>
                      <h2 className="asked-question">“{pending?.text}”</h2>
                      {!canAnswer && (
                        <p className="phase-guidance">
                          {other?.name} is thinking. Your board is still yours to edit.
                        </p>
                      )}
                    </div>
                  </div>
                  {canAnswer ? (
                    <div className="play-answer-buttons">
                      <button
                        className="button yes-button"
                        disabled={controller.busy}
                        onClick={() => void controller.act('answer', { answer: true })}
                      >
                        <Check size={22} /> YES
                      </button>
                      <button
                        className="button no-button"
                        disabled={controller.busy}
                        onClick={() => void controller.act('answer', { answer: false })}
                      >
                        <X size={22} /> NO
                      </button>
                    </div>
                  ) : (
                    <p className="waiting-verdict">
                      <LoaderCircle size={16} className="spin" /> Waiting for {other?.name}’s answer
                    </p>
                  )}
                </>
              ) : writer ? (
                <>
                  {flow.submitted ? (
                    <div className="submitted-question">
                      <CheckCheck size={24} />
                      <h2>Ready when they are.</h2>
                      <p>“{flow.ownSubmission}”</p>
                      <small>
                        {flow.reviewReady
                          ? 'Starting the answer step…'
                          : `${other?.name} is finishing their eliminations.`}
                      </small>
                    </div>
                  ) : (
                    <>
                      <QuestionIdeas focused={focused} onUse={changeDraft} />
                      <form
                        className="play-composer"
                        onSubmit={(e) => {
                          e.preventDefault()
                          if (draft.trim() && !controller.busy) void ask()
                        }}
                      >
                        <label htmlFor="question-input">
                          Your question <span>{Array.from(draft).length}/50</span>
                        </label>
                        <div>
                          <textarea
                            id="question-input"
                            aria-label="Your question"
                            placeholder="Ask about their secret person…"
                            rows={2}
                            value={draft}
                            onFocus={() => setFocused(true)}
                            onBlur={() => setFocused(false)}
                            onChange={(e) => changeDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                                e.preventDefault()
                                if (draft.trim() && !controller.busy) void ask()
                              }
                            }}
                          />
                          <button
                            className="send-button"
                            type="submit"
                            aria-label="Ask question"
                            disabled={!draft.trim() || controller.busy}
                          >
                            <Send size={19} />
                          </button>
                        </div>
                      </form>
                      <button
                        className={`guess-link ${guessMode ? 'guess-on' : ''}`}
                        onClick={() => {
                          setInspect(false)
                          setGuessMode((v) => !v)
                        }}
                      >
                        <Flag size={16} />
                        {guessMode ? 'Cancel final guess · choose on board' : 'I know who it is'}
                        <ArrowRight size={15} />
                      </button>
                    </>
                  )}
                </>
              ) : (
                <>
                  {latest ? (
                    <div className="review-verdict">
                      <span className={`verdict-badge ${latest.answer ? 'yes' : 'no'}`}>
                        {latest.answer ? 'YES' : 'NO'}
                      </span>
                      <div>
                        <p>“{latest.text}”</p>
                        <small>{other?.name}’s answer · review your board</small>
                      </div>
                    </div>
                  ) : (
                    <div className="review-verdict">
                      <MessageCircle size={24} />
                      <p>{other?.name} is writing the first question. Explore the cast.</p>
                    </div>
                  )}
                  <p className="review-instructions">
                    {flow.reviewReady
                      ? `You’re ready. Waiting for ${other?.name}’s question.`
                      : extraReview
                        ? `Keep reviewing while ${other?.name} finishes writing.`
                        : 'Tap characters to rule them out. Your eliminations stay private.'}
                  </p>
                  {!flow.reviewReady && (
                    <button
                      className="button primary"
                      disabled={controller.busy}
                      onClick={() => void controller.act('review')}
                    >
                      <CheckCheck size={18} /> Done reviewing
                    </button>
                  )}
                </>
              )}
              {saveFailed && (
                <p className="field-error" role="status">
                  This browser can’t save drafts or eliminations. Keep this tab open.
                </p>
              )}
            </section>
          </div>
        </>
      )}
      <nav className="play-nav" aria-label="Game tools">
        <button onClick={onMenu}>
          <Menu size={22} />
          <span>Menu</span>
        </button>
        <button onClick={() => setSheet('history')}>
          <History size={19} />
          <span>
            History <small>{s.history.length}</small>
          </span>
        </button>
        <button className="emoji-trigger" onClick={() => setSheet('emoji')}>
          <Smile size={21} />
          <span>Emoji</span>
        </button>
        <button
          aria-pressed={controller.mutedReactions}
          onClick={() => controller.muteReactions(!controller.mutedReactions)}
        >
          {controller.mutedReactions ? <VolumeX size={20} /> : <Volume2 size={20} />}
          <span>{controller.mutedReactions ? 'Unmute' : 'Mute'} reactions</span>
        </button>
      </nav>
      <div className="play-reactions" role="log" aria-live="polite" aria-label="Reactions">
        {controller.reactions.map((r, i) => (
          <span
            className="reaction-float"
            key={r.id}
            role="img"
            aria-label={`${r.from === s.you ? 'You' : other?.name} reacted ${r.emoji}`}
            style={
              {
                '--reaction-x': `${12 + ((i * 23 + (Number.parseInt(r.id.slice(0, 2), 16) % 25)) % 74)}%`,
                '--reaction-drift': `${i % 2 ? 35 : -35}px`,
                '--reaction-rotate': `${i % 2 ? 16 : -16}deg`,
              } as CSSProperties
            }
          >
            {r.emoji}
          </span>
        ))}
      </div>
      {sheet === 'rules' && (
        <Sheet title="Read the person. Trust your gut." onClose={() => setSheet(null)}>
          <ol className="play-rules">
            <li>Choose your secret. The other player can’t see it.</li>
            <li>Each round includes one question from each player.</li>
            <li>
              Writing and reviewing happen together. Submit your question to mark yourself ready;
              press Done reviewing when your board is ready.
            </li>
            <li>
              After submission, review ends at the later of the base review time or 20 seconds after
              submission, within the writing limit. Unlimited review ends manually.
            </li>
            <li>Answer YES or NO about your own secret. You’ll see their portrait again.</li>
            <li>
              A missed writing or answer timer pauses the game. Both players must be ready to
              resume.
            </li>
            <li>A correct final guess wins. A wrong guess loses.</li>
          </ol>
          <p className="lobby-timings">
            {boardInfo(s.boardId).name} · Writing {timeLabel(settings.question)} · Answering{' '}
            {timeLabel(settings.answer)} · Review {timeLabel(settings.review)}
          </p>
        </Sheet>
      )}
      {sheet === 'history' && (
        <Sheet title="The conversation" onClose={() => setSheet(null)}>
          <div className="play-history">
            {s.history.length ? (
              [...s.history].reverse().map((q) => (
                <article key={q.id}>
                  <div>
                    <small>
                      ROUND {Math.ceil(q.turn / 2)} · {q.asker === s.you ? 'You' : other?.name}{' '}
                      asked
                    </small>
                    <span
                      className={`verdict-badge ${q.status === 'answered' ? (q.answer ? 'yes' : 'no') : 'pending'}`}
                    >
                      {q.status === 'answered'
                        ? q.answer
                          ? 'YES'
                          : 'NO'
                        : q.status === 'pending'
                          ? finished
                            ? 'Not answered'
                            : 'Pending'
                          : 'Unanswered'}
                    </span>
                  </div>
                  <p>{q.text}</p>
                </article>
              ))
            ) : (
              <p>Questions and answers will appear here.</p>
            )}
          </div>
        </Sheet>
      )}
      {sheet === 'emoji' && (
        <Sheet title="Send a little feeling." onClose={() => setSheet(null)}>
          <div className="emoji-picker">
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                aria-label={`React ${emoji}`}
                disabled={cooldown || (!controller.preview && controller.connection !== 'online')}
                onClick={() => {
                  setCooldown(true)
                  void controller.react(emoji)
                  setSheet(null)
                  reactionTimer.current = setTimeout(() => setCooldown(false), 1000)
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
          <button
            className="mute-choice"
            aria-pressed={controller.mutedReactions}
            onClick={() => controller.muteReactions(!controller.mutedReactions)}
          >
            {controller.mutedReactions ? <VolumeX size={19} /> : <Volume2 size={19} />}{' '}
            {controller.mutedReactions
              ? 'Opponent reactions muted · tap to unmute'
              : 'Mute opponent reactions'}
          </button>
        </Sheet>
      )}
      {(sheet === 'portrait' || sheet === 'guess') && inspected && (
        <Sheet
          title={sheet === 'guess' ? `Is it ${inspected.name}?` : inspected.name}
          onClose={() => setSheet(null)}
        >
          <div className="inspected-portrait">
            <Portrait character={inspected} />
          </div>
          {sheet === 'guess' ? (
            <>
              <p className="guess-warning">
                A correct guess wins. A wrong guess gives the other player the win.
              </p>
              <button
                className="button primary"
                disabled={controller.busy || !canWrite}
                onClick={async () => {
                  if (await controller.act('guess', { characterId: inspected.id })) {
                    setSheet(null)
                    setGuessMode(false)
                  }
                }}
              >
                Confirm final guess <Flag size={18} />
              </button>
            </>
          ) : (
            <p className="portrait-caption">
              {inspected.id === s.myCharacter
                ? 'Your secret · only you can see this choice.'
                : 'Look closely. Everyone has their own story.'}
            </p>
          )}
        </Sheet>
      )}
    </div>
  )
}
