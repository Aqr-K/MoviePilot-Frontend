import StorageCard from '@/components/cards/StorageCard.vue'
import type { StorageConf } from '@/api/types'
import { screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  manageStorage: vi.fn(),
  openSharedDialog: vi.fn(),
}))

vi.mock('@/api/manage', () => ({
  manageStorage: (...args: unknown[]) => mocks.manageStorage(...args),
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: mocks.openSharedDialog,
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({ get: vi.fn(), post: vi.fn() }),
}))

// 取色依赖 canvas，在 jsdom 里取不到像素，卡片强调色与本用例无关
vi.mock('@/composables/useCardAccentColor', async () => {
  const { ref } = await import('vue')
  return {
    useCardAccentColor: () => ({ accentRgb: ref('0, 0, 0'), imageRef: ref(null), updateAccentColor: vi.fn() }),
  }
})

const ImageStub = { name: 'VImg', template: '<img />' }

/** 渲染一张存储卡片。 */
async function renderCard(storage: Partial<StorageConf>) {
  return renderWithProviders(StorageCard, {
    global: { stubs: { VImg: ImageStub } },
    props: { storage: { name: 'u115', type: 'u115', config: { cookie: 'x' }, ...storage } },
  })
}

describe('StorageCard', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.manageStorage.mockReset().mockResolvedValue({ total: 100, available: 40 })
    mocks.openSharedDialog.mockReset()
  })

  it('asks about the bare token holder using the bare token, as today', async () => {
    await renderCard({ name: 'u115', bare_token_target: true })
    await waitFor(() => expect(mocks.manageStorage).toHaveBeenCalledWith('u115', 'usage'))
  })

  it('asks about a named instance using its own token, not the storage type', async () => {
    // 同一类型配了两份时，类型标识指不到具体哪一份，管理动作会打到错误的实例上
    await renderCard({ name: 'work', bare_token_target: false })
    await waitFor(() => expect(mocks.manageStorage).toHaveBeenCalledWith('u115@work', 'usage'))
  })

  it('hands the instance token to the credential dialog', async () => {
    const user = userEvent.setup()
    await renderCard({ name: 'work', bare_token_target: false })
    await user.click(screen.getByText('u115@work'))
    const [, dialogProps] = mocks.openSharedDialog.mock.calls.at(-1) as [unknown, Record<string, unknown>]
    expect(dialogProps).toMatchObject({ storage: 'u115@work', conf: { cookie: 'x' } })
  })

  it('raises the instance shell editor without opening the credential dialog', async () => {
    const user = userEvent.setup()
    const { emitted } = await renderCard({ name: 'work', bare_token_target: false })
    await user.click(screen.getByRole('button', { name: 'edit-work' }))
    expect(emitted().edit).toBeTruthy()
    expect(mocks.openSharedDialog).not.toHaveBeenCalled()
  })

  it('shows the token so the operator can see what a path must spell', async () => {
    await renderCard({ name: '主库', bare_token_target: false, type: 'alistgo' })
    expect(screen.getByText('alistgo@主库')).toBeInTheDocument()
  })
})
