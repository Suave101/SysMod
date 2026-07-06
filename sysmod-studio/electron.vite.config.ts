import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite' // 1. Import the new v4 plugin
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    optimizeDeps: {
      // Monaco-editor has hundreds of lazy ESM chunks; let Rollup handle it
      // directly at build time instead of pre-bundling with esbuild.
      exclude: ['monaco-editor'],
    },
    plugins: [
      react(),
      tailwindcss() // 2. Add it right here to the renderer pipeline
    ]
  }
})