import {
  clearServiceDefaultTarget,
  createServiceConfig,
  deleteServiceConfig,
  fetchAbsentServiceProviders,
  fetchServiceConfigs,
  fetchServiceFamilies,
  fetchServiceTypes,
  fromServiceInstanceConfig,
  hasUnchangedMaskedSecret,
  isMaskedSecret,
  maskedFormPaths,
  SERVICE_CAPABILITIES,
  SERVICE_SECRET_MASK,
  serviceBareTokenField,
  serviceHostFields,
  serviceSupportsDefaultTarget,
  setServiceDefaultTarget,
  stripMaskedSecrets,
  toServiceConfigPayload,
  updateServiceConfig,
  type ServiceInstanceForm,
} from '@/api/serviceConfig'
import type { ServiceInstanceConfigInfo } from '@/api/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    get: (...args: unknown[]) => mocks.apiGet(...args),
    post: (...args: unknown[]) => mocks.apiPost(...args),
    put: (...args: unknown[]) => mocks.apiPut(...args),
    delete: (...args: unknown[]) => mocks.apiDelete(...args),
  }),
}))

// 用户手动改过的凭据取值，用于把「改过」与「原样回传掩码」区分开
const EDITED_CREDENTIAL = 'edited-by-operator'

/** 造一条下发形状的配置，凭据已按后端口径换成掩码。 */
function createConfigInfo(overrides: Partial<ServiceInstanceConfigInfo> = {}): ServiceInstanceConfigInfo {
  return {
    capability: 'downloader',
    type: 'qbittorrent',
    name: '下载器1',
    enabled: true,
    config: { host: 'http://localhost:8080', password: SERVICE_SECRET_MASK },
    host_config: { path_mapping: [['/media', '/downloads']] },
    is_default_target: false,
    provider: '__builtin__',
    masked_fields: ['config.password'],
    type_available: true,
    type_name: 'qBittorrent',
    ...overrides,
  }
}

describe('service family metadata', () => {
  it('names the five host families', () => {
    expect(SERVICE_CAPABILITIES).toEqual(['downloader', 'mediaserver', 'notification', 'storage', 'auth'])
  })

  it.each([
    ['downloader', ['path_mapping']],
    ['mediaserver', ['sync_interval', 'sync_libraries']],
    ['notification', ['switchs']],
    ['storage', ['bare_token_target']],
    ['auth', ['identity_provider']],
    ['unknown', []],
  ])('lists the host-consumed fields of %s', (capability, fields) => {
    expect(serviceHostFields(capability)).toEqual(fields)
  })

  it('denies a default call target to the auth family only', () => {
    // 登录时用户点的永远是具体某个入口，不存在「调用未指定实例」这回事
    expect(serviceSupportsDefaultTarget('auth')).toBe(false)
    for (const capability of ['downloader', 'mediaserver', 'notification', 'storage']) {
      expect(serviceSupportsDefaultTarget(capability)).toBe(true)
    }
  })

  it('puts the bare-token pointer on the storage family only', () => {
    expect(serviceBareTokenField('storage')).toBe('bare_token_target')
    expect(serviceBareTokenField('downloader')).toBeUndefined()
  })
})

describe('config and host_config separation', () => {
  it.each([
    ['downloader', 'path_mapping', [['/media', '/downloads']]],
    ['mediaserver', 'sync_libraries', ['电影']],
    ['notification', 'switchs', ['订阅']],
    ['storage', 'bare_token_target', true],
    ['auth', 'identity_provider', 'emby@nas'],
  ])('keeps the %s host field out of config', (capability, field, value) => {
    const payload = toServiceConfigPayload(capability, {
      type: 't',
      name: 'n',
      enabled: true,
      config: { host: 'h' },
      [field]: value,
    })
    expect(payload[field]).toEqual(value)
    expect(payload.config).toEqual({ host: 'h' })
    expect(payload.config).not.toHaveProperty(field)
  })

  it('strips a host field that leaked into config, so the type contract is not violated', () => {
    // 宿主字段混进 config 会被声明了 additionalProperties: false 的类型判为违约、整条配置被拒收
    const form: ServiceInstanceForm = {
      type: 'emby',
      name: 'emby1',
      config: { host: 'h', sync_interval: 6, sync_libraries: ['电影'] },
      sync_interval: 12,
    }
    const payload = toServiceConfigPayload('mediaserver', form)
    expect(payload.config).toEqual({ host: 'h' })
    expect(payload.sync_interval).toBe(12)
    expect(payload.sync_libraries).toBeUndefined()
  })

  it('never sends the default marker in the config payload', () => {
    // 默认调用目标走专用端点，混在配置写入里会让一次改端口号顺带把别人的置位清掉
    const payload = toServiceConfigPayload('downloader', {
      type: 'qbittorrent',
      name: 'qb',
      default: true,
      config: {},
    })
    expect(payload).not.toHaveProperty('default')
  })

  it('drops top-level keys that belong to neither the shell nor the host', () => {
    const form: ServiceInstanceForm = {
      type: 'qbittorrent',
      name: 'qb',
      config: {},
      is_default_target: true,
      type_available: true,
    }
    const payload = toServiceConfigPayload('downloader', form)
    expect(Object.keys(payload).sort()).toEqual(['config', 'enabled', 'name', 'type'])
  })

  it('omits a host field that was never filled in rather than sending null', () => {
    const form: ServiceInstanceForm = { type: 'emby', name: 'e', sync_interval: null }
    const payload = toServiceConfigPayload('mediaserver', form)
    expect(payload).not.toHaveProperty('sync_interval')
  })

  it('always states the enabled flag so an omitted form field does not silently disable an instance', () => {
    expect(toServiceConfigPayload('downloader', { type: 'q', name: 'n' }).enabled).toBe(false)
    expect(toServiceConfigPayload('downloader', { type: 'q', name: 'n', enabled: true }).enabled).toBe(true)
  })

  it('flattens host_config back onto the form without letting it shadow the identity', () => {
    const form = fromServiceInstanceConfig(
      createConfigInfo({ host_config: { path_mapping: [], name: '冒充的名字', type: '冒充的类型' } }),
    )
    expect(form.name).toBe('下载器1')
    expect(form.type).toBe('qbittorrent')
    expect(form.path_mapping).toEqual([])
    expect(form.default).toBe(false)
  })

  it('round-trips a downloader between the wire shape and the form shape', () => {
    const info = createConfigInfo()
    const payload = toServiceConfigPayload('downloader', fromServiceInstanceConfig(info))
    expect(payload).toEqual({
      type: 'qbittorrent',
      name: '下载器1',
      enabled: true,
      config: { host: 'http://localhost:8080', password: SERVICE_SECRET_MASK },
      path_mapping: [['/media', '/downloads']],
    })
  })
})

describe('masked credentials', () => {
  it('recognises the mask placeholder', () => {
    expect(isMaskedSecret(SERVICE_SECRET_MASK)).toBe(true)
    expect(isMaskedSecret('real-password')).toBe(false)
    expect(isMaskedSecret(undefined)).toBe(false)
  })

  it('maps wire mask paths onto the flattened form', () => {
    expect(maskedFormPaths(['config.auth.token', 'host_config.secret'])).toEqual(['config.auth.token', 'secret'])
  })

  it('sends the mask back unchanged when the user did not touch the credential', () => {
    // 原样回传掩码即表示这一项没动，服务端从库里取回原值
    const form = fromServiceInstanceConfig(createConfigInfo())
    expect(hasUnchangedMaskedSecret(form, ['config.password'])).toBe(true)
    expect(toServiceConfigPayload('downloader', form).config?.password).toBe(SERVICE_SECRET_MASK)
  })

  it('sends the new value once the user edits the credential', () => {
    const form = fromServiceInstanceConfig(createConfigInfo())
    form.config!.password = EDITED_CREDENTIAL
    expect(hasUnchangedMaskedSecret(form, ['config.password'])).toBe(false)
    expect(toServiceConfigPayload('downloader', form).config?.password).toBe(EDITED_CREDENTIAL)
  })

  it('finds a mask nested inside an object and inside a list', () => {
    const form = {
      config: { auth: { token: SERVICE_SECRET_MASK }, servers: [{ password: SERVICE_SECRET_MASK }] },
    }
    expect(hasUnchangedMaskedSecret(form, ['config.auth.token'])).toBe(true)
    expect(hasUnchangedMaskedSecret(form, ['config.servers[0].password'])).toBe(true)
    expect(hasUnchangedMaskedSecret(form, ['config.servers[1].password'])).toBe(false)
  })

  it('drops untouched masks when a configuration is copied into a new instance', () => {
    // 新实例在库里没有对应的原值，掩码会被服务端整个丢掉，留在表单上只会让用户以为已经填好了
    const copied = stripMaskedSecrets(fromServiceInstanceConfig(createConfigInfo()), ['config.password'])
    expect(copied.config).toEqual({ host: 'http://localhost:8080' })
    expect(copied.name).toBe('下载器1')
  })

  it('keeps an edited credential when stripping masks', () => {
    const form = { config: { password: EDITED_CREDENTIAL } }
    expect(stripMaskedSecrets(form, ['config.password']).config).toEqual({ password: EDITED_CREDENTIAL })
  })
})

describe('service configuration endpoints', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset().mockResolvedValue([])
    mocks.apiPost.mockReset().mockResolvedValue({})
    mocks.apiPut.mockReset().mockResolvedValue({})
    mocks.apiDelete.mockReset().mockResolvedValue({})
  })

  it('reads the family catalog, the type catalog and the configuration list', async () => {
    await fetchServiceFamilies()
    expect(mocks.apiGet).toHaveBeenCalledWith('service/families')
    await fetchServiceTypes('storage')
    expect(mocks.apiGet).toHaveBeenCalledWith('service/types/storage')
    await fetchServiceConfigs('storage')
    expect(mocks.apiGet).toHaveBeenCalledWith('service/configs/storage')
    await fetchAbsentServiceProviders()
    expect(mocks.apiGet).toHaveBeenCalledWith('service/absent_providers')
  })

  it.each(SERVICE_CAPABILITIES)('creates a %s configuration on its own family endpoint', async capability => {
    await createServiceConfig(capability, { type: 'demo', name: '实例1', enabled: true, config: { a: 1 } })
    expect(mocks.apiPost).toHaveBeenCalledWith(`service/configs/${capability}`, {
      type: 'demo',
      name: '实例1',
      enabled: true,
      config: { a: 1 },
    })
  })

  it.each(SERVICE_CAPABILITIES)(
    'updates a %s configuration by type in the path and name in the query',
    async capability => {
      await updateServiceConfig(capability, 'demo', '旧 名字/带斜杠', { type: 'demo', name: '新名字', config: {} })
      expect(mocks.apiPut).toHaveBeenCalledWith(
        `service/configs/${capability}/demo`,
        { type: 'demo', name: '新名字', enabled: false, config: {} },
        { params: { name: '旧 名字/带斜杠' } },
      )
    },
  )

  it.each(SERVICE_CAPABILITIES)('deletes a %s configuration by type and name', async capability => {
    await deleteServiceConfig(capability, 'demo', '实例1')
    expect(mocks.apiDelete).toHaveBeenCalledWith(`service/configs/${capability}/demo`, { params: { name: '实例1' } })
  })

  it('routes the default call target through its own endpoints, not the configuration payload', async () => {
    await setServiceDefaultTarget('downloader', 'qbittorrent', 'qb1')
    expect(mocks.apiPut).toHaveBeenCalledWith('service/default_target/downloader/qbittorrent', undefined, {
      params: { name: 'qb1' },
    })
    await clearServiceDefaultTarget('downloader')
    expect(mocks.apiDelete).toHaveBeenCalledWith('service/default_target/downloader')
    expect(mocks.apiPost).not.toHaveBeenCalled()
  })

  it('escapes a service type that would otherwise break out of its path segment', async () => {
    await deleteServiceConfig('storage', 'custom/1', 'a')
    expect(mocks.apiDelete).toHaveBeenCalledWith('service/configs/storage/custom%2F1', { params: { name: 'a' } })
  })
})
