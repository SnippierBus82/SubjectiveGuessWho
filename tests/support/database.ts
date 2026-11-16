import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import type { RoomState } from '../../src/game/types'

export const users = Array.from(
  { length: 12 },
  (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
)
export interface RpcResponse {
  state?: RoomState
  error?: string
}
export interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
}
const bootstrap = `
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$;
  create schema auth;
  create table auth.users (id uuid primary key, is_anonymous boolean default true, created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
  grant usage on schema public, auth to authenticated, anon;
  create schema realtime;
  create table realtime.messages (id bigint generated always as identity primary key, topic text, event text, extension text, payload jsonb, private boolean);
  alter table realtime.messages enable row level security;
  grant usage on schema realtime to authenticated;
  grant select, insert on realtime.messages to authenticated;
  grant usage, select on sequence realtime.messages_id_seq to authenticated;
  create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic', true) $$;
  create function realtime.send(payload jsonb, event text, topic text, private boolean) returns void
  language sql as $$ insert into realtime.messages(payload,event,topic,private,extension) values (payload,event,topic,private,'broadcast') $$;
`

export async function makeDatabase() {
  const url = process.env.TEST_DATABASE_URL
  if (url && process.env.TEST_ALLOW_EMPTY_DATABASE !== 'yes')
    throw new Error(
      'External tests require TEST_ALLOW_EMPTY_DATABASE=yes and an EMPTY disposable database.',
    )
  const pool = url ? new pg.Pool({ connectionString: url, max: 12 }) : undefined
  const embedded = pool ? undefined : new PGlite()
  const admin: Queryable = pool
    ? { query: (sql, params) => pool.query(sql, params) }
    : { query: (sql, params) => embedded!.query(sql, params) }
  const existing = await admin.query(
    "select to_regclass('public.rooms') as rooms, to_regclass('auth.users') as users",
  )
  if (existing.rows[0]?.rooms || existing.rows[0]?.users) {
    await pool?.end()
    throw new Error(
      'Refusing to modify an existing database. Use a new empty disposable database, never production.',
    )
  }
  const migration = await readFile(
    new URL('../../supabase/migrations/202611150001_game.sql', import.meta.url),
    'utf8',
  )
  if (embedded) {
    await embedded.exec(bootstrap)
    await embedded.exec(migration)
  } else {
    await pool!.query(bootstrap)
    await pool!.query(migration)
  }
  for (const id of users) await admin.query('insert into auth.users(id) values ($1)', [id])
  async function as<T>(
    user: string | null,
    work: (db: Queryable) => Promise<T>,
    topic = '',
  ): Promise<T> {
    async function execute(db: Queryable) {
      await db.query(
        "select set_config('request.jwt.claim.sub',$1,true), set_config('realtime.topic',$2,true)",
        [user ?? '', topic],
      )
      await db.query(user ? 'set local role authenticated' : 'set local role anon')
      return work(db)
    }
    if (embedded)
      return embedded.transaction((tx) =>
        execute({ query: (sql, params) => tx.query(sql, params) }),
      )
    const client = await pool!.connect()
    try {
      await client.query('begin')
      const result = await execute(client)
      await client.query('commit')
      return result
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally {
      client.release()
    }
  }
  const allowed = ['create_room', 'join_room', 'get_room', 'game_action']
  async function rpc(user: string | null, name: string, args: unknown[]): Promise<RpcResponse> {
    if (!allowed.includes(name)) throw new Error('Unknown RPC in test harness')
    return as(user, async (db) => {
      const result = await db.query(
        `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) as result`,
        args,
      )
      return result.rows[0]!.result as RpcResponse
    })
  }
  return {
    admin,
    as,
    rpc,
    reset: async () => {
      if (embedded)
        await embedded.exec(
          'truncate public.rooms cascade; truncate private.rate_limits; truncate realtime.messages;',
        )
      else
        await pool!.query(
          'truncate public.rooms cascade; truncate private.rate_limits; truncate realtime.messages;',
        )
    },
    close: async () => {
      if (embedded) await embedded.close()
      else await pool!.end()
    },
    transport: pool
      ? 'PostgreSQL connection pool (true parallel transactions)'
      : 'PGlite PostgreSQL (serialized connections)',
  }
}
