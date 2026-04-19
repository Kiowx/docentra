import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import path from 'node:path'

export default defineConfig(({ command, mode }) => {
  const withElectron = command === 'build' || mode === 'electron'

  return {
    plugins: [
      react(),
      withElectron && electron({
        main: {
          entry: 'electron/main.ts',
          onstart({ startup }) {
            const env = { ...process.env }
            delete env.ELECTRON_RUN_AS_NODE
            startup(['.', '--no-sandbox'], { env })
          },
        },
        preload: {
          input: 'electron/preload.ts',
        },
      }),
    ].filter(Boolean),
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      host: true,
    },
  }
})
