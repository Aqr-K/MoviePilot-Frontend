import { basename } from 'node:path'
import { federation } from '@module-federation/vite'
import vue from '@vitejs/plugin-vue'
import { lynxPluginPages } from '../compiler/index.js'

const exposes = Object.fromEntries(['Config', 'Page', 'Dashboard', 'AppPage'].map(name => ['./' + name, './Panel.vue']))
export default {
  plugins: [
    vue(),
    federation({
      name: 'Demo' + basename(process.cwd()),
      filename: 'assets/remoteEntry.js',
      exposes,
      shared: { vue: { import: false, requiredVersion: false } },
      dts: false,
    }),
    lynxPluginPages({ exposes, navKeys: { settings: 'Config', main: 'AppPage' } }),
  ],
  build: { target: 'esnext', rollupOptions: { input: './Panel.vue' } },
}
