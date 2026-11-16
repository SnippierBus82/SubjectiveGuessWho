// Uses the same RPC/RLS suite with a real multi-connection PostgreSQL pool.
import { spawn } from 'node:child_process'
if (!process.env.TEST_DATABASE_URL || process.env.TEST_ALLOW_EMPTY_DATABASE !== 'yes') {
  console.error(
    'Set TEST_DATABASE_URL to an EMPTY disposable PostgreSQL database and TEST_ALLOW_EMPTY_DATABASE=yes. Never use production.',
  )
  process.exitCode = 1
} else {
  const child = spawn(
    process.execPath,
    ['node_modules/vitest/vitest.mjs', 'run', 'tests/database.test.ts'],
    { stdio: 'inherit', env: process.env },
  )
  child.on('exit', (code) => {
    process.exitCode = code ?? 1
  })
}
