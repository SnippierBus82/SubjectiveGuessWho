import { useCallback, useEffect, useRef, useState } from 'react'
import {
  GameError,
  type ActionKind,
  type Connection,
  type GameService,
  type Reaction,
  type RoomState,
  type Timings,
  type MatchStatus,
} from '../game/types'
import { isNewerState } from '../game/rules'
import { DEFAULT_BOARD, type BoardId } from '../game/boards'
import { getService } from '../services'
import { navigateRoom, newId, storage } from '../lib/platform'

const REACTION_POSITIONS = [34, 56, 24, 68, 44, 76, 18, 62]
type FloatingReaction = Reaction & { position: number; drift: number; rotation: number }

export function useGame(roomId: string | null) {
  const [state, setState] = useState<RoomState | null>(null)
  const [service, setService] = useState<GameService>()
  const [connection, setConnection] = useState<Connection>('connecting')
  const [onlinePlayers, setOnlinePlayers] = useState<string[]>([])
  const [reactions, setReactions] = useState<FloatingReaction[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(Boolean(roomId))
  const [clockOffset, setClockOffset] = useState(0)
  const [mutedReactions, setMutedReactions] = useState(() =>
    storage.read<boolean>('mute-reactions', false),
  )
  const mutedRef = useRef(mutedReactions)
  mutedRef.current = mutedReactions
  const reactionIds = useRef(new Set<string>())
  const nextReactionSlot = useRef(0)
  const [search, setSearch] = useState<MatchStatus | null>(null)
  const searchName = useRef('')
  const searchBoard = useRef<BoardId>(storage.read<BoardId>('match-board', DEFAULT_BOARD))
  const searchBusy = useRef(false)
  const [hasSession, setHasSession] = useState(false)
  const stateRef = useRef<RoomState | null>(null)
  const serviceRef = useRef<GameService | undefined>(undefined)
  const busyRef = useRef(false)
  const syncInFlight = useRef(false)
  const syncAgain = useRef(false)
  const reactionTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  const createRequest = useRef(newId())
  const [preparingBoard, setPreparingBoard] = useState(false)
  const [boardPreparationError, setBoardPreparationError] = useState('')
  const boardRequestInFlight = useRef(false)

  const displayReaction = useCallback((reaction: Reaction) => {
    if (reactionIds.current.has(reaction.id)) return
    if (mutedRef.current && reaction.from !== stateRef.current?.you) return
    reactionIds.current.add(reaction.id)
    if (reactionIds.current.size > 200)
      reactionIds.current.delete(reactionIds.current.values().next().value!)
    const slot = nextReactionSlot.current
    nextReactionSlot.current = (slot + 1) % REACTION_POSITIONS.length
    const direction = slot % 2 ? 1 : -1
    const floating = {
      ...reaction,
      position: REACTION_POSITIONS[slot]!,
      drift: direction * 35,
      rotation: direction * 16,
    }
    setReactions((current) => [...current.slice(1 - REACTION_POSITIONS.length), floating])
    const timer = setTimeout(() => {
      setReactions((current) => current.filter((r) => r.id !== reaction.id))
      reactionTimers.current = reactionTimers.current.filter((t) => t !== timer)
    }, 2800)
    reactionTimers.current.push(timer)
  }, [])

  const apply = useCallback((next: RoomState, sentAt = Date.now()) => {
    if (!isNewerState(stateRef.current, next)) return
    if (
      stateRef.current?.roomId === next.roomId &&
      stateRef.current.you === next.you &&
      stateRef.current.version === next.version &&
      Date.parse(stateRef.current.serverNow) > Date.parse(next.serverNow)
    )
      return
    stateRef.current = next
    setState(next)
    const timing = next.clientTiming ?? { startedAt: sentAt, receivedAt: Date.now() }
    setClockOffset(Date.parse(next.serverNow) - (timing.startedAt + timing.receivedAt) / 2)
    storage.write('last-room', next.roomId)
    storage.write('active-room', next.roomId)
  }, [])

  const prepareBoard = useCallback(async () => {
    const current = stateRef.current,
      backend = serviceRef.current
    if (!current || !backend?.prepareBoard || boardRequestInFlight.current) return
    boardRequestInFlight.current = true
    setPreparingBoard(true)
    setBoardPreparationError('')
    try {
      const next = await backend.prepareBoard(current)
      if (next && stateRef.current?.game.id === current.game.id) apply(next)
    } catch (error) {
      if (stateRef.current?.game.id === current.game.id)
        setBoardPreparationError(
          error instanceof Error ? error.message : 'Could not prepare the faces.',
        )
    } finally {
      boardRequestInFlight.current = false
      setPreparingBoard(false)
    }
  }, [apply])
  useEffect(() => {
    setBoardPreparationError('')
  }, [state?.game.id])
  useEffect(() => {
    if (state?.boardStatus !== 'pending' || boardPreparationError) return
    void prepareBoard()
    const timer = setInterval(() => void prepareBoard(), 3000)
    return () => clearInterval(timer)
  }, [state?.game.id, state?.boardStatus, boardPreparationError, prepareBoard])

  useEffect(() => {
    let cancelled = false
    getService()
      .then(async (next) => {
        if (cancelled) return
        serviceRef.current = next
        setService(next)
        setHasSession(await next.session())
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not start the game.')
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const dropUnavailableRoom = useCallback((error: unknown, originRoom: string | undefined) => {
    if (
      !(error instanceof GameError) ||
      error.code !== 'ROOM_UNAVAILABLE' ||
      stateRef.current?.roomId !== originRoom
    )
      return false
    stateRef.current = null
    setState(null)
    setError(error.message)
    setConnection('offline')
    storage.remove('active-room')
    return true
  }, [])

  const sync = useCallback(
    async function reconcile() {
      const current = stateRef.current,
        backend = serviceRef.current
      if (!current || !backend) return
      if (syncInFlight.current) {
        syncAgain.current = true
        return
      }
      syncInFlight.current = true
      const sentAt = Date.now()
      try {
        const next = await backend.snapshot(current.roomId)
        if (stateRef.current?.roomId === current.roomId && stateRef.current.you === current.you)
          apply(next, sentAt)
      } catch (error) {
        if (!dropUnavailableRoom(error, current.roomId))
          setConnection(backend.mode === 'preview' ? 'preview' : 'reconnecting')
      } finally {
        syncInFlight.current = false
        if (syncAgain.current) {
          syncAgain.current = false
          queueMicrotask(() => void reconcile())
        }
      }
    },
    [apply, dropUnavailableRoom],
  )

  useEffect(() => {
    if (!service) return
    if (!roomId) {
      stateRef.current = null
      setState(null)
      setLoading(false)
      return
    }
    if (stateRef.current?.roomId !== roomId) {
      stateRef.current = null
      setState(null)
    }
    let cancelled = false
    setLoading(true)
    const sentAt = Date.now()
    service
      .snapshot(roomId)
      .then((next) => {
        if (!cancelled) {
          apply(next, sentAt)
          setError('')
        }
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Could not restore your room.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [roomId, service, apply])

  useEffect(() => {
    if (!state || !service) return
    let cancelled = false
    let dispose: (() => void) | undefined
    setConnection(service.mode === 'preview' ? 'preview' : 'connecting')
    service
      .subscribe(state.roomId, state.you, {
        invalidate: (version) => {
          if (!version || version > (stateRef.current?.version ?? 0)) void sync()
        },
        connection: (status) => {
          if (!cancelled) setConnection(status)
        },
        presence: (ids) => {
          if (!cancelled) setOnlinePlayers(ids)
        },
        reaction: (reaction) => {
          if (cancelled || !stateRef.current?.players.some((p) => p.id === reaction.from)) return
          displayReaction(reaction)
        },
      })
      .then((cleanup) => {
        if (cancelled) cleanup()
        else dispose = cleanup
      })
      .catch(() => {
        if (!cancelled) setConnection('reconnecting')
      })
    const resume = () => {
      if (document.visibilityState === 'visible') void sync()
    }
    const offline = () => setConnection('offline')
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('online', resume)
    window.addEventListener('offline', offline)
    window.addEventListener('focus', resume)
    let heartbeatPending = false
    const pulse = async () => {
      const current = stateRef.current
      if (
        !current ||
        document.visibilityState !== 'visible' ||
        heartbeatPending ||
        syncInFlight.current
      )
        return
      if (!service.heartbeat) {
        resume()
        return
      }
      heartbeatPending = true
      const sentAt = Date.now()
      try {
        const next = await service.heartbeat(current.roomId, current.version)
        if (
          !cancelled &&
          next &&
          stateRef.current?.roomId === current.roomId &&
          stateRef.current.you === current.you
        )
          apply(next, sentAt)
      } catch (err) {
        if (!cancelled && !dropUnavailableRoom(err, current.roomId)) setConnection('reconnecting')
      } finally {
        heartbeatPending = false
      }
    }
    const reconcile = setInterval(() => void pulse(), 15000)
    return () => {
      cancelled = true
      dispose?.()
      clearInterval(reconcile)
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('online', resume)
      window.removeEventListener('offline', offline)
      window.removeEventListener('focus', resume)
      reactionTimers.current.forEach(clearTimeout)
      reactionTimers.current = []
      setReactions([])
    }
    // Re-subscribe only when membership identity changes, never for a countdown tick.
  }, [state?.roomId, state?.you, service, sync, displayReaction, apply, dropUnavailableRoom])

  useEffect(() => {
    if (!state?.game.deadline) return
    const remaining = Date.parse(state.game.deadline) - Date.now() - clockOffset
    const timer = setTimeout(() => void sync(), Math.max(100, remaining + 150))
    // Retry reconciliation while a deadline has elapsed and the network is down.
    const retry = setInterval(() => {
      if (Date.now() + clockOffset >= Date.parse(state.game.deadline!)) void sync()
    }, 2500)
    return () => {
      clearTimeout(timer)
      clearInterval(retry)
    }
  }, [state?.game.deadline, clockOffset, sync])

  const updateSearch = useCallback(
    async (command: 'join' | 'pulse' | 'cancel', captcha?: string) => {
      if (searchBusy.current || busyRef.current) return false
      searchBusy.current = true
      if (command !== 'pulse') {
        busyRef.current = true
        setBusy(true)
      }
      try {
        const backend = await getService()
        if (!backend.match)
          throw new GameError('Player search needs an online Supabase connection.')
        const nickname =
          searchName.current ||
          stateRef.current?.players.find((p) => p.id === stateRef.current?.you)?.name ||
          storage.read<string>('nickname', '')
        const next = await backend.match(nickname, command, captcha, searchBoard.current)
        if (next.boardId) searchBoard.current = next.boardId
        setError('')
        if (next.status === 'matched' && next.roomId) {
          setSearch(null)
          storage.remove('match-search')
          if (stateRef.current?.roomId !== next.roomId) {
            // A server-confirmed match may advance to another room without
            // exposing the app's menus or escaping the current game context.
            storage.write('active-room', next.roomId)
            navigateRoom(next.roomId)
          }
        } else {
          if (next.status === 'waiting') {
            storage.write('match-search', nickname)
            storage.write('match-board', searchBoard.current)
          } else {
            if (command === 'pulse' && storage.read('match-search', ''))
              setError(
                'Your search expired while you were away. Find a player again when you’re ready.',
              )
            storage.remove('match-search')
          }
          setSearch(next.status === 'waiting' ? next : null)
        }
        setHasSession(await backend.session())
        return true
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not find a player.')
        return false
      } finally {
        searchBusy.current = false
        if (command !== 'pulse') {
          busyRef.current = false
          setBusy(false)
        }
      }
    },
    [],
  )
  useEffect(() => {
    if (!service || roomId) return
    const saved = storage.read<string>('match-search', '')
    if (saved) {
      searchName.current = saved
      void updateSearch('pulse')
    }
  }, [service, roomId, updateSearch])
  const matchingLobby =
    state?.mode === 'match' &&
    (state.game.phase === 'lobby' ||
      (state.game.endReason === 'no_show' &&
        state.players.some((p) => p.id === state.you && p.ready)))
  useEffect(() => {
    if (!service || (!search && !matchingLobby)) return
    let dispose: (() => void) | undefined,
      active = true
    service
      .subscribeMatch?.(() => {
        void updateSearch('pulse')
      })
      .then((cleanup) => {
        if (active) dispose = cleanup
        else cleanup()
      })
    const pulse = () => {
      if (document.visibilityState === 'visible') void updateSearch('pulse')
    }
    const timer = setInterval(pulse, 10000)
    document.addEventListener('visibilitychange', pulse)
    return () => {
      active = false
      dispose?.()
      clearInterval(timer)
      document.removeEventListener('visibilitychange', pulse)
    }
  }, [Boolean(search), matchingLobby, service, updateSearch])

  async function run(work: (backend: GameService) => Promise<RoomState>) {
    if (busyRef.current) return false
    busyRef.current = true
    setBusy(true)
    setError('')
    const originRoom = stateRef.current?.roomId
    const sentAt = Date.now()
    try {
      const backend = await getService()
      const next = await work(backend)
      if (!originRoom || stateRef.current?.roomId === originRoom) apply(next, sentAt)
      setHasSession(await backend.session())
      return true
    } catch (err) {
      if (dropUnavailableRoom(err, originRoom)) return false
      if (err instanceof GameError && err.state && stateRef.current?.roomId === originRoom)
        apply(err.state, sentAt)
      else if (stateRef.current) void sync()
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      return false
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }
  return {
    state,
    connection,
    onlinePlayers,
    reactions,
    error,
    busy,
    loading,
    clockOffset,
    hasSession,
    refreshSession: async () => {
      setHasSession(await (await getService()).session())
    },
    search,
    mutedReactions,
    muteReactions: (value: boolean) => {
      setMutedReactions(value)
      storage.write('mute-reactions', value)
      if (value) setReactions((current) => current.filter((r) => r.from === stateRef.current?.you))
    },
    findPlayer: (name: string, captcha?: string, boardId: BoardId = DEFAULT_BOARD) => {
      searchName.current = name
      searchBoard.current = boardId
      return updateSearch('join', captcha)
    },
    cancelSearch: () => updateSearch('cancel'),
    preview: service?.mode === 'preview',
    prepareBoard,
    preparingBoard,
    boardPreparationError,
    clearError: () => setError(''),
    leave: async () => {
      if (busyRef.current) return false
      const current = stateRef.current
      if (search || (current?.mode === 'match' && current.game.endReason === 'no_show')) {
        if (!(await updateSearch('cancel'))) return false
      }
      if (current && current.game.phase !== 'finished') {
        const left = await run((backend) => backend.action(current, 'leave', {}, newId()))
        if (!left) return false
      }
      storage.remove('active-room')
      storage.remove('last-room')
      setError('')
      stateRef.current = null
      setState(null)
      navigateRoom()
      return true
    },
    sync,
    create: (name: string, captcha?: string, settings?: Timings, boardId?: BoardId) =>
      run(async (backend) => {
        const next = await backend.create(name, createRequest.current, captcha, settings, boardId)
        createRequest.current = newId()
        navigateRoom(next.roomId)
        return next
      }),
    join: (code: string, name: string, captcha?: string) =>
      run(async (backend) => {
        const next = await backend.join(code, name, captcha)
        navigateRoom(next.roomId)
        return next
      }),
    act: (kind: ActionKind, payload: Record<string, unknown> = {}) =>
      run((backend) => {
        if (!stateRef.current) throw new GameError('Please reconnect to your room.')
        return backend.action(stateRef.current, kind, payload, newId())
      }),
    switchSeat: () =>
      run((backend) => {
        if (!backend.switchSeat)
          throw new GameError('Seat switching is only available in local preview.')
        return backend.switchSeat()
      }),
    react: async (emoji: string) => {
      if (!service || !state) return
      try {
        const id = newId()
        displayReaction({ id, emoji, from: state.you })
        await service.react(emoji, state.you, id)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not send reaction.')
      }
    },
  }
}
export type GameController = ReturnType<typeof useGame>
