import type { ServiceInstanceConfigInfo, ServiceInstanceConfigPayload, ServiceTypeInfo } from '@/api/types'
import AccountSettingAuth from '@/views/setting/AccountSettingAuth.vue'
import { screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiDelete: vi.fn(),
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  useSilentSettingRefresh: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({
    delete: mocks.apiDelete,
    get: mocks.apiGet,
    post: mocks.apiPost,
    put: mocks.apiPut,
  }),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

vi.mock('@/composables/useSilentSettingRefresh', () => ({
  useSilentSettingRefresh: mocks.useSilentSettingRefresh,
}))

// 卡片替身把交互摊平成按钮：改配置、只轮换凭据、以及删除，各自照原样把表单交回页面
vi.mock('@/components/cards/AuthProviderCard.vue', async () => {
  const { defineComponent } = await import('vue')
  return {
    default: defineComponent({
      name: 'AuthProviderCardStub',
      props: {
        provider: { type: Object, required: true },
        providers: { type: Array, default: () => [] },
        maskedFields: { type: Array, default: () => [] },
        conflicted: { type: Boolean, default: false },
        typeAvailable: { type: Boolean, default: true },
      },
      emits: ['change', 'close'],
      template: `
        <section :aria-label="'provider-' + provider.name">
          <span>{{ provider.name }} / {{ provider.type }}</span>
          <span :aria-label="'state-' + provider.name">
            {{ conflicted ? 'conflicted' : 'ok' }}/{{ typeAvailable ? 'available' : 'absent' }}/{{ maskedFields.join(',') }}
          </span>
          <button :aria-label="'resave-' + provider.name" @click="$emit('change', { ...provider }, provider.name)">
            resave
          </button>
          <button
            :aria-label="'rotate-' + provider.name"
            @click="$emit('change', { ...provider, config: { ...provider.config, client_secret: 'rotated' } }, provider.name)"
          >
            rotate
          </button>
          <button :aria-label="'remove-' + provider.name" @click="$emit('close')">remove</button>
        </section>
      `,
    }),
  }
})

/** 造一条下发形状的登录入口配置，宿主消费的 identity_provider 装在 host_config 下。 */
function createConfigInfo(overrides: Partial<ServiceInstanceConfigInfo> = {}): ServiceInstanceConfigInfo {
  return {
    capability: 'auth',
    type: 'oidc',
    name: 'Keycloak',
    enabled: true,
    config: { client_id: 'moviepilot', client_secret: '********' },
    host_config: { identity_provider: 'legacy-sso' },
    is_default_target: false,
    provider: 'oidc-plugin',
    masked_fields: ['config.client_secret'],
    type_available: true,
    type_name: 'OIDC 登录',
    ...overrides,
  }
}

/** 造一条类型目录，multi_instance 决定该类型还能不能再加一份配置。 */
function createTypeInfo(overrides: Partial<ServiceTypeInfo> = {}): ServiceTypeInfo {
  return {
    capability: 'auth',
    type: 'oidc',
    name: 'OIDC 登录',
    icon: null,
    multi_instance: true,
    config_form_available: true,
    config_schema: null,
    provider: 'oidc-plugin',
    distribution: 'plugin',
    ...overrides,
  }
}

// Emby 单点登录声明只能配一份，夹具里已经配了一条，故它不该再出现在新增菜单里
const authTypesFixture: ServiceTypeInfo[] = [
  createTypeInfo(),
  createTypeInfo({ type: 'embysso', name: 'Emby 单点登录', multi_instance: false, provider: 'emby-sso-plugin' }),
]

const authConfigsFixture: ServiceInstanceConfigInfo[] = [
  createConfigInfo(),
  createConfigInfo({
    type: 'embysso',
    name: '家里那台',
    enabled: false,
    config: {},
    host_config: {},
    masked_fields: [],
    provider: 'emby-sso-plugin',
    type_name: 'Emby 单点登录',
  }),
]

// 服务端那一份登录入口配置，逐条写入的端点直接改它，下一次读取即刻反映出来
let authConfigs: ServiceInstanceConfigInfo[] = []
let authTypes: ServiceTypeInfo[] = []

/** 把写入载荷折回下发形状：宿主消费的实例级字段归 host_config，其余键留在 config。 */
function toConfigInfo(payload: ServiceInstanceConfigPayload, previous?: ServiceInstanceConfigInfo) {
  const { config, enabled, name, type, ...hostConfig } = JSON.parse(JSON.stringify(payload)) as typeof payload
  return createConfigInfo({
    type: type ?? previous?.type ?? '',
    name: name ?? '',
    enabled: !!enabled,
    config: config ?? {},
    host_config: hostConfig,
    masked_fields: previous?.masked_fields ?? [],
    type_available: previous?.type_available ?? true,
  })
}

function defaultGet(endpoint: string) {
  if (endpoint === 'service/types/auth') return { success: true, data: structuredClone(authTypes) }
  if (endpoint === 'service/configs/auth') return { success: true, data: structuredClone(authConfigs) }
  if (endpoint === 'service/absent_providers') return { success: true, data: [] }
  throw new Error(`Unexpected GET ${endpoint}`)
}

function mockLoadedSettings() {
  authConfigs = structuredClone(authConfigsFixture)
  authTypes = structuredClone(authTypesFixture)
  mocks.apiGet.mockImplementation(defaultGet)
  mocks.apiPost.mockImplementation((endpoint: string, payload: ServiceInstanceConfigPayload) => {
    if (endpoint === 'service/configs/auth') authConfigs = [...authConfigs, toConfigInfo(payload)]
    return { success: true }
  })
  mocks.apiPut.mockImplementation(
    (endpoint: string, payload: ServiceInstanceConfigPayload, config: { params: { name: string } }) => {
      const serviceType = endpoint.slice('service/configs/auth/'.length)
      authConfigs = authConfigs.map(item =>
        item.type === serviceType && item.name === config.params.name ? toConfigInfo(payload, item) : item,
      )
      return { success: true }
    },
  )
  mocks.apiDelete.mockImplementation((endpoint: string, config: { params: { name: string } }) => {
    const serviceType = endpoint.slice('service/configs/auth/'.length)
    authConfigs = authConfigs.filter(item => !(item.type === serviceType && item.name === config.params.name))
    return { success: true }
  })
}

function getCard(title: string) {
  const card = screen.getByText(title).closest('.v-card')
  expect(card).not.toBeNull()
  return within(card as HTMLElement)
}

describe('AccountSettingAuth', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    mocks.apiDelete.mockReset()
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.apiPut.mockReset()
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.useSilentSettingRefresh.mockReset()
    mockLoadedSettings()
  })

  it('reads the configurations through the admin endpoint, never the unauthenticated login one', async () => {
    await renderWithProviders(AccountSettingAuth)

    expect(await screen.findByText('Keycloak / oidc')).toBeInTheDocument()
    expect(mocks.apiGet).toHaveBeenCalledWith('service/configs/auth')
    expect(mocks.apiGet).toHaveBeenCalledWith('service/types/auth')
    // 登录页那条无鉴权端点交出的是不带 config 的入口描述，管理侧复用它就等于把凭据摊给访客
    expect(mocks.apiGet).not.toHaveBeenCalledWith('auth/providers')
  })

  it('guides the admin to install a plugin when the type catalog is empty instead of showing a blank page', async () => {
    authTypes = []
    authConfigs = []
    await renderWithProviders(AccountSettingAuth)

    expect(await screen.findByText('暂无可用的登录入口类型')).toBeInTheDocument()
    expect(screen.getByText(/安装并启用提供登录入口的插件/)).toBeInTheDocument()
    expect(mocks.toastError).not.toHaveBeenCalled()
    // 目录为空时一个类型也加不了，新增按钮不该摆在那里等着点出一个空菜单
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('never offers a default-target switch, because this family structurally has none', async () => {
    await renderWithProviders(AccountSettingAuth)
    await screen.findByText('Keycloak / oidc')

    expect(screen.queryByText('默认调用目标')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('默认调用目标')).not.toBeInTheDocument()
    expect(mocks.apiPut).not.toHaveBeenCalledWith(expect.stringContaining('service/default_target'), expect.anything())
  })

  it('hides single-instance types that are already configured from the add menu', async () => {
    const user = userEvent.setup()
    await renderWithProviders(AccountSettingAuth)
    await screen.findByText('Keycloak / oidc')

    await user.click(getCard('登录入口').getAllByRole('button').at(-1)!)

    expect(await screen.findByText('OIDC 登录', { selector: '.v-list-item-title' })).toBeInTheDocument()
    expect(screen.queryByText('Emby 单点登录', { selector: '.v-list-item-title' })).not.toBeInTheDocument()
  })

  it('adds a disabled entry under a deduplicated name taken from the type label', async () => {
    const user = userEvent.setup()
    await renderWithProviders(AccountSettingAuth)
    await screen.findByText('Keycloak / oidc')

    await user.click(getCard('登录入口').getAllByRole('button').at(-1)!)
    await user.click(await screen.findByText('OIDC 登录', { selector: '.v-list-item-title' }))

    await waitFor(() => expect(screen.getByText('OIDC 登录 / oidc')).toBeInTheDocument())
    expect(mocks.apiPost).toHaveBeenCalledWith('service/configs/auth', {
      type: 'oidc',
      name: 'OIDC 登录',
      enabled: false,
      config: {},
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith('配置已保存')
  })

  it('submits identity_provider as a host field beside config, and never a default flag', async () => {
    const user = userEvent.setup()
    await renderWithProviders(AccountSettingAuth)
    await screen.findByText('Keycloak / oidc')

    await user.click(screen.getByRole('button', { name: 'resave-Keycloak' }))

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('配置已保存'))
    const [endpoint, payload, options] = mocks.apiPut.mock.calls[0]!
    expect(endpoint).toBe('service/configs/auth/oidc')
    expect(options).toEqual({ params: { name: 'Keycloak' } })
    // 宿主字段混进 config 会被声明了契约的类型判为违约、整条配置连带被拒收
    expect(payload).toEqual({
      type: 'oidc',
      name: 'Keycloak',
      enabled: true,
      config: { client_id: 'moviepilot', client_secret: '********' },
      identity_provider: 'legacy-sso',
    })
    expect(payload).not.toHaveProperty('default')
    expect(payload.config).not.toHaveProperty('identity_provider')
  })

  it('echoes an untouched credential mask back and replaces it only once it is edited', async () => {
    const user = userEvent.setup()
    await renderWithProviders(AccountSettingAuth)
    await screen.findByText('Keycloak / oidc')
    // 掩码路径随下发形状交给卡片，表单据此跳过对掩码的校验
    expect(screen.getByLabelText('state-Keycloak')).toHaveTextContent('config.client_secret')

    await user.click(screen.getByRole('button', { name: 'resave-Keycloak' }))
    await waitFor(() => expect(mocks.apiPut).toHaveBeenCalledTimes(1))
    // 原样回传掩码即保留库中原值，改一个客户端 ID 不必重新输入密钥
    expect(mocks.apiPut.mock.calls[0]![1].config.client_secret).toBe('********')

    await user.click(await screen.findByRole('button', { name: 'rotate-Keycloak' }))
    await waitFor(() => expect(mocks.apiPut).toHaveBeenCalledTimes(2))
    expect(mocks.apiPut.mock.calls[1]![1].config.client_secret).toBe('rotated')
  })

  it('surfaces two entries fighting over one identity key, which silences both of them', async () => {
    authConfigs = [
      createConfigInfo({ name: 'Keycloak', host_config: { identity_provider: 'shared-sso' } }),
      createConfigInfo({ name: 'Authentik', host_config: { identity_provider: 'shared-sso' } }),
    ]
    await renderWithProviders(AccountSettingAuth)
    await screen.findByText('Keycloak / oidc')

    expect(screen.getByText('以下登录入口因标识冲突而不生效')).toBeInTheDocument()
    expect(screen.getByText('shared-sso')).toBeInTheDocument()
    expect(screen.getByText('— Keycloak、Authentik')).toBeInTheDocument()
    expect(screen.getByLabelText('state-Keycloak')).toHaveTextContent('conflicted')
    expect(screen.getByLabelText('state-Authentik')).toHaveTextContent('conflicted')
  })

  it('keeps derived keys apart so two entries of different types may share a name', async () => {
    await renderWithProviders(AccountSettingAuth)
    await screen.findByText('Keycloak / oidc')

    expect(screen.queryByText('以下登录入口因标识冲突而不生效')).not.toBeInTheDocument()
    expect(screen.getByLabelText('state-家里那台')).toHaveTextContent('ok')
  })

  it('deletes one record without touching the rest of the family', async () => {
    const user = userEvent.setup()
    await renderWithProviders(AccountSettingAuth)
    await screen.findByText('Keycloak / oidc')

    await user.click(screen.getByRole('button', { name: 'remove-家里那台' }))

    await waitFor(() => expect(screen.queryByLabelText('provider-家里那台')).not.toBeInTheDocument())
    expect(mocks.apiDelete).toHaveBeenCalledWith('service/configs/auth/embysso', { params: { name: '家里那台' } })
    expect(screen.getByText('Keycloak / oidc')).toBeInTheDocument()
  })

  it('reports a failed write while keeping the entry list on screen', async () => {
    const user = userEvent.setup()
    await renderWithProviders(AccountSettingAuth)
    await screen.findByText('Keycloak / oidc')

    mocks.apiPut.mockRejectedValueOnce(new Error('offline'))
    await user.click(screen.getByRole('button', { name: 'resave-Keycloak' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('更新配置失败！'))
    expect(screen.getByText('Keycloak / oidc')).toBeInTheDocument()

    mocks.apiDelete.mockRejectedValueOnce(new Error('offline'))
    await user.click(screen.getByRole('button', { name: 'remove-家里那台' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('删除配置失败！'))
    expect(screen.getByText('家里那台 / embysso')).toBeInTheDocument()
  })

  it('reports a failed read and follows the tab active state for silent refreshes', async () => {
    mocks.apiGet.mockImplementation((endpoint: string) => {
      if (endpoint === 'service/configs/auth') throw new Error('offline')
      return defaultGet(endpoint)
    })
    const { rerender } = await renderWithProviders(AccountSettingAuth)

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('读取配置失败！'))

    const refreshOptions = mocks.useSilentSettingRefresh.mock.calls[0]?.[1]
    expect(refreshOptions.active.value).toBe(true)
    await rerender({ active: false })
    expect(refreshOptions.active.value).toBe(false)
  })
})
