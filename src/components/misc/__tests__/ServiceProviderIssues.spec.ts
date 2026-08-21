import ServiceProviderIssues from '@/components/misc/ServiceProviderIssues.vue'
import type { ServiceConfigProviderIssue } from '@/api/types'
import { screen, waitFor } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ apiGet: vi.fn() }))

vi.mock('@/api', () => ({
  default: createDataApiMock({ get: (...args: unknown[]) => mocks.apiGet(...args) }),
}))

/** 造一条「提供方已消失」的记录。 */
function issue(overrides: Partial<ServiceConfigProviderIssue> = {}): ServiceConfigProviderIssue {
  return {
    capability: 'storage',
    type: 'p123',
    name: '我的网盘',
    provider: 'P123Helper',
    extension_id: 'P123Helper',
    reason: 'not_installed',
    ...overrides,
  }
}

describe('ServiceProviderIssues', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    mocks.apiGet.mockReset().mockResolvedValue([])
  })

  it('stays out of the way when every provider is present', async () => {
    await renderWithProviders(ServiceProviderIssues)
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith('service/absent_providers'))
    expect(screen.queryByText('以下配置当前不生效')).toBeNull()
  })

  it.each([
    ['not_installed', '提供方 P123Helper 未安装，装回该插件即可恢复'],
    ['disabled', '提供方 P123Helper 已安装但未启用，启用该插件即可恢复'],
    ['start_failed', '提供方 P123Helper 已启用，但服务类型 p123 没有登记成功，请查看该插件的日志'],
  ])('localises the %s reason into an actionable sentence', async (reason, expected) => {
    mocks.apiGet.mockResolvedValue([issue({ reason })])
    await renderWithProviders(ServiceProviderIssues)
    await waitFor(() => expect(screen.getByText('以下配置当前不生效')).toBeInTheDocument())
    expect(screen.getByText(`— ${expected}`)).toBeInTheDocument()
    expect(screen.getByText('我的网盘')).toBeInTheDocument()
    // 成因代码本身绝不直接呈现给用户
    expect(screen.queryByText(reason)).toBeNull()
  })

  it('falls back to a generic sentence for a reason code it does not know yet', async () => {
    mocks.apiGet.mockResolvedValue([issue({ reason: 'quarantined' })])
    await renderWithProviders(ServiceProviderIssues)
    await waitFor(() => expect(screen.getByText('— 提供方 P123Helper 当前不可用')).toBeInTheDocument())
  })

  it('lists every affected configuration across families', async () => {
    mocks.apiGet.mockResolvedValue([
      issue({ capability: 'storage', name: '网盘一' }),
      issue({ capability: 'auth', type: 'oidc', name: '公司登录', reason: 'disabled' }),
    ])
    await renderWithProviders(ServiceProviderIssues)
    await waitFor(() => expect(screen.getByText('网盘一')).toBeInTheDocument())
    expect(screen.getByText('公司登录')).toBeInTheDocument()
  })

  it('renders nothing when the query fails rather than breaking the settings page', async () => {
    mocks.apiGet.mockRejectedValue(new Error('boom'))
    await renderWithProviders(ServiceProviderIssues)
    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalled())
    expect(screen.queryByText('以下配置当前不生效')).toBeNull()
  })
})
