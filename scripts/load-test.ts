// Managed-service load test. Never run against production without its operator's consent.
import {
  createClient,
  type Session,
  type SupabaseClient,
  type RealtimeChannel,
} from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

const url = process.env.LOAD_SUPABASE_URL,
  key = process.env.LOAD_SUPABASE_PUBLISHABLE_KEY,
  appUrl = process.env.LOAD_APP_URL?.replace(/\/$/, '')
if (!url || !key || !appUrl || process.env.LOAD_CONFIRM !== 'isolated-test-project') {
  console.error(
    'Set LOAD_APP_URL, LOAD_SUPABASE_URL, LOAD_SUPABASE_PUBLISHABLE_KEY, and LOAD_CONFIRM=isolated-test-project. See SCALING.md.',
  )
  process.exitCode = 1
} else {
  const pairs = Math.min(500, Math.max(1, Number(process.env.LOAD_PAIRS ?? 2)))
  const seconds = Math.min(3600, Math.max(10, Number(process.env.LOAD_SECONDS ?? 30)))
  const rampMs = Math.max(50, Number(process.env.LOAD_RAMP_MS ?? 150))
  if (![pairs, seconds, rampMs].every(Number.isFinite))
    throw new Error('Load parameters must be finite numbers.')
  const sessions = process.env.LOAD_SESSIONS_FILE
    ? (JSON.parse(await readFile(process.env.LOAD_SESSIONS_FILE, 'utf8')) as Pick<
        Session,
        'access_token' | 'refresh_token'
      >[])
    : []
  if (sessions.length < pairs * 2 && process.env.LOAD_CREATE_SESSIONS !== 'yes')
    throw new Error(
      'Provide at least two sessions per pair, or LOAD_CREATE_SESSIONS=yes for a small smoke test.',
    )
  if (
    !Array.isArray(sessions) ||
    sessions.some(
      (session) =>
        !session ||
        typeof session.access_token !== 'string' ||
        typeof session.refresh_token !== 'string',
    )
  )
    throw new Error('The session file must contain an array of access_token/refresh_token objects.')
  if (sessions.length < pairs * 2 && pairs > 10)
    throw new Error('Large tests require pre-provisioned sessions to respect Auth signup limits.')
  const delays = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
  const latencies: number[] = [],
    clients: SupabaseClient[] = []
  let failures = 0,
    broadcasts = 0,
    completedPairs = 0
  const started = Date.now()
  async function clientFor(index: number) {
    const client = createClient(url!, key!, {
      auth: { persistSession: false, autoRefreshToken: true },
      realtime: { params: { eventsPerSecond: 4 } },
    })
    clients.push(client)
    const result = sessions[index]
      ? await client.auth.setSession(sessions[index])
      : await client.auth.signInAnonymously()
    if (result.error)
      throw new Error(
        `Auth failed: ${result.error.code ?? 'unknown'}; check test-project rate limits.`,
      )
    return { client, id: result.data.user!.id }
  }
  async function rpc(client: SupabaseClient, fn: string, args: Record<string, unknown>) {
    const start = performance.now(),
      { data, error } = await client.rpc(fn, args)
    latencies.push(performance.now() - start)
    if (error || data?.error) throw new Error(`RPC ${fn} failed (${error?.code ?? 'validation'})`)
    return data.state as {
      roomId: string
      code: string
      boardStatus: string
      board: { id: string }[]
      game: { id: string; turn: number; activePlayer: string }
    }
  }
  async function subscribe(channel: RealtimeChannel) {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Realtime subscription timed out')), 15000)
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout)
          resolve()
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timeout)
          reject(new Error(`Realtime ${status}`))
        }
      })
    })
  }
  async function boardApi(client: SupabaseClient, body: Record<string, unknown>) {
    const { data } = await client.auth.getSession()
    const result = await fetch(`${appUrl}/api/boards`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${data.session!.access_token}`,
      },
      body: JSON.stringify(body),
    })
    const response = await result.json()
    if (!result.ok || response.error)
      throw new Error('Board preparation failed; check the isolated app backend.')
    return response
  }
  async function pair(index: number) {
    await delays(index * rampMs)
    try {
      const a = await clientFor(index * 2),
        b = await clientFor(index * 2 + 1)
      const boardId = process.env.LOAD_BOARD_ID ?? 'ai-random'
      await boardApi(a.client, { operation: 'register', boardId })
      let state = await rpc(a.client, 'create_room_board_v2', {
        p_nickname: 'Load A',
        p_request_id: randomUUID(),
        p_settings: { question: 120, answer: 30, review: 60 },
        p_board_id: boardId,
      })
      state = await rpc(b.client, 'join_room_v2', { p_code: state.code, p_nickname: 'Load B' })
      const preparationLimit = Date.now() + 100000
      while (state.boardStatus !== 'ready') {
        if (Date.now() > preparationLimit) throw new Error('Board preparation timed out.')
        state = (
          await boardApi(a.client, {
            operation: 'prepare',
            roomId: state.roomId,
            gameId: state.game.id,
          })
        ).state
        if (state.boardStatus !== 'ready') await delays(3000)
      }
      for (const player of [a, b]) {
        const channel = player.client
          .channel(`game:${state.roomId}`, { config: { private: true } })
          .on(
            'broadcast',
            { event: 'state' },
            ({ payload }: { payload: Record<string, unknown> }) => {
              if (Object.keys(payload).some((key) => key !== 'version')) failures++
              broadcasts++
            },
          )
        await subscribe(channel)
        const social = player.client.channel(`social:${state.roomId}`, {
          config: { private: true, presence: { key: player.id } },
        })
        await subscribe(social)
        await social.track({ online: true })
      }
      const act = (player: typeof a, kind: string, payload = {}) =>
        rpc(player.client, 'game_action_v2', {
          p_room_id: state.roomId,
          p_game_id: state.game.id,
          p_turn: state.game.turn,
          p_action_id: randomUUID(),
          p_kind: kind,
          p_payload: payload,
        })
      state = await act(a, 'select', { characterId: state.board[0]!.id })
      state = await act(b, 'select', { characterId: state.board[1]!.id })
      state = await act(a, 'ready')
      state = await act(b, 'ready')
      const end = Date.now() + seconds * 1000
      while (Date.now() < end) {
        const asker = state.game.activePlayer === a.id ? a : b,
          answerer = asker === a ? b : a
        if (state.game.turn > 1) state = await act(answerer, 'review')
        state = await act(asker, 'question', { text: 'Would they start a podcast?' })
        state = await act(answerer, 'answer', { answer: true })
        await delays(10000)
      }
      // Canonical snapshots model a refreshed page without relying on missed events.
      await rpc(a.client, 'get_room_v2', { p_room_id: state.roomId })
      await rpc(b.client, 'get_room_v2', { p_room_id: state.roomId })
      await act(a, 'leave')
      completedPairs++
    } catch (error) {
      failures++
      console.error(`Pair ${index + 1}: ${error instanceof Error ? error.message : 'failed'}`)
    }
  }
  try {
    await Promise.all(Array.from({ length: pairs }, (_, i) => pair(i)))
  } finally {
    await Promise.all(clients.map((client) => client.removeAllChannels()))
    clients.forEach((client) => client.auth.stopAutoRefresh())
  }
  latencies.sort((a, b) => a - b)
  const percentile = (p: number) =>
    Math.round(latencies[Math.floor((latencies.length - 1) * p)] ?? 0)
  console.log(
    JSON.stringify(
      {
        requestedPlayers: pairs * 2,
        completedPairs,
        rpcRequests: latencies.length,
        failures,
        broadcasts,
        p50ms: percentile(0.5),
        p95ms: percentile(0.95),
        p99ms: percentile(0.99),
        elapsedSeconds: Math.round((Date.now() - started) / 1000),
      },
      null,
      2,
    ),
  )
  if (failures || completedPairs !== pairs) process.exitCode = 1
}
