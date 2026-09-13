import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import type { Plugin, PluginInstanceLogLevelOverview } from '@/api/types'
import PluginLogLevelDialog from '@/components/dialog/PluginLogLevelDialog.vue'
import { renderWithProviders } from '@tests/support/render'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  clearPluginInstanceLogLevel: vi.fn(),
  getPluginInstanceLogLevels: vi.fn(),
  setPluginInstanceLogLevel: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/api/pluginLogLevel', () => ({
  clearPluginInstanceLogLevel: mocks.clearPluginInstanceLogLevel,
  getPluginInstanceLogLevels: mocks.getPluginInstanceLogLevels,
  setPluginInstanceLogLevel: mocks.setPluginInstanceLogLevel,
}))

vi.mock('@/api', () => ({
  getApiErrorMessage: (error: unknown) => (error instanceof Error ? error.message : undefined),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess }),
}))

const plugin: Plugin = {
  id: 'DemoPlugin',
  plugin_name: '演示插件',
  plugin_version: '1.1.0',
  installed: true,
}

const overview: PluginInstanceLogLevelOverview = {
  plugin_id: 'DemoPlugin',
  instances: [
    { instance_id: 'DemoPlugin', configured_level: null, expires_at: null, effective_level: 'INFO' },
    {
      instance_id: 'DemoPluginwork',
      configured_level: 'DEBUG',
      expires_at: '2026-09-10T00:00:00Z',
      effective_level: 'DEBUG',
    },
  ],
}

/** 渲染日志等级弹窗并注册真实关闭按钮。 */
async function renderDialog(props: Record<string, unknown> = {}) {
  return renderWithProviders(PluginLogLevelDialog, {
    props: { modelValue: true, plugin, ...props },
    global: { components: { VDialogCloseBtn: DialogCloseBtn } },
  })
}

describe('PluginLogLevelDialog', () => {
  beforeEach(() => {
    mocks.clearPluginInstanceLogLevel.mockReset().mockResolvedValue(null)
    mocks.getPluginInstanceLogLevels.mockReset().mockResolvedValue(overview)
    mocks.setPluginInstanceLogLevel.mockReset().mockResolvedValue(null)
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('列出本体与分身各自配置的与实际生效的等级', async () => {
    await renderDialog()

    expect(await screen.findByText('DemoPluginwork')).toBeInTheDocument()
    expect(mocks.getPluginInstanceLogLevels).toHaveBeenCalledWith('DemoPlugin')
    expect(screen.getByText('本体')).toBeInTheDocument()
    expect(screen.getByText('分身')).toBeInTheDocument()
    expect(screen.getByText('跟随全局')).toBeInTheDocument()
    expect(screen.getByText('已配置：DEBUG')).toBeInTheDocument()
    expect(screen.getByText('生效：INFO')).toBeInTheDocument()
    expect(screen.getByText('生效：DEBUG')).toBeInTheDocument()
  })

  it('从分身卡片进入时改用源插件 ID 查询，并标出当前所在实例', async () => {
    // 后端对分身自身的实例 ID 直接拒绝，卡片是分身时必须重定向到源插件
    await renderDialog({
      plugin: { ...plugin, id: 'DemoPluginwork', is_instance: true, source_plugin_id: 'DemoPlugin' },
    })

    await waitFor(() => expect(mocks.getPluginInstanceLogLevels).toHaveBeenCalledWith('DemoPlugin'))
    expect(await screen.findByText('当前')).toBeInTheDocument()
  })

  it('提交覆盖时把失效时间送成带时区的 ISO 字符串', async () => {
    // 后端把不带时区的失效时间按 UTC 解读，送裸本地时间会让覆盖提前或推迟失效
    await renderDialog()
    await fireEvent.click(await screen.findByTestId('log-level-edit-DemoPlugin'))
    await fireEvent.update(
      document.querySelector<HTMLInputElement>('input[type="datetime-local"]')!,
      '2026-09-10T08:30',
    )
    await fireEvent.click(screen.getByRole('button', { name: '确认' }))

    await waitFor(() => expect(mocks.setPluginInstanceLogLevel).toHaveBeenCalledTimes(1))
    const [pluginId, instanceId, request] = mocks.setPluginInstanceLogLevel.mock.calls[0]
    expect([pluginId, instanceId]).toEqual(['DemoPlugin', 'DemoPlugin'])
    expect(request.level).toBe('INFO')
    expect(request.expires_at).toBe(new Date('2026-09-10T08:30').toISOString())
    expect(mocks.toastSuccess).toHaveBeenCalledWith('日志等级已更新')
    expect(mocks.getPluginInstanceLogLevels).toHaveBeenCalledTimes(2)
  })

  it('未填失效时间时送空值，表示覆盖不过期', async () => {
    await renderDialog()
    await fireEvent.click(await screen.findByTestId('log-level-edit-DemoPlugin'))
    await fireEvent.click(screen.getByRole('button', { name: '确认' }))

    await waitFor(() =>
      expect(mocks.setPluginInstanceLogLevel).toHaveBeenCalledWith('DemoPlugin', 'DemoPlugin', {
        level: 'INFO',
        expires_at: null,
      }),
    )
  })

  it('只给已配置覆盖的实例提供清除入口，清除后回落全局等级', async () => {
    await renderDialog()
    await fireEvent.click(await screen.findByTestId('log-level-edit-DemoPlugin'))

    expect(screen.queryByRole('button', { name: '清除覆盖' })).toBeNull()

    await fireEvent.click(screen.getByTestId('log-level-edit-DemoPluginwork'))
    await fireEvent.click(await screen.findByRole('button', { name: '清除覆盖' }))

    await waitFor(() => expect(mocks.clearPluginInstanceLogLevel).toHaveBeenCalledWith('DemoPlugin', 'DemoPluginwork'))
    expect(mocks.toastSuccess).toHaveBeenCalledWith('已清除日志等级覆盖，回落全局等级')
  })

  it('设置失败时保留编辑器并报出后端原因', async () => {
    mocks.setPluginInstanceLogLevel.mockRejectedValueOnce(new Error('实例不存在'))
    await renderDialog()
    await fireEvent.click(await screen.findByTestId('log-level-edit-DemoPlugin'))
    await fireEvent.click(screen.getByRole('button', { name: '确认' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('设置失败：实例不存在'))
    expect(screen.getByRole('button', { name: '确认' })).toBeInTheDocument()
  })

  it('加载失败时保留重试入口', async () => {
    mocks.getPluginInstanceLogLevels.mockRejectedValueOnce(new Error('network unavailable')).mockResolvedValue(overview)
    await renderDialog()

    expect(await screen.findByText('实例日志等级加载失败，请稍后重试')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: '重试' }))

    await waitFor(() => expect(mocks.getPluginInstanceLogLevels).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('DemoPluginwork')).toBeInTheDocument()
  })

  it('通过 modelValue 契约关闭', async () => {
    const { emitted } = await renderDialog()

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    const closeButton = document.querySelector<HTMLButtonElement>('.absolute.right-3.top-3')
    expect(closeButton).not.toBeNull()
    await fireEvent.click(closeButton!)

    expect(emitted()['update:modelValue']).toContainEqual([false])
    expect(emitted().close).toHaveLength(1)
  })
})
