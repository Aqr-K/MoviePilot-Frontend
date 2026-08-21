import {
  findStorageConf,
  isLocalStorage,
  isSameStorage,
  isSameStorageType,
  isStorageInstanceName,
  isStorageType,
  joinStorageToken,
  joinStorageUri,
  pathOfUri,
  splitStorageToken,
  splitStorageUri,
  storageInstanceOf,
  storageOfUri,
  StorageTokenError,
  storageTokenOfConf,
  storageTokenParts,
  storageTypeOf,
} from '@/utils/storageToken'
import { describe, expect, it } from 'vitest'

describe('storage token split and join', () => {
  it.each([
    ['u115', 'u115', null],
    ['u115@work', 'u115', 'work'],
    ['local', 'local', null],
    ['alistgo@主库', 'alistgo', '主库'],
    ['custom2@a.b-c_d', 'custom2', 'a.b-c_d'],
    ['', '', null],
  ])('splits %s into type and instance', (token, type, instance) => {
    expect(splitStorageToken(token)).toEqual({ type, instance })
  })

  it.each([
    [['u115', 'work'], 'u115@work'],
    [['u115', null], 'u115'],
    [['u115', ''], 'u115'],
    [['u115', undefined], 'u115'],
  ])('joins %j into %s', ([type, instance], expected) => {
    expect(joinStorageToken(type as string, instance as string | null)).toBe(expected)
  })

  it.each(['u115', 'u115@work', 'local', 'alistgo@主库'])('round-trips %s through split and join', token => {
    const { type, instance } = splitStorageToken(token)
    expect(joinStorageToken(type, instance)).toBe(token)
  })

  it('treats a bare token as the default instance rather than an instance literally named after the type', () => {
    expect(storageInstanceOf('u115')).toBeNull()
    expect(storageInstanceOf('u115@u115')).toBe('u115')
    // 裸令牌与同类型的具名令牌是两个不同的实例，两者之间的转移是跨实例转移
    expect(isSameStorage('u115', 'u115@u115')).toBe(false)
    expect(isSameStorageType('u115', 'u115@u115')).toBe(true)
  })
})

describe('malformed storage tokens', () => {
  // 带实例分隔符却写错的令牌一律拒绝，而不是退回某个合法取值
  it.each(['u115@', '@work', 'u115@wo rk', 'u115@a/b', 'u115@a:b', 'u115@a@b', 'u@work', 'u115@a\\b'])(
    'rejects %s at the parse boundary',
    token => {
      expect(() => splitStorageToken(token)).toThrow(StorageTokenError)
    },
  )

  it('rejects an instance name longer than the backend limit', () => {
    expect(() => splitStorageToken(`u115@${'a'.repeat(65)}`)).toThrow(StorageTokenError)
    expect(splitStorageToken(`u115@${'a'.repeat(64)}`).instance).toBe('a'.repeat(64))
  })

  it('answers "no storage" instead of throwing on the comparison helpers', () => {
    expect(storageTokenParts('u115@')).toBeNull()
    expect(storageTypeOf('u115@')).toBe('')
    expect(storageInstanceOf('u115@')).toBeNull()
  })

  it('never lets a malformed token equal a valid one, nor degrade to local', () => {
    expect(isSameStorage('u115@', 'u115')).toBe(false)
    expect(isSameStorage('u115@', 'u115@')).toBe(false)
    expect(isSameStorageType('u115@', 'u115')).toBe(false)
    expect(isLocalStorage('local@')).toBe(false)
    expect(isLocalStorage('')).toBe(false)
  })

  it.each([
    ['u115', true],
    ['local', true],
    ['a', false],
    ['1abc', false],
    ['u115@work', false],
    ['', false],
  ])('validates %s as a storage type: %s', (value, expected) => {
    expect(isStorageType(value)).toBe(expected)
  })

  it.each([
    ['work', true],
    ['主库', true],
    ['a b', false],
    ['a/b', false],
    ['a@b', false],
    ['', false],
  ])('validates %s as an instance name: %s', (value, expected) => {
    expect(isStorageInstanceName(value)).toBe(expected)
  })
})

describe('storage identity comparison', () => {
  it.each([
    ['u115@work', 'u115@work', true],
    ['u115@work', 'u115@home', false],
    ['u115', 'u115', true],
    ['local', 'local', true],
    ['', 'local', false],
  ])('compares %s with %s as same instance: %s', (left, right, expected) => {
    expect(isSameStorage(left, right)).toBe(expected)
  })

  it('recognises a named local instance as local', () => {
    expect(isLocalStorage('local@nas')).toBe(true)
    expect(isLocalStorage('u115@nas')).toBe(false)
  })
})

describe('file uri split and join', () => {
  it.each([
    ['/media/movie', null, '/media/movie'],
    ['u115:/media/movie', 'u115', '/media/movie'],
    ['u115@work:/media/movie', 'u115@work', '/media/movie'],
    // 单字母的 Windows 盘符不满足存储标识的长度下限，整串按路径解析
    ['Z:/media', null, 'Z:/media'],
    // 首段含路径分隔符时一律视为路径本身
    ['/a/b:c', null, '/a/b:c'],
    ['', null, ''],
  ])('splits uri %s', (uri, storage, path) => {
    expect(splitStorageUri(uri)).toEqual({ storage, path })
  })

  it('rejects a uri whose storage segment is a malformed token', () => {
    expect(() => splitStorageUri('u115@:/media')).toThrow(StorageTokenError)
    expect(() => splitStorageUri('u115@a b:/media')).toThrow(StorageTokenError)
  })

  it.each([
    [['local', '/media'], '/media'],
    [[null, '/media'], '/media'],
    [['u115', '/media'], 'u115:/media'],
    [['u115@work', '/media'], 'u115@work:/media'],
  ])('joins %j into %s', ([storage, path], expected) => {
    expect(joinStorageUri(storage as string | null, path as string)).toBe(expected)
  })

  it.each(['u115:/media/movie', 'u115@work:/media/movie', '/media/movie'])('round-trips uri %s', uri => {
    const { storage, path } = splitStorageUri(uri)
    expect(joinStorageUri(storage, path)).toBe(uri)
  })

  it('keeps the malformed uri visible instead of silently reinterpreting it', () => {
    // 非法令牌不冒充任何合法存储，路径原样交还让调用方能把它显示出来给用户修
    expect(storageOfUri('u115@:/media')).toBe('')
    expect(pathOfUri('u115@:/media')).toBe('u115@:/media')
    expect(storageOfUri('/media')).toBe('local')
    expect(pathOfUri('u115@work:/media')).toBe('/media')
  })
})

describe('storage instance configuration tokens', () => {
  const storages = [
    { type: 'local', name: 'local', bare_token_target: true },
    { type: 'u115', name: 'u115', bare_token_target: true },
    { type: 'u115', name: 'work', bare_token_target: false },
  ]

  it('gives the bare token to the instance that receives instance-less paths', () => {
    // 承接裸令牌的那一份继续用裸令牌，存量路径 u115:/media 的指向因此与今天完全一致
    expect(storageTokenOfConf(storages[1])).toBe('u115')
    expect(storageTokenOfConf(storages[2])).toBe('u115@work')
    expect(storageTokenOfConf(storages[0])).toBe('local')
  })

  it('resolves a bare token only to the instance that receives it, never to the first of its type', () => {
    expect(findStorageConf(storages, 'u115')).toBe(storages[1])
    expect(findStorageConf(storages, 'u115@work')).toBe(storages[2])
    const orphaned = [{ type: 'alipan', name: 'a', bare_token_target: false }]
    // 该类型没有一份承接裸令牌时不猜，绝不取第一个
    expect(findStorageConf(orphaned, 'alipan')).toBeUndefined()
    expect(findStorageConf(orphaned, 'alipan@a')).toBe(orphaned[0])
  })

  it('keeps the bare spelling when the payload carries no bare-token pointer at all', () => {
    // 字段缺席表示这份数据不带兼容指针，此时该类型只可能有一份实例，
    // 给出裸令牌才不会让 u115:/media 这样的存量路径匹配不上任何选项
    expect(storageTokenOfConf({ type: 'local', name: '本地' })).toBe('local')
    // 显式的 false 是「这一份不承接」，与缺席不是一回事
    expect(storageTokenOfConf({ type: 'local', name: '本地', bare_token_target: false })).toBe('local@本地')
  })

  it('resolves nothing for a malformed token', () => {
    expect(findStorageConf(storages, 'u115@')).toBeUndefined()
    expect(findStorageConf(storages, '')).toBeUndefined()
  })
})
