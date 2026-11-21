import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { discoverBoards } from './server/catalog'
import { boardHttp } from './server/board-http'

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwind(),
    {
      name: 'folder-boards',
      handleHotUpdate(context) {
        if (resolve(context.file) !== resolve('.generated/boards.json')) return
        context.server.moduleGraph.invalidateAll()
        context.server.ws.send({ type: 'full-reload' })
        return []
      },
      transformIndexHtml() {
        const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
        const origin = (
          env.VITE_APP_URL ||
          (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : '')
        ).replace(/\/$/, '')
        return [
          { tag: 'meta', attrs: { property: 'og:title', content: 'Subjective Guess Who' } },
          {
            tag: 'meta',
            attrs: {
              property: 'og:description',
              content: 'Good questions. Questionable judgment. 24 faces, one secret person.',
            },
          },
          { tag: 'meta', attrs: { property: 'og:type', content: 'website' } },
          { tag: 'meta', attrs: { property: 'og:image', content: `${origin}/social-preview.png` } },
          { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
          { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
          { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
          {
            tag: 'meta',
            attrs: { name: 'twitter:image', content: `${origin}/social-preview.png` },
          },
        ]
      },
      configureServer(server) {
        const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
        server.middlewares.use((request, response, next) => {
          if (request.url?.startsWith('/boards/one-million-faces-v1/'))
            request.url = request.url.replace('/boards/one-million-faces-v1/', '/ai-face-cache/')
          if (request.url?.split('?')[0] !== '/api/boards') {
            next()
            return
          }
          void discoverBoards(process.cwd(), false)
            .then((catalog) => boardHttp(request, response, catalog, env, true))
            .catch(() => {
              response.statusCode = 500
              response.end(JSON.stringify({ error: 'The board catalog could not be loaded.' }))
            })
        })
        let timer: ReturnType<typeof setTimeout> | undefined
        const refresh = (file: string) => {
          if (!resolve(file).startsWith(resolve('public/boards') + sep)) return
          clearTimeout(timer)
          timer = setTimeout(() => {
            void discoverBoards(process.cwd(), false)
              .then(async (catalog) => {
                const content = JSON.stringify(catalog, null, 2) + '\n'
                if ((await readFile('.generated/boards.json', 'utf8').catch(() => '')) !== content)
                  await writeFile('.generated/boards.json', content)
              })
              .catch((error: unknown) => server.config.logger.error(String(error)))
          }, 150)
        }
        server.watcher
          .on('add', refresh)
          .on('unlink', refresh)
          .on('change', refresh)
          .on('addDir', refresh)
          .on('unlinkDir', refresh)
        server.httpServer?.once('close', () => {
          clearTimeout(timer)
          server.watcher
            .off('add', refresh)
            .off('unlink', refresh)
            .off('change', refresh)
            .off('addDir', refresh)
            .off('unlinkDir', refresh)
        })
      },
    },
  ],
  server: { port: 5173, strictPort: true, allowedHosts: ['guesswho.local'] },
  build: { target: 'es2022' },
  test: {
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
}))
