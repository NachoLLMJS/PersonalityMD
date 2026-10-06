import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { handleImdRequest } from './server/imd-handler.js'
import { handleHiggsfieldRequest } from './server/higgsfield-handler.js'

function localApiBridge() {
  return {
    name: 'personality-development-api-bridge',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.startsWith('/api/imd/')) return handleImdRequest(req, res)
        if (req.url?.startsWith('/api/higgsfield/')) return handleHiggsfieldRequest(req, res)
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [localApiBridge()],
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        create: resolve(import.meta.dirname, 'create.html'),
        docs: resolve(import.meta.dirname, 'docs.html'),
        explorer: resolve(import.meta.dirname, 'explorer.html'),
        personalities: resolve(import.meta.dirname, 'personalities.html'),
      },
    },
  },
})
