// Each suite receives its own newly created disposable database. Never reset an existing schema.
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
const configured = process.env.TEST_DATABASE_URL
if (!configured || process.env.TEST_ALLOW_EMPTY_DATABASE !== 'yes') {
  console.error(
    'Set TEST_DATABASE_URL to an EMPTY disposable PostgreSQL database and TEST_ALLOW_EMPTY_DATABASE=yes. Never use production.',
  )
  process.exitCode = 1
} else {
  const admin = new pg.Client({ connectionString: configured })
  try {
    await admin.connect()
    const existing = await admin.query(
      "select to_regclass('public.rooms') as rooms,to_regclass('auth.users') as users",
    )
    if (existing.rows[0].rooms || existing.rows[0].users)
      throw new Error(
        'Refusing to test against an initialized database. Use an empty disposable PostgreSQL cluster.',
      )
    for (const suite of [
      'tests/rooms.test.ts',
      'tests/gameplay.test.ts',
      'tests/matchmaking.test.ts',
      'tests/folder-boards.test.ts',
    ]) {
      const database = `sgw_test_${randomUUID().replaceAll('-', '')}`
      if (!/^sgw_test_[a-f0-9]{32}$/.test(database))
        throw new Error('Invalid disposable database name')
      await admin.query(`create database "${database}"`)
      try {
        const url = new URL(configured)
        url.pathname = `/${database}`
        const code = await new Promise<number | null>((resolve, reject) => {
          const child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', suite], {
            stdio: 'inherit',
            windowsHide: true,
            env: { ...process.env, TEST_DATABASE_URL: url.toString() },
          })
          child.on('exit', resolve)
          child.on('error', reject)
        })
        if (code !== 0) {
          process.exitCode = code ?? 1
          break
        }
      } finally {
        await admin.query(`drop database "${database}"`)
      }
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'PostgreSQL checks failed')
    process.exitCode = 1
  } finally {
    await admin.end()
  }
}
