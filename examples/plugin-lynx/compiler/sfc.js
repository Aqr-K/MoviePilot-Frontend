import { readFile } from 'node:fs/promises'
import { dirname, extname } from 'node:path'
import { babelParse, compileScript, compileTemplate, parse } from '@vue/compiler-sfc'
import babelTraverse from '@babel/traverse'
import { build } from 'esbuild'

const controls = new Set([
  'div',
  'span',
  'p',
  'template',
  'v-card',
  'v-card-title',
  'v-card-text',
  'v-row',
  'v-col',
  'v-btn',
  'v-switch',
])
const browserGlobals = new Set(['document', 'window', 'localStorage', 'sessionStorage', 'HTMLElement', 'navigator'])

function diagnostic(filename, pos, message) {
  throw new Error(`${filename}:${pos.line}:${pos.column}: ${message}`)
}

function checkScript(source, filename, start, expression = false) {
  const ast = babelParse(expression ? '(' + source + ')' : source, { sourceType: 'module', plugins: ['typescript'] })
  babelTraverse.default(ast, {
    ReferencedIdentifier(path) {
      if (browserGlobals.has(path.node.name) && !path.scope.hasBinding(path.node.name, true)) {
        const { line, column } = path.node.loc.start
        diagnostic(
          filename,
          { line: start.line + line - 1, column: column + (line === 1 ? start.column : 1) - Number(expression) },
          'Lynx 不支持 DOM API ' + path.node.name,
        )
      }
    },
  })
}

function checkNode(node, filename) {
  if (node.type === 1) {
    const tag = node.tag.replace(/[A-Z]/g, (c, offset) => (offset ? '-' : '') + c.toLowerCase())
    if (!controls.has(tag)) diagnostic(filename, node.loc.start, 'Lynx 不支持组件 <' + node.tag + '>')
    for (const prop of node.props) {
      const allowed = ['if', 'else', 'else-if', 'for', 'bind', 'on', 'model']
      const name = prop.type === 7 ? prop.arg?.content : prop.name
      if (prop.type === 7 && (!allowed.includes(prop.name) || prop.modifiers.length || prop.arg?.isStatic === false)) {
        diagnostic(filename, prop.loc.start, 'Lynx 不支持指令 ' + prop.loc.source)
      }
      const supported =
        name === 'key' ||
        (tag === 'v-btn' && ['disabled', 'click'].includes(name)) ||
        (tag === 'v-switch' && ['label', 'disabled', 'modelValue', 'update:modelValue'].includes(name))
      if ((name && !supported) || (prop.name === 'model' && tag !== 'v-switch')) {
        diagnostic(filename, prop.loc.start, 'Lynx 不支持属性 ' + prop.loc.source)
      }
      if (prop.exp && prop.name !== 'for') checkScript(prop.exp.content, filename, prop.exp.loc.start, true)
    }
  }
  if (node.type === 5) checkScript(node.content.content, filename, node.content.loc.start, true)
  for (const child of node.children ?? []) checkNode(child, filename)
}

/** 将各入口的 Vue 组件编译为工厂；Vue 运行时由当前 Lynx 宿主实例注入。 */
export async function compilePages(root, entries) {
  const result = await build({
    stdin: {
      contents: Object.entries(entries)
        .map(([name, path]) => `export { default as ${name} } from ${JSON.stringify(path)}`)
        .join('\n'),
      resolveDir: root,
    },
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'neutral',
    target: 'es2018',
    external: ['vue'],
    plugins: [
      {
        name: 'moviepilot-lynx-vue',
        setup(build) {
          build.onLoad({ filter: /\.[cm]?[jt]s$/ }, async ({ path }) => {
            const source = await readFile(path, 'utf8')
            checkScript(source, path, { line: 1, column: 1 })
            return { contents: source, loader: extname(path).endsWith('ts') ? 'ts' : 'js', resolveDir: dirname(path) }
          })
          build.onLoad({ filter: /\.vue$/ }, async ({ path }) => {
            const source = await readFile(path, 'utf8')
            const { descriptor, errors } = parse(source, { filename: path })
            if (errors.length) throw errors[0]
            if (!descriptor.template) throw new Error(path + ': 缺少 template')
            if (descriptor.styles.length) diagnostic(path, descriptor.styles[0].loc.start, 'Lynx 不支持此样式块')
            checkNode(descriptor.template.ast, path)
            for (const script of [descriptor.script, descriptor.scriptSetup]) {
              if (script) checkScript(script.content, path, script.loc.start)
            }
            const id = 'mp-lynx'
            const script =
              descriptor.script || descriptor.scriptSetup
                ? compileScript(descriptor, { id, genDefaultAs: 'component' })
                : null
            const template = compileTemplate({
              id,
              source: descriptor.template.content,
              filename: path,
              compilerOptions: { bindingMetadata: script?.bindings, hoistStatic: false },
            })
            if (template.errors.length) throw template.errors[0]
            return {
              contents: [
                script?.content ?? 'const component = {}',
                template.code,
                'component.render = render; export default component',
              ].join('\n'),
              loader: 'ts',
              resolveDir: dirname(path),
            }
          })
        },
      },
    ],
  })
  return `export function createPages(vue) {\nconst module = { exports: {} };\nfunction require(id) { if (id === 'vue') return vue; throw Error(id) }\n${result.outputFiles[0].text}\nreturn module.exports\n}`
}
