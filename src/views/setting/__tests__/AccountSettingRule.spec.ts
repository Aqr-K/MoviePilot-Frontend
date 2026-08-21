import AccountSettingRule from '@/views/setting/AccountSettingRule.vue'
import userEvent from '@testing-library/user-event'
import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  copyToClipboard: vi.fn(),
  openSharedDialog: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
  useSilentSettingRefresh: vi.fn(),
}))

vi.mock('@/api', () => ({
  default: createDataApiMock({ get: mocks.apiGet, post: mocks.apiPost }),
}))

vi.mock('vue-toastification', () => ({
  useToast: () => ({ error: mocks.toastError, success: mocks.toastSuccess, warning: mocks.toastWarning }),
}))

vi.mock('@/@core/utils/navigator', () => ({
  copyToClipboard: mocks.copyToClipboard,
}))

vi.mock('@/composables/useSharedDialog', () => ({
  openSharedDialog: mocks.openSharedDialog,
}))

vi.mock('@/composables/useSilentSettingRefresh', () => ({
  useSilentSettingRefresh: mocks.useSilentSettingRefresh,
}))

vi.mock('@/components/cards/CustomRuleCard.vue', async () => {
  const { defineComponent } = await import('vue')
  return {
    default: defineComponent({
      name: 'CustomRuleCardStub',
      props: { rule: { type: Object, required: true }, origin: { type: Object, default: null } },
      emits: ['close', 'change'],
      template: `
        <section :aria-label="'custom-' + rule.id">
          <span>{{ rule.id }} / {{ rule.name }}</span>
          <span :aria-label="'custom-origin-' + rule.id">{{ origin?.source?.layer ?? 'none' }}</span>
          <input
            :aria-label="'custom-id-' + rule.id"
            :value="rule.id"
            @input="$emit('change', { ...rule, id: $event.target.value }, rule.id)"
          />
          <input
            :aria-label="'custom-name-' + rule.id"
            :value="rule.name"
            @input="$emit('change', { ...rule, name: $event.target.value }, rule.id)"
          />
          <button :aria-label="'remove-custom-' + rule.id" @click="$emit('close')">remove</button>
        </section>
      `,
    }),
  }
})

vi.mock('@/components/cards/FilterRuleGroupCard.vue', async () => {
  const { defineComponent } = await import('vue')
  return {
    default: defineComponent({
      name: 'FilterRuleGroupCardStub',
      props: { group: { type: Object, required: true }, origin: { type: Object, default: null } },
      emits: ['close', 'change'],
      template: `
        <section :aria-label="'group-' + group.name">
          <span>{{ group.name }}</span>
          <span :aria-label="'group-origin-' + group.name">{{ origin?.shadowed?.length ?? 'none' }}</span>
          <input
            :aria-label="'group-name-' + group.name"
            :value="group.name"
            @input="$emit('change', { ...group, name: $event.target.value }, group.name)"
          />
          <button :aria-label="'remove-group-' + group.name" @click="$emit('close')">remove</button>
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
            h('button', { 'aria-label': `reverse-${items[0]?.name ?? 'empty'}`, onClick: reverse }, 'reverse'),
            ...items.map(element => slots.item?.({ element })),
          ])
        }
      },
    }),
  }
})

const customRulesFixture = [
  { id: 'RULE1', name: '规则1', include: 'WEB-DL' },
  { id: 'RULE3', name: '规则3', exclude: 'CAM' },
]

const groupsFixture = [
  { name: '规则组1', rule_string: 'RULE1', media_type: '电影', category: '' },
  { name: '规则组3', rule_string: 'RULE3', media_type: '', category: '' },
]

const ruleOriginsFixture = [
  { id: 'BLU', kind: 'rule', effective: true, source: { layer: 'builtin' }, shadowed: [] },
  {
    id: 'PLUGINRULE',
    kind: 'rule',
    effective: true,
    source: { layer: 'plugin', owner: 'DemoPlugin@alt', extension_id: 'DemoPlugin', instance_id: 'alt' },
    shadowed: [],
  },
  { id: 'RULE1', kind: 'rule', effective: true, source: { layer: 'user' }, shadowed: [{ layer: 'builtin' }] },
  // 争的是内建标识，插件声明作废后回落内建定义，规则仍然生效
  {
    id: '4K',
    kind: 'rule',
    effective: true,
    source: { layer: 'builtin' },
    shadowed: [],
    conflict: { plugins: ['AlphaPlugin', 'BetaPlugin'], owners: ['AlphaPlugin', 'BetaPlugin@x'] },
  },
  {
    id: 'DUPLICATED',
    kind: 'rule',
    effective: false,
    source: null,
    shadowed: [],
    conflict: { plugins: ['AlphaPlugin', 'BetaPlugin'], owners: ['AlphaPlugin', 'BetaPlugin@x'] },
    definition: null,
  },
]

// 规则组没有内置层
const groupOriginsFixture = [
  {
    id: '插件规则组',
    kind: 'rule_group',
    effective: true,
    source: { layer: 'plugin', owner: 'DemoPlugin', extension_id: 'DemoPlugin', instance_id: null },
    shadowed: [],
  },
  {
    id: '规则组3',
    kind: 'rule_group',
    effective: true,
    source: { layer: 'user' },
    shadowed: [{ layer: 'plugin', owner: 'DemoPlugin', extension_id: 'DemoPlugin', instance_id: null }],
  },
]

function mockLoadedRules() {
  mocks.apiGet.mockImplementation((endpoint: string) => {
    if (endpoint === 'media/category') return { 电影: ['华语'] }
    if (endpoint === 'filterrule/rules') return { success: true, data: structuredClone(ruleOriginsFixture) }
    if (endpoint === 'filterrule/groups') return { success: true, data: structuredClone(groupOriginsFixture) }
    if (endpoint === 'system/setting/CustomFilterRules') {
      return { success: true, data: { value: structuredClone(customRulesFixture) } }
    }
    if (endpoint === 'system/setting/UserFilterRuleGroups') {
      return { success: true, data: { value: structuredClone(groupsFixture) } }
    }
    if (endpoint === 'system/setting/TorrentsPriority') {
      return { success: true, data: { value: ['site', 'seeder'] } }
    }
    throw new Error(`Unexpected GET ${endpoint}`)
  })
  mocks.apiPost.mockResolvedValue({ success: true })
}

async function renderRuleSettings() {
  return renderWithProviders(AccountSettingRule)
}

function getCard(title: string) {
  const card = screen.getByText(title).closest('.v-card')
  expect(card).not.toBeNull()
  return within(card as HTMLElement)
}

function getCommandButtons(title: string) {
  const card = screen.getByText(title).closest('.v-card')
  expect(card).not.toBeNull()
  return Array.from((card as HTMLElement).querySelectorAll<HTMLButtonElement>('button.v-btn'))
}

function getOriginSections(card: ReturnType<typeof within>) {
  return card
    .getAllByRole('heading')
    .map((heading: HTMLElement) => heading.querySelector('span')?.textContent?.trim() ?? '')
}

function getImportSave(callIndex: number) {
  return mocks.openSharedDialog.mock.calls[callIndex]?.[2]?.save as (type: string, value: { value: string }) => void
}

describe('AccountSettingRule', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.apiGet.mockReset()
    mocks.apiPost.mockReset()
    mocks.copyToClipboard.mockReset()
    mocks.openSharedDialog.mockReset()
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.toastWarning.mockReset()
    mocks.useSilentSettingRefresh.mockReset()
    mocks.copyToClipboard.mockResolvedValue(true)
    mockLoadedRules()
  })

  it('loads rules, groups, priority, and follows active refresh state', async () => {
    const { rerender } = await renderRuleSettings()

    expect(await screen.findByText('RULE1 / 规则1')).toBeInTheDocument()
    expect(screen.getByText('规则组1')).toBeInTheDocument()
    expect(screen.getByLabelText('当前使用下载优先规则')).toHaveValue('site, seeder')

    const refreshOptions = mocks.useSilentSettingRefresh.mock.calls[0]?.[1]
    expect(refreshOptions.active.value).toBe(true)
    await rerender({ active: false })
    expect(refreshOptions.active.value).toBe(false)
  })

  it('saves custom rules, groups, and torrent priority in current order', async () => {
    const user = userEvent.setup()
    await renderRuleSettings()
    await screen.findByText('RULE1 / 规则1')

    await user.click(screen.getByRole('button', { name: 'reverse-规则1' }))
    await user.click(getCard('自定义规则').getByRole('button', { name: '保存' }))
    expect(mocks.apiPost).toHaveBeenCalledWith('system/setting/CustomFilterRules', [
      expect.objectContaining({ id: 'RULE3' }),
      expect.objectContaining({ id: 'RULE1' }),
    ])

    await user.click(screen.getByRole('button', { name: 'reverse-规则组1' }))
    await user.click(getCard('优先级规则组').getByRole('button', { name: '保存' }))
    expect(mocks.apiPost).toHaveBeenCalledWith('system/setting/UserFilterRuleGroups', [
      expect.objectContaining({ name: '规则组3' }),
      expect.objectContaining({ name: '规则组1' }),
    ])

    await user.click(getCard('下载规则').getByRole('button', { name: '保存' }))
    expect(mocks.apiPost).toHaveBeenCalledWith('system/setting/TorrentsPriority', ['site', 'seeder'])
  })

  it('adds unique automatic names and removes the selected items', async () => {
    const user = userEvent.setup()
    await renderRuleSettings()
    await screen.findByText('RULE1 / 规则1')

    await user.click(getCommandButtons('自定义规则')[1])
    expect(screen.getByText('RULE4 / 规则4')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'remove-custom-RULE1' }))
    expect(screen.queryByText('RULE1 / 规则1')).not.toBeInTheDocument()

    await user.click(getCommandButtons('优先级规则组')[1])
    expect(screen.getByText('规则组4')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'remove-group-规则组1' }))
    expect(screen.queryByText('规则组1')).not.toBeInTheDocument()
  })

  it('blocks empty and duplicate custom rule identifiers or names', async () => {
    const user = userEvent.setup()
    await renderRuleSettings()
    await screen.findByText('RULE1 / 规则1')
    const save = getCard('自定义规则').getByRole('button', { name: '保存' })
    const idInput = screen.getByLabelText('custom-id-RULE1')
    const nameInput = screen.getByLabelText('custom-name-RULE1')

    await fireEvent.update(idInput, '')
    await user.click(save)
    expect(mocks.toastError).toHaveBeenCalledWith('存在空ID的规则，无法保存，请修改！')

    await fireEvent.update(idInput, 'RULE3')
    await user.click(save)
    expect(mocks.toastError).toHaveBeenCalledWith('存在重复规则ID！无法保存，请修改！')

    await fireEvent.update(idInput, 'RULE1')
    await fireEvent.update(nameInput, '')
    await user.click(save)
    expect(mocks.toastError).toHaveBeenCalledWith('存在空名字的规则，无法保存，请修改！')

    await fireEvent.update(nameInput, '规则3')
    await user.click(save)
    expect(mocks.toastError).toHaveBeenCalledWith('存在重复规则名称！无法保存，请修改！')
    expect(mocks.apiPost).not.toHaveBeenCalled()
  })

  it('blocks empty and duplicate rule group names', async () => {
    const user = userEvent.setup()
    await renderRuleSettings()
    await screen.findByText('规则组1')
    const save = getCard('优先级规则组').getByRole('button', { name: '保存' })
    const nameInput = screen.getByLabelText('group-name-规则组1')

    await fireEvent.update(nameInput, '')
    await user.click(save)
    expect(mocks.toastError).toHaveBeenCalledWith('存在空名字的规则组！无法保存，请修改！')

    await fireEvent.update(nameInput, '规则组3')
    await user.click(save)
    expect(mocks.toastError).toHaveBeenCalledWith('存在重复规则组名称！无法保存，请修改！')
    expect(mocks.apiPost).not.toHaveBeenCalled()
  })

  it('imports only contract fields for custom rules and rule groups', async () => {
    const user = userEvent.setup()
    await renderRuleSettings()
    await screen.findByText('规则组1')

    await user.click(getCommandButtons('自定义规则')[2])
    getImportSave(0)('custom', {
      value: JSON.stringify([{ id: 'RULE9', name: '规则9', include: 'REMUX', unexpected: 'ignored' }]),
    })
    expect(await screen.findByText('RULE9 / 规则9')).toBeInTheDocument()
    await user.click(getCard('自定义规则').getByRole('button', { name: '保存' }))
    expect(mocks.apiPost).toHaveBeenLastCalledWith(
      'system/setting/CustomFilterRules',
      expect.arrayContaining([
        {
          id: 'RULE9',
          name: '规则9',
          include: 'REMUX',
          exclude: undefined,
          size_range: undefined,
          seeders: undefined,
          publish_time: undefined,
        },
      ]),
    )

    await user.click(getCommandButtons('优先级规则组')[2])
    getImportSave(1)('group', {
      value: JSON.stringify([{ name: '规则组9', rule_string: 'RULE9', media_type: '电影', extra: true }]),
    })
    expect(await screen.findByText('规则组9')).toBeInTheDocument()
    await user.click(getCard('优先级规则组').getByRole('button', { name: '保存' }))
    expect(mocks.apiPost).toHaveBeenLastCalledWith(
      'system/setting/UserFilterRuleGroups',
      expect.arrayContaining([{ name: '规则组9', rule_string: 'RULE9', media_type: '电影', category: undefined }]),
    )
  })

  it('rejects malformed or structurally invalid imports without mutating rules', async () => {
    const user = userEvent.setup()
    await renderRuleSettings()
    await screen.findByText('RULE1 / 规则1')

    await user.click(getCommandButtons('自定义规则')[2])
    getImportSave(0)('custom', { value: '{bad json' })
    expect(mocks.toastError).toHaveBeenCalledWith('导入规则失败！无法解析输入的数据！')
    expect(screen.queryByText('RULE9 / 规则9')).not.toBeInTheDocument()

    getImportSave(0)('unknown', { value: JSON.stringify([{ id: 'RULE9', name: '规则9' }]) })
    expect(mocks.toastError).toHaveBeenCalledWith('导入规则失败！未知的数据类型！')
    expect(screen.queryByText('RULE9 / 规则9')).not.toBeInTheDocument()

    getImportSave(0)('custom', { value: JSON.stringify([{ name: '缺少ID' }]) })
    expect(mocks.toastError).toHaveBeenCalledWith('导入失败！发现有规则不存在ID，可能属于优先级规则组！')

    await user.click(getCommandButtons('优先级规则组')[2])
    getImportSave(1)('group', { value: JSON.stringify([{ id: 'RULE1', name: '不合法规则组' }]) })
    expect(mocks.toastError).toHaveBeenCalledWith('导入失败！发现有规则存在相同ID，可能属于自定义规则！')
    expect(screen.queryByText('不合法规则组')).not.toBeInTheDocument()
  })

  it('shares and clears each collection through its command group', async () => {
    const user = userEvent.setup()
    await renderRuleSettings()
    await screen.findByText('RULE1 / 规则1')

    await user.click(getCommandButtons('自定义规则')[3])
    expect(mocks.copyToClipboard).toHaveBeenCalledWith(JSON.stringify(customRulesFixture))
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('自定义规则已复制到剪贴板！'))
    await user.click(getCommandButtons('自定义规则')[4])
    expect(screen.queryByText('RULE1 / 规则1')).not.toBeInTheDocument()

    mocks.copyToClipboard.mockResolvedValueOnce(false)
    await user.click(getCommandButtons('优先级规则组')[3])
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith('优先级规则组复制失败：可能是浏览器不支持或被用户阻止！'),
    )
    await user.click(getCommandButtons('优先级规则组')[4])
    expect(screen.queryByText('规则组1')).not.toBeInTheDocument()
  })

  it('分层展示规则来源，并把各自的来源交给对应卡片', async () => {
    await renderRuleSettings()
    await screen.findByText('RULE1 / 规则1')

    const ruleCard = getCard('自定义规则')
    // 内置与插件带来的规则此前在这页上完全看不到
    expect(getOriginSections(ruleCard)).toEqual(['内置', '插件', '用户自定义', '当前不生效'])
    expect(ruleCard.getByText('BLU')).toBeInTheDocument()
    expect(ruleCard.getByText('DemoPlugin · alt')).toBeInTheDocument()

    // 规则组没有内置层，不能渲染一个空的内置分组
    const groupCard = getCard('优先级规则组')
    expect(getOriginSections(groupCard)).toEqual(['插件', '用户自定义'])
    expect(groupCard.getByText('插件规则组')).toBeInTheDocument()

    // 用户自己的卡片上要标出它压住了谁
    expect(screen.getByLabelText('custom-origin-RULE1')).toHaveTextContent('user')
    expect(screen.getByLabelText('group-origin-规则组3')).toHaveTextContent('1')
    expect(screen.getByLabelText('group-origin-规则组1')).toHaveTextContent('none')
  })

  it('区分「有冲突但仍生效」与「因冲突而失效」', async () => {
    await renderRuleSettings()
    await screen.findByText('RULE1 / 规则1')
    const ruleCard = getCard('自定义规则')

    // 4K 争的是内建标识，插件声明作废后回落内建定义，规则照常生效
    expect(ruleCard.getByText('插件 AlphaPlugin、BetaPlugin@x 的同名声明已作废，当前回落内置定义')).toBeInTheDocument()
    expect(ruleCard.getAllByText('已失效')).toHaveLength(1)

    // 失效的条目仍然可见，并说清涉及哪些插件
    expect(ruleCard.getByText('DUPLICATED')).toBeInTheDocument()
    expect(ruleCard.getByText('涉及插件：AlphaPlugin、BetaPlugin@x')).toBeInTheDocument()
  })

  it('来源接口失败时就地提示，不影响规则本身的编辑', async () => {
    const loadedRules = mocks.apiGet.getMockImplementation()
    mocks.apiGet.mockImplementation((endpoint: string) => {
      if (endpoint.startsWith('filterrule/')) throw new Error('offline')
      return loadedRules?.(endpoint)
    })

    await renderRuleSettings()
    await screen.findByText('RULE1 / 规则1')

    expect(screen.getAllByText('来源信息加载失败，不影响规则本身的编辑与保存。')).toHaveLength(2)
    expect(screen.queryByText('暂无来源信息')).not.toBeInTheDocument()
    expect(screen.getByText('规则组1')).toBeInTheDocument()
  })

  it('reports business and HTTP failures for each save responsibility', async () => {
    const user = userEvent.setup()
    await renderRuleSettings()
    await screen.findByText('RULE1 / 规则1')

    const responsibilities = [
      { card: '自定义规则', failure: '自定义规则保存失败！' },
      { card: '优先级规则组', failure: '优先级规则组保存失败！' },
      { card: '下载规则', failure: '优先规则保存失败！' },
    ]

    for (const responsibility of responsibilities) {
      mocks.apiPost.mockResolvedValueOnce({ success: false })
      await user.click(getCard(responsibility.card).getByRole('button', { name: '保存' }))
      await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(responsibility.failure))
      expect(mocks.toastSuccess).not.toHaveBeenCalled()

      mocks.toastError.mockClear()
      mocks.apiPost.mockRejectedValueOnce(new Error('offline'))
      await user.click(getCard(responsibility.card).getByRole('button', { name: '保存' }))
      await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(responsibility.failure))
      expect(mocks.toastSuccess).not.toHaveBeenCalled()
      mocks.toastError.mockClear()
    }
  })
})
