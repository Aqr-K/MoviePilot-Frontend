import type { StorageConf } from '@/api/types'

/**
 * 存储令牌工具，与后端 `app/schemas/file.py` 的 split_storage / join_storage /
 * is_same_storage 一一对应。
 *
 * 存储令牌形如 `u115` 或 `u115@work`：前者是裸令牌，指该存储类型当前承接裸令牌的
 * 那一份实例；后者指该类型下名为 `work` 的具名实例。文件 URI 形如 `u115@work:/media`。
 *
 * 畸形令牌的约定：解析入口 `splitStorageToken` 直接抛 `StorageTokenError`，其余
 * 判定入口一律答「没有存储」——`storageTokenParts` 给 null、`storageTypeOf` 给空串、
 * 各类相等判定给 false。畸形令牌因此既不会被静默当成 `local`，也不会与任何合法
 * 令牌相等，与后端「无效令牌不参与任何相等判断」的口径一致。
 */

/** 存储实例名与存储标识之间的分隔符，如 u115@work。 */
export const STORAGE_INSTANCE_SEPARATOR = '@'

/** 存储实例名的最大长度，与后端 STORAGE_INSTANCE_MAX_LENGTH 一致。 */
export const STORAGE_INSTANCE_MAX_LENGTH = 64

/** 本地存储的类型标识。 */
export const LOCAL_STORAGE_TYPE = 'local'

// 存储标识：字母开头且长度不小于 2，与单字母的 Windows 盘符区分开
const STORAGE_SCHEME_SOURCE = '[A-Za-z][A-Za-z0-9_.+-]+'

// 存储实例名：非空、不含空白与控制字符，且不含 : / \ @ 四个会造成歧义解析的分隔符
const STORAGE_INSTANCE_SOURCE = `[^\\u0000-\\u0020\\u007f:/\\\\${STORAGE_INSTANCE_SEPARATOR}]{1,${STORAGE_INSTANCE_MAX_LENGTH}}`

// u 标志让量词按码位而非 UTF-16 码元计数，中日韩实例名的长度上限才与后端一致
const STORAGE_SCHEME_PATTERN = new RegExp(`^${STORAGE_SCHEME_SOURCE}$`, 'u')
const STORAGE_INSTANCE_PATTERN = new RegExp(`^${STORAGE_INSTANCE_SOURCE}$`, 'u')
const STORAGE_TOKEN_PATTERN = new RegExp(
  `^(${STORAGE_SCHEME_SOURCE})(?:${STORAGE_INSTANCE_SEPARATOR}(${STORAGE_INSTANCE_SOURCE}))?$`,
  'u',
)

/** Windows 盘符绝对路径，如 Z:/Downloads 或 Z:\Downloads。 */
const WINDOWS_DRIVE_PATTERN = /^[A-Za-z]:[\\/]/

/** 存储令牌的组成部分。 */
export interface StorageTokenParts {
  /** 存储标识，即存储类型 */
  type: string
  /** 实例名；裸令牌为 null，表示该类型当前承接裸令牌的那一份实例 */
  instance: string | null
}

/** 文件 URI 的组成部分。 */
export interface StorageUriParts {
  /** 存储令牌；URI 没有存储前缀时为 null */
  storage: string | null
  /** 去掉存储前缀后的路径，原样保留 */
  path: string
}

/** 令牌写法非法时抛出，供调用方把错误呈现给用户而不是退回某个合法值。 */
export class StorageTokenError extends Error {
  constructor(token: string) {
    super(
      `存储令牌 ${token} 不合法：存储标识需为字母开头、长度不小于 2，` +
        `实例名需为 1-${STORAGE_INSTANCE_MAX_LENGTH} 个字符且不含空白或 : / \\ ${STORAGE_INSTANCE_SEPARATOR}`,
    )
    this.name = 'StorageTokenError'
  }
}

/** 判断字符串能否作为文件 URI 的存储标识。 */
export function isStorageType(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && STORAGE_SCHEME_PATTERN.test(value)
}

/** 判断字符串能否作为存储实例名。 */
export function isStorageInstanceName(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && STORAGE_INSTANCE_PATTERN.test(value)
}

/**
 * 拆分存储令牌为存储标识与实例名。
 *
 * 不带实例分隔符的令牌原样作为存储标识返回，实例名为 null；此时不校验标识本身的
 * 写法，按标识直取的既有调用不受影响。
 *
 * @throws {StorageTokenError} 令牌带实例分隔符但整体不是合法令牌
 */
export function splitStorageToken(storage?: string | null): StorageTokenParts {
  const value = storage ?? ''
  if (!value) return { type: '', instance: null }
  const matched = STORAGE_TOKEN_PATTERN.exec(value)
  if (matched) return { type: matched[1], instance: matched[2] ?? null }
  if (value.includes(STORAGE_INSTANCE_SEPARATOR)) throw new StorageTokenError(value)
  return { type: value, instance: null }
}

/** 拆分存储令牌用于比较，令牌为空或写法非法时给出 null，绝不退回某个合法值。 */
export function storageTokenParts(storage?: string | null): StorageTokenParts | null {
  if (!storage) return null
  try {
    return splitStorageToken(storage)
  } catch {
    return null
  }
}

/** 把存储标识与实例名拼成存储令牌，实例名为空即拼出裸令牌。 */
export function joinStorageToken(type?: string | null, instance?: string | null): string {
  if (!instance) return type || ''
  return `${type ?? ''}${STORAGE_INSTANCE_SEPARATOR}${instance}`
}

/** 取存储令牌的类型部分，实例名不参与；令牌为空或写法非法时为空串。 */
export function storageTypeOf(storage?: string | null): string {
  return storageTokenParts(storage)?.type ?? ''
}

/** 取存储令牌的实例名部分；裸令牌、空令牌与非法令牌均为 null。 */
export function storageInstanceOf(storage?: string | null): string | null {
  return storageTokenParts(storage)?.instance ?? null
}

/** 判断存储令牌是否指向本地存储类型，具名实例同样成立。 */
export function isLocalStorage(storage?: string | null): boolean {
  return storageTypeOf(storage) === LOCAL_STORAGE_TYPE
}

/** 判断两个存储令牌是否属于同一存储类型，实例名不参与。 */
export function isSameStorageType(left?: string | null, right?: string | null): boolean {
  const leftType = storageTypeOf(left)
  return leftType !== '' && leftType === storageTypeOf(right)
}

/**
 * 判断两个存储令牌是否指向同一存储实例。
 *
 * 裸令牌指该类型当前承接裸令牌的实例，与同类型的具名令牌算作不同实例：u115 与
 * u115@work 之间的转移是跨实例转移，而非同一存储内的移动。
 */
export function isSameStorage(left?: string | null, right?: string | null): boolean {
  const leftParts = storageTokenParts(left)
  if (!leftParts) return false
  const rightParts = storageTokenParts(right)
  if (!rightParts) return false
  return leftParts.type === rightParts.type && leftParts.instance === rightParts.instance
}

/**
 * 拆分文件 URI 的存储令牌与路径，路径原样保留。
 *
 * 存储令牌只在首个冒号之前的一段中识别，该段含路径分隔符时一律视为路径本身；
 * Windows 盘符只有一个字母，不满足存储标识的长度下限，因此 Z:/media 会被识别成路径。
 *
 * @throws {StorageTokenError} 存储令牌位置带实例分隔符但不是合法令牌
 */
export function splitStorageUri(uri?: string | null): StorageUriParts {
  const value = uri ?? ''
  const separatorIndex = value.indexOf(':')
  if (separatorIndex < 0) return { storage: null, path: value }
  const head = value.slice(0, separatorIndex)
  const rest = value.slice(separatorIndex + 1)
  if (head.includes('/') || head.includes('\\')) return { storage: null, path: value }
  if (head.includes(STORAGE_INSTANCE_SEPARATOR)) {
    splitStorageToken(head)
    return { storage: head, path: rest }
  }
  if (!STORAGE_SCHEME_PATTERN.test(head)) return { storage: null, path: value }
  return { storage: head, path: rest }
}

/** 把存储令牌与路径拼成文件 URI，本地存储直接给出路径。 */
export function joinStorageUri(storage?: string | null, path?: string | null): string {
  const value = path ?? ''
  if (!storage || isLocalStorage(storage)) return value
  return `${storage}:${value}`
}

/** 取文件 URI 的存储令牌，无前缀时回落为本地存储；令牌非法时为空串。 */
export function storageOfUri(uri?: string | null): string {
  try {
    return splitStorageUri(uri).storage ?? LOCAL_STORAGE_TYPE
  } catch {
    return ''
  }
}

/** 取文件 URI 去掉存储前缀后的路径；令牌非法时原样给出输入。 */
export function pathOfUri(uri?: string | null): string {
  try {
    return splitStorageUri(uri).path
  } catch {
    return uri ?? ''
  }
}

/** 判断路径是否为 Windows 盘符绝对路径，这类路径不带存储前缀。 */
export function isWindowsDrivePath(path?: string | null): boolean {
  return !!path && WINDOWS_DRIVE_PATTERN.test(path)
}

/**
 * 取一条存储实例配置对应的存储令牌。
 *
 * 承接裸令牌的那一份用裸令牌，其余用具名令牌：每个存储类型恰好有一份承接裸令牌，
 * 让它继续用裸令牌，存量路径 `u115:/media` 的指向就与今天完全一致；同类型的其余
 * 实例才需要写出实例名来区分。
 *
 * 整条配置没有这个字段时同样给裸令牌：字段缺席表示这份数据来自不带兼容指针的来源，
 * 此时该类型只可能有一份实例，按今天的拼法给出裸令牌才不会让存量路径匹配不上；显式
 * 的 false 是「这一份不承接」，与缺席不是一回事，照常给具名令牌。
 */
export function storageTokenOfConf(conf: Pick<StorageConf, 'type' | 'name' | 'bare_token_target'>): string {
  const type = conf.type ?? ''
  if (conf.bare_token_target ?? true) return type
  return joinStorageToken(type, conf.name)
}

/** 在一组存储实例配置里找出令牌指向的那一份，找不到时为 undefined。 */
export function findStorageConf<T extends Pick<StorageConf, 'type' | 'name' | 'bare_token_target'>>(
  storages: readonly T[],
  storage?: string | null,
): T | undefined {
  const parts = storageTokenParts(storage)
  if (!parts) return undefined
  if (parts.instance === null) {
    // 裸令牌只落到承接它的那一份；该类型一份都没承接时不猜，绝不取第一个
    return storages.find(item => item.type === parts.type && item.bare_token_target)
  }
  return storages.find(item => item.type === parts.type && item.name === parts.instance)
}
