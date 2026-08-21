import type { FilterRuleLayer, FilterRuleOrigin } from '@/api/types'

// 运行期规则集的合并次序，靠后的层压住靠前的层：用户自定义永远赢
export const FILTER_RULE_LAYERS = ['builtin', 'plugin', 'user'] as const

export type FilterRuleLayerName = (typeof FILTER_RULE_LAYERS)[number]

// 按来源层归拢后的一组标识
export interface FilterRuleOriginGroup {
  // 该组的来源层
  layer: FilterRuleLayerName
  // 当前生效定义出自该层的标识
  origins: FilterRuleOrigin[]
}

/**
 * 判断一个来源层标识是否为已知的三层之一
 *
 * @param layer 来源层标识
 * @returns 属于已知三层时为 true
 */
function isKnownLayer(layer: string | undefined): layer is FilterRuleLayerName {
  return FILTER_RULE_LAYERS.includes(layer as FilterRuleLayerName)
}

/**
 * 按生效来源层把标识归拢成分组
 *
 * 空分组不出现在结果里：规则组没有内置层，若照着三层固定渲染，用户会看到一个永远为空
 * 的「内置」分组，误以为内置规则组丢了。
 *
 * @param origins 来源条目列表
 * @returns 按内置、插件、用户次序排列的非空分组
 */
export function groupOriginsByLayer(origins: FilterRuleOrigin[]): FilterRuleOriginGroup[] {
  return FILTER_RULE_LAYERS.map(layer => ({
    layer,
    origins: origins.filter(
      origin => origin.effective && isKnownLayer(origin.source?.layer) && origin.source?.layer === layer,
    ),
  })).filter(group => group.origins.length > 0)
}

/**
 * 取当前不生效的标识
 *
 * 这些条目仍然存在于来源清单里，只是没有任何一层交得出定义——跨插件同名会让双方的
 * 插件声明一并作废，用户看到的是规则莫名其妙不生效，必须让它可见。
 *
 * @param origins 来源条目列表
 * @returns 不生效的来源条目
 */
export function selectIneffectiveOrigins(origins: FilterRuleOrigin[]): FilterRuleOrigin[] {
  return origins.filter(origin => !origin.effective)
}

/**
 * 判断冲突是否让该标识整体失效
 *
 * 冲突只作废插件那一层的声明。若争的是内建标识，插件声明作废后会回落内建定义，规则
 * 照常生效；把「有冲突」一律渲染成「已失效」是错的。
 *
 * @param origin 来源条目
 * @returns 该标识确因冲突而不生效时为 true
 */
export function isConflictFatal(origin: FilterRuleOrigin): boolean {
  return Boolean(origin.conflict) && !origin.effective
}

/**
 * 判断该标识虽有冲突但仍然生效
 *
 * @param origin 来源条目
 * @returns 插件声明已作废但该标识仍由其它层交出定义时为 true
 */
export function isConflictResolvedByFallback(origin: FilterRuleOrigin): boolean {
  return Boolean(origin.conflict) && origin.effective
}

/**
 * 取插件层的展示名
 *
 * 用户看到「来自插件」而不知道该去停用谁，因此要标到具体是哪个插件的哪个分身。
 *
 * @param layer 来源层
 * @returns 插件与分身的展示名；缺少插件信息时回落实例键
 */
export function describePluginLayer(layer: FilterRuleLayer): string {
  if (!layer.extension_id) return layer.owner ?? ''
  if (!layer.instance_id) return layer.extension_id
  return `${layer.extension_id} · ${layer.instance_id}`
}

// 来源层展示名的文案键，规则卡片、规则组卡片与来源面板共用一套称呼
const LAYER_TITLE_KEYS: Record<FilterRuleLayerName, string> = {
  builtin: 'setting.rule.originLayerBuiltin',
  plugin: 'setting.rule.originLayerPlugin',
  user: 'setting.rule.originLayerUser',
}

// 「覆盖了某一层」的文案键
const SHADOWED_TAG_KEY = 'setting.rule.originShadowedTag'

// 取文案的翻译函数，形状与 vue-i18n 的 t 一致
export type FilterRuleOriginTranslate = (key: string, named?: Record<string, unknown>) => string

/**
 * 取来源层的展示名
 *
 * @param layer 来源层标识
 * @param t 翻译函数
 * @returns 来源层展示名；未知层直接回显原串
 */
export function describeLayerTitle(layer: string, t: FilterRuleOriginTranslate): string {
  return isKnownLayer(layer) ? t(LAYER_TITLE_KEYS[layer]) : layer
}

/**
 * 取某一层的完整描述
 *
 * @param layer 来源层
 * @param t 翻译函数
 * @returns 层名；插件层附带具体插件与分身
 */
export function describeLayerText(layer: FilterRuleLayer, t: FilterRuleOriginTranslate): string {
  const title = describeLayerTitle(layer.layer, t)
  if (layer.layer !== 'plugin') return title
  const plugin = describePluginLayer(layer)
  return plugin ? `${title} ${plugin}` : title
}

/**
 * 列出一个标识压住的下层来源
 *
 * @param origin 来源条目
 * @param t 翻译函数
 * @returns 逐个下层的描述，按内置到插件的次序排列
 */
export function listShadowedLayerTexts(
  origin: FilterRuleOrigin | null | undefined,
  t: FilterRuleOriginTranslate,
): string[] {
  return (origin?.shadowed ?? []).map(layer => describeLayerText(layer, t))
}

/**
 * 取一个标识压住的下层来源标签
 *
 * 用户自定义的规则永远赢，但用户未必知道自己顺手覆盖了插件带来的同名规则，卡片上要说清。
 *
 * @param origin 来源条目
 * @param t 翻译函数
 * @returns 逐个下层的「覆盖了谁」标签，按内置到插件的次序排列
 */
export function describeShadowedLayers(
  origin: FilterRuleOrigin | null | undefined,
  t: FilterRuleOriginTranslate,
): string[] {
  return listShadowedLayerTexts(origin, t).map(source => t(SHADOWED_TAG_KEY, { source }))
}

/**
 * 取涉及冲突的插件清单
 *
 * 实例键比插件标识更能定位到具体分身，优先取实例键。
 *
 * @param origin 来源条目
 * @returns 涉及冲突的插件展示名，无冲突时为空数组
 */
export function describeConflictPlugins(origin: FilterRuleOrigin): string[] {
  const conflict = origin.conflict
  if (!conflict) return []
  const owners = conflict.owners ?? []
  return owners.length > 0 ? owners : (conflict.plugins ?? [])
}
