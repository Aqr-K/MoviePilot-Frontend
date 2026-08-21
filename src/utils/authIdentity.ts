/**
 * 登录入口的身份绑定标识，与后端 `app/runtime/extensions/auth_entries.py` 一一对应。
 *
 * 该标识是第三方身份绑定表 `provider` 列的取值，也是绑定唯一键的一半：取值一变即换了一个
 * 身份命名空间，已绑定的用户按新标识查不到自己的绑定。配置留空时宿主按「类型@实例名」派生，
 * 显式填写则以填的为准。
 *
 * 两条配置落到同一个标识时后端**两条都不产出登录入口**——让其中一条胜出等于把另一台服务器的
 * 账号静默并进胜出者的身份空间。前端据此在设置页上把冲突显示出来，否则用户看到的是两条配置
 * 都好端端地列着、登录页上却一个按钮都没有。
 */

// 派生标识的分隔符，与后端 _DERIVED_IDENTITY_FORMAT 同形
const DERIVED_IDENTITY_SEPARATOR = '@'

/** 参与身份标识判定的配置字段，任何带这三项的形状都可传入。 */
export interface AuthIdentityHolder {
  type?: string
  name?: string
  identity_provider?: unknown
}

/**
 * 按类型与实例名派生身份标识。
 *
 * @param serviceType 登录入口类型标识
 * @param name 实例名
 * @returns 派生出的身份标识
 */
export function deriveAuthIdentity(serviceType = '', name = ''): string {
  return `${serviceType}${DERIVED_IDENTITY_SEPARATOR}${name}`
}

/**
 * 取一条登录入口配置最终生效的身份标识。
 *
 * 显式填写优先，且与后端一致地去掉首尾空白：只由空白构成的取值算没填，否则用户看到的标识
 * 与库里那一列的取值对不上。
 *
 * @param conf 单条登录入口配置
 * @returns 该配置生效的身份标识
 */
export function resolveAuthIdentity(conf: AuthIdentityHolder): string {
  const declared = conf.identity_provider
  if (typeof declared === 'string' && declared.trim()) return declared.trim()
  return deriveAuthIdentity(conf.type ?? '', conf.name ?? '')
}

/**
 * 找出被多条配置同时认领的身份标识。
 *
 * @param confs 该族的全部登录入口配置
 * @returns 冲突的身份标识集合，无冲突时为空集合
 */
export function findAuthIdentityConflicts(confs: readonly AuthIdentityHolder[]): Set<string> {
  const claims = new Map<string, number>()
  for (const conf of confs) {
    const identity = resolveAuthIdentity(conf)
    claims.set(identity, (claims.get(identity) ?? 0) + 1)
  }
  return new Set([...claims].filter(([, count]) => count > 1).map(([identity]) => identity))
}
