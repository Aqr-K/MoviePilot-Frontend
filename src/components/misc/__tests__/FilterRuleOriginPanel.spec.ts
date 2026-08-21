import type { FilterRuleOrigin } from '@/api/types'
import FilterRuleOriginPanel from '@/components/misc/FilterRuleOriginPanel.vue'
import { screen, within } from '@testing-library/vue'
import { renderWithProviders } from '@tests/support/render'
import { describe, expect, it } from 'vitest'

function buildOrigin(origin: Partial<FilterRuleOrigin> & Pick<FilterRuleOrigin, 'id'>): FilterRuleOrigin {
  return { kind: 'rule', effective: true, shadowed: [], ...origin }
}

const builtinRule = buildOrigin({ id: 'BLU', source: { layer: 'builtin' }, definition: { id: 'BLU' } })

const pluginRule = buildOrigin({
  id: 'PLUGINRULE',
  source: { layer: 'plugin', owner: 'DemoPlugin@alt', extension_id: 'DemoPlugin', instance_id: 'alt' },
})

const userRule = buildOrigin({
  id: 'RULE1',
  source: { layer: 'user' },
  shadowed: [
    { layer: 'builtin' },
    { layer: 'plugin', owner: 'DemoPlugin', extension_id: 'DemoPlugin', instance_id: null },
  ],
})

// 争的是内建标识：插件声明作废，定义回落内建，规则照常生效
const conflictedButEffective = buildOrigin({
  id: '4K',
  source: { layer: 'builtin' },
  conflict: { plugins: ['AlphaPlugin', 'BetaPlugin'], owners: ['AlphaPlugin', 'BetaPlugin@x'] },
})

// 无人交得出定义，条目仍在但已失效
const conflictedAndVoided = buildOrigin({
  id: 'DUPLICATED',
  effective: false,
  source: null,
  conflict: { plugins: ['AlphaPlugin', 'BetaPlugin'], owners: ['AlphaPlugin', 'BetaPlugin@x'] },
  definition: null,
})

async function renderPanel(props: Record<string, unknown> = {}) {
  return renderWithProviders(FilterRuleOriginPanel, { props: { title: '规则来源', ...props } })
}

function getSectionTitles() {
  return screen.getAllByRole('heading').map(heading => heading.querySelector('span')?.textContent?.trim() ?? '')
}

function getSectionCounts() {
  return screen.getAllByRole('heading').map(heading => heading.textContent?.replace(/\s/g, '') ?? '')
}

function getEntry(id: string) {
  const item = screen.getByText(id).closest('li')
  expect(item).not.toBeNull()
  return within(item as HTMLElement)
}

describe('FilterRuleOriginPanel', () => {
  it('按内置、插件、用户三层分别渲染各自的标识', async () => {
    await renderPanel({ origins: [userRule, pluginRule, builtinRule] })

    expect(getSectionTitles()).toEqual(['内置', '插件', '用户自定义'])
    expect(getSectionCounts()).toEqual(['内置1', '插件1', '用户自定义1'])
    // 插件层标出具体插件与分身，用户才知道该去停用谁
    expect(getEntry('PLUGINRULE').getByText('DemoPlugin · alt')).toBeInTheDocument()
    // 用户自定义压住的下层逐条列出
    expect(getEntry('RULE1').getByText('覆盖内置')).toBeInTheDocument()
    expect(getEntry('RULE1').getByText('覆盖插件 DemoPlugin')).toBeInTheDocument()
  })

  it('规则组没有内置层时不渲染空的内置分组', async () => {
    await renderPanel({ title: '规则组来源', origins: [pluginRule, userRule] })

    expect(getSectionTitles()).toEqual(['插件', '用户自定义'])
    expect(screen.queryByText('内置')).not.toBeInTheDocument()
  })

  it('有冲突但仍生效的标识不能显示为已失效', async () => {
    await renderPanel({ origins: [conflictedButEffective] })

    // 条目留在它生效的那一层里
    expect(getSectionTitles()).toEqual(['内置'])
    const entry = getEntry('4K')
    expect(entry.getByText('插件 AlphaPlugin、BetaPlugin@x 的同名声明已作废，当前回落内置定义')).toBeInTheDocument()
    expect(entry.queryByText('已失效')).not.toBeInTheDocument()
    expect(screen.queryByText('当前不生效')).not.toBeInTheDocument()
  })

  it('冲突失效的条目可见，并列出涉及的插件', async () => {
    await renderPanel({ origins: [builtinRule, conflictedAndVoided] })

    expect(getSectionTitles()).toEqual(['内置', '当前不生效'])
    const entry = getEntry('DUPLICATED')
    expect(entry.getByText('已失效')).toBeInTheDocument()
    expect(entry.getByText('涉及插件：AlphaPlugin、BetaPlugin@x')).toBeInTheDocument()
    expect(
      screen.getByText(
        '多个插件声明了同一个标识，宿主无从裁决谁对，双方声明一并作废；请让其中一方改标识或停用该插件，也可以直接新增同名的自定义规则来接管。',
      ),
    ).toBeInTheDocument()
  })

  it('接口失败时只提示来源不可用，不谎称规则集为空', async () => {
    await renderPanel({ origins: [], failed: true })

    expect(screen.getByText('来源信息加载失败，不影响规则本身的编辑与保存。')).toBeInTheDocument()
    expect(screen.queryByText('暂无来源信息')).not.toBeInTheDocument()
  })

  it('加载中与空结果分别给出各自的占位', async () => {
    const { rerender } = await renderPanel({ origins: [], loading: true })

    expect(screen.getByText('加载中...')).toBeInTheDocument()
    expect(screen.queryByText('暂无来源信息')).not.toBeInTheDocument()

    await rerender({ title: '规则来源', origins: [], loading: false })
    expect(screen.getByText('暂无来源信息')).toBeInTheDocument()
  })
})
