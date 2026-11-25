import {
  selectFolderBoard,
  DEFAULT_BOARD,
  isBoardId,
  boardInfo,
  type BoardId,
} from '../game/boards'
import type { Character } from '../game/board-model'
import { DEFAULT_TIMINGS, reviewEnd, validTimings } from '../game/timings'
import {
  GameError,
  REACTIONS,
  type GameService,
  type RoomState,
  type Timings,
  type SubscriptionCallbacks,
} from '../game/types'
import { newId, storage } from '../lib/platform'
interface PreviewRecord {
  state: RoomState
  secrets: Record<string, string>
  submission: string | null
  seat: number
  receipts: string[]
}
const seats = ['preview-one', 'preview-two'] as const
const iso = (n: number | null) => (n === null ? null : new Date(n).toISOString())
const due = (n: number | null) => (n === null ? null : iso(Date.now() + n * 1000))
export function createPreviewService(): GameService {
  let record = storage.read<PreviewRecord | null>('preview2', null)
  let callbacks: SubscriptionCallbacks | undefined
  let lastReaction = 0
  const save = () => storage.write('preview2', record)
  function view(): RoomState {
    if (!record) throw new GameError('Start a fresh local preview from Home.')
    const s = structuredClone(record.state)
    s.you = seats[record.seat]!
    s.myCharacter = record.secrets[s.you] ?? null
    s.reveals = s.game.phase === 'finished' ? { ...record.secrets } : null
    s.game.flow.ownSubmission = s.game.activePlayer === s.you ? record.submission : null
    s.serverNow = new Date().toISOString()
    return s
  }
  async function fresh(
    name: string,
    settings: Timings,
    names?: string[],
    boardId: BoardId = DEFAULT_BOARD,
  ) {
    const id = newId()
    let board: Character[],
      source: 'folder' | 'online' | 'cache' = 'folder'
    if (boardId === DEFAULT_BOARD) {
      const response = await fetch('/api/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'preview', boardId }),
      })
      const result = await response.json()
      if (!response.ok || !Array.isArray(result.characters) || result.characters.length !== 24)
        throw new GameError(result.error ?? 'Could not prepare the preview faces.')
      board = result.characters
      source = result.source
    } else board = selectFolderBoard(boardId)
    record = {
      seat: 0,
      secrets: {},
      submission: null,
      receipts: [],
      state: {
        roomId: 'preview',
        code: 'PREVIEW',
        settings: { ...settings },
        mode: 'private',
        boardId,
        board,
        boardStatus: 'ready',
        boardSource: source,
        boardLabel: boardInfo(boardId).name,
        version: 1,
        serverNow: new Date().toISOString(),
        you: seats[0],
        players: seats.map((id, i) => ({
          id,
          name: names?.[i] ?? (i ? 'Seat two' : name),
          slot: i + 1,
          ready: false,
          rematchReady: false,
        })),
        game: {
          id,
          phase: 'lobby',
          turn: 0,
          activePlayer: null,
          deadline: null,
          winner: null,
          guesser: null,
          guessCharacter: null,
          result: null,
          pause: null,
          endReason: null,
          flow: {
            startedAt: null,
            writingDeadline: null,
            reviewDeadline: null,
            submitted: false,
            reviewReady: true,
            ownSubmission: null,
          },
        },
        myCharacter: null,
        reveals: null,
        history: [],
      },
    }
    save()
    return view()
  }
  function begin(user: string, first = false) {
    const s = record!.state,
      g = s.game
    record!.submission = null
    Object.assign(g, {
      phase: 'question',
      activePlayer: user,
      turn: first ? 1 : g.turn + 1,
      deadline: due(s.settings.question),
      pause: null,
      flow: {
        startedAt: iso(Date.now()),
        writingDeadline: due(s.settings.question),
        reviewDeadline: null,
        submitted: false,
        reviewReady: first,
        ownSubmission: null,
      },
    })
  }
  function release() {
    const s = record!.state,
      g = s.game
    s.history.push({
      id: newId(),
      turn: g.turn,
      asker: g.activePlayer!,
      text: record!.submission!,
      answer: null,
      status: 'pending',
      askedAt: iso(Date.now())!,
    })
    g.phase = 'answer'
    g.deadline = due(s.settings.answer)
  }
  function advance() {
    if (!record) return
    const s = record.state,
      g = s.game
    if (
      !g.deadline ||
      Date.now() < Date.parse(g.deadline) ||
      !['question', 'answer'].includes(g.phase)
    )
      return
    if (g.phase === 'question' && g.flow.submitted) {
      g.flow.reviewReady = true
      release()
    } else {
      const missing =
        g.phase === 'answer' ? seats.find((x) => x !== g.activePlayer)! : g.activePlayer
      const saved = { phase: g.phase, deadline: g.deadline }
      g.pause = { reason: 'timeout', since: g.deadline, missing, resumeReady: [] }
      g.phase = 'paused'
      g.deadline = null
      storage.write('preview2:pause', saved)
    }
    s.version++
    save()
  }
  return {
    mode: 'preview',
    session: async () => true,
    create: async (
      name,
      _request,
      _captcha,
      settings = DEFAULT_TIMINGS,
      boardId = DEFAULT_BOARD,
    ) => {
      if (!validTimings(settings)) throw new GameError('Choose valid timers.')
      if (!isBoardId(boardId)) throw new GameError('Choose an available board.')
      return fresh(name, settings, undefined, boardId)
    },
    join: async () => {
      throw new GameError(
        'Online room codes need a configured Supabase backend. Use Create game to explore the local preview.',
      )
    },
    snapshot: async (room) => {
      if (room !== 'preview') throw new GameError('Start a preview from Home.')
      advance()
      return view()
    },
    action: async (state, kind, payload, id) => {
      if (!record) throw new GameError('Start a fresh local preview from Home.')
      advance()
      const s = record.state,
        g = s.game,
        you = seats[record.seat]!,
        other = seats.find((x) => x !== you)!,
        me = s.players.find((p) => p.id === you)!
      const fail = (message: string): never => {
        throw new GameError(message, view())
      }
      if (record.receipts.includes(id)) return view()
      if (state.game.id !== g.id || state.game.turn !== g.turn)
        fail('The turn has changed. Your draft is still here.')
      if (kind === 'select') {
        if (g.phase !== 'lobby' || me.ready) fail('Unready before changing your secret.')
        if (!s.board.some((c) => c.id === payload.characterId))
          fail('Choose a character from this board.')
        record.secrets[you] = String(payload.characterId)
      } else if (kind === 'ready' || kind === 'unready') {
        if (g.phase !== 'lobby' || !record.secrets[you]) fail('Pick your character first.')
        me.ready = kind === 'ready'
        if (s.players.every((p) => p.ready))
          begin(seats[crypto.getRandomValues(new Uint8Array(1))[0]! % 2]!, true)
      } else if (kind === 'question') {
        if (g.phase !== 'question' || g.activePlayer !== you || g.flow.submitted)
          fail('Submit one question on your writing turn.')
        const text = String(payload.text ?? '').trim()
        if (!text || Array.from(text).length > 50 || /[\r\n\t]/.test(text))
          fail('Use 1–50 characters on one line.')
        record.submission = text
        g.flow.submitted = true
        g.flow.reviewDeadline = iso(
          reviewEnd(Date.parse(g.flow.startedAt!), Date.now(), s.settings),
        )
        g.deadline = g.flow.reviewDeadline
        if (g.flow.reviewReady) release()
      } else if (kind === 'review') {
        if (g.phase !== 'question' || g.activePlayer === you)
          fail('Only the reviewing player can finish review.')
        g.flow.reviewReady = true
        g.flow.reviewDeadline = null
        if (g.flow.submitted) release()
      } else if (kind === 'answer') {
        if (g.phase !== 'answer' || g.activePlayer === you || typeof payload.answer !== 'boolean')
          fail('Switch seats to answer the question.')
        const q = s.history.find((q) => q.turn === g.turn)!
        q.answer = Boolean(payload.answer)
        q.status = 'answered'
        begin(you)
      } else if (kind === 'guess') {
        if (g.phase !== 'question' || g.activePlayer !== you || g.flow.submitted)
          fail('Guess before submitting your question.')
        if (!s.board.some((c) => c.id === payload.characterId))
          fail('Choose a character from this board.')
        const correct = record.secrets[other] === payload.characterId
        Object.assign(g, {
          phase: 'finished',
          deadline: null,
          guesser: you,
          guessCharacter: String(payload.characterId),
          result: correct ? 'correct' : 'incorrect',
          winner: correct ? you : other,
          endReason: 'guess',
        })
      } else if (kind === 'resume') {
        if (g.phase !== 'paused') fail('This game is not paused.')
        const ready = g.pause!.resumeReady
        if (!ready.includes(you)) ready.push(you)
        if (ready.length === 2) {
          const saved = storage.read<{ phase: 'question' | 'answer' }>('preview2:pause', {
            phase: 'question',
          })
          g.phase = saved.phase
          g.pause = null
          g.deadline = due(g.phase === 'answer' ? s.settings.answer : s.settings.question)
          if (g.phase === 'question') {
            g.flow.startedAt = iso(Date.now())
            g.flow.writingDeadline = g.deadline
          }
        }
      } else if (kind === 'leave' || kind === 'end') {
        if (
          kind === 'end' &&
          (g.phase !== 'paused' || Date.now() - Date.parse(g.pause!.since) < 120000)
        )
          fail('Give the other player two minutes to return, or leave the game.')
        Object.assign(g, {
          phase: 'finished',
          deadline: null,
          winner: null,
          result: null,
          pause: null,
          endReason: kind === 'end' ? 'timeout' : 'left',
        })
      } else if (kind === 'rematch') {
        if (g.phase !== 'finished') fail('Finish this game first.')
        me.rematchReady = true
        if (s.players.every((p) => p.rematchReady)) {
          const seat = record.seat,
            version = s.version
          await fresh(
            s.players[0]!.name,
            s.settings,
            s.players.map((p) => p.name),
            isBoardId(s.boardId) ? s.boardId : DEFAULT_BOARD,
          )
          record!.seat = seat
          record!.state.version = version
        }
      }
      record!.receipts.push(id)
      record!.state.version++
      save()
      return view()
    },
    subscribe: async (_room, _you, cb) => {
      callbacks = cb
      cb.connection('preview')
      cb.presence([...seats])
      return () => {
        callbacks = undefined
      }
    },
    react: async (emoji, you, id = newId()) => {
      if (!REACTIONS.some((e) => e === emoji) || Date.now() - lastReaction < 1000) return
      lastReaction = Date.now()
      callbacks?.reaction({ id, emoji, from: you })
    },
    switchSeat: async () => {
      if (!record) throw new GameError('Start a fresh local preview from Home.')
      record.seat = record.seat ? 0 : 1
      advance()
      save()
      return view()
    },
  }
}
