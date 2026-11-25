import { test, expect, previewResult } from './fixtures'
const me = '00000000-0000-4000-8000-000000000001',
  other = '00000000-0000-4000-8000-000000000002',
  room = '00000000-0000-4000-8000-000000000003',
  nextRoom = '00000000-0000-4000-8000-000000000004'
test.setTimeout(120_000)
for (const outcome of ['cancel', 'match', 'requeue', 'leave-queue'])
  test(`online player search can ${outcome} without a second login or leaked queue`, async ({
    page,
  }) => {
    const board = previewResult().characters
    await page.clock.install()
    await page.routeWebSocket('wss://online-test.supabase.co/**', (socket) => socket.close())
    await page.route('**/src/lib/config.ts', (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: `export const config=${JSON.stringify({ online: true, incomplete: false, url: 'https://online-test.supabase.co', key: 'public-test-key', captchaProvider: 'hcaptcha', captchaKey: '', appUrl: '', supportEmail: '' })}`,
      }),
    )
    let logins = 0,
      pulses = 0,
      noShow = false,
      requeued = false,
      cancelled = false
    await page.route('https://online-test.supabase.co/**', async (route) => {
      const path = new URL(route.request().url()).pathname
      if (path === '/auth/v1/signup') {
        logins++
        const payload = Buffer.from(
          JSON.stringify({
            sub: me,
            exp: Math.floor(Date.now() / 1000) + 3600,
            role: 'authenticated',
          }),
        ).toString('base64url')
        await route.fulfill({
          json: {
            access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.test`,
            refresh_token: 'test-refresh-token',
            token_type: 'bearer',
            expires_in: 3600,
            user: {
              id: me,
              aud: 'authenticated',
              role: 'authenticated',
              is_anonymous: true,
              created_at: new Date().toISOString(),
              app_metadata: { provider: 'anonymous' },
            },
          },
        })
        return
      }
      if (path.endsWith('/matchmake_board_v2')) {
        const { p_command: command, p_board_id: boardId } = route.request().postDataJSON()
        expect(boardId).toBe('ai-random')
        if (command === 'cancel') cancelled = true
        const firstRequeue = noShow && !requeued
        if (noShow && command === 'pulse') requeued = true
        await route.fulfill({
          json:
            command === 'cancel'
              ? { status: 'idle' }
              : command === 'pulse' &&
                  outcome !== 'cancel' &&
                  !firstRequeue &&
                  !(noShow && outcome === 'leave-queue')
                ? { status: 'matched', roomId: noShow ? nextRoom : room, boardId }
                : { status: 'waiting', queuedAt: new Date().toISOString(), boardId },
        })
        if (command === 'pulse') pulses++
        return
      }
      if (path.endsWith('/get_room_v2')) {
        const requestedRoom = route.request().postDataJSON().p_room_id
        const ended = noShow && requestedRoom === room
        await route.fulfill({
          json: {
            state: {
              roomId: requestedRoom,
              code: 'ABC1234',
              version: noShow ? 2 : 1,
              settings: { question: 120, answer: 30, review: 60 },
              mode: 'match',
              boardId: 'ai-random',
              board,
              serverNow: new Date().toISOString(),
              you: me,
              players: [
                { id: me, name: 'Alice', slot: 1, ready: ended, rematchReady: false },
                {
                  id: other,
                  name: requestedRoom === nextRoom ? 'Casey' : 'Bob',
                  slot: 2,
                  ready: false,
                  rematchReady: false,
                },
              ],
              game: {
                id: requestedRoom,
                phase: ended ? 'finished' : 'lobby',
                endReason: ended ? 'no_show' : null,
                turn: 0,
                activePlayer: null,
                deadline: null,
                winner: null,
                guesser: null,
                guessCharacter: null,
                result: null,
                pause: null,
                flow: {
                  startedAt: null,
                  writingDeadline: null,
                  reviewDeadline: null,
                  submitted: false,
                  reviewReady: true,
                  ownSubmission: null,
                },
              },
              myCharacter: null,
              reveals: null,
              history: [],
            },
          },
        })
        return
      }
      if (path.endsWith('/heartbeat_room_v2')) {
        await route.fulfill({ json: { version: 1, serverNow: new Date().toISOString() } })
        return
      }
      await route.abort()
    })
    await page.goto('/')
    await page.getByRole('button', { name: 'Find a player', exact: false }).click()
    await page.getByLabel('What should your friend call you?').fill('Alice')
    await page.getByLabel('Board', { exact: true }).selectOption('ai-random')
    await page.getByRole('button', { name: /Find a player/ }).click()
    await expect(page.getByRole('status')).toContainText('Looking for another player')
    if (outcome === 'cancel') {
      await page.getByRole('button', { name: 'Cancel search' }).click()
      await expect(page.getByRole('button', { name: 'Create game' })).toBeVisible()
      expect(await page.evaluate(() => localStorage.getItem('sgw:match-search'))).toBeNull()
    } else {
      await page.reload()
      await expect(page.getByRole('heading', { name: 'Pick your person.' })).toBeVisible()
      await expect(page.locator('.play-status')).toContainText('Bob')
      expect(pulses).toBeGreaterThan(0)
      if (outcome === 'requeue' || outcome === 'leave-queue') {
        noShow = true
        await page.reload()
        await expect(page.getByRole('heading', { name: 'Game ended.' })).toBeVisible()
        await page.clock.runFor(10_100)
        await expect(page.getByRole('status')).toContainText('Finding another player')
        await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0)
        await expect(page.getByRole('dialog')).toHaveCount(0)
        if (outcome === 'requeue') {
          await page.clock.runFor(10_100)
          await expect(page).toHaveURL(new RegExp(nextRoom))
          await expect(page.getByRole('heading', { name: 'Pick your person.' })).toBeVisible()
          await expect(page.locator('.play-status')).toContainText('Casey')
        } else {
          await page.getByRole('button', { name: 'Game menu', exact: true }).click()
          await page.getByRole('button', { name: 'Leave game', exact: true }).click()
          await page.getByRole('button', { name: 'Yes, leave game', exact: true }).click()
          await expect(page.getByRole('heading', { name: 'Let’s play.' })).toBeVisible()
          expect(cancelled).toBe(true)
          expect(await page.evaluate(() => localStorage.getItem('sgw:match-search'))).toBeNull()
        }
      }
    }
    expect(logins).toBe(1)
  })
