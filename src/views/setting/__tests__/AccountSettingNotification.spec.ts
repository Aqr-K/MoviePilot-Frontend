import vuetify from '@/plugins/vuetify'
import type { ServiceInstanceConfigInfo, ServiceInstanceConfigPayload, ServiceTypeInfo } from '@/api/types'
import AccountSettingNotification from '@/views/setting/AccountSettingNotification.vue'
import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiDelete: vi.fn(),
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  openSharedDialog: vi.fn(),
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

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: mocks.openSharedDialog,
}))

vi.mock('@/composables/useSilentSettingRefresh', () => ({
  useSilentSettingRefresh: mocks.useSilentSettingRefresh,
}))

vi.mock('@/components/cards/NotificationChannelCard.vue', async () => {
  const { defineComponent } = await import('vue')
  return {
    default: defineComponent({
      name: 'NotificationChannelCardStub',
      props: { notification: { type: Object, required: true } },
      emits: ['change', 'close'],
      template: `
        <section :aria-label="'channel-' + notification.name">
          <span>{{ notification.name }} / {{ notification.type }}</span>
          <input
            :aria-label="'name-' + notification.name"
            :value="notification.name"
            @input="$emit('change', { ...notification, name: $event.target.value }, notification.name)"
          />
          <button :aria-label="'remove-' + notification.name" @click="$emit('close')">remove</button>
        </section>
      `,
    }),
  }
})

vi.mock('vuedraggable', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      name: 'DraggableStub',
      props: { modelValue: { type: Array, default: () => [] } },
      emits: ['update:modelValue'],
      setup(props, { emit, slots }) {
        const reverse = () => emit('update:modelValue', [...props.modelValue].reverse())
        return () => {
          const items = props.modelValue as Array<{ name?: string }>
          return h('div', [
            h('button', { 'aria-label': 'reverse-channels', onClick: reverse }, 'reverse'),
            ...items.map(element => slots.item?.({ element })),
          ])
        }
      },
    }),
  }
})

/** 造一条下发形状的渠道配置，宿主消费的 switchs 装在 host_config 下。 */
function createConfigInfo(overrides: Partial<ServiceInstanceConfigInfo> = {}): ServiceInstanceConfigInfo {
  return {
    capability: 'notification',
    type: 'wechatclawbot',
    name: 'Alpha',
    enabled: true,
    config: { token: 'fixture-token' },
    host_config: {},
    is_default_target: false,
    provider: '__builtin__',
    masked_fields: [],
    type_available: true,
    type_name: null,
    ...overrides,
  }
}

const notificationsFixture: ServiceInstanceConfigInfo[] = [
  createConfigInfo({ host_config: { switchs: ['资源下载'] } }),
  createConfigInfo({ name: '通知3', type: 'telegram', enabled: false, config: {} }),
]

/** 造一条类型目录，multi_instance 决定该类型还能不能再加一份配置。 */
function createTypeInfo(overrides: Partial<ServiceTypeInfo> = {}): ServiceTypeInfo {
  return {
    capability: 'notification',
    type: 'bark',
    name: 'Bark',
    icon: null,
    multi_instance: true,
    config_form_available: false,
    config_schema: null,
    provider: 'bark-extension',
    distribution: 'extension',
    ...overrides,
  }
}

// 微信 ClawBot 声明只能配一份，夹具里已经配了 Alpha，故它不该再出现在新增菜单里
const notificationTypesFixture: ServiceTypeInfo[] = [
  createTypeInfo(),
  createTypeInfo({ type: 'wechatclawbot', name: '微信 ClawBot', multi_instance: false, provider: '__builtin__' }),
]

const templateFixture = {
  organizeSuccess: '{"title":"organized"}',
  downloadAdded: '{"title":"downloaded"}',
  subscribeAdded: '{}',
  subscribeComplete: '{}',
}

// 服务端那一份渠道配置，逐条写入的端点直接改它，下一次读取即刻反映出来
let notificationConfigs: ServiceInstanceConfigInfo[] = []

/**
 * 把写入载荷折回下发形状：宿主消费的实例级字段归 host_config，其余键留在 config。
 *
 * 载荷里的数组与对象直接引用着页面上的响应式代理，照收会让后续 structuredClone 抛错；
 * 先过一遍 JSON 摘成纯数据，与真实端点收到序列化载荷的口径一致。
 */
function toConfigInfo(payload: ServiceInstanceConfigPayload, previous?: ServiceInstanceConfigInfo) {
  const { config, enabled, name, type, ...hostConfig } = JSON.parse(JSON.stringify(payload)) as typeof payload
  return createConfigInfo({
    type: type ?? previous?.type ?? '',
    name: name ?? '',
    enabled: !!enabled,
    config: config ?? {},
    host_config: hostConfig,
  })
}

function defaultGet(endpoint: string) {
  if (endpoint === 'service/types/notification') {
    return { success: true, data: structuredClone(notificationTypesFixture) }
  }
  if (endpoint === 'service/configs/notification') {
    return { success: true, data: structuredClone(notificationConfigs) }
  }
  if (endpoint === 'service/absent_providers') return { success: true, data: [] }
  if (endpoint === 'system/setting/NotificationSwitchs') {
    return { success: true, data: { value: [{ type: '资源下载', action: 'user' }] } }
  }
  if (endpoint === 'system/setting/NotificationSendTime') {
    return { success: true, data: { value: { start: '08:30', end: '22:00' } } }
  }
  if (endpoint === 'system/setting/NotificationTemplates') {
    return { success: true, data: { value: structuredClone(templateFixture) } }
  }
  throw new Error(`Unexpected GET ${endpoint}`)
}

function mockLoadedSettings() {
  notificationConfigs = structuredClone(notificationsFixture)
  mocks.apiGet.mockImplementation(defaultGet)
  mocks.apiPost.mockImplementation((endpoint: string, payload: ServiceInstanceConfigPayload) => {
    if (endpoint === 'service/configs/notification')
      notificationConfigs = [...notificationConfigs, toConfigInfo(payload)]
    return { success: true }
  })
  mocks.apiPut.mockImplementation(
    (endpoint: string, payload: ServiceInstanceConfigPayload, config: { params: { name: string } }) => {
      const serviceType = endpoint.slice('service/configs/notification/'.length)
      notificationConfigs = notificationConfigs.map(item =>
        item.type === serviceType && item.name === config.params.name ? toConfigInfo(payload, item) : item,
      )
      return { success: true }
    },
  )
  mocks.apiDelete.mockImplementation((endpoint: string, config: { params: { name: string } }) => {
    const serviceType = endpoint.slice('service/configs/notification/'.length)
    notificationConfigs = notificationConfigs.filter(
      item => !(item.type === serviceType && item.name === config.params.name),
    )
    return { success: true }
  })
}

function createDialogController() {
  return { close: vi.fn(), id: 1, updateProps: vi.fn() }
}

async function renderNotificationSettings() {
  return renderWithProviders(AccountSettingNotification)
}

function getCard(title: string) {
  const card = screen.getByText(title).closest('.v-card')
  expect(card).not.toBeNull()
  return within(card as HTMLElement)
}

function getDialogEvents() {
  return mocks.openSharedDialog.mock.calls.at(-1)?.[2] as {
    close: () => void
    save: (value: string) => Promise<void>
    'update:content': (value: string) => void
    'update:modelValue': (value: boolean) => void
  }
}

describe('AccountSettingNotification', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.apiDelete.mockReset()
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.apiPut.mockReset()
    mocks.openSharedDialog.mockReset()
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.useSilentSettingRefresh.mockReset()
    mocks.openSharedDialog.mockImplementation(() => createDialogController())
    mockLoadedSettings()
  })

  it('loads owned settings, adds missing switch defaults, and follows active refresh state', async () => {
    const { rerender } = await renderNotificationSettings()

    expect(await screen.findByText('Alpha / wechatclawbot')).toBeInTheDocument()
    expect(screen.getByText('通知3 / telegram')).toBeInTheDocument()
    expect(screen.getByLabelText('开始时间')).toHaveValue('08:30')
    expect(screen.getByLabelText('结束时间')).toHaveValue('22:00')
    expect(getCard('通知发送范围').getAllByRole('radiogroup')).toHaveLength(9)

    const refreshOptions = mocks.useSilentSettingRefresh.mock.calls[0]?.[1]
    expect(refreshOptions.active.value).toBe(true)
    await rerender({ active: false })
    expect(refreshOptions.active.value).toBe(false)
  })

  it('creates a unique automatic channel name and deletes a channel through the per-record endpoints', async () => {
    const user = userEvent.setup()
    await renderNotificationSettings()
    await screen.findByText('Alpha / wechatclawbot')
    const channelCard = getCard('通知渠道')

    await user.click(channelCard.getAllByRole('button').at(-1)!)
    await user.click(await screen.findByText('企业微信', { selector: '.v-list-item-title' }))

    await waitFor(() => expect(screen.getByText('通知4 / wechat')).toBeInTheDocument())
    expect(mocks.apiPost).toHaveBeenCalledWith('service/configs/notification', {
      type: 'wechat',
      name: '通知4',
      enabled: false,
      config: {},
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith('配置已保存')

    await user.click(screen.getByRole('button', { name: 'remove-通知3' }))

    await waitFor(() => expect(screen.queryByLabelText('channel-通知3')).not.toBeInTheDocument())
    expect(mocks.apiDelete).toHaveBeenCalledWith('service/configs/notification/telegram', {
      params: { name: '通知3' },
    })
  })

  it('reorders channels locally without writing, because per-record writes carry no order', async () => {
    const user = userEvent.setup()
    await renderNotificationSettings()
    await screen.findByText('Alpha / wechatclawbot')
    mocks.apiPost.mockClear()

    await user.click(screen.getByRole('button', { name: 'reverse-channels' }))

    expect(screen.getAllByText(/ \/ /).map(node => node.textContent)).toEqual([
      '通知3 / telegram',
      'Alpha / wechatclawbot',
    ])
    expect(mocks.apiPost).not.toHaveBeenCalled()
    expect(mocks.apiPut).not.toHaveBeenCalled()
    expect(mocks.apiDelete).not.toHaveBeenCalled()
  })

  it('renames a channel through its own record and keeps the host-level switchs out of config', async () => {
    await renderNotificationSettings()
    await screen.findByText('Alpha / wechatclawbot')

    await fireEvent.update(screen.getByLabelText('name-Alpha'), 'Beta')

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('配置已保存'))
    expect(screen.getByText('Beta / wechatclawbot')).toBeInTheDocument()
    expect(mocks.apiPut).toHaveBeenCalledWith(
      'service/configs/notification/wechatclawbot',
      {
        type: 'wechatclawbot',
        name: 'Beta',
        enabled: true,
        config: { token: 'fixture-token' },
        switchs: ['资源下载'],
      },
      { params: { name: 'Alpha' } },
    )
    // 默认调用目标受「每族至多一个」的唯一索引管辖，绝不能顺着配置载荷一起写
    expect(mocks.apiPut.mock.calls[0]?.[1]).not.toHaveProperty('default')
  })

  it('migrates the ClawBot cache as soon as each rename lands in the record', async () => {
    await renderNotificationSettings()
    await screen.findByText('Alpha / wechatclawbot')

    await fireEvent.update(screen.getByLabelText('name-Alpha'), 'Beta')
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledTimes(1))
    expect(mocks.apiPost).toHaveBeenNthCalledWith(1, 'notification/manage', {
      target: 'WechatClawBot',
      action: 'migrate_cache',
      params: { old_name: 'Alpha', new_name: 'Beta' },
    })

    await fireEvent.update(await screen.findByLabelText('name-Beta'), 'Gamma')
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledTimes(2))
    expect(mocks.apiPost).toHaveBeenNthCalledWith(2, 'notification/manage', {
      target: 'WechatClawBot',
      action: 'migrate_cache',
      params: { old_name: 'Beta', new_name: 'Gamma' },
    })
  })

  it('compresses a failed ClawBot migration into the next rename and retries it from the original name', async () => {
    await renderNotificationSettings()
    await screen.findByText('Alpha / wechatclawbot')

    mocks.apiPost.mockResolvedValueOnce({ success: false, message: 'migration failed' })
    await fireEvent.update(screen.getByLabelText('name-Alpha'), 'Beta')
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('更新配置失败！'))
    expect(mocks.apiPost).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Beta / wechatclawbot')).toBeInTheDocument()

    mocks.apiPost.mockClear()
    await fireEvent.update(screen.getByLabelText('name-Beta'), 'Gamma')

    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledTimes(1))
    expect(mocks.apiPost).toHaveBeenNthCalledWith(1, 'notification/manage', {
      target: 'WechatClawBot',
      action: 'migrate_cache',
      params: { old_name: 'Alpha', new_name: 'Gamma' },
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith('配置已保存')
  })

  it('merges registered channel types into the add menu and hides single-instance types already configured', async () => {
    const user = userEvent.setup()
    await renderNotificationSettings()
    await screen.findByText('Alpha / wechatclawbot')

    await user.click(getCard('通知渠道').getAllByRole('button').at(-1)!)

    expect(await screen.findByText('Bark', { selector: '.v-list-item-title' })).toBeInTheDocument()
    expect(screen.queryByText('微信 ClawBot', { selector: '.v-list-item-title' })).not.toBeInTheDocument()
  })

  it('reports a per-record write failure without dropping the channel list', async () => {
    const user = userEvent.setup()
    await renderNotificationSettings()
    await screen.findByText('Alpha / wechatclawbot')

    mocks.apiDelete.mockRejectedValueOnce(new Error('offline'))
    await user.click(screen.getByRole('button', { name: 'remove-通知3' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('删除配置失败！'))
    expect(screen.getByText('通知3 / telegram')).toBeInTheDocument()

    mocks.apiPost.mockRejectedValueOnce(new Error('offline'))
    await user.click(getCard('通知渠道').getAllByRole('button').at(-1)!)
    await user.click(await screen.findByText('企业微信', { selector: '.v-list-item-title' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('新增配置失败！'))
    expect(screen.queryByText('通知4 / wechat')).not.toBeInTheDocument()
  })

  it('loads, edits, and saves a template while pausing refresh and following the active theme', async () => {
    const previousTheme = vuetify.theme.global.name.value
    // 从浅色主题起步验证编辑器跟随主题切换，不受应用默认主题影响。
    vuetify.theme.global.name.value = 'light'
    const controller = createDialogController()
    mocks.openSharedDialog.mockReturnValue(controller)

    try {
      const user = userEvent.setup()
      await renderNotificationSettings()
      await screen.findByText('Alpha / wechatclawbot')
      const templateButton = screen.getByRole('button', { name: /资源入库/ })
      await user.click(templateButton)

      await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledOnce())
      expect(mocks.openSharedDialog.mock.calls[0]?.[1]).toEqual(
        expect.objectContaining({ content: templateFixture.organizeSuccess, editorTheme: 'github_light_default' }),
      )
      expect(mocks.useSilentSettingRefresh.mock.calls[0]?.[1].active.value).toBe(false)

      getDialogEvents()['update:content']('{"title":"updated"}')
      vuetify.theme.global.name.value = 'dark'
      await waitFor(() => expect(controller.updateProps).toHaveBeenCalledWith({ editorTheme: 'github_dark' }))
      await getDialogEvents().save('{"title":"updated"}')

      expect(mocks.apiPost).toHaveBeenCalledWith('system/setting/NotificationTemplates', {
        ...templateFixture,
        organizeSuccess: '{"title":"updated"}',
      })
      expect(mocks.toastSuccess).toHaveBeenCalledWith('模板保存成功')
      expect(controller.close).toHaveBeenCalledOnce()
    } finally {
      vuetify.theme.global.name.value = previousTheme
    }
  })

  it('keeps the template editor open when saving fails and reports load failures', async () => {
    const user = userEvent.setup()
    const controller = createDialogController()
    mocks.openSharedDialog.mockReturnValue(controller)
    await renderNotificationSettings()
    await screen.findByText('Alpha / wechatclawbot')
    const templateButton = screen.getByRole('button', { name: /资源下载/ })
    await user.click(templateButton)
    await waitFor(() => expect(mocks.openSharedDialog).toHaveBeenCalledOnce())

    mocks.apiPost.mockRejectedValueOnce(new Error('offline'))
    await getDialogEvents().save('{"title":"failed"}')
    expect(mocks.toastError).toHaveBeenCalledWith('模板保存失败！')
    expect(controller.close).not.toHaveBeenCalled()

    mocks.apiGet.mockImplementation((endpoint: string) => {
      if (endpoint === 'system/setting/NotificationTemplates') throw new Error('offline')
      return defaultGet(endpoint)
    })
    mocks.openSharedDialog.mockClear()
    await user.click(screen.getByRole('button', { name: /添加订阅/ }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('模板加载失败！'))
    expect(mocks.openSharedDialog).not.toHaveBeenCalled()
  })

  it('saves edited notification time and merged message scope payloads', async () => {
    const user = userEvent.setup()
    await renderNotificationSettings()
    await screen.findByText('Alpha / wechatclawbot')

    await fireEvent.update(screen.getByLabelText('开始时间'), '09:15')
    await fireEvent.update(screen.getByLabelText('结束时间'), '21:45')
    await user.click(getCard('通知发送时间').getByRole('button', { name: '保存' }))
    expect(mocks.apiPost).toHaveBeenCalledWith('system/setting/NotificationSendTime', {
      start: '09:15',
      end: '21:45',
    })

    const scopeCard = getCard('通知发送范围')
    await user.click(scopeCard.getAllByRole('radio', { name: '仅管理员' })[0])
    await user.click(scopeCard.getByRole('button', { name: '保存' }))
    expect(mocks.apiPost).toHaveBeenCalledWith(
      'system/setting/NotificationSwitchs',
      expect.arrayContaining([
        { type: '资源下载', action: 'admin' },
        { type: '智能体', action: 'admin' },
        { type: '其它', action: 'admin' },
      ]),
    )
    expect(mocks.toastSuccess).toHaveBeenCalledWith('通知发送时间保存成功')
    expect(mocks.toastSuccess).toHaveBeenCalledWith('消息类型开关保存成功')
  })

  it('reports HTTP failures when saving notification time or message scopes', async () => {
    const user = userEvent.setup()
    await renderNotificationSettings()
    await screen.findByText('Alpha / wechatclawbot')

    mocks.apiPost.mockRejectedValueOnce(new Error('offline'))
    await user.click(getCard('通知发送时间').getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('通知发送时间保存失败！'))

    mocks.apiPost.mockRejectedValueOnce(new Error('offline'))
    await user.click(getCard('通知发送范围').getByRole('button', { name: '保存' }))
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('消息类型开关保存失败！'))
  })
})
