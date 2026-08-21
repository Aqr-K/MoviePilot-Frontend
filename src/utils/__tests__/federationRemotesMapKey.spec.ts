import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

// 后端把插件版本拼进联邦 remote 名（形如 DemoPlugin@alt#1.2.0），`#` 与 `@` 因此会
// 出现在 remotesMap 的键上。这两个字符会不会被联邦运行时特殊处理，只有它自己的实现
// 说了算：本用例直接读取安装在本仓的插件产物，取出真实的注册与查找代码来跑，而不是
// 靠「看起来是普通对象键」推断。依赖升级后若这条约定被打破，这里先红。
const nodeRequire = createRequire(import.meta.url)
const federationSource = readFileSync(nodeRequire.resolve('@originjs/vite-plugin-federation'), 'utf-8')

// 运行时注册函数在产物里以模板字符串形式内嵌，开发与构建两条链路各有一份
const SET_REMOTE_SIGNATURE = 'function __federation_method_setRemote(remoteName, remoteConfig)'

interface RemotesMapHarness {
  remotesMap: Record<string, unknown>
  setRemote: (remoteName: string, remoteConfig: unknown) => void
}

/**
 * 从指定位置起按花括号配对截出一个函数体
 *
 * @param source 产物源码
 * @param start 函数声明的起始下标
 * @returns 完整的函数源码；括号不配对时为空串
 */
function sliceFunction(source: string, start: number): string {
  const bodyStart = source.indexOf('{', start)
  if (bodyStart < 0) return ''
  let depth = 0
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    else if (source[index] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, index + 1)
    }
  }
  return ''
}

/** 取出产物里全部的 `__federation_method_setRemote` 源码副本。 */
function extractSetRemoteSources(): string[] {
  const sources: string[] = []
  let cursor = federationSource.indexOf(SET_REMOTE_SIGNATURE)
  while (cursor >= 0) {
    const extracted = sliceFunction(federationSource, cursor)
    if (extracted) sources.push(extracted)
    cursor = federationSource.indexOf(SET_REMOTE_SIGNATURE, cursor + SET_REMOTE_SIGNATURE.length)
  }
  return sources
}

/**
 * 用产物里的真实注册函数搭一个 remotesMap 运行环境
 *
 * `remotesMap` 在产物里由 `createRemotesMap` 生成为对象字面量，此处照搬字面量声明，
 * 连同原型链行为一并复现。
 *
 * @param setRemoteSource 从产物取出的注册函数源码
 * @returns 可直接断言的 remotesMap 与注册函数
 */
function instantiateRemotesMap(setRemoteSource: string): RemotesMapHarness {
  // 这里的求值对象就是本用例要验证的依赖产物本身，换成手抄一份实现就失去了实证意义
  // eslint-disable-next-line sonarjs/code-eval
  const factory = new Function(`
    const remotesMap = {};
    ${setRemoteSource}
    return { remotesMap, setRemote: __federation_method_setRemote }
  `)
  return factory() as RemotesMapHarness
}

const setRemoteSources = extractSetRemoteSources()

describe('federation remotesMap 对 # 与 @ 的处理', () => {
  it('产物里确实存在可执行的注册函数副本', () => {
    expect(setRemoteSources.length).toBeGreaterThan(0)
    for (const source of setRemoteSources) {
      expect(source).toContain('remotesMap[remoteName] = remoteConfig')
    }
  })

  it.each(setRemoteSources.map((source, index) => [index, source] as const))(
    '第 %i 份注册函数把含 # 与 @ 的 remote 名当作普通对象键存取',
    (_index, source) => {
      const { remotesMap, setRemote } = instantiateRemotesMap(source)
      const oldConfig = { url: () => Promise.resolve('/plugins/DemoPlugin/1.2.0/remoteEntry.js') }
      const newConfig = { url: () => Promise.resolve('/plugins/DemoPlugin/2.0.0/remoteEntry.js') }

      setRemote('DemoPlugin@alt#1.2.0', oldConfig)
      setRemote('DemoPlugin@alt#2.0.0', newConfig)

      // 键原样落库，没有被截断、转义或归一化
      expect(Object.keys(remotesMap)).toEqual(['DemoPlugin@alt#1.2.0', 'DemoPlugin@alt#2.0.0'])
      expect(Object.prototype.hasOwnProperty.call(remotesMap, 'DemoPlugin@alt#1.2.0')).toBe(true)
      // 升级换名后新旧版本各占一个槽位，互不覆盖
      expect(remotesMap['DemoPlugin@alt#1.2.0']).toBe(oldConfig)
      expect(remotesMap['DemoPlugin@alt#2.0.0']).toBe(newConfig)
    },
  )

  it.each(setRemoteSources.map((source, index) => [index, source] as const))(
    '第 %i 份注册函数让同插件的不同分身各占一个槽位',
    (_index, source) => {
      const { remotesMap, setRemote } = instantiateRemotesMap(source)
      const primary = { url: () => Promise.resolve('/plugins/DemoPlugin/1.0.0/remoteEntry.js') }
      const alternate = { url: () => Promise.resolve('/plugins/DemoPlugin@alt/1.0.0/remoteEntry.js') }

      setRemote('DemoPlugin#1.0.0', primary)
      setRemote('DemoPlugin@alt#1.0.0', alternate)

      expect(remotesMap['DemoPlugin#1.0.0']).toBe(primary)
      expect(remotesMap['DemoPlugin@alt#1.0.0']).toBe(alternate)
    },
  )

  it('运行时按原始 remote 名查找，取用前不做任何字符加工', () => {
    // `__federation_method_ensure` 是唯一的查找入口，两条链路各一份
    const lookups = federationSource.match(/const remote = remotesMap\[remoteId\];/g) ?? []
    expect(lookups.length).toBe(setRemoteSources.length)
  })

  it('包内唯一的名称字符过滤只作用于 shared 与 expose 名，不碰 remote 名', () => {
    // NAME_CHAR_REG 为 [0-9a-zA-Z@_-]，不含 `#`；若它被用在 remote 名上，版本号后缀会被吃掉
    expect(federationSource).toContain('const NAME_CHAR_REG = new RegExp("[0-9a-zA-Z@_-]+")')
    expect(federationSource).not.toMatch(/removeNonRegLetter\(\s*remoteName/)
    expect(federationSource).not.toMatch(/removeNonRegLetter\(\s*remoteId/)
  })
})
