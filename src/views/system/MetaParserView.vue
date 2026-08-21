<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import api from '@/api'
import type { MetaParserOrderEntry, MetaParserPipeline, MetaParserRing } from '@/api/types'
import { useI18n } from 'vue-i18n'

// 国际化
const { t } = useI18n()

// 提示框
const $toast = useToast()

// 拖拽库只在解析环可排序时才需要，进入面板后再加载。
const Draggable = defineAsyncComponent(() => import('vuedraggable').then(module => module.default))

// 宿主固定的解析环，位次与启停都不可改
const pinnedRings = ref<MetaParserRing[]>([])

// 可由用户排序的解析环
const sortableRings = ref<MetaParserRing[]>([])

// 排序失败时只能回退到最近一次由服务端确认的顺序，不能保留未落盘的拖拽结果。
const confirmedRings = ref<MetaParserRing[]>([])

// 是否正在首次加载
const loading = ref(true)

// 是否有写入请求在途，避免拖拽与启停并发提交
const saving = ref(false)

/** 按宿主是否固定位次拆分解析环，并记录服务端确认的顺序。 */
function applyPipeline(pipeline: MetaParserPipeline | null) {
  const rings = pipeline?.rings ?? []
  pinnedRings.value = rings.filter(ring => ring.pinned)
  sortableRings.value = rings.filter(ring => !ring.pinned)
  confirmedRings.value = sortableRings.value.map(ring => ({ ...ring }))
}

/** 调用 API 查询解析环的最终生效顺序。 */
async function loadPipeline() {
  try {
    const result: MetaParserPipeline = await api.get('metaparser/pipeline')

    applyPipeline(result)
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

/** 把当前展示顺序整理成写入接口要求的顺序项，宿主固定的环不参与提交。 */
function buildOrderPayload(): MetaParserOrderEntry[] {
  return sortableRings.value.map(ring => ({ enabled: ring.enabled, parser: ring.parser }))
}

/** 判断当前展示顺序是否已与服务端确认过的顺序一致。 */
function isOrderUnchanged() {
  return sortableRings.value.every((ring, index) => confirmedRings.value[index]?.parser === ring.parser)
}

/** 保存拖拽后的执行顺序，失败时回退到服务端确认过的顺序。 */
async function saveOrder() {
  // 原位放下不构成顺序变化，不必写入。
  if (saving.value || isOrderUnchanged()) return

  saving.value = true
  try {
    const result: MetaParserPipeline = await api.post('metaparser/order', buildOrderPayload())

    applyPipeline(result)
    $toast.success(t('setting.metaParser.orderSaveSuccess'))
  } catch (error) {
    console.error(error)
    sortableRings.value = confirmedRings.value.map(ring => ({ ...ring }))
    await loadPipeline()
  } finally {
    saving.value = false
  }
}

/** 启停单个解析环；后端会连同当前位次一并落盘，因此直接按返回结果重绘。 */
async function toggleRing(ring: MetaParserRing, enabled: boolean) {
  if (ring.pinned || saving.value) return

  saving.value = true
  try {
    const result: MetaParserPipeline = await api.post('metaparser/toggle', {
      enabled,
      parser: ring.parser,
    })

    applyPipeline(result)
  } catch (error) {
    console.error(error)
    await loadPipeline()
  } finally {
    saving.value = false
  }
}

/** 取解析环的来源描述：内建环归宿主，其余标出插件与分身。 */
function getRingOwnerText(ring: MetaParserRing) {
  if (!ring.extension_id) return t('setting.metaParser.ownerHost')
  if (!ring.instance_id) return ring.extension_id
  return `${ring.extension_id} · ${ring.instance_id}`
}

/** 取发行方式标签文案，未知取值直接回显原串。 */
function getDistributionText(ring: MetaParserRing) {
  if (ring.distribution === 'builtin') return t('setting.metaParser.distributionBuiltin')
  if (ring.distribution === 'market') return t('setting.metaParser.distributionMarket')
  return ring.distribution
}

onMounted(loadPipeline)
</script>

<template>
  <VCard class="meta-parser-card">
    <VCardItem>
      <VCardTitle>{{ t('setting.metaParser.title') }}</VCardTitle>
      <VCardSubtitle>{{ t('setting.metaParser.subtitle') }}</VCardSubtitle>
    </VCardItem>

    <VCardText>
      <VAlert type="info" variant="tonal" density="compact" class="mb-4">
        {{ t('setting.metaParser.orderHint') }}
      </VAlert>

      <div v-if="loading" class="meta-parser-placeholder">
        <VProgressCircular indeterminate color="primary" size="22" width="2" />
        <span>{{ t('common.loadingText') }}</span>
      </div>

      <template v-else>
        <div class="meta-parser-list">
          <article v-for="(ring, index) in pinnedRings" :key="ring.parser" class="meta-parser-ring is-pinned">
            <span class="ring-order">{{ index + 1 }}</span>
            <div class="ring-content">
              <div class="ring-title">
                <span class="ring-name">{{ ring.name }}</span>
                <VChip size="x-small" variant="tonal" color="primary">
                  {{ t('setting.metaParser.pinnedTag') }}
                </VChip>
              </div>
              <p class="ring-meta">{{ t('setting.metaParser.pinnedHint') }}</p>
            </div>
            <VIcon icon="mdi-lock-outline" class="ring-lock" aria-hidden="true" />
          </article>

          <Draggable
            v-if="sortableRings.length"
            v-model="sortableRings"
            handle=".cursor-move"
            item-key="parser"
            tag="div"
            :animation="180"
            :disabled="saving"
            :component-data="{ 'class': 'meta-parser-list' }"
            @end="saveOrder"
          >
            <template #item="{ element, index }">
              <article class="meta-parser-ring" :class="{ 'is-disabled': !element.enabled }">
                <!-- 拖拽过程中服务端位次尚未刷新，位次按当前展示位置计算 -->
                <span class="ring-order">{{ pinnedRings.length + index + 1 }}</span>
                <div class="ring-content">
                  <div class="ring-title">
                    <span class="ring-name">{{ element.name }}</span>
                    <VChip size="x-small" variant="tonal">{{ getDistributionText(element) }}</VChip>
                    <VChip v-if="!element.configured" size="x-small" variant="tonal" color="warning">
                      {{ t('setting.metaParser.unconfiguredTag') }}
                    </VChip>
                  </div>
                  <p class="ring-meta">
                    <span>{{ getRingOwnerText(element) }}</span>
                    <span class="ring-parser-id">{{ element.parser_id }}</span>
                  </p>
                </div>
                <VSwitch
                  :model-value="element.enabled"
                  :disabled="saving"
                  color="primary"
                  density="compact"
                  hide-details
                  :aria-label="t('setting.metaParser.toggleLabel', { name: element.name })"
                  @update:model-value="value => toggleRing(element, Boolean(value))"
                />
                <VIcon icon="mdi-drag-vertical" class="ring-drag cursor-move" aria-hidden="true" />
              </article>
            </template>
          </Draggable>
        </div>

        <div v-if="!sortableRings.length" class="meta-parser-placeholder">
          <VIcon icon="mdi-text-search-variant" size="44" />
          <span>{{ t('setting.metaParser.noExtensionRing') }}</span>
        </div>
      </template>
    </VCardText>
  </VCard>
</template>

<style scoped>
.meta-parser-card {
  background: transparent;
  box-shadow: none;
}

.meta-parser-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.meta-parser-ring {
  display: flex;
  align-items: center;
  padding-block: 10px;
  padding-inline: 14px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 8px;
  background-color: rgba(var(--v-theme-on-surface), 0.04);
  gap: 12px;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    opacity 0.2s ease;
}

.meta-parser-ring.is-pinned {
  border-color: rgba(var(--v-theme-primary), 0.3);
  background-color: rgba(var(--v-theme-primary), 0.08);
}

.meta-parser-ring.is-disabled {
  opacity: 0.6;
}

.ring-order {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  inline-size: 26px;
  block-size: 26px;
  border-radius: 50%;
  background-color: rgba(var(--v-theme-on-surface), 0.08);
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.ring-content {
  flex: 1;
  min-inline-size: 0;
}

.ring-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.ring-name {
  font-size: 0.95rem;
  font-weight: 550;
}

.ring-meta {
  display: flex;
  flex-wrap: wrap;
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.78rem;
  gap: 8px;
  margin-block: 2px 0;
}

.ring-parser-id {
  font-family: monospace;
}

.ring-lock,
.ring-drag {
  flex-shrink: 0;
  color: rgba(var(--v-theme-on-surface), 0.52);
}

.ring-drag {
  cursor: grab;
}

.ring-drag:active {
  cursor: grabbing;
}

.meta-parser-ring:hover .ring-drag {
  color: rgb(var(--v-theme-primary));
}

.meta-parser-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: rgba(var(--v-theme-on-surface), 0.52);
  gap: 12px;
  min-block-size: 160px;
}
</style>
