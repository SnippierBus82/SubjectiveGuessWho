// A single-device, two-seat preview. This module is never the online authority.
// Both secrets exist in local storage; the UI labels this limitation throughout.
import { characterCount, trimQuestion } from '../game/rules'
import { characters } from '../game/characters'
import {
  GameError,
  REACTIONS,
  type GameService,
  type RoomState,
  type SubscriptionCallbacks,
} from '../game/types'
import { newId, storage } from '../lib/platform'

interface PreviewRecord {
  state: RoomState
  secrets: Record<string, string>
  seat: number
  receipts: string[]
}
const seats = ['preview-one', 'preview-two'] as const
export function createPreviewService(): GameService {
  let record = storage.read<PreviewRecord | null>('preview', null)
  let callbacks: SubscriptionCallbacks | undefined
  let lastReaction = 0
  const save = () => {
    storage.write('preview', record)
  }
  function view() {
    if (!record) throw new GameError('Start a fresh local preview from the home screen.')
    const you = seats[record.seat]!
    const state = structuredClone(record.state)
    state.you = you
    state.myCharacter = record.secrets[you] ?? null
    state.reveals = state.game.phase === 'finished' ? { ...record.secrets } : null
    state.serverNow = new Date().toISOString()
    return state
  }
  function advance() {
    if (!record?.state.game.deadline) return
    const game = record.state.game
    const now = Date.now(),
      deadline = Date.parse(game.deadline!)
    if (now < deadline) return
    if (game.phase === 'answer') {
      const question = record.state.history.find((q) => q.turn === game.turn)
      if (question) question.status = 'unanswered'
    }
    const steps = 1 + Math.floor((now - deadline) / 30000)
    if (steps % 2) game.activePlayer = seats.find((id) => id !== game.activePlayer)!
    game.phase = 'question'
    game.turn += steps
    game.deadline = new Date(deadline + steps * 30000).toISOString()
    record.state.version++
    save()
  }
  return {
    mode: 'preview',
    session: async () => true,
    create: async (name) => {
      record = {
        seat: 0,
        secrets: {},
        receipts: [],
        state: {
          roomId: 'preview',
          code: 'PREVIEW',
          version: 1,
          serverNow: new Date().toISOString(),
          you: seats[0],
          players: seats.map((id, i) => ({
            id,
            name: i ? 'Seat two' : name,
            slot: i + 1,
            ready: false,
            rematchReady: false,
          })),
          game: {
            id: newId(),
            packId: 'original',
            phase: 'lobby',
            turn: 0,
            activePlayer: null,
            deadline: null,
            winner: null,
            guesser: null,
            guessCharacter: null,
            result: null,
          },
          myCharacter: null,
          reveals: null,
          history: [],
        },
      }
      save()
      return view()
    },
    join: async () => {
      throw new GameError(
        'Online room codes need a configured Supabase backend. Use Create game to explore the local preview.',
      )
    },
    snapshot: async (roomId) => {
      if (roomId !== 'preview')
        throw new GameError(
          'Online rooms need a configured Supabase backend. Start a local preview from Home.',
        )
      advance()
      return view()
    },
    action: async (state, kind, payload, actionId) => {
      advance()
      if (!record) throw new GameError('Please start a preview first.')
      if (record.receipts.includes(actionId)) return view()
      const game = record.state.game,
        you = seats[record.seat]!
      const me = record.state.players.find((p) => p.id === you)!
      const other = record.state.players.find((p) => p.id !== you)!
      const fail = (message: string): never => {
        throw new GameError(message, view())
      }
      if (
        state.game.id !== game.id ||
        (['question', 'answer', 'guess'].includes(kind) && state.game.turn !== game.turn)
      )
        fail('The turn has changed. Your draft is still here.')
      if (kind === 'select') {
        if (game.phase !== 'lobby' || me.ready) fail('Unready before changing your secret.')
        if (!characters.some((c) => c.id === payload.characterId))
          fail('Pick a character from the board.')
        record.secrets[you] = String(payload.characterId)
      } else if (kind === 'ready' || kind === 'unready') {
        if (game.phase !== 'lobby') fail('The round has already started.')
        if (!record.secrets[you]) fail('Pick your secret character first.')
        me.ready = kind === 'ready'
        if (record.state.players.every((p) => p.ready)) {
          game.phase = 'question'
          game.turn = 1
          game.activePlayer = seats[crypto.getRandomValues(new Uint8Array(1))[0]! % 2]!
          game.deadline = new Date(Date.now() + 30000).toISOString()
        }
      } else if (kind === 'question') {
        if (game.phase !== 'question' || game.activePlayer !== you)
          fail('Ask during your question turn.')
        const text = trimQuestion(String(payload.text ?? '')).trim()
        if (!text || characterCount(String(payload.text).trim()) > 50) fail('Use 1–50 characters.')
        record.state.history.push({
          id: newId(),
          turn: game.turn,
          asker: you,
          text,
          answer: null,
          status: 'pending',
          askedAt: new Date().toISOString(),
        })
        game.phase = 'answer'
        game.deadline = new Date(Date.now() + 15000).toISOString()
      } else if (kind === 'answer') {
        if (
          game.phase !== 'answer' ||
          game.activePlayer === you ||
          typeof payload.answer !== 'boolean'
        )
          fail('Switch to the other seat to answer.')
        const question = record.state.history.find((q) => q.turn === game.turn)!
        question.answer = Boolean(payload.answer)
        question.status = 'answered'
        game.phase = 'question'
        game.activePlayer = you
        game.turn++
        game.deadline = new Date(Date.now() + 30000).toISOString()
      } else if (kind === 'guess') {
        if (game.phase !== 'question' || game.activePlayer !== you)
          fail('Guess during your question turn.')
        const correct = record.secrets[other.id] === payload.characterId
        game.phase = 'finished'
        game.deadline = null
        game.guesser = you
        game.guessCharacter = String(payload.characterId)
        game.result = correct ? 'correct' : 'incorrect'
        game.winner = correct ? you : other.id
      } else if (kind === 'rematch') {
        if (game.phase !== 'finished') fail('Finish this round first.')
        me.rematchReady = true
        if (record.state.players.every((p) => p.rematchReady)) {
          record.secrets = {}
          record.state.history = []
          record.state.game = {
            ...game,
            id: newId(),
            phase: 'lobby',
            turn: 0,
            activePlayer: null,
            deadline: null,
            winner: null,
            guesser: null,
            guessCharacter: null,
            result: null,
          }
          record.state.players.forEach((p) => {
            p.ready = false
            p.rematchReady = false
          })
        }
      }
      record.receipts.push(actionId)
      record.state.version++
      save()
      return view()
    },
    subscribe: async (_roomId, _you, cb) => {
      callbacks = cb
      cb.connection('preview')
      cb.presence([...seats])
      return () => {
        callbacks = undefined
      }
    },
    react: async (emoji, you) => {
      if (!REACTIONS.some((e) => e === emoji) || Date.now() - lastReaction < 1200) return
      lastReaction = Date.now()
      callbacks?.reaction({ id: newId(), emoji, from: you })
    },
    switchSeat: async () => {
      if (!record) throw new GameError('Start a preview first.')
      record.seat = record.seat ? 0 : 1
      advance()
      save()
      return view()
    },
  }
}
