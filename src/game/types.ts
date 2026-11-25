import type { Character } from './board-model'
import type { BoardId } from './boards'
export interface Timings {
  question: number | null
  answer: number | null
  review: number | null
}
export interface TurnFlow {
  startedAt: string | null
  writingDeadline: string | null
  reviewDeadline: string | null
  submitted: boolean
  reviewReady: boolean
  ownSubmission: string | null
}
export interface Pause {
  reason: 'timeout' | 'disconnect'
  since: string
  missing: string | null
  resumeReady: string[]
}
export interface MatchStatus {
  status: 'waiting' | 'matched' | 'idle'
  queuedAt?: string
  roomId?: string
  boardId?: BoardId
}
export type Phase = 'lobby' | 'question' | 'answer' | 'paused' | 'finished'
export type ActionKind =
  | 'select'
  | 'ready'
  | 'unready'
  | 'question'
  | 'answer'
  | 'guess'
  | 'rematch'
  | 'review'
  | 'resume'
  | 'leave'
  | 'end'
export type Connection = 'connecting' | 'online' | 'reconnecting' | 'offline' | 'preview'
export interface Player {
  id: string
  name: string
  slot: number
  ready: boolean
  rematchReady: boolean
}
export interface Question {
  id: string
  turn: number
  asker: string
  text: string
  answer: boolean | null
  status: 'pending' | 'answered'
  askedAt: string
}
export interface Game {
  id: string
  phase: Phase
  turn: number
  activePlayer: string | null
  deadline: string | null
  winner: string | null
  guesser: string | null
  guessCharacter: string | null
  result: 'correct' | 'incorrect' | null
  flow: TurnFlow
  pause?: Pause | null
  endReason?: string | null
}
export interface RoomState {
  roomId: string
  code: string
  version: number
  serverNow: string
  you: string
  players: Player[]
  game: Game
  myCharacter: string | null
  reveals: Record<string, string> | null
  history: Question[]
  settings: Timings
  board: Character[]
  boardId?: BoardId
  mode?: 'private' | 'match'
  boardStatus?: 'pending' | 'ready' | 'error'
  boardLabel?: string
  boardSource?: 'folder' | 'online' | 'cache' | null
  boardError?: string | null
  // Added by the transport after an RPC, never sent as an authoritative input.
  clientTiming?: { startedAt: number; receivedAt: number }
}
export interface Reaction {
  id: string
  emoji: string
  from: string
}
export const REACTIONS = [
  '😂',
  '💀',
  '❤️',
  '😭',
  '🤨',
  '👍',
  '🤔',
  '👀',
  '😮',
  '😎',
  '🤯',
  '🙃',
  '😅',
  '🥳',
  '🙈',
  '🙄',
  '👏',
  '🔥',
  '💅',
  '😬',
  '🫣',
  '🧐',
  '😏',
  '🤝',
] as const

export const REACTION_CHOICES = [
  { emoji: '😂', label: 'Laugh' },
  { emoji: '❤️', label: 'Love' },
  { emoji: '👍', label: 'Thumbs up' },
  { emoji: '👏', label: 'Applause' },
  { emoji: '🤔', label: 'Thinking' },
  { emoji: '👀', label: 'Curious' },
  { emoji: '😮', label: 'Surprised' },
  { emoji: '😅', label: 'Nervous laugh' },
  { emoji: '😎', label: 'Cool' },
  { emoji: '🙈', label: 'Embarrassed' },
  { emoji: '🔥', label: 'Fire' },
  { emoji: '💀', label: 'Skull' },
] as const satisfies readonly { emoji: (typeof REACTIONS)[number]; label: string }[]
export interface SubscriptionCallbacks {
  invalidate: (version?: number) => void
  connection: (status: Connection) => void
  reaction: (reaction: Reaction) => void
  presence: (ids: string[]) => void
}
export interface GameService {
  mode: 'online' | 'preview'
  session: () => Promise<boolean>
  create: (
    name: string,
    requestId: string,
    captcha?: string,
    settings?: Timings,
    boardId?: BoardId,
  ) => Promise<RoomState>
  join: (code: string, name: string, captcha?: string) => Promise<RoomState>
  snapshot: (roomId: string) => Promise<RoomState>
  action: (
    state: RoomState,
    kind: ActionKind,
    payload: Record<string, unknown>,
    actionId: string,
  ) => Promise<RoomState>
  subscribe: (roomId: string, you: string, callbacks: SubscriptionCallbacks) => Promise<() => void>
  react: (emoji: string, you: string, id?: string) => Promise<void>
  heartbeat?: (roomId: string, version: number) => Promise<RoomState | null>
  prepareBoard?: (state: RoomState) => Promise<RoomState | null>
  match?: (
    name: string,
    command: 'join' | 'pulse' | 'cancel',
    captcha?: string,
    boardId?: BoardId,
  ) => Promise<MatchStatus>
  subscribeMatch?: (invalidate: () => void) => Promise<() => void>
  switchSeat?: () => Promise<RoomState>
}
export class GameError extends Error {
  constructor(
    message: string,
    public state?: RoomState,
    public code?: string,
  ) {
    super(message)
    this.name = 'GameError'
  }
}
