import type { FilterRuleOrigin } from '@/api/types'
import {
  describeConflictPlugins,
  describeLayerText,
  describeLayerTitle,
  describePluginLayer,
  describeShadowedLayers,
  groupOriginsByLayer,
  isConflictFatal,
  isConflictResolvedByFallback,
  listShadowedLayerTexts,
  selectIneffectiveOrigins,
} from '@/utils/filterRuleOrigin'
import { describe, expect, it } from 'vitest'

// 用可读的桩替代真实文案，断言的是取了哪个键、拼了哪些参数
const translate = (key: string, named?: Record<string, unknown>) =>
  named
    ? `${key}(${Object.entries(named)
        .map(([name, value]) => `${name}=${value}`)
        .join(',')})`
    : key

function buildOrigin(origin: Partial<FilterRuleOrigin> & Pick<FilterRuleOrigin, 'id'>): FilterRuleOrigin {
  return { kind: 'rule', effective: true, shadowed: [], ...origin }
}

const builtinOrigin = buildOrigin({ id: 'BLU', source: { layer: 'builtin' } })

const pluginOrigin = buildOrigin({
  id: 'PLUGINRULE',
  source: { layer: 'plugin', owner: 'DemoPlugin@alt', extension_id: 'DemoPlugin', instance_id: 'alt' },
})

const userOrigin = buildOrigin({
  id: 'RULE1',
  source: { layer: 'user' },
  shadowed: [
    { layer: 'builtin' },
    { layer: 'plugin', owner: 'DemoPlugin', extension_id: 'DemoPlugin', instance_id: null },
  ],
})

// 争的是内建标识，插件声明作废后回落内建定义，规则仍然生效
const conflictedButEffective = buildOrigin({
  id: '4K',
  source: { layer: 'builtin' },
  conflict: { plugins: ['AlphaPlugin', 'BetaPlugin'], owners: ['AlphaPlugin', 'BetaPlugin@x'] },
})

// 没有任何一层交得出定义，条目仍在但已失效
const conflictedAndVoided = buildOrigin({
  id: 'DUPLICATED',
  effective: false,
  source: null,
  conflict: { plugins: ['AlphaPlugin', 'BetaPlugin'], owners: ['AlphaPlugin', 'BetaPlugin@x'] },
  definition: null,
})

describe('filterRuleOrigin', () => {
  it('按内置、插件、用户的次序归拢生效来源', () => {
    const groups = groupOriginsByLayer([userOrigin, pluginOrigin, builtinOrigin])

    expect(groups.map(group => group.layer)).toEqual(['builtin', 'plugin', 'user'])
    expect(groups.map(group => group.origins.map(origin => origin.id))).toEqual([['BLU'], ['PLUGINRULE'], ['RULE1']])
  })

  it('不产出空分组：规则组没有内置层时不能出现空的内置分组', () => {
    const groups = groupOriginsByLayer([pluginOrigin, userOrigin])

    expect(groups.map(group => group.layer)).toEqual(['plugin', 'user'])
  })

  it('未知来源层与不生效的条目都不进任何分组', () => {
    const unknownLayer = buildOrigin({ id: 'WEIRD', source: { layer: 'sideload' } })

    expect(groupOriginsByLayer([unknownLayer, conflictedAndVoided])).toEqual([])
  })

  it('把不生效的条目单独挑出来，而不是把有冲突的一律挑出来', () => {
    const ineffective = selectIneffectiveOrigins([builtinOrigin, conflictedButEffective, conflictedAndVoided])

    expect(ineffective.map(origin => origin.id)).toEqual(['DUPLICATED'])
  })

  it('冲突是否致命取决于该标识还生不生效，而不是有没有冲突', () => {
    expect(isConflictFatal(conflictedAndVoided)).toBe(true)
    expect(isConflictFatal(conflictedButEffective)).toBe(false)
    expect(isConflictFatal(builtinOrigin)).toBe(false)

    expect(isConflictResolvedByFallback(conflictedButEffective)).toBe(true)
    expect(isConflictResolvedByFallback(conflictedAndVoided)).toBe(false)
    expect(isConflictResolvedByFallback(builtinOrigin)).toBe(false)
  })

  it('插件层标到具体插件与分身，缺少插件标识时回落实例键', () => {
    expect(describePluginLayer({ layer: 'plugin', extension_id: 'DemoPlugin', instance_id: 'alt' })).toBe(
      'DemoPlugin · alt',
    )
    expect(describePluginLayer({ layer: 'plugin', extension_id: 'DemoPlugin', instance_id: null })).toBe('DemoPlugin')
    expect(describePluginLayer({ layer: 'plugin', owner: 'DemoPlugin@alt' })).toBe('DemoPlugin@alt')
    expect(describePluginLayer({ layer: 'builtin' })).toBe('')
  })

  it('来源层展示名取对应文案，未知层回显原串', () => {
    expect(describeLayerTitle('builtin', translate)).toBe('setting.rule.originLayerBuiltin')
    expect(describeLayerTitle('plugin', translate)).toBe('setting.rule.originLayerPlugin')
    expect(describeLayerTitle('user', translate)).toBe('setting.rule.originLayerUser')
    expect(describeLayerTitle('sideload', translate)).toBe('sideload')
  })

  it('层描述在插件层附带插件与分身', () => {
    expect(describeLayerText({ layer: 'user' }, translate)).toBe('setting.rule.originLayerUser')
    expect(describeLayerText({ layer: 'plugin', extension_id: 'DemoPlugin', instance_id: 'alt' }, translate)).toBe(
      'setting.rule.originLayerPlugin DemoPlugin · alt',
    )
  })

  it('列出被压住的下层，次序保持内置到插件', () => {
    expect(listShadowedLayerTexts(userOrigin, translate)).toEqual([
      'setting.rule.originLayerBuiltin',
      'setting.rule.originLayerPlugin DemoPlugin',
    ])
    expect(describeShadowedLayers(userOrigin, translate)).toEqual([
      'setting.rule.originShadowedTag(source=setting.rule.originLayerBuiltin)',
      'setting.rule.originShadowedTag(source=setting.rule.originLayerPlugin DemoPlugin)',
    ])
    expect(describeShadowedLayers(null, translate)).toEqual([])
  })

  it('冲突插件优先按实例键列出，缺实例键时回落插件标识', () => {
    expect(describeConflictPlugins(conflictedAndVoided)).toEqual(['AlphaPlugin', 'BetaPlugin@x'])
    expect(
      describeConflictPlugins(buildOrigin({ id: 'X', conflict: { plugins: ['AlphaPlugin'], owners: [] } })),
    ).toEqual(['AlphaPlugin'])
    expect(describeConflictPlugins(builtinOrigin)).toEqual([])
  })
})
