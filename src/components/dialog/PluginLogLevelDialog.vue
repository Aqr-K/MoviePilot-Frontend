<script setup lang="ts">
import { getApiErrorMessage } from '@/api'
import {
  clearPluginInstanceLogLevel,
  getPluginInstanceLogLevels,
  setPluginInstanceLogLevel,
} from '@/api/pluginLogLevel'
import type { Plugin, PluginInstanceLogLevel } from '@/api/types'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'
import { useDisplay } from 'vuetify'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: true,
  },
  plugin: {
    type: Object as PropType<Plugin>,
    required: true,
  },
})

const emit = defineEmits(['update:modelValue', 'close'])

const { mdAndUp } = useDisplay()
const { t, locale } = useI18n()
const $toast = useToast()

const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

const loading = ref(false)
const loadFailed = ref(false)
const instances = ref<PluginInstanceLogLevel[]>([])
// 后端回执里的插件 ID，本体行以它为准，而不是打开弹窗时那张卡片的 ID
const overviewPluginId = ref('')

const editingId = ref<string | null>(null)
const form = reactive({ level: 'INFO', expiresAt: '' })
const savingId = ref<string | null>(null)

/**
 * 日志等级接口只认源插件 ID。
 *
 * 从分身卡片打开时必须重定向到它的源插件：后端对分身自身的实例 ID 直接拒绝，
 * 分身也看不到同一插件下的其它实例。
 */
const targetPluginId = computed(
  () => (props.plugin?.is_instance ? props.plugin?.source_plugin_id || props.plugin?.id : props.plugin?.id) ?? '',
)

// 与系统设置里的全局日志等级取同一组选项，避免两处等级名对不上
const levelItems = computed(() => [
  { title: t('setting.system.logLevelItems.debug'), value: 'DEBUG' },
  { title: t('setting.system.logLevelItems.info'), value: 'INFO' },
  { title: t('setting.system.logLevelItems.warning'), value: 'WARNING' },
  { title: t('setting.system.logLevelItems.error'), value: 'ERROR' },
  { title: t('setting.system.logLevelItems.critical'), value: 'CRITICAL' },
])

/** 本体行的实例 ID 就是插件 ID 自身，接口只回实例 ID，本体与分身只能这样区分。 */
function isHostInstance(item: PluginInstanceLogLevel): boolean {
  const pluginId = overviewPluginId.value || targetPluginId.value
  return Boolean(pluginId) && item.instance_id.toLowerCase() === pluginId.toLowerCase()
}

/** 标出打开本弹窗的那个实例：从分身卡片进来时，光看 ID 认不出自己是哪一行。 */
function isCurrentInstance(item: PluginInstanceLogLevel): boolean {
  const currentId = props.plugin?.id ?? ''
  return Boolean(currentId) && item.instance_id.toLowerCase() === currentId.toLowerCase()
}

/** 把 ISO 时间转换为 datetime-local 输入框可直接使用的本地时间字符串。 */
function toDatetimeLocalValue(iso?: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * 把输入框里的本地时间转换为带时区的 ISO 字符串，空值表示不设置失效时间。
 *
 * 必须带时区：后端把不带时区的失效时间按 UTC 解读，直接送 datetime-local 的裸本地
 * 时间会让覆盖提前或推迟若干小时失效。
 */
function fromDatetimeLocalValue(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** 格式化展示用的日期时间。 */
function formatDateTime(value?: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale.value)
}

/** 读取该插件全部实例的日志等级设置。 */
async function loadLevels(): Promise<boolean> {
  if (!targetPluginId.value) return false

  loading.value = true
  loadFailed.value = false
  try {
    const overview = await getPluginInstanceLogLevels(targetPluginId.value)
    overviewPluginId.value = overview.plugin_id || targetPluginId.value
    instances.value = overview.instances ?? []
    return true
  } catch (error) {
    console.error(error)
    loadFailed.value = true
    return false
  } finally {
    loading.value = false
  }
}

/** 变更成功后重新读取权威状态，失败时明说，避免用户把过期的列表当成已生效的结果。 */
async function refreshLevels() {
  if (!(await loadLevels())) $toast.error(t('plugin.logLevelRefreshFailed'))
}

/** 打开等级编辑器，默认展示已配置等级，未配置时展示当前生效等级。 */
function openEditor(item: PluginInstanceLogLevel) {
  editingId.value = item.instance_id
  form.level = item.configured_level || item.effective_level
  form.expiresAt = toDatetimeLocalValue(item.expires_at)
}

function closeEditor() {
  editingId.value = null
}

/** 提交实例日志等级覆盖，运行期立即生效。 */
async function submitLevel(item: PluginInstanceLogLevel) {
  if (!targetPluginId.value || !form.level) return

  savingId.value = item.instance_id
  try {
    await setPluginInstanceLogLevel(targetPluginId.value, item.instance_id, {
      level: form.level,
      expires_at: fromDatetimeLocalValue(form.expiresAt),
    })
    $toast.success(t('plugin.logLevelSetSuccess'))
    closeEditor()
  } catch (error) {
    console.error(error)
    $toast.error(
      t('plugin.logLevelSetFailed', { message: getApiErrorMessage(error) || t('common.serverConnectionFailed') }),
    )
  } finally {
    savingId.value = null
  }
  await refreshLevels()
}

/** 清除实例的日志等级覆盖，立即回落全局等级。 */
async function clearLevel(item: PluginInstanceLogLevel) {
  if (!targetPluginId.value) return

  savingId.value = item.instance_id
  try {
    await clearPluginInstanceLogLevel(targetPluginId.value, item.instance_id)
    $toast.success(t('plugin.logLevelClearSuccess'))
    closeEditor()
  } catch (error) {
    console.error(error)
    $toast.error(
      t('plugin.logLevelClearFailed', { message: getApiErrorMessage(error) || t('common.serverConnectionFailed') }),
    )
  } finally {
    savingId.value = null
  }
  await refreshLevels()
}

watch(
  targetPluginId,
  () => {
    closeEditor()
    instances.value = []
    void loadLevels()
  },
  { immediate: true },
)
</script>

<template>
  <VDialog v-if="visible" v-model="visible" scrollable max-width="44rem" :fullscreen="!mdAndUp">
    <VCard class="plugin-log-level-dialog">
      <VDialogCloseBtn v-model="visible" />
      <VCardItem>
        <VCardTitle class="d-flex align-center ga-2 pe-8">
          <VIcon icon="mdi-text-box-search-outline" />
          <span class="plugin-log-level-dialog__title">
            {{ t('plugin.logLevelManageTitle', { name: props.plugin?.plugin_name || props.plugin?.id }) }}
          </span>
        </VCardTitle>
      </VCardItem>
      <VDivider />

      <VCardText class="pa-0">
        <LoadingBanner v-if="loading && instances.length === 0" class="my-8" />
        <div v-else-if="loadFailed && instances.length === 0" class="pa-4 pa-sm-6">
          <VAlert type="error" variant="tonal" :text="t('plugin.logLevelLoadFailed')">
            <template #append>
              <VBtn variant="text" color="error" @click="loadLevels">{{ t('common.retry') }}</VBtn>
            </template>
          </VAlert>
        </div>
        <div v-else-if="instances.length === 0" class="pa-4 pa-sm-6">
          <VAlert type="info" variant="tonal" :text="t('plugin.instancesEmpty')" />
        </div>
        <template v-else>
          <div class="plugin-log-level-dialog__hint">
            <VIcon icon="mdi-information-outline" size="16" />
            <span>{{ t('plugin.logLevelScopeHint') }}</span>
          </div>
          <VList bg-color="transparent" lines="two">
            <template v-for="item in instances" :key="item.instance_id">
              <VListItem :data-testid="`log-level-row-${item.instance_id}`">
                <template #prepend>
                  <VIcon :icon="isHostInstance(item) ? 'mdi-puzzle-outline' : 'mdi-content-copy'" />
                </template>
                <VListItemTitle class="plugin-log-level-dialog__instance">
                  <span class="plugin-log-level-dialog__instance-id">{{ item.instance_id }}</span>
                  <VChip size="x-small" variant="tonal" :color="isHostInstance(item) ? 'primary' : 'secondary'">
                    {{ isHostInstance(item) ? t('plugin.instanceHost') : t('plugin.instanceClone') }}
                  </VChip>
                  <VChip v-if="isCurrentInstance(item)" size="x-small" variant="tonal" color="info">
                    {{ t('plugin.logLevelCurrentInstance') }}
                  </VChip>
                </VListItemTitle>
                <VListItemSubtitle class="plugin-log-level-dialog__facts">
                  <span>
                    {{
                      item.configured_level
                        ? t('plugin.logLevelConfigured', { level: item.configured_level })
                        : t('plugin.logLevelFollowGlobal')
                    }}
                  </span>
                  <span>·</span>
                  <span>{{ t('plugin.logLevelEffective', { level: item.effective_level }) }}</span>
                  <template v-if="item.expires_at">
                    <span>·</span>
                    <span>{{ t('plugin.logLevelExpiresAt', { time: formatDateTime(item.expires_at) }) }}</span>
                  </template>
                </VListItemSubtitle>
                <template #append>
                  <VBtn
                    size="small"
                    variant="tonal"
                    :data-testid="`log-level-edit-${item.instance_id}`"
                    @click="openEditor(item)"
                  >
                    {{ t('plugin.logLevelEdit') }}
                  </VBtn>
                </template>
              </VListItem>

              <div v-if="editingId === item.instance_id" class="plugin-log-level-dialog__editor">
                <VSelect
                  v-model="form.level"
                  :items="levelItems"
                  :label="t('plugin.logLevelSelectLabel')"
                  density="compact"
                  hide-details
                />
                <VTextField
                  v-model="form.expiresAt"
                  type="datetime-local"
                  :label="t('plugin.logLevelExpiresLabel')"
                  :hint="t('plugin.logLevelExpiresHint')"
                  persistent-hint
                  density="compact"
                />
                <div class="d-flex align-center ga-2">
                  <VBtn
                    v-if="item.configured_level"
                    size="small"
                    color="warning"
                    variant="text"
                    :loading="savingId === item.instance_id"
                    @click="clearLevel(item)"
                  >
                    {{ t('plugin.logLevelClear') }}
                  </VBtn>
                  <VSpacer />
                  <VBtn size="small" variant="text" @click="closeEditor">{{ t('common.cancel') }}</VBtn>
                  <VBtn
                    size="small"
                    color="primary"
                    variant="flat"
                    :loading="savingId === item.instance_id"
                    @click="submitLevel(item)"
                  >
                    {{ t('common.confirm') }}
                  </VBtn>
                </div>
              </div>
            </template>
          </VList>
        </template>
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style scoped>
.plugin-log-level-dialog {
  overflow: hidden;
}

.plugin-log-level-dialog__title,
.plugin-log-level-dialog__instance-id {
  overflow-wrap: anywhere;
  white-space: normal;
}

.plugin-log-level-dialog__hint {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  padding: 0.5rem 1rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  background: rgba(var(--v-theme-on-surface), 0.04);
  font-size: 0.8125rem;
}

.plugin-log-level-dialog__instance,
.plugin-log-level-dialog__facts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  align-items: center;
}

.plugin-log-level-dialog__facts {
  opacity: var(--v-medium-emphasis-opacity);
}

.plugin-log-level-dialog__editor {
  display: grid;
  gap: 0.75rem;
  padding: 0.75rem 1rem 1rem;
  border-block-end: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: rgba(var(--v-theme-on-surface), 0.02);
}
</style>
