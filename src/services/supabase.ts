import { createClient, type RealtimeChannel } from '@supabase/supabase-js'
import { config } from '../lib/config'
import {
  GameError,
  REACTIONS,
  type GameService,
  type RoomState,
  type Connection,
} from '../game/types'
import { newId } from '../lib/platform'

export function createSupabaseService(): GameService {
  if (config.key.startsWith('sb_secret_'))
    throw new Error('Use a publishable Supabase key in the browser.')
  if (config.key.startsWith('ey')) {
    try {
      const payload = JSON.parse(
        atob(config.key.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')),
      ) as { role?: string }
      if (payload.role === 'service_role')
        throw new Error('A service_role key cannot be used in the browser.')
    } catch (error) {
      if (error instanceof Error && error.message.includes('service_role')) throw error
    }
  }
  const client = createClient(config.url, config.key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'sgw-auth',
    },
    realtime: { params: { eventsPerSecond: 4 } },
  })
  let social: RealtimeChannel | undefined
  let lastReaction = 0
  async function ensureSession(captchaToken?: string) {
    const { data: existing, error: sessionError } = await client.auth.getSession()
    if (sessionError)
      throw new GameError('Your session could not be restored. Check your connection and retry.')
    if (existing.session) return
    const { error } = await client.auth.signInAnonymously({ options: { captchaToken } })
    if (error)
      throw new GameError(
        error.message.includes('captcha')
          ? 'Please complete the connection check and try again.'
          : 'Could not connect. Check anonymous sign-ins and try again.',
      )
  }
  async function rpc(name: string, args: Record<string, unknown>): Promise<RoomState> {
    let startedAt = Date.now()
    let result = await client.rpc(name, args)
    // Reuse identical action IDs on one transport retry; the database deduplicates.
    if (result.error && (result.status >= 500 || result.status === 0)) {
      startedAt = Date.now()
      result = await client.rpc(name, args)
    }
    if (result.error) {
      console.warn('Game request failed', {
        operation: name,
        code: result.error.code || result.status,
      })
      throw new GameError('Connection interrupted. Your draft is saved. Please retry.')
    }
    const response = result.data as { state?: RoomState; error?: string; code?: string } | null
    const clientTiming = { startedAt, receivedAt: Date.now() }
    if (response?.error)
      throw new GameError(
        response.error,
        response.state ? { ...response.state, clientTiming } : undefined,
        response.code,
      )
    if (!response?.state?.game || !Array.isArray(response.state.players))
      throw new GameError('An unexpected response arrived. Please reconnect.')
    return { ...response.state, clientTiming }
  }
  return {
    mode: 'online',
    session: async () => Boolean((await client.auth.getSession()).data.session),
    create: async (name, requestId, captcha) => {
      await ensureSession(captcha)
      return rpc('create_room', { p_nickname: name, p_request_id: requestId })
    },
    join: async (code, name, captcha) => {
      await ensureSession(captcha)
      return rpc('join_room', { p_code: code, p_nickname: name })
    },
    snapshot: async (roomId) => {
      await ensureSession()
      return rpc('get_room', { p_room_id: roomId })
    },
    action: (state, kind, payload, actionId) =>
      rpc('game_action', {
        p_room_id: state.roomId,
        p_game_id: state.game.id,
        p_turn: state.game.turn,
        p_action_id: actionId,
        p_kind: kind,
        p_payload: payload,
      }),
    subscribe: async (roomId, you, callbacks) => {
      let disposed = false
      const statuses: Record<string, Connection> = { game: 'connecting', social: 'connecting' }
      const setStatus = (which: string, status: string) => {
        if (disposed) return
        statuses[which] =
          status === 'SUBSCRIBED' ? 'online' : status === 'CLOSED' ? 'offline' : 'reconnecting'
        callbacks.connection(
          Object.values(statuses).every((value) => value === 'online') ? 'online' : 'reconnecting',
        )
        if (status === 'SUBSCRIBED') callbacks.invalidate()
      }
      const session = (await client.auth.getSession()).data.session
      await client.realtime.setAuth(session?.access_token)
      const gameChannel = client
        .channel(`game:${roomId}`, { config: { private: true } })
        .on('broadcast', { event: 'state' }, ({ payload }: { payload: { version?: unknown } }) => {
          if (typeof payload?.version === 'number') callbacks.invalidate(payload.version)
        })
      const socialChannel = client.channel(`social:${roomId}`, {
        config: { private: true, broadcast: { self: true, ack: true }, presence: { key: you } },
      })
      let receivedAt = 0
      let receivedCount = 0
      const receivedIds = new Set<string>()
      socialChannel
        .on(
          'broadcast',
          { event: 'reaction' },
          ({ payload }: { payload: { id?: unknown; emoji?: unknown; from?: unknown } }) => {
            if (Date.now() - receivedAt > 4000) {
              receivedAt = Date.now()
              receivedCount = 0
              receivedIds.clear()
            }
            if (
              receivedCount >= 8 ||
              typeof payload?.id !== 'string' ||
              payload.id.length > 40 ||
              receivedIds.has(payload.id) ||
              typeof payload.from !== 'string' ||
              !REACTIONS.some((e) => e === payload.emoji)
            )
              return
            receivedIds.add(payload.id)
            receivedCount++
            callbacks.reaction({ id: payload.id, from: payload.from, emoji: String(payload.emoji) })
          },
        )
        .on('presence', { event: 'sync' }, () =>
          callbacks.presence(Object.keys(socialChannel.presenceState())),
        )
      social = socialChannel
      gameChannel.subscribe((status) => setStatus('game', status))
      socialChannel.subscribe(async (status) => {
        setStatus('social', status)
        if (status === 'SUBSCRIBED' && !disposed) await socialChannel.track({ online: true })
      })
      return () => {
        disposed = true
        if (social === socialChannel) social = undefined
        void client.removeChannel(gameChannel)
        void client.removeChannel(socialChannel)
      }
    },
    react: async (emoji, you) => {
      if (!REACTIONS.some((e) => e === emoji) || Date.now() - lastReaction < 1200) return
      if (!social) throw new GameError('Reactions will return when you reconnect.')
      lastReaction = Date.now()
      const result = await social.send({
        type: 'broadcast',
        event: 'reaction',
        payload: { id: newId(), emoji, from: you },
      })
      if (result !== 'ok')
        throw new GameError('That reaction could not be sent. Try again when connected.')
    },
  }
}
