import { useCallback, useEffect, useRef, useState } from 'react'
import {
  GameError,
  type ActionKind,
  type Connection,
  type GameService,
  type Reaction,
  type RoomState,
} from '../game/types'
import { isNewerState } from '../game/rules'
import { getService } from '../services'
import { navigateRoom, newId, storage } from '../lib/platform'

export function useGame(roomId: string | null) {
  const [state, setState] = useState<RoomState | null>(null)
  const [service, setService] = useState<GameService>()
  const [connection, setConnection] = useState<Connection>('connecting')
  const [onlinePlayers, setOnlinePlayers] = useState<string[]>([])
  const [reactions, setReactions] = useState<Reaction[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(Boolean(roomId))
  const [clockOffset, setClockOffset] = useState(0)
  const [hasSession, setHasSession] = useState(false)
  const stateRef = useRef<RoomState | null>(null)
  const serviceRef = useRef<GameService | undefined>(undefined)
  const busyRef = useRef(false)
  const syncInFlight = useRef(false)
  const syncAgain = useRef(false)
  const reactionTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  const createRequest = useRef(newId())

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
  }, [])

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
          setReactions((current) => [...current.slice(-3), reaction])
          const timer = setTimeout(() => {
            setReactions((current) => current.filter((r) => r.id !== reaction.id))
            reactionTimers.current = reactionTimers.current.filter((t) => t !== timer)
          }, 2800)
          reactionTimers.current.push(timer)
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
    const reconcile = setInterval(resume, 60000)
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
  }, [state?.roomId, state?.you, service, sync])

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
    preview: service?.mode === 'preview',
    clearError: () => setError(''),
    sync,
    create: (name: string, captcha?: string) =>
      run(async (backend) => {
        const next = await backend.create(name, createRequest.current, captcha)
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
        await service.react(emoji, state.you)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not send reaction.')
      }
    },
  }
}
export type GameController = ReturnType<typeof useGame>
