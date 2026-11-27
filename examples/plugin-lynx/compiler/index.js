import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pluginReactLynx } from '@lynx-js/react-rsbuild-plugin'
import { createRspeedy } from '@lynx-js/rspeedy'
import { compilePages } from './sfc.js'

/** Web 联邦和 Lynx 共用 exposes。navKeys 将 App 命名入口关联到同一个组件导出。 */
export function lynxPluginPages({ exposes, navKeys = {} }) {
  let root
  return {
    name: 'moviepilot-lynx-plugin-pages',
    apply: 'build',
    configResolved(config) {
      root = config.root
    },
    async generateBundle() {
      const entries = Object.create(null)
      for (const [key, path] of Object.entries(exposes)) {
        if (!/^\.\/[A-Za-z][A-Za-z0-9_]*$/.test(key)) throw new Error('无效的联邦入口 ' + key)
        entries[key.slice(2)] = path
      }
      for (const entry of Object.values(navKeys)) {
        if (!Object.hasOwn(entries, entry)) throw new Error('navKey 引用了未知入口 ' + entry)
      }
      const source = await compilePages(root, entries)
      const toolDir = dirname(dirname(fileURLToPath(import.meta.url)))
      const cache = join(toolDir, 'node_modules', '.cache', 'moviepilot-lynx')
      await mkdir(cache, { recursive: true })
      const tmp = await mkdtemp(join(cache, 'build-'))
      try {
        await writeFile(join(tmp, 'pages.js'), source)
        const builder = await createRspeedy({
          cwd: tmp,
          rspeedyConfig: {
            plugins: [pluginReactLynx({ engineVersion: '3.6', experimental_isLazyBundle: true })],
            source: { entry: { pages: './pages.js' } },
          },
        })
        const build = await builder.build()
        await build.close()
        const bundle = await readFile(join(tmp, 'dist/pages.lynx.bundle'))
        const sha256 = createHash('sha256').update(bundle).digest('hex')
        const file = sha256 + '.lynx.bundle'
        this.emitFile({ type: 'asset', fileName: 'lynx/' + file, source: bundle })
        this.emitFile({
          type: 'asset',
          fileName: 'lynx/manifest.json',
          source: JSON.stringify({ version: 1, controls: 1, file, sha256, entries: Object.keys(entries), navKeys }),
        })
      } finally {
        await rm(tmp, { recursive: true, force: true })
      }
    },
  }
}
