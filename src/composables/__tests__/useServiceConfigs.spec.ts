import { useServiceConfigs } from '@/composables/useServiceConfigs'
import type { ServiceInstanceForm } from '@/api/serviceConfig'
import type { ServiceInstanceConfigInfo, ServiceTypeInfo } from '@/api/types'
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

/** 造一条下发形状的配置。 */
function configInfo(overrides: Partial<ServiceInstanceConfigInfo> = {}): ServiceInstanceConfigInfo {
  return {
    capability: 'storage',
    type: 'u115',
    name: 'u115',
    enabled: true,
    config: {},
    host_config: { bare_token_target: true },
    is_default_target: false,
    provider: '__builtin__',
    masked_fields: [],
    type_available: true,
    type_name: '115网盘',
    ...overrides,
  }
}

/** 造一条类型目录条目。 */
function typeInfo(overrides: Partial<ServiceTypeInfo> = {}): ServiceTypeInfo {
  return {
    capability: 'storage',
    type: 'u115',
    name: '115网盘',
    icon: null,
    multi_instance: true,
    config_form_available: false,
    config_schema: null,
    provider: 'plugin.demo',
    distribution: 'plugin',
    ...overrides,
  }
}

/** 让类型目录与配置列表按能力标签应答。 */
function mockCatalog(capability: string, types: ServiceTypeInfo[], configs: ServiceInstanceConfigInfo[]) {
  mocks.apiGet.mockImplementation((endpoint: string) => {
    if (endpoint === `service/types/${capability}`) return types
    if (endpoint === `service/configs/${capability}`) return configs
    throw new Error(`Unexpected GET ${endpoint}`)
  })
}

describe('useServiceConfigs', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset().mockResolvedValue({})
    mocks.apiPut.mockReset().mockResolvedValue({})
    mocks.apiDelete.mockReset().mockResolvedValue({})
  })

  it('loads the type catalog and the configuration list of one family', async () => {
    mockCatalog('storage', [typeInfo()], [configInfo()])
    const service = useServiceConfigs('storage')
    await service.load()
    expect(service.types.value).toHaveLength(1)
    expect(service.configs.value).toEqual([
      expect.objectContaining({ type: 'u115', name: 'u115', bare_token_target: true, default: false }),
    ])
  })

  it('still lists the configurations when the type catalog is unavailable', async () => {
    // 内建类型本就不在登记表里，目录取不到不该让整页配置一起消失
    mocks.apiGet.mockImplementation((endpoint: string) => {
      if (endpoint === 'service/types/downloader') throw new Error('boom')
      return [configInfo({ capability: 'downloader', type: 'qbittorrent', name: 'qb' })]
    })
    const service = useServiceConfigs('downloader')
    await service.load()
    expect(service.types.value).toEqual([])
    expect(service.configs.value).toHaveLength(1)
  })

  it('exposes the masked field paths of a single configuration', async () => {
    mockCatalog('downloader', [], [configInfo({ capability: 'downloader', masked_fields: ['config.password'] })])
    const service = useServiceConfigs('downloader')
    await service.load()
    expect(service.maskedFieldsOf('u115', 'u115')).toEqual(['config.password'])
    expect(service.maskedFieldsOf('u115', '不存在')).toEqual([])
  })

  describe('multi_instance gating', () => {
    it('refuses a second configuration for a single-instance type', async () => {
      mockCatalog('storage', [typeInfo({ multi_instance: false })], [configInfo()])
      const service = useServiceConfigs('storage')
      await service.load()
      expect(service.canAddInstance('u115')).toBe(false)
    })

    it('allows the first configuration of a single-instance type', async () => {
      mockCatalog('storage', [typeInfo({ multi_instance: false })], [])
      const service = useServiceConfigs('storage')
      await service.load()
      expect(service.canAddInstance('u115')).toBe(true)
    })

    it('allows more configurations for a multi-instance type', async () => {
      mockCatalog('storage', [typeInfo({ multi_instance: true })], [configInfo()])
      const service = useServiceConfigs('storage')
      await service.load()
      expect(service.canAddInstance('u115')).toBe(true)
    })

    it('treats an unregistered type as multi-instance, matching the host default', async () => {
      // 内建类型不在登记表里，按「声明缺省即多实例」处理
      mockCatalog('storage', [], [configInfo({ type: 'local', name: 'local' })])
      const service = useServiceConfigs('storage')
      await service.load()
      expect(service.canAddInstance('local')).toBe(true)
    })
  })

  describe('per-record writes', () => {
    beforeEach(() => mockCatalog('downloader', [], []))

    it('creates one configuration without touching the rest of the family', async () => {
      const service = useServiceConfigs('downloader')
      await service.addConfig({ type: 'qbittorrent', name: 'qb1', enabled: true, config: { host: 'h' } })
      expect(mocks.apiPost).toHaveBeenCalledWith('service/configs/downloader', {
        type: 'qbittorrent',
        name: 'qb1',
        enabled: true,
        config: { host: 'h' },
      })
    })

    it('updates one configuration and carries the previous name as the locator', async () => {
      const service = useServiceConfigs('downloader')
      await service.changeConfig({ type: 'qbittorrent', name: '新名字', config: {} }, '旧名字')
      expect(mocks.apiPut).toHaveBeenCalledWith(
        'service/configs/downloader/qbittorrent',
        expect.objectContaining({ name: '新名字' }),
        { params: { name: '旧名字' } },
      )
    })

    it('deletes one configuration by its own identity', async () => {
      const service = useServiceConfigs('downloader')
      await service.removeConfig({ type: 'qbittorrent', name: 'qb1' })
      expect(mocks.apiDelete).toHaveBeenCalledWith('service/configs/downloader/qbittorrent', {
        params: { name: 'qb1' },
      })
    })
  })

  describe('default call target', () => {
    it('sets the target through the dedicated endpoint', async () => {
      mockCatalog('downloader', [], [])
      const service = useServiceConfigs('downloader')
      await service.applyDefaultTarget({ type: 'qbittorrent', name: 'qb1' })
      expect(mocks.apiPut).toHaveBeenCalledWith('service/default_target/downloader/qbittorrent', undefined, {
        params: { name: 'qb1' },
      })
      expect(mocks.apiPost).not.toHaveBeenCalled()
    })

    it('clears the family target without naming a configuration', async () => {
      mockCatalog('downloader', [], [])
      const service = useServiceConfigs('downloader')
      await service.applyDefaultTarget()
      expect(mocks.apiDelete).toHaveBeenCalledWith('service/default_target/downloader')
    })

    it('reports the current target from the wire state', async () => {
      mockCatalog(
        'downloader',
        [],
        [
          configInfo({ capability: 'downloader', type: 'qbittorrent', name: 'qb1' }),
          configInfo({ capability: 'downloader', type: 'qbittorrent', name: 'qb2', is_default_target: true }),
        ],
      )
      const service = useServiceConfigs('downloader')
      await service.load()
      expect(service.defaultTarget.value?.name).toBe('qb2')
    })

    it('offers no default target to the auth family and never calls the endpoint', async () => {
      // 该族的置位请求后端一律以 400 退回，前端因此连入口都不给
      mockCatalog('auth', [], [])
      const service = useServiceConfigs('auth')
      expect(service.supportsDefaultTarget.value).toBe(false)
      await service.applyDefaultTarget({ type: 'emby', name: 'nas' })
      expect(mocks.apiPut).not.toHaveBeenCalled()
      expect(mocks.apiDelete).not.toHaveBeenCalled()
    })

    it('offers a default target to the other four families', () => {
      for (const capability of ['downloader', 'mediaserver', 'notification', 'storage']) {
        expect(useServiceConfigs(capability).supportsDefaultTarget.value).toBe(true)
      }
    })
  })

  describe('bare token target and default target are independent switches', () => {
    it('keeps the bare-token pointer in the configuration payload and the default target out of it', async () => {
      mockCatalog('storage', [], [])
      const service = useServiceConfigs('storage')
      const form: ServiceInstanceForm = {
        type: 'u115',
        name: 'work',
        bare_token_target: true,
        default: true,
        config: {},
      }
      await service.changeConfig(form, 'work')
      const [, payload] = mocks.apiPut.mock.calls[0] as [string, Record<string, unknown>]
      // 裸令牌承接随配置写入，默认调用目标另走专用端点，两者互不换算
      expect(payload.bare_token_target).toBe(true)
      expect(payload).not.toHaveProperty('default')
      expect(mocks.apiPut).toHaveBeenCalledTimes(1)
    })

    it('can point the bare token at one instance while another is the default target', async () => {
      mockCatalog(
        'storage',
        [],
        [
          configInfo({ name: 'u115', host_config: { bare_token_target: true }, is_default_target: false }),
          configInfo({ name: 'work', host_config: { bare_token_target: false }, is_default_target: true }),
        ],
      )
      const service = useServiceConfigs('storage')
      await service.load()
      expect(service.configs.value[0]).toMatchObject({ name: 'u115', bare_token_target: true, default: false })
      expect(service.configs.value[1]).toMatchObject({ name: 'work', bare_token_target: false, default: true })
    })
  })
})
