import type { RealtimeChannel } from '@supabase/supabase-js'
import { getSupabaseClient } from './client'
import {
  GameError,
  REACTIONS,
  type GameService,
  type RoomState,
  type Connection,
  type MatchStatus,
} from '../game/types'
import { DEFAULT_TIMINGS } from '../game/timings'
import { DEFAULT_BOARD } from '../game/boards'
import { newId } from '../lib/platform'

export function createSupabaseService(): GameService {
  const client = getSupabaseClient()
  let social: RealtimeChannel | undefined
  let lastReaction = 0
  async function ensureSession(captchaToken?: string) {
    const { data: existing, error: sessionError } = await client.auth.getSession()
    if (sessionError)
      throw new GameError('Your session could not be restored. Check your connection and retry.')
    if (existing.session) return
    const { error } = await client.auth.signInAnonymously({ options: { captchaToken } })
    if (error) {
      const message =
        error.code === 'anonymous_provider_disabled'
          ? 'Anonymous sign-ins are disabled. Enable them in Supabase Authentication settings.'
          : error.code === 'captcha_failed' || /captcha/i.test(error.message)
            ? 'The connection check was rejected. Complete it again; check the CAPTCHA provider and secret in Supabase if this continues.'
            : error.status === 429
              ? 'Too many sign-in attempts. Please wait before trying again.'
              : 'Could not sign in. Check your connection and Supabase Auth settings.'
      throw new GameError(message)
    }
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
      throw new GameError(
        result.error.code === 'PGRST202'
          ? 'The game database needs the latest migrations. See SETUP.md before retrying.'
          : 'Connection interrupted. Your draft is saved. Please retry.',
      )
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
  async function boardRequest(body: Record<string, unknown>) {
    const { data } = await client.auth.getSession()
    if (!data.session) throw new GameError('Reconnect before preparing faces.')
    const response = await fetch('/api/boards', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${data.session.access_token}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(100_000),
    })
    const result = await response
      .json()
      .catch(() => ({ error: 'The board backend is unavailable. Check the deployment and retry.' }))
    if (!response.ok || result.error)
      throw new GameError(result.error ?? 'Could not prepare the board.')
    return result as { state?: RoomState }
  }
  return {
    mode: 'online',
    session: async () => Boolean((await client.auth.getSession()).data.session),
    create: async (
      name,
      requestId,
      captcha,
      settings = DEFAULT_TIMINGS,
      boardId = DEFAULT_BOARD,
    ) => {
      await ensureSession(captcha)
      await boardRequest({ operation: 'register', boardId })
      return rpc('create_room_board_v2', {
        p_nickname: name,
        p_request_id: requestId,
        p_settings: settings,
        p_board_id: boardId,
      })
    },
    join: async (code, name, captcha) => {
      await ensureSession(captcha)
      return rpc('join_room_v2', { p_code: code, p_nickname: name })
    },
    snapshot: async (roomId) => {
      await ensureSession()
      return rpc('get_room_v2', { p_room_id: roomId })
    },
    prepareBoard: async (state) =>
      (await boardRequest({ operation: 'prepare', roomId: state.roomId, gameId: state.game.id }))
        .state ?? null,
    action: (state, kind, payload, actionId) =>
      rpc('game_action_v2', {
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
    heartbeat: async (roomId, version) => {
      const { data, error } = await client.rpc('heartbeat_room_v2', {
        p_room_id: roomId,
        p_version: version,
      })
      if (error || data?.error)
        throw new GameError(data?.error || 'Could not reconnect.', undefined, data?.code)
      return data?.state ?? null
    },
    match: async (name, command, captcha, boardId = DEFAULT_BOARD) => {
      await ensureSession(captcha)
      if (command === 'join') await boardRequest({ operation: 'register', boardId })
      const { data, error } = await client.rpc('matchmake_board_v2', {
        p_nickname: name,
        p_command: command,
        p_board_id: boardId,
      })
      if (error || data?.error)
        throw new GameError(
          data?.error ||
            (error?.code === 'PGRST202'
              ? 'Apply the latest database migration to enable player search.'
              : 'Player search could not connect. Try again.'),
        )
      return data as MatchStatus
    },
    subscribeMatch: async (invalidate) => {
      const { data } = await client.auth.getSession()
      if (!data.session) return () => {}
      const channel = client
        .channel(`match:${data.session.user.id}`, { config: { private: true } })
        .on('broadcast', { event: 'match' }, invalidate)
        .subscribe()
      return () => {
        void client.removeChannel(channel)
      }
    },
    react: async (emoji, _you, id = newId()) => {
      if (!REACTIONS.some((e) => e === emoji) || Date.now() - lastReaction < 1000) return
      if (!social) throw new GameError('Reactions will return when you reconnect.')
      lastReaction = Date.now()
      const roomId = social.topic.replace(/^realtime:social:/, '').replace(/^social:/, '')
      const { data, error } = await client.rpc('send_reaction_v2', {
        p_room_id: roomId,
        p_id: id,
        p_emoji: emoji,
      })
      if (error || data?.error)
        throw new GameError(
          data?.error || 'That reaction could not be sent. Try again when connected.',
        )
    },
  }
}
