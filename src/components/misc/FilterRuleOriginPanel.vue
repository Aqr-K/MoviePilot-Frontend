<script lang="ts" setup>
import type { FilterRuleLayer, FilterRuleOrigin } from '@/api/types'
import { useI18n } from 'vue-i18n'
import {
  describeConflictPlugins,
  describeLayerText,
  describeLayerTitle,
  describePluginLayer,
  groupOriginsByLayer,
  isConflictFatal,
  isConflictResolvedByFallback,
  selectIneffectiveOrigins,
} from '@/utils/filterRuleOrigin'

// 国际化
const { t } = useI18n()

// 输入参数
const props = defineProps({
  // 面板标题
  title: {
    type: String,
    required: true,
  },
  // 面板说明
  hint: {
    type: String,
    default: '',
  },
  // 来源条目列表
  origins: {
    type: Array as PropType<FilterRuleOrigin[]>,
    default: () => [],
  },
  // 是否正在加载
  loading: {
    type: Boolean,
    default: false,
  },
  // 来源查询是否失败
  failed: {
    type: Boolean,
    default: false,
  },
})

// 按生效来源层归拢的分组，空分组不出现
const layerGroups = computed(() => groupOriginsByLayer(props.origins))

// 当前不生效的标识
const ineffectiveOrigins = computed(() => selectIneffectiveOrigins(props.origins))

/** 取来源层的展示名。 */
function getLayerTitle(layer: string) {
  return describeLayerTitle(layer, t)
}

/** 取某一层的完整描述，插件层要标到具体插件与分身。 */
function getLayerText(layer: FilterRuleLayer) {
  return describeLayerText(layer, t)
}

/** 取涉及冲突的插件清单文案。 */
function getConflictPluginsText(origin: FilterRuleOrigin) {
  return describeConflictPlugins(origin).join('、')
}
</script>

<template>
  <div class="rule-origin">
    <div class="rule-origin__head">
      <span class="rule-origin__title">{{ props.title }}</span>
      <span v-if="props.hint" class="rule-origin__hint">{{ props.hint }}</span>
    </div>

    <VAlert v-if="props.failed" type="warning" variant="tonal" density="compact">
      {{ t('setting.rule.originLoadFailed') }}
    </VAlert>

    <div v-else-if="props.loading" class="rule-origin__placeholder">
      <VProgressCircular indeterminate color="primary" size="20" width="2" />
      <span>{{ t('common.loadingText') }}</span>
    </div>

    <template v-else>
      <section v-for="group in layerGroups" :key="group.layer" class="rule-origin__group">
        <h6 class="rule-origin__group-title">
          <span>{{ getLayerTitle(group.layer) }}</span>
          <VChip size="x-small" variant="tonal" density="comfortable">{{ group.origins.length }}</VChip>
        </h6>
        <ul class="rule-origin__list">
          <li v-for="origin in group.origins" :key="origin.id" class="rule-origin__item">
            <code class="rule-origin__id">{{ origin.id }}</code>
            <VChip v-if="group.layer === 'plugin' && origin.source" size="x-small" variant="tonal" color="info">
              {{ describePluginLayer(origin.source) }}
            </VChip>
            <VChip
              v-for="shadowed in origin.shadowed"
              :key="`${origin.id}-${shadowed.layer}-${shadowed.owner ?? ''}`"
              size="x-small"
              variant="tonal"
            >
              {{ t('setting.rule.originShadowedTag', { source: getLayerText(shadowed) }) }}
            </VChip>
            <VChip v-if="isConflictResolvedByFallback(origin)" size="x-small" variant="tonal" color="warning">
              {{
                t('setting.rule.originConflictFallbackTag', {
                  plugins: getConflictPluginsText(origin),
                  source: getLayerTitle(group.layer),
                })
              }}
            </VChip>
          </li>
        </ul>
      </section>

      <section v-if="ineffectiveOrigins.length" class="rule-origin__group">
        <h6 class="rule-origin__group-title rule-origin__group-title--error">
          <span>{{ t('setting.rule.originIneffectiveTitle') }}</span>
          <VChip size="x-small" variant="tonal" color="error" density="comfortable">
            {{ ineffectiveOrigins.length }}
          </VChip>
        </h6>
        <p class="rule-origin__group-hint">{{ t('setting.rule.originIneffectiveHint') }}</p>
        <ul class="rule-origin__list">
          <li v-for="origin in ineffectiveOrigins" :key="origin.id" class="rule-origin__item is-ineffective">
            <code class="rule-origin__id">{{ origin.id }}</code>
            <VChip size="x-small" variant="tonal" color="error">{{ t('setting.rule.originIneffectiveTag') }}</VChip>
            <span v-if="isConflictFatal(origin)" class="rule-origin__conflict">
              {{ t('setting.rule.originConflictPlugins', { plugins: getConflictPluginsText(origin) }) }}
            </span>
          </li>
        </ul>
      </section>

      <div v-if="!layerGroups.length && !ineffectiveOrigins.length" class="rule-origin__placeholder">
        <span>{{ t('setting.rule.originEmpty') }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.rule-origin {
  display: flex;
  flex-direction: column;
  padding-block: 14px;
  padding-inline: 16px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 8px;
  background-color: rgba(var(--v-theme-on-surface), 0.03);
  gap: 12px;
}

.rule-origin__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
}

.rule-origin__title {
  font-size: 0.95rem;
  font-weight: 550;
}

.rule-origin__hint {
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.78rem;
}

.rule-origin__group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rule-origin__group-title {
  display: flex;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-size: 0.82rem;
  font-weight: 600;
  gap: 6px;
}

.rule-origin__group-title--error {
  color: rgb(var(--v-theme-error));
}

.rule-origin__group-hint {
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.78rem;
  margin-block: 0;
}

.rule-origin__list {
  display: flex;
  flex-direction: column;
  padding-inline-start: 0;
  gap: 6px;
  list-style: none;
}

.rule-origin__item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.rule-origin__item.is-ineffective .rule-origin__id {
  text-decoration: line-through;
}

.rule-origin__id {
  font-family: monospace;
  font-size: 0.8rem;
}

.rule-origin__conflict {
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.78rem;
}

.rule-origin__placeholder {
  display: flex;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), 0.52);
  font-size: 0.82rem;
  gap: 8px;
}
</style>
