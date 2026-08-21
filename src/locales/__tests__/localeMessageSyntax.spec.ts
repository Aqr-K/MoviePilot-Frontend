import i18n from '@/plugins/i18n'
import { describe, expect, it } from 'vitest'

/**
 * locale 文案的编译期语法守卫。
 *
 * vue-i18n 把裸 `@` 当作 linked message 的前缀，`u115@work` 这样的存储令牌示例会让消息
 * 编译抛 Invalid linked format，而症状是所有渲染组件的用例整批 collect 失败——离「某一行
 * 文案」这个原因非常远，极难排查。字面量 `{'@'}` 才是写出一个 `@` 的正确方式。
 *
 * 这里读的是 locale 的源文本而不是导入后的对象：locale 在测试里已被
 * `unplugin-vue-i18n` 预编译成消息 AST，编译产物里的 `@` 是渲染结果、不是作者写下的东西。
 */

// vue-i18n 认得的 linked message 写法：@:key、@.modifier:key、@:(key)
const LINKED_MESSAGE_PATTERN = /@(?:\.[A-Za-z]+)?[:(]/

// 源文件里的一条文案：键名加单引号或双引号包起来的字面量
const MESSAGE_LINE_PATTERN = /^\s*([A-Za-z0-9_$]+):\s*(['"])(.*)\2,?\s*$/

const localeSources = import.meta.glob('../*.ts', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>

const LOCALE_FILES = ['zh-CN', 'en-US', 'zh-TW'] as const

/** 取一份 locale 源文件里所有单行字面量文案。 */
function messageLinesOf(locale: string): Array<[number, string]> {
  const source = localeSources[`../${locale}.ts`]
  expect(source, `locale source of ${locale} should be readable`).toBeTruthy()
  return source.split('\n').flatMap((line, index) => {
    const matched = MESSAGE_LINE_PATTERN.exec(line)
    return matched ? [[index + 1, matched[3]] as [number, string]] : []
  })
}

describe('locale message syntax', () => {
  it.each(LOCALE_FILES)('writes every literal @ in %s as an escaped literal, not a bare linked prefix', locale => {
    const offenders = messageLinesOf(locale)
      .filter(([, message]) => message.includes('@'))
      // 转义字面量与合法的 linked message 都放行，剩下的裸 @ 会打挂整份 locale 的编译
      .filter(([, message]) => !message.includes(`{'@'}`) && !LINKED_MESSAGE_PATTERN.test(message))
      .map(([line, message]) => `${locale}.ts:${line} ${message}`)
    expect(offenders).toEqual([])
  })

  it.each(LOCALE_FILES)('renders the storage token hint of %s as a real @ so the example is copyable', locale => {
    const original = i18n.global.locale.value
    try {
      i18n.global.locale.value = locale
      expect(i18n.global.t('storage.instanceNameHint')).toContain('u115@work')
      expect(i18n.global.t('storage.instanceNameInvalid')).toContain('@')
    } finally {
      i18n.global.locale.value = original
    }
  })
})
