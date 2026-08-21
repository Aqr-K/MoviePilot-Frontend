import DialogCloseBtn from '@/@core/components/DialogCloseBtn.vue'
import { SERVICE_SECRET_MASK } from '@/api/serviceConfig'
import type { StorageConf } from '@/api/types'
import AlistConfigDialog from '@/components/dialog/AlistConfigDialog.vue'
import RcloneConfigDialog from '@/components/dialog/RcloneConfigDialog.vue'
import SmbConfigDialog from '@/components/dialog/SmbConfigDialog.vue'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@tests/support/render'
import { defineComponent, type Component } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ apiPut: vi.fn(), manageStorage: vi.fn() }))

vi.mock('@/api/manage', () => ({
  manageStorage: (...args: unknown[]) => mocks.manageStorage(...args),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({ put: (...args: unknown[]) => mocks.apiPut(...args) }),
}))

// ace 编辑器在 jsdom 里起不来，rclone 配置正文的编辑体验与本组用例无关
const AceEditorStub = defineComponent({
  name: 'VAceEditor',
  props: { value: { type: String, default: '' } },
  emits: ['update:value'],
  template: '<textarea :value="value" @input="$emit(\'update:value\', $event.target.value)" />',
})

// 用户手动输入的凭据取值，用于把「改过」与「原样回传掩码」区分开
const EDITED_CREDENTIAL = 'typed-by-operator'

interface DialogCase {
  // 弹窗组件与它所属的那一份存储实例
  component: Component
  storage: StorageConf
  token: string
  // 每次渲染都要一份新的配置对象：弹窗按引用就地改写它
  conf: () => Record<string, unknown>
  // 非凭据字段，改它一项而不碰凭据，正是掩码会被写进库里的那条路径
  plainField: { key: string; label: string; value: string }
  // 凭据输入框，没有独立凭据项的弹窗为 undefined
  credentialField?: { key: string; label: string }
}

/**
 * 三个弹窗共用同一条保存路径，故按同一张表驱动。
 *
 * 存储配置行不声明契约，凭据键落在哪一份配置里都有可能，弹窗对 `config` 一律原样透传，
 * 因此掩码是否幸存与具体是哪一个存储类型无关。
 */
const rcloneCase: DialogCase = {
  component: RcloneConfigDialog,
  storage: { name: '主盘', type: 'rclone', bare_token_target: true },
  token: 'rclone@主盘',
  conf: () => ({
    filepath: '/moviepilot/.config/rclone/rclone.conf',
    content: '[MP]\ntype = webdav',
    password: SERVICE_SECRET_MASK,
  }),
  plainField: { key: 'filepath', label: 'rclone配置文件路径', value: '/config/rclone/rclone.conf' },
}

const smbCase: DialogCase = {
  component: SmbConfigDialog,
  storage: { name: '共享盘', type: 'smb', bare_token_target: true },
  token: 'smb@共享盘',
  conf: () => ({ host: '192.168.1.100', share: 'media', username: 'mp', password: SERVICE_SECRET_MASK }),
  plainField: { key: 'host', label: 'SMB服务器地址', value: '192.168.1.200' },
  credentialField: { key: 'password', label: '密码' },
}

const alistCase: DialogCase = {
  component: AlistConfigDialog,
  storage: { name: '主库', type: 'alist', bare_token_target: false },
  token: 'alist@主库',
  conf: () => ({ url: 'http://alist:5244', username: 'mp', password: SERVICE_SECRET_MASK }),
  plainField: { key: 'url', label: 'OpenList服务地址', value: 'http://alist:5245' },
  credentialField: { key: 'password', label: '密码' },
}

const allCases: [string, DialogCase][] = [
  ['RcloneConfigDialog', rcloneCase],
  ['SmbConfigDialog', smbCase],
  ['AlistConfigDialog', alistCase],
]

const credentialCases: [string, DialogCase][] = [
  ['SmbConfigDialog', smbCase],
  ['AlistConfigDialog', alistCase],
]

/** 渲染一个存储配置弹窗，返回它这次拿到的配置对象。 */
async function renderDialog(testCase: DialogCase, overrides: Record<string, unknown> = {}) {
  const conf = testCase.conf()
  await renderWithProviders(testCase.component, {
    global: {
      components: { VDialogCloseBtn: DialogCloseBtn },
      stubs: { VAceEditor: AceEditorStub },
    },
    props: {
      conf,
      modelValue: true,
      storage: testCase.token,
      storageConf: testCase.storage,
      ...overrides,
    },
  })
  return conf
}

/** 取出本次 PUT 的配置载荷。 */
function submittedConfig() {
  const [, payload] = mocks.apiPut.mock.calls[0] as [string, { config: Record<string, unknown> }]
  return payload.config
}

describe('存储配置弹窗的配置保存', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.apiPut.mockReset().mockResolvedValue({})
    mocks.manageStorage.mockReset().mockResolvedValue({})
  })

  it.each(allCases)(
    '%s keeps the untouched mask so the stored secret survives an unrelated edit',
    async (_label, testCase) => {
      const user = userEvent.setup()
      await renderDialog(testCase)

      await fireEvent.update(screen.getByLabelText(testCase.plainField.label), testCase.plainField.value)
      await user.click(screen.getByRole('button', { name: '完成' }))

      // 原样回传的掩码即表示这一项没动，服务端从库里取回原值；旧路径整份替换会把掩码本身写成新凭据
      await waitFor(() => expect(mocks.apiPut).toHaveBeenCalledTimes(1))
      expect(mocks.apiPut).toHaveBeenCalledWith(
        `service/configs/storage/${testCase.storage.type}`,
        expect.objectContaining({
          type: testCase.storage.type,
          name: testCase.storage.name,
          config: { ...testCase.conf(), [testCase.plainField.key]: testCase.plainField.value },
        }),
        { params: { name: testCase.storage.name } },
      )
      expect(submittedConfig().password).toBe(SERVICE_SECRET_MASK)
      expect(mocks.manageStorage).not.toHaveBeenCalled()
    },
  )

  it.each(credentialCases)('%s sends the credential the operator actually typed', async (_label, testCase) => {
    const user = userEvent.setup()
    const credentialField = testCase.credentialField!
    await renderDialog(testCase)

    await fireEvent.update(screen.getByLabelText(credentialField.label), EDITED_CREDENTIAL)
    await user.click(screen.getByRole('button', { name: '完成' }))

    await waitFor(() => expect(mocks.apiPut).toHaveBeenCalledTimes(1))
    expect(submittedConfig()[credentialField.key]).toBe(EDITED_CREDENTIAL)
  })

  it.each(allCases)('%s still resets through the storage management action', async (_label, testCase) => {
    const user = userEvent.setup()
    await renderDialog(testCase)

    await user.click(screen.getByRole('button', { name: '重置' }))

    // 重置不是配置写入，仍按实例令牌打到存储管理动作上
    await waitFor(() => expect(mocks.manageStorage).toHaveBeenCalledWith(testCase.token, 'reset_config'))
  })

  it.each(allCases)(
    '%s falls back to the storage management action without an owning instance',
    async (_label, testCase) => {
      const user = userEvent.setup()
      const conf = await renderDialog(testCase, { storageConf: undefined })

      await user.click(screen.getByRole('button', { name: '完成' }))

      await waitFor(() => expect(mocks.manageStorage).toHaveBeenCalledWith(testCase.token, 'save_config', { conf }))
      expect(mocks.apiPut).not.toHaveBeenCalled()
    },
  )
})
