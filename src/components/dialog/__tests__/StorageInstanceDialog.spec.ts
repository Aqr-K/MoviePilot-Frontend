import StorageInstanceDialog from '@/components/dialog/StorageInstanceDialog.vue'
import type { StorageConf } from '@/api/types'
import { screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** 渲染实例外壳设置弹窗。 */
async function renderDialog(storage: Partial<StorageConf> = {}) {
  return renderWithProviders(StorageInstanceDialog, {
    props: {
      storage: { name: 'work', type: 'u115', config: {}, bare_token_target: false, default: false, ...storage },
    },
  })
}

/** 取出弹窗交出的那一份配置。 */
function donedPayload(emitted: Record<string, unknown[]>) {
  return (emitted.done?.at(-1) as [StorageConf])[0]
}

describe('StorageInstanceDialog', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('previews the token a path must spell for this instance', async () => {
    await renderDialog({ name: 'work', bare_token_target: false })
    expect(screen.getByText('u115@work')).toBeInTheDocument()
  })

  it('previews the bare token once the instance receives instance-less paths', async () => {
    await renderDialog({ name: 'work', bare_token_target: true })
    expect(screen.getByText('u115')).toBeInTheDocument()
  })

  it('carries the bare-token switch and the default-target switch independently', async () => {
    const user = userEvent.setup()
    const { emitted } = await renderDialog({ bare_token_target: false, default: false })

    // 只翻裸令牌承接：它回答「路径没写实例名时落到哪一份」
    await user.click(screen.getByRole('checkbox', { name: '承接不带实例名的路径' }))
    await user.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(emitted().done).toBeTruthy())
    expect(donedPayload(emitted())).toMatchObject({ bare_token_target: true, default: false })
  })

  it('turns on the default target without claiming the bare token', async () => {
    const user = userEvent.setup()
    const { emitted } = await renderDialog({ bare_token_target: false, default: false })

    // 只翻默认调用目标：它回答「调用完全没指定存储时用哪一份」，两者互不蕴含
    await user.click(screen.getByRole('checkbox', { name: '默认调用目标' }))
    await user.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(emitted().done).toBeTruthy())
    expect(donedPayload(emitted())).toMatchObject({ bare_token_target: false, default: true })
  })

  it('keeps both switches on when the instance is both the bare-token holder and the default', async () => {
    const user = userEvent.setup()
    const { emitted } = await renderDialog({ bare_token_target: true, default: true })
    await user.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(emitted().done).toBeTruthy())
    expect(donedPayload(emitted())).toMatchObject({ bare_token_target: true, default: true })
  })

  it('refuses an instance name that would make the token unparseable', async () => {
    const user = userEvent.setup()
    const { emitted } = await renderDialog()
    const nameField = screen.getByRole('textbox')
    await user.clear(nameField)
    await user.type(nameField, 'a@b')

    await waitFor(() => expect(screen.getByRole('button', { name: '保存' })).toBeDisabled())
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(emitted().done).toBeFalsy()
  })

  it('renames the instance and reports the new token', async () => {
    const user = userEvent.setup()
    const { emitted } = await renderDialog({ name: 'work' })
    const nameField = screen.getByRole('textbox')
    await user.clear(nameField)
    await user.type(nameField, 'home')

    expect(await screen.findByText('u115@home')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(emitted().done).toBeTruthy())
    expect(donedPayload(emitted())).toMatchObject({ name: 'home', type: 'u115' })
  })
})
