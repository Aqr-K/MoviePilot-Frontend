import { defineConfig } from '@lynx-js/rspeedy'
import { pluginReactLynx } from '@lynx-js/react-rsbuild-plugin'

export default defineConfig({
  plugins: [pluginReactLynx({ engineVersion: '3.6' })],
  source: { entry: { main: './src/index.tsx' } },
})
