// electron.vite.config.ts
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";
import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import { quasar, transformAssetUrls } from "@quasar/vite-plugin";
var __electron_vite_injected_import_meta_url = "file:///F:/Develop/demo/comb-desktop/electron.vite.config.ts";
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
        "@shared": resolve("src/shared")
      }
    },
    plugins: [
      vue({
        template: { transformAssetUrls }
      }),
      quasar({
        sassVariables: fileURLToPath(
          new URL("./src/renderer/src/assets/scss/quasar-variables.scss", __electron_vite_injected_import_meta_url)
        )
      })
    ],
    css: {
      preprocessorOptions: {
        scss: {
          additionalData: fileURLToPath(
            new URL("./src/renderer/src/assets/scss/variables.scss", __electron_vite_injected_import_meta_url)
          )
        }
      }
    }
  }
});
export {
  electron_vite_config_default as default
};
