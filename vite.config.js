import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { handleImdRequest } from './server/imd-handler.js'

function imdBridge() {
  return {
    name: 'personality-imd-bridge',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/imd/')) return next()
        await handleImdRequest(req, res)
      })
    },
  }
}

export default defineConfig({
  plugins: [imdBridge()],
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
