import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import {
  Check,
  CheckCheck,
  Clock3,
  Copy,
  Expand,
  Flag,
  History,
  Lightbulb,
  LoaderCircle,
  LockKeyhole,
  Menu,
  RotateCcw,
  Send,
  Shuffle,
  Smile,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  WifiOff,
  X,
} from 'lucide-react'
import type { Character } from '../game/board-model'
import { boardInfo } from '../game/boards'
import { characterCount, MAX_QUESTION, secondsRemaining, trimQuestion } from '../game/rules'
import { REACTION_CHOICES } from '../game/types'
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
function Clock({ seconds, owner }: { seconds: number; owner: string }) {
  return (
    <span
      className={`phase-clock ${seconds <= 10 ? 'clock-soon' : ''}`}
      role="timer"
      aria-label={`${owner}: ${seconds} seconds remaining`}
    >
      <Clock3 size={15} aria-hidden="true" />
      <span>{owner}</span>
      <strong>{`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}</strong>
    </span>
  )
}
export function GameRoom({ controller }: { controller: GameController }) {
  const [menu, setMenu] = useState(false)
  const [inviteStatus, setInviteStatus] = useState<'copied' | 'failed' | null>(null)
  const code = controller.state!.code
  useEffect(() => setInviteStatus(null), [code])
  useEffect(() => {
    const open = () => setMenu(true)
    window.addEventListener('sgw:open-game-menu', open)
    return () => window.removeEventListener('sgw:open-game-menu', open)
  }, [])
  async function copyInvite() {
    try {
      await copyText(invitation(code))
      setInviteStatus('copied')
    } catch {
      setInviteStatus('failed')
    }
  }
  return (
    <>
      <Room
        key={controller.state!.game.id + controller.state!.you}
        controller={controller}
        onMenu={() => setMenu(true)}
        onCopyInvite={copyInvite}
        inviteStatus={inviteStatus}
      />
      {menu && (
        <GameMenu
          controller={controller}
          onClose={() => setMenu(false)}
          onCopyInvite={copyInvite}
          inviteStatus={inviteStatus}
        />
      )}
    </>
  )
}
function Room({
  controller,
  onMenu,
  onCopyInvite,
  inviteStatus,
}: {
  controller: GameController
  onMenu: () => void
  onCopyInvite: () => Promise<void>
  inviteStatus: 'copied' | 'failed' | null
}) {
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
  const [eliminated, setEliminated] = useState<string[]>(
    () => storage.read<unknown>(`eliminated:${key}`, []) as string[],
  )
  const safeEliminated = Array.isArray(eliminated)
    ? eliminated.filter((id) => board.some((c) => c.id === id))
    : []
  const [draft, setDraft] = useState(() => storage.read<string>(`draft:${key}`, ''))
  const [sheet, setSheet] = useState<'history' | 'emoji' | 'ideas' | 'portrait' | 'guess' | null>(
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
  const questionInput = useRef<HTMLTextAreaElement>(null)
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
    if (boardRef.current)
      boardRef.current.scrollTop = storage.read<number>(`board-scroll:${key}`, 0)
  }, [key])
  useEffect(() => () => clearTimeout(reactionTimer.current), [])
  useEffect(() => {
    if (!canWrite) {
      setGuessMode(false)
      setSheet((current) => (current === 'ideas' || current === 'guess' ? null : current))
    }
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
      setKeyboard(
        document.activeElement === questionInput.current &&
          height < viewportSize.current.height * 0.75,
      )
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
    const text = trimQuestion(value)
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
  const firstReview =
    latest?.asker === s.you &&
    !s.history.some((q) => q.asker === s.you && q.status === 'answered' && q.turn < latest.turn)
  const connected = controller.connection === 'online' || controller.preview
  let yourDeadline: string | null = null
  let otherDeadline: string | null = null
  if (g.phase === 'question') {
    const writingDeadline = flow.submitted ? null : flow.writingDeadline
    const baseReviewDeadline =
      flow.startedAt && settings.review !== null
        ? new Date(Date.parse(flow.startedAt) + settings.review * 1000).toISOString()
        : null
    const reviewDeadline = flow.reviewReady
      ? null
      : flow.submitted
        ? flow.reviewDeadline
        : baseReviewDeadline
    yourDeadline = writer ? writingDeadline : reviewDeadline
    otherDeadline = writer ? reviewDeadline : writingDeadline
  } else if (g.phase === 'answer') {
    if (canAnswer) yourDeadline = g.deadline
    else otherDeadline = g.deadline
  } else if (lobby && s.mode === 'match') {
    if (!me.ready) yourDeadline = g.deadline
    if (other && !other.ready) otherDeadline = g.deadline
  }
  const yourSeconds = secondsRemaining(yourDeadline, 0, now)
  const otherSeconds = secondsRemaining(otherDeadline, 0, now)
  const resumeReady = g.pause?.resumeReady.includes(s.you)
  const canEndPause = g.pause && now - Date.parse(g.pause.since) >= 120000
  const missingPlayer = g.pause?.missing === s.you ? 'You' : (other?.name ?? 'The other player')
  const boardHint = inspect
    ? 'Tap faces to inspect'
    : guessMode
      ? 'Tap a face to guess'
      : 'Tap faces to cross them out'
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
        <div className="play-matchup">
          {other ? (
            <>
              <b>{me.name}</b>
              <span>vs</span>
              <b>{other.name}</b>
            </>
          ) : (
            <>
              <span>Room code:</span>
              <b className="play-room-code">{s.code}</b>
            </>
          )}
        </div>
        {!connected && (
          <span className="play-offline" role="status" title="Reconnecting">
            <WifiOff size={18} aria-hidden="true" />
            <span className="sr-only">Reconnecting</span>
          </span>
        )}
        <button className="game-menu-button" aria-label="Game menu" onClick={onMenu}>
          <Menu size={22} />
        </button>
      </header>
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
          <section className="play-phase">
            <div className="phase-title">
              <div aria-live="polite">
                <h1>
                  {lobby
                    ? waitingForBoard
                      ? 'Preparing your faces.'
                      : 'Pick your person.'
                    : paused
                      ? 'Game paused'
                      : g.phase === 'answer'
                        ? canAnswer
                          ? 'Your answer.'
                          : 'Their turn'
                        : writer
                          ? flow.submitted
                            ? 'Question sent'
                            : guessMode
                              ? 'Pick your guess'
                              : 'Ask a question'
                          : flow.reviewReady
                            ? 'Review complete'
                            : firstReview
                              ? 'Who can you rule out?'
                              : 'Rule out faces'}
                </h1>
              </div>
              {!!board.length && (
                <div className="play-board-tools">
                  <button
                    className={inspect ? 'selected-tool' : ''}
                    aria-pressed={inspect}
                    onClick={() => {
                      setGuessMode(false)
                      setInspect((v) => !v)
                    }}
                  >
                    <Expand size={17} />
                    Inspect
                  </button>
                  {!lobby && safeEliminated.length > 0 && (
                    <button aria-label="Reset eliminations" onClick={() => changeEliminated([])}>
                      <RotateCcw size={18} />
                    </button>
                  )}
                </div>
              )}
            </div>
            {(!lobby || yourSeconds > 0 || (other && otherSeconds > 0)) && (
              <div className="phase-meta">
                {!lobby && (
                  <div className="phase-progress">
                    {!paused && <span>{`Round ${round} · ${g.turn % 2 === 1 ? '1' : '2'}/2`}</span>}
                    <span>{board.length - safeEliminated.length} left</span>
                    <span id="board-hint">{boardHint}</span>
                  </div>
                )}
                {yourSeconds > 0 ? (
                  <Clock seconds={yourSeconds} owner="Your time" />
                ) : other && otherSeconds > 0 ? (
                  <Clock seconds={otherSeconds} owner={other.name} />
                ) : null}
              </div>
            )}
          </section>
          <div className="play-workspace">
            <section
              className="play-board"
              aria-label="Character board"
              aria-describedby={lobby ? undefined : 'board-hint'}
            >
              <div
                className="play-board-scroll"
                ref={boardRef}
                onMouseDown={(event) => {
                  if (
                    !lobby &&
                    !inspect &&
                    !guessMode &&
                    questionInput.current?.matches(':focus') &&
                    event.target instanceof Element &&
                    event.target.closest('button')
                  ) {
                    event.preventDefault()
                  }
                }}
                onScroll={(e) => storage.write(`board-scroll:${key}`, e.currentTarget.scrollTop)}
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
                  disabled={!inspect && lobby && (controller.busy || me.ready || waitingForBoard)}
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
                  <p role="status">
                    {resumeReady
                      ? `Waiting for ${other?.name ?? 'the other player'}`
                      : g.pause?.reason === 'disconnect'
                        ? `${missingPlayer} disconnected`
                        : `${missingPlayer} ran out of time`}
                  </p>
                  {(!resumeReady || canEndPause) && (
                    <div className="pause-actions">
                      {!resumeReady && (
                        <button
                          className="button primary"
                          disabled={controller.busy}
                          onClick={() => void controller.act('resume')}
                        >
                          Wait
                        </button>
                      )}
                      {canEndPause && (
                        <button
                          className="button secondary"
                          disabled={controller.busy}
                          onClick={() => void controller.act('end')}
                        >
                          End game
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : lobby ? (
                <>
                  <div className="lobby-ready">
                    {mySecret && (
                      <div className="picked-secret">
                        <Portrait character={mySecret} />
                        <div>
                          <span>
                            <LockKeyhole size={14} /> Your secret
                          </span>
                          <h2>{mySecret.name}</h2>
                        </div>
                      </div>
                    )}
                    <button
                      className={`button ${me.ready ? 'secondary' : 'primary'}`}
                      disabled={!mySecret || controller.busy}
                      onClick={() => void controller.act(me.ready ? 'unready' : 'ready')}
                    >
                      {me.ready ? (
                        'Change my pick'
                      ) : (
                        <>
                          <Check size={18} /> I’m ready
                        </>
                      )}
                    </button>
                  </div>
                  {other && (me.ready || other.ready) && (
                    <p className="ready-status" role="status">
                      {other.ready ? `${other.name} is ready` : `Waiting for ${other.name}`}
                    </p>
                  )}
                  {!other && !controller.preview && (
                    <div className="lobby-invite">
                      <button className="button secondary" onClick={() => void onCopyInvite()}>
                        {inviteStatus === 'copied' ? <Check size={18} /> : <Copy size={18} />}
                        {inviteStatus === 'copied' ? 'Link copied' : 'Copy invitation link'}
                      </button>
                      {inviteStatus === 'failed' && <p role="status">Share the room code above.</p>}
                    </div>
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
                      <h2 className="asked-question">“{pending?.text}”</h2>
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
                      <p>“{flow.ownSubmission}”</p>
                      <small>
                        {flow.reviewReady ? 'Starting shortly…' : `Waiting for ${other?.name}`}
                      </small>
                    </div>
                  ) : (
                    <form
                      className="play-composer"
                      onSubmit={(e) => {
                        e.preventDefault()
                        if (draft.trim() && !controller.busy) void ask()
                      }}
                    >
                      <label className="sr-only" htmlFor="question-input">
                        Your question
                      </label>
                      <textarea
                        ref={questionInput}
                        id="question-input"
                        aria-describedby="question-count"
                        placeholder="Type a yes or no question"
                        rows={2}
                        value={draft}
                        onChange={(e) => changeDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                            e.preventDefault()
                            if (draft.trim() && !controller.busy) void ask()
                          }
                        }}
                      />
                      <div className="composer-tools">
                        <button type="button" onClick={() => setSheet('ideas')}>
                          <Lightbulb size={18} /> Ideas
                        </button>
                        <span className="question-count" id="question-count">
                          {characterCount(draft)}/{MAX_QUESTION}
                        </span>
                        <button
                          type="button"
                          aria-pressed={guessMode}
                          onClick={() => {
                            setInspect(false)
                            setGuessMode((v) => !v)
                          }}
                        >
                          <Flag size={17} />
                          {guessMode ? 'Cancel guess' : 'Final guess'}
                        </button>
                      </div>
                      <button
                        className="send-button"
                        type="submit"
                        aria-label="Ask question"
                        disabled={!draft.trim() || controller.busy}
                      >
                        <Send size={19} />
                      </button>
                    </form>
                  )}
                </>
              ) : (
                <>
                  {latest && (
                    <div className="review-verdict">
                      <p>“{latest.text}”</p>
                      <span className={`verdict-badge ${latest.answer ? 'yes' : 'no'}`}>
                        {latest.answer ? (
                          <Check size={18} aria-hidden="true" />
                        ) : (
                          <X size={18} aria-hidden="true" />
                        )}
                        {latest.answer ? 'YES' : 'NO'}
                      </span>
                    </div>
                  )}
                  {(flow.reviewReady || !latest) && (
                    <p className="review-status" role="status">
                      {flow.reviewReady
                        ? `Waiting for ${other?.name}`
                        : `${other?.name} is writing a question`}
                    </p>
                  )}
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
        <button onClick={() => setSheet('history')}>
          <History size={20} />
          History
        </button>
        <button className="emoji-trigger" onClick={() => setSheet('emoji')}>
          <Smile size={21} />
          Emoji
        </button>
      </nav>
      <div className="play-reactions" role="log" aria-live="polite" aria-label="Reactions">
        {controller.reactions.map((r) => (
          <span
            className="reaction-float reaction-glyph"
            key={r.id}
            role="img"
            aria-label={`${r.from === s.you ? 'You' : other?.name} reacted ${r.emoji}`}
            style={
              {
                '--reaction-x': `${r.position}%`,
                '--reaction-drift': `${r.drift}px`,
                '--reaction-rotate': `${r.rotation}deg`,
              } as CSSProperties
            }
          >
            {r.emoji}
          </span>
        ))}
      </div>
      <QuestionIdeas
        open={sheet === 'ideas' && canWrite}
        onClose={() => setSheet(null)}
        onUse={(text) => {
          changeDraft(text)
          setSheet(null)
          requestAnimationFrame(() => questionInput.current?.focus())
        }}
      />
      {sheet === 'history' && (
        <Sheet title="The conversation" onClose={() => setSheet(null)}>
          <div className="play-history">
            {s.history.length ? (
              [...s.history].reverse().map((q) => (
                <article key={q.id}>
                  <small>
                    ROUND {Math.ceil(q.turn / 2)} · {q.asker === s.you ? 'You' : other?.name} asked
                  </small>
                  <div>
                    <p>{q.text}</p>
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
                </article>
              ))
            ) : (
              <p>Questions and answers will appear here.</p>
            )}
          </div>
        </Sheet>
      )}
      {sheet === 'emoji' && (
        <Sheet title="Reactions" onClose={() => setSheet(null)}>
          <div className="emoji-picker">
            {REACTION_CHOICES.map(({ emoji, label }) => (
              <button
                key={emoji}
                aria-label={`Send reaction: ${label}`}
                title={label}
                disabled={cooldown || (!controller.preview && controller.connection !== 'online')}
                onClick={() => {
                  setCooldown(true)
                  void controller.react(emoji)
                  setSheet(null)
                  reactionTimer.current = setTimeout(() => setCooldown(false), 1000)
                }}
              >
                <span className="reaction-glyph" aria-hidden="true">
                  {emoji}
                </span>
              </button>
            ))}
          </div>
          <button
            className="mute-choice"
            aria-pressed={controller.mutedReactions}
            onClick={() => controller.muteReactions(!controller.mutedReactions)}
          >
            {controller.mutedReactions ? <VolumeX size={19} /> : <Volume2 size={19} />}{' '}
            {controller.mutedReactions ? 'Unmute' : 'Mute'} reactions
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
          ) : inspected.id === s.myCharacter ? (
            <p className="portrait-caption">
              <LockKeyhole size={16} /> Your secret
            </p>
          ) : null}
        </Sheet>
      )}
    </div>
  )
}
