import api from './index'
import type {
  ServiceConfigProviderIssue,
  ServiceFamilyInfo,
  ServiceInstanceConfigInfo,
  ServiceInstanceConfigPayload,
  ServiceTypeInfo,
} from './types'

/**
 * 服务实例配置端点适配层，对应后端 `app/api/endpoints/service.py`。
 *
 * 下载器、媒体服务器、消息通知、存储与登录认证五族的实例配置共用同一组端点，按
 * 「能力标签加类型标识加实例名」定位一条。写入是逐条的：只改这一行，不读整族也不
 * 回写整族，因此两位管理员同时改不同的配置不会互相覆盖。
 */

/** 宿主自带的五个服务族的能力标签。扩展可以带进新的族，实际清单以 /service/families 为准。 */
export const SERVICE_CAPABILITIES = ['downloader', 'mediaserver', 'notification', 'storage', 'auth'] as const

export type ServiceCapability = (typeof SERVICE_CAPABILITIES)[number]

/**
 * 各族由宿主消费的实例级字段。
 *
 * 这几个字段平铺在写入载荷的顶层由宿主自己读，其余键一律归 `config` 由类型实现自己读。
 * 两者不能混：宿主字段混进 `config` 会被声明了 `additionalProperties: false` 的类型判为
 * 违约、整条配置被拒收；类型字段留在顶层则会被宿主整形时丢弃。
 */
export const SERVICE_HOST_FIELDS: Readonly<Record<string, readonly string[]>> = {
  downloader: ['path_mapping'],
  mediaserver: ['sync_interval', 'sync_libraries'],
  notification: ['switchs'],
  storage: ['bare_token_target'],
  auth: ['identity_provider'],
}

/**
 * 没有默认调用目标的族。
 *
 * 登录认证族里用户点的永远是具体某个入口，不存在「调用未指定实例」这回事，后端对该族
 * 的置位请求一律以 400 退回。族目录端点不下发这项元数据，故此处按宿主自带的五族写死；
 * 扩展带进的新族一律按「有默认调用目标」处理，与后端对未知族的判定一致。
 */
const SERVICE_CAPABILITIES_WITHOUT_DEFAULT_TARGET: ReadonlySet<string> = new Set(['auth'])

/** 裸令牌兼容指针所在的族与字段名，它与默认调用目标是两个独立开关，互不蕴含。 */
export const SERVICE_BARE_TOKEN_FIELD: Readonly<Record<string, string>> = {
  storage: 'bare_token_target',
}

/** 凭据下发时的占位取值，原样回传即表示该项未改动。 */
export const SERVICE_SECRET_MASK = '********'

/** 「提供方已消失」的成因代码，三者的处置动作各不相同。 */
export const SERVICE_PROVIDER_ISSUE_REASONS = ['not_installed', 'disabled', 'start_failed'] as const

export type ServiceProviderIssueReason = (typeof SERVICE_PROVIDER_ISSUE_REASONS)[number]

/**
 * 一条服务实例配置在表单上的外壳字段。
 *
 * 宿主消费的实例级字段不在这里逐族列举——它们各族不同，且各族已有自己的配置模型
 * （`DownloaderConf`、`StorageConf` 等）。本类型刻意不带索引签名：带了之后那些配置模型
 * 就传不进来了，接口类型不满足索引签名是 TypeScript 的既定规则。
 */
export interface ServiceInstanceShell {
  type?: string
  name?: string
  enabled?: boolean
  config?: Record<string, unknown>
  /** 是否为本族的默认调用目标，只读展示用，写入走专用端点 */
  default?: boolean
}

/** 平铺形状：外壳字段与宿主消费的实例级字段同层，类型专属配置在 config 里。 */
export type ServiceInstanceForm = ServiceInstanceShell & Record<string, unknown>

/** 返回该族由宿主消费的实例级字段名，未知族为空数组。 */
export function serviceHostFields(capability: string): readonly string[] {
  return SERVICE_HOST_FIELDS[capability] ?? []
}

/** 判断该族有没有默认调用目标，据此决定要不要给出「设为默认」入口。 */
export function serviceSupportsDefaultTarget(capability: string): boolean {
  return !SERVICE_CAPABILITIES_WITHOUT_DEFAULT_TARGET.has(capability)
}

/** 返回该族裸令牌兼容指针的字段名，没有兼容指针的族为 undefined。 */
export function serviceBareTokenField(capability: string): string | undefined {
  return SERVICE_BARE_TOKEN_FIELD[capability]
}

/** 判断一个取值是不是下发时的凭据掩码，校验器据此跳过、不把掩码当真实值判断。 */
export function isMaskedSecret(value: unknown): value is string {
  return value === SERVICE_SECRET_MASK
}

/**
 * 把下发的掩码路径换算成表单上的路径。
 *
 * 下发形状里宿主载荷装在 `host_config` 下，表单上它是平铺的，故去掉这一层前缀；
 * `config` 下的路径两处一致，原样保留。
 */
export function maskedFormPaths(maskedFields: readonly string[] = []): string[] {
  return maskedFields.map(path => (path.startsWith('host_config.') ? path.slice('host_config.'.length) : path))
}

/** 按路径取出表单上的取值，路径中的 `a.b[0].c` 逐段下钻，取不到时为 undefined。 */
function valueAtPath(source: unknown, path: string): unknown {
  const segments = path.replace(/\[(\d+)]/g, '.$1').split('.')
  return segments.reduce<unknown>((current, segment) => {
    if (current === null || typeof current !== 'object') return undefined
    return (current as Record<string, unknown>)[segment]
  }, source)
}

/** 判断表单上仍有原样未改动的凭据掩码，供提交前提示或跳过校验。 */
export function hasUnchangedMaskedSecret(form: ServiceInstanceShell, maskedFields: readonly string[] = []): boolean {
  return maskedFormPaths(maskedFields).some(path => isMaskedSecret(valueAtPath(form, path)))
}

/**
 * 清掉表单上原样未改动的凭据掩码。
 *
 * 只在「照着一份已有配置复制出一条新配置」时用：新配置在库里没有对应的原值，掩码回传
 * 后会被服务端整个丢掉，表单上留着它只会让用户以为凭据已经填好了。
 */
export function stripMaskedSecrets<T extends ServiceInstanceShell>(form: T, maskedFields: readonly string[] = []): T {
  const stripped = structuredClone(form)
  for (const path of maskedFormPaths(maskedFields)) {
    const segments = path.replace(/\[(\d+)]/g, '.$1').split('.')
    const leaf = segments.pop()
    if (!leaf) continue
    const owner = segments.length ? valueAtPath(stripped, segments.join('.')) : stripped
    if (owner === null || typeof owner !== 'object') continue
    const container = owner as Record<string, unknown>
    if (isMaskedSecret(container[leaf])) delete container[leaf]
  }
  return stripped
}

/**
 * 把表单形状拆成写入载荷：宿主消费的实例级字段平铺在顶层，其余归 `config`。
 *
 * `default` 刻意不进载荷——默认调用目标受「每族至多一个」的唯一索引管辖，置位与清位
 * 各有专用端点，混在配置写入里会让一次改端口号顺带把别人的默认置位清掉。表单上除
 * 身份字段与宿主字段之外的顶层键同样不进载荷，它们在后端整形时本就会被丢弃。
 */
export function toServiceConfigPayload(capability: string, form: ServiceInstanceShell): ServiceInstanceConfigPayload {
  const hostFields = serviceHostFields(capability)
  // 宿主字段各族不同，不在外壳类型上逐族声明，按名字取值
  const flatForm = form as Record<string, unknown>
  const config: Record<string, unknown> = { ...(form.config ?? {}) }
  // 宿主字段一旦混进 config，就会被声明了契约的类型判为违约，整条配置连带被拒收
  for (const field of hostFields) delete config[field]
  const payload: ServiceInstanceConfigPayload = {
    type: form.type,
    name: form.name,
    enabled: !!form.enabled,
    config,
  }
  for (const field of hostFields) {
    const value = flatForm[field]
    // 后端按 exclude_none 收载荷，null 与 undefined 一样表示「这一项没提交」
    if (value !== undefined && value !== null) payload[field] = value
  }
  return payload
}

/** 把下发形状摊平成表单形状：宿主载荷先铺开，身份与置位后覆盖，避免用户写的键顶掉身份。 */
export function fromServiceInstanceConfig(info: ServiceInstanceConfigInfo): ServiceInstanceForm {
  return {
    ...(info.host_config ?? {}),
    type: info.type,
    name: info.name,
    enabled: info.enabled,
    config: { ...(info.config ?? {}) },
    default: info.is_default_target,
  }
}

/** 列出当前已登记的全部服务族。 */
export function fetchServiceFamilies(): Promise<ServiceFamilyInfo[]> {
  return api.get<ServiceFamilyInfo[]>('service/families')
}

/** 列出某族当前已登记的服务实例类型，供新增配置的下拉框取用。 */
export function fetchServiceTypes(capability: string): Promise<ServiceTypeInfo[]> {
  return api.get<ServiceTypeInfo[]>(`service/types/${encodeURIComponent(capability)}`)
}

/** 列出某族的全部实例配置，凭据一律以掩码下发。 */
export function fetchServiceConfigs(capability: string): Promise<ServiceInstanceConfigInfo[]> {
  return api.get<ServiceInstanceConfigInfo[]>(`service/configs/${encodeURIComponent(capability)}`)
}

/** 新增一条服务实例配置，新增的实例一律不是默认调用目标。 */
export function createServiceConfig(
  capability: string,
  form: ServiceInstanceShell,
): Promise<ServiceInstanceConfigInfo> {
  return api.post<ServiceInstanceConfigInfo>(
    `service/configs/${encodeURIComponent(capability)}`,
    toServiceConfigPayload(capability, form),
  )
}

/**
 * 更新一条服务实例配置。
 *
 * 实例名走查询参数而不是路径段：它由用户自填、可以带斜杠与空格，落进路径段会被路由切断。
 * 表单上的实例名与 `name` 参数不同即为改名。
 */
export function updateServiceConfig(
  capability: string,
  serviceType: string,
  name: string,
  form: ServiceInstanceShell,
): Promise<ServiceInstanceConfigInfo> {
  return api.put<ServiceInstanceConfigInfo>(
    `service/configs/${encodeURIComponent(capability)}/${encodeURIComponent(serviceType)}`,
    toServiceConfigPayload(capability, form),
    { params: { name } },
  )
}

/** 删除一条服务实例配置，同族其余配置不受影响。 */
export function deleteServiceConfig(capability: string, serviceType: string, name: string): Promise<unknown> {
  return api.delete(`service/configs/${encodeURIComponent(capability)}/${encodeURIComponent(serviceType)}`, {
    params: { name },
  })
}

/** 把指定实例设为该族的默认调用目标，置位是族级的、每族至多一个。 */
export function setServiceDefaultTarget(capability: string, serviceType: string, name: string): Promise<unknown> {
  return api.put(
    `service/default_target/${encodeURIComponent(capability)}/${encodeURIComponent(serviceType)}`,
    undefined,
    { params: { name } },
  )
}

/** 清除该族的默认调用目标置位，置位是族级的故不必指到某一条配置。 */
export function clearServiceDefaultTarget(capability: string): Promise<unknown> {
  return api.delete(`service/default_target/${encodeURIComponent(capability)}`)
}

/** 列出提供方已不在场的服务实例配置，成因是稳定代码、文案由前端本地化。 */
export function fetchAbsentServiceProviders(): Promise<ServiceConfigProviderIssue[]> {
  return api.get<ServiceConfigProviderIssue[]>('service/absent_providers')
}
