/**
 * @file electron.vite.config.ts
 * @description Configuration file for Electron with Vite.
 * @see https://electron-vite.org/
 */
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { quasar, transformAssetUrls } from '@quasar/vite-plugin'

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
    plugins: [
      vue({
        template: { transformAssetUrls }
      }),
      quasar({
        sassVariables: fileURLToPath(
          new URL('./src/renderer/src/assets/scss/quasar-variables.scss', import.meta.url)
        )
      })
    ],
    css: {
      preprocessorOptions: {
        scss: {
          additionalData: fileURLToPath(
            new URL('./src/renderer/src/assets/scss/variables.scss', import.meta.url)
          )
        }
      }
    }
  }
})
