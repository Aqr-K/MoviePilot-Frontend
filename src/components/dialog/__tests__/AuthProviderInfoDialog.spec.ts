import type { AuthProviderConf } from '@/api/types'
import AuthProviderInfoDialog from '@/components/dialog/AuthProviderInfoDialog.vue'
import { renderWithProviders } from '@tests/support/render'
import { fireEvent, screen, waitFor } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { defineComponent, h, type PropType } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({ get: mocks.apiGet }),
}))

const DialogStub = defineComponent({
  name: 'VDialog',
  setup:
    (_, { slots }) =>
    () =>
      h('section', { role: 'dialog' }, slots.default?.()),
})

const CloseButtonStub = defineComponent({
  name: 'VDialogCloseBtn',
  setup:
    (_, { attrs }) =>
    () =>
      h('button', { ...attrs, 'aria-label': '关闭', type: 'button' }),
})

const LoadingBannerStub = defineComponent({
  name: 'LoadingBanner',
  setup: () => () => h('div', '正在加载'),
})

// 声明方给的界面在此处只需可辨认：真正的渲染由 FormRender 的自有用例把关
const FormRenderStub = defineComponent({
  name: 'FormRender',
  props: {
    config: { type: Object as PropType<Record<string, unknown>>, required: true },
    model: { type: Object as PropType<Record<string, unknown>>, required: true },
  },
  setup: props => () =>
    h('input', {
      'aria-label': `form-${props.config.component}`,
      value: String(props.model.client_secret ?? ''),
      onInput: (event: Event) => {
        props.model.client_secret = (event.target as HTMLInputElement).value
      },
    }),
})

function createProvider(overrides: Partial<AuthProviderConf> = {}): AuthProviderConf {
  return {
    type: 'oidc',
    name: 'Keycloak',
    enabled: true,
    config: { client_id: 'moviepilot', client_secret: '********' },
    ...overrides,
  }
}

const configFormFixture = {
  available: true,
  name: 'OIDC 登录',
  multi_instance: true,
  conf: [{ component: 'VTextField' }],
  model: { client_id: '', client_secret: '', scope: 'openid' },
  component: null,
  remote: null,
  config_schema: null,
}

async function renderDialog(props: Record<string, unknown> = {}) {
  return renderWithProviders(AuthProviderInfoDialog, {
    props: {
      modelValue: true,
      provider: createProvider(),
      providers: [createProvider()],
      maskedFields: ['config.client_secret'],
      ...props,
    },
    global: {
      stubs: {
        FormRender: FormRenderStub,
        LoadingBanner: LoadingBannerStub,
        VDialog: DialogStub,
        VDialogCloseBtn: CloseButtonStub,
      },
    },
  })
}

/** 展开专家面板，普通用户看不到里面那一项，用例要摸到它得跟用户一样先点开。 */
async function openAdvancedPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '身份绑定标识' }))
  return screen.findByLabelText('身份绑定标识')
}

describe('AuthProviderInfoDialog', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    mocks.apiGet.mockReset()
    mocks.apiGet.mockImplementation((endpoint: string) => {
      if (endpoint === 'service/config_form/auth/oidc') return { success: true, data: configFormFixture }
      throw new Error(`Unexpected GET ${endpoint}`)
    })
  })

  it('renders the declared config form through the admin endpoint', async () => {
    await renderDialog()

    expect(await screen.findByLabelText('form-VTextField')).toBeInTheDocument()
    expect(mocks.apiGet).toHaveBeenCalledWith('service/config_form/auth/oidc')
    expect(mocks.apiGet).not.toHaveBeenCalledWith('auth/providers')
  })

  it('never offers a default-target switch, because this family structurally has none', async () => {
    await renderDialog()
    await screen.findByLabelText('form-VTextField')

    expect(screen.queryByText('默认调用目标')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('默认调用目标')).not.toBeInTheDocument()
  })

  it('keeps the identity key folded away with the derived value shown as its placeholder', async () => {
    const user = userEvent.setup()
    await renderDialog()
    await screen.findByLabelText('form-VTextField')
    // 绝大多数用户从不需要碰这一项，摆在正面只会让人以为它必填
    expect(screen.queryByLabelText('身份绑定标识')).not.toBeInTheDocument()

    const identityField = (await openAdvancedPanel(user)) as HTMLInputElement

    expect(identityField).toHaveValue('')
    expect(identityField).toHaveAttribute('placeholder', 'oidc@Keycloak')
    expect(screen.getByText('当前生效的标识：oidc@Keycloak')).toBeInTheDocument()
  })

  it('opens the expert panel on its own when a key was already filled in', async () => {
    await renderDialog({ provider: createProvider({ identity_provider: 'legacy-sso' }) })
    await screen.findByLabelText('form-VTextField')

    // 冲突时入口会从登录页上消失，而原因就藏在这一项里，收着等于让用户对着正常配置排查
    expect(await screen.findByLabelText('身份绑定标识')).toHaveValue('legacy-sso')
  })

  it('submits the identity key beside config, not inside it, and drops it again when cleared', async () => {
    const user = userEvent.setup()
    const { emitted } = await renderDialog()
    await screen.findByLabelText('form-VTextField')

    await fireEvent.update(await openAdvancedPanel(user), '  legacy-sso  ')
    await user.click(screen.getByRole('button', { name: '保存' }))

    // 宿主字段混进 config 会被声明了契约的类型判为违约、整条配置连带被拒收
    expect(emitted('change')[0]).toEqual([
      {
        type: 'oidc',
        name: 'Keycloak',
        enabled: true,
        config: { client_id: 'moviepilot', client_secret: '********', scope: 'openid' },
        identity_provider: 'legacy-sso',
      },
      'Keycloak',
    ])
    expect((emitted('change')[0] as [AuthProviderConf, string])[0]).not.toHaveProperty('default')
  })

  it('omits the identity key when it is left empty so the host keeps deriving it', async () => {
    const user = userEvent.setup()
    const { emitted } = await renderDialog()
    await screen.findByLabelText('form-VTextField')

    await user.click(screen.getByRole('button', { name: '保存' }))

    expect((emitted('change')[0] as [AuthProviderConf, string])[0]).not.toHaveProperty('identity_provider')
  })

  it('echoes an untouched mask back and replaces it only once the field is edited', async () => {
    const user = userEvent.setup()
    const { emitted } = await renderDialog()
    await screen.findByLabelText('form-VTextField')
    expect(screen.getByText(/凭据已隐藏/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '保存' }))
    expect((emitted('change')[0] as [AuthProviderConf, string])[0].config.client_secret).toBe('********')
  })

  it('replaces the stored credential once the masked field is edited', async () => {
    const user = userEvent.setup()
    const { emitted } = await renderDialog()

    await fireEvent.update(await screen.findByLabelText('form-VTextField'), 'rotated-secret')
    await user.click(screen.getByRole('button', { name: '保存' }))

    expect((emitted('change')[0] as [AuthProviderConf, string])[0].config.client_secret).toBe('rotated-secret')
  })

  it('warns as soon as the typed key is already claimed by another entry', async () => {
    const user = userEvent.setup()
    await renderDialog({
      providers: [createProvider(), createProvider({ type: 'embysso', name: '家里那台' })],
    })
    await screen.findByLabelText('form-VTextField')
    expect(screen.queryByText(/已被同族另一条配置认领/)).not.toBeInTheDocument()

    await fireEvent.update(await openAdvancedPanel(user), 'embysso@家里那台')

    expect(await screen.findByText(/标识 embysso@家里那台 已被同族另一条配置认领/)).toBeInTheDocument()
  })

  it('warns when a rename makes the derived key collide with another entry', async () => {
    await renderDialog({
      providers: [createProvider(), createProvider({ name: 'Authentik' })],
    })
    await screen.findByLabelText('form-VTextField')

    await fireEvent.update(screen.getByLabelText('入口名称'), 'Authentik')

    expect(await screen.findByText(/标识 oidc@Authentik 已被同族另一条配置认领/)).toBeInTheDocument()
  })

  it('explains an absent config form instead of hanging on the loading banner', async () => {
    mocks.apiGet.mockImplementation(() => {
      throw new Error('offline')
    })
    await renderDialog()

    await waitFor(() => expect(screen.getByText('该登录入口类型没有提供配置界面。')).toBeInTheDocument())
    expect(screen.queryByText('正在加载')).not.toBeInTheDocument()
  })

  it('refuses to save an entry without a name, because an unnamed button cannot be shown', async () => {
    const user = userEvent.setup()
    const { emitted } = await renderDialog()
    await screen.findByLabelText('form-VTextField')

    await fireEvent.update(screen.getByLabelText('入口名称'), '   ')
    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(emitted('change')).toBeUndefined()
  })
})
