export type Phase = 'lobby' | 'question' | 'answer' | 'finished'
export type ActionKind =
  'select' | 'ready' | 'unready' | 'question' | 'answer' | 'guess' | 'rematch'
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
  status: 'pending' | 'answered' | 'unanswered'
  askedAt: string
}
export interface Game {
  id: string
  packId: string
  phase: Phase
  turn: number
  activePlayer: string | null
  deadline: string | null
  winner: string | null
  guesser: string | null
  guessCharacter: string | null
  result: 'correct' | 'incorrect' | null
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
  // Added by the transport after an RPC, never sent as an authoritative input.
  clientTiming?: { startedAt: number; receivedAt: number }
}
export interface Reaction {
  id: string
  emoji: string
  from: string
}
export const REACTIONS = ['😂', '💀', '❤️', '😭', '🤨', '👍'] as const
export interface SubscriptionCallbacks {
  invalidate: (version?: number) => void
  connection: (status: Connection) => void
  reaction: (reaction: Reaction) => void
  presence: (ids: string[]) => void
}
export interface GameService {
  mode: 'online' | 'preview'
  session: () => Promise<boolean>
  create: (name: string, requestId: string, captcha?: string) => Promise<RoomState>
  join: (code: string, name: string, captcha?: string) => Promise<RoomState>
  snapshot: (roomId: string) => Promise<RoomState>
  action: (
    state: RoomState,
    kind: ActionKind,
    payload: Record<string, unknown>,
    actionId: string,
  ) => Promise<RoomState>
  subscribe: (roomId: string, you: string, callbacks: SubscriptionCallbacks) => Promise<() => void>
  react: (emoji: string, you: string) => Promise<void>
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
