<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import api from '@/api'
import { manageNotificationChannel } from '@/api/manage'
import type { NotificationConf, NotificationSwitchConf } from '@/api/types'
import NotificationChannelCard from '@/components/cards/NotificationChannelCard.vue'
import ServiceProviderIssues from '@/components/misc/ServiceProviderIssues.vue'
import { useI18n } from 'vue-i18n'
import { notificationSwitchDict } from '@/api/constants'
import { useTheme } from 'vuetify'
import { useServiceConfigs } from '@/composables/useServiceConfigs'
import type { ServiceInstanceForm } from '@/api/serviceConfig'
import { useSilentSettingRefresh } from '@/composables/useSilentSettingRefresh'
import { openSharedDialog } from '@/composables/useSharedDialog'

// 国际化
const { t } = useI18n()

const props = defineProps({
  active: {
    type: Boolean,
    default: true,
  },
})

// 通知渠道排序按需加载，避免通知设置 chunk 直接包含拖拽库。
const Draggable = defineAsyncComponent(() => import('vuedraggable').then(module => module.default))
const NotificationTemplateEditorDialog = defineAsyncComponent(
  () => import('@/components/dialog/NotificationTemplateEditorDialog.vue'),
)

// 通知模板入口的图标和强调色统一维护，避免模板中散落长判断。
const templateTypeDefaults = [
  {
    type: 'organizeSuccess',
    icon: 'mdi-folder-check',
    accentRgb: 'var(--v-theme-primary)',
  },
  {
    type: 'downloadAdded',
    icon: 'mdi-download-box',
    accentRgb: 'var(--v-theme-info)',
  },
  {
    type: 'subscribeAdded',
    icon: 'mdi-rss-box',
    accentRgb: 'var(--v-theme-warning)',
  },
  {
    type: 'subscribeComplete',
    icon: 'mdi-check-circle',
    accentRgb: 'var(--v-theme-success)',
  },
] as const

type NotificationTemplateType = (typeof templateTypeDefaults)[number]['type']

// 初始化模板配置字典
const templateConfigs = ref<Record<string, string>>(
  templateTypeDefaults.reduce<Record<string, string>>((configs, item) => {
    configs[item.type] = '{}'
    return configs
  }, {}),
)

// 模板类型配置
const templateTypes = computed(() =>
  templateTypeDefaults.map(item => ({
    ...item,
    label: t(`setting.notification.${item.type}`),
  })),
)

function getTemplateAccentStyle(item: (typeof templateTypes.value)[number]) {
  return { '--app-card-accent-rgb': item.accentRgb }
}

// Ace 直接跟随 Vuetify 当前生效主题，auto 模式下也能按实际明暗色切换。
const { global: globalTheme } = useTheme()
const editorTheme = computed(() => (globalTheme.current.value.dark ? 'github_dark' : 'github_light_default'))

// 消息渠道实例配置，增删改各自走服务实例配置端点，写完即刻生效
const {
  configs: notificationConfigs,
  types: notificationChannelTypes,
  canAddInstance: canAddNotification,
  load: loadNotifications,
  addConfig: addNotificationConfig,
  changeConfig: changeNotificationConfig,
  removeConfig: removeNotificationConfig,
} = useServiceConfigs('notification')

/**
 * 所有消息渠道。
 *
 * 场景开关 switchs 是本族由宿主消费的实例级字段，平铺在表单顶层而不是塞进 config——
 * 塞进去会被声明了契约的渠道类型判为违约、整条配置连带被拒收。拖拽排序只改本页展示
 * 顺序，逐条写入的端点不记顺序。
 */
const notifications = computed<NotificationConf[]>({
  get: () => notificationConfigs.value as NotificationConf[],
  set: value => {
    notificationConfigs.value = value as ServiceInstanceForm[]
  },
})

// 内建消息渠道类型，它们登记在内建模块的清单里、不在服务实例登记表中
const builtinNotificationOptions = computed(() => [
  { title: t('setting.notification.wechat'), value: 'wechat' },
  { title: t('setting.notification.wechatClawBot'), value: 'wechatclawbot' },
  { title: t('setting.notification.feishu'), value: 'feishu' },
  { title: t('setting.notification.telegram'), value: 'telegram' },
  { title: t('setting.notification.slack'), value: 'slack' },
  { title: 'Discord', value: 'discord' },
  { title: t('setting.notification.synologyChat'), value: 'synologychat' },
  { title: t('setting.notification.qq'), value: 'qqbot' },
  { title: t('setting.notification.voceChat'), value: 'vocechat' },
  { title: t('setting.notification.webPush'), value: 'webpush' },
])

/**
 * 可新增配置的消息渠道类型。
 *
 * 宿主没有一份跨内建清单与登记表的全量目录，故把两处并起来才是完整的类型菜单；能不能再
 * 加一份由 canAddInstance 按 multi_instance 判定，而不是按「这个类型有没有配过」一刀切。
 */
const notificationTypeOptions = computed(() => {
  const registeredOptions = notificationChannelTypes.value
    .filter(item => !builtinNotificationOptions.value.some(builtin => builtin.value === item.type))
    .map(item => ({ title: item.name, value: item.type }))
  return [...builtinNotificationOptions.value, ...registeredOptions].filter(item => canAddNotification(item.value))
})

// 提示框
const $toast = useToast()

const editorDialogOpen = ref(false)
const currentTemplate = ref<NotificationTemplateType | ''>('')
const editorContent = ref('')

// 消息类型开关
const notificationSwitchs = ref<NotificationSwitchConf[]>([
  {
    type: '资源下载',
    action: 'all',
  },
  {
    type: '整理入库',
    action: 'all',
  },
  {
    type: '订阅',
    action: 'all',
  },
  {
    type: '站点',
    action: 'admin',
  },
  {
    type: '媒体服务器',
    action: 'admin',
  },
  {
    type: '手动处理',
    action: 'admin',
  },
  {
    type: '插件',
    action: 'admin',
  },
  {
    type: '智能体',
    action: 'admin',
  },
  {
    type: '其它',
    action: 'admin',
  },
])

// 通知发送时间
const notificationTime = ref({
  start: '00:00',
  end: '23:59',
})

const wechatClawBotRenameMap = ref<Record<string, string>>({})

let editorDialogController: ReturnType<typeof openSharedDialog> | null = null

// 关闭通知模板共享弹窗，并同步本页的弹窗占用状态。
function closeTemplateEditorDialog() {
  editorDialogOpen.value = false
  editorDialogController?.close()
  editorDialogController = null
}

// 打开通知模板共享弹窗，保持内容通过事件回写到设置页。
function openTemplateEditorDialog(type: NotificationTemplateType) {
  closeTemplateEditorDialog()
  editorDialogOpen.value = true
  editorDialogController = openSharedDialog(
    NotificationTemplateEditorDialog,
    {
      content: editorContent.value,
      editorTheme: editorTheme.value,
      subtitle: templateTypes.value.find(item => item.type === type)?.label ?? '',
      templateType: type,
    },
    {
      close: () => {
        editorDialogOpen.value = false
        editorDialogController = null
      },
      save: saveTemplate,
      'update:content': (value: string) => {
        editorContent.value = value
      },
      'update:modelValue': (value: boolean) => {
        if (!value) {
          editorDialogOpen.value = false
          editorDialogController = null
        }
      },
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
}

// 共享弹窗的 props 是打开时写入的，主题切换时主动推送给已打开的编辑器。
watch(editorTheme, theme => {
  if (!editorDialogOpen.value) return

  editorDialogController?.updateProps({ editorTheme: theme })
})

// 添加通知渠道
async function addNotification(notification: string) {
  let name = `${t('setting.notification.channel')}${notifications.value.length + 1}`
  while (notifications.value.some(item => item.name === name)) {
    name = `${t('setting.notification.channel')}${parseInt(name.split(t('setting.notification.channel'))[1]) + 1}`
  }
  try {
    await addNotificationConfig({ name, type: notification, enabled: false, config: {} })
    $toast.success(t('serviceConfig.saveSuccess'))
  } catch (error) {
    console.log(error)
    $toast.error(t('serviceConfig.createFailed'))
  }
}

// 移除通知渠道，同族其余配置不受影响
async function removeNotification(notification: ServiceInstanceForm) {
  try {
    await removeNotificationConfig(notification)
  } catch (error) {
    console.log(error)
    $toast.error(t('serviceConfig.deleteFailed'))
  }
}

function trackWechatClawBotRename(oldName: string, newName: string) {
  if (!oldName || !newName || oldName === newName) {
    return
  }
  const renameMap = { ...wechatClawBotRenameMap.value }
  let chainedRename = false
  // 连续改名只保留原始缓存名到当前渠道名，避免为不存在的中间名发起迁移。
  for (const [source, target] of Object.entries(renameMap)) {
    if (target === oldName) {
      renameMap[source] = newName
      chainedRename = true
    }
  }
  if (!chainedRename) {
    renameMap[oldName] = newName
  }
  wechatClawBotRenameMap.value = Object.fromEntries(
    Object.entries(renameMap).filter(([source, target]) => source && target && source !== target),
  )
}

/**
 * 迁移已改名的微信客服渠道缓存。
 *
 * 迁移成功的条目即刻从待迁移表里划掉，失败的留着，下一次改名时连同新条目一起重试——
 * 缓存跟着渠道名走，漏掉一条就意味着那个渠道的会话上下文永久丢失。
 */
async function migrateWechatClawBotRenames() {
  const activeWechatClawBotNames = new Set(
    notifications.value.filter(item => item.type === 'wechatclawbot').map(item => item.name),
  )
  const renameEntries = Object.entries(wechatClawBotRenameMap.value).filter(
    ([oldName, newName]) => oldName && newName && oldName !== newName && activeWechatClawBotNames.has(newName),
  )
  for (const [oldName, newName] of renameEntries) {
    await manageNotificationChannel(
      'WechatClawBot',
      'migrate_cache',
      {
        old_name: oldName,
        new_name: newName,
      },
      { feedback: 'silent' },
    )
    wechatClawBotRenameMap.value = Object.fromEntries(
      Object.entries(wechatClawBotRenameMap.value).filter(([source]) => source !== oldName),
    )
  }
}

// 读取消息渠道实例配置，失败时保留上一轮内容而不是清空
async function refreshNotifications() {
  try {
    await loadNotifications()
  } catch (error) {
    console.log(error)
    $toast.error(t('serviceConfig.loadFailed'))
  }
}

async function openEditor(type: NotificationTemplateType) {
  try {
    currentTemplate.value = type
    const result = await api.get<{ value?: Record<string, string> }>('system/setting/NotificationTemplates', {
      feedback: 'silent',
    })
    templateConfigs.value = result.value || {}
    editorContent.value = templateConfigs.value[type] || '{}'
    openTemplateEditorDialog(type)
  } catch (error) {
    console.error(error)
    $toast.error(t('setting.notification.templateLoadFailed'))
  }
}

async function saveTemplate(value = editorContent.value) {
  try {
    await api.post(
      'system/setting/NotificationTemplates',
      {
        ...templateConfigs.value,
        [currentTemplate.value]: value,
      },
      { feedback: 'silent' },
    )
    $toast.success(t('setting.notification.templateSaveSuccess'))
    closeTemplateEditorDialog()
  } catch (error) {
    console.error(error)
    $toast.error(t('setting.notification.templateSaveFailed'))
  }
}

async function loadTemplateConfigs() {
  try {
    const result = await api.get<{ value?: Record<string, string> }>('system/setting/NotificationTemplates', {
      feedback: 'silent',
    })
    templateConfigs.value = result.value || {}
  } catch (error) {
    console.error(error)
    $toast.error(t('setting.notification.templateLoadFailed'))
  }
}

// 调用API查询通知发送时间设置
async function loadNotificationTime() {
  try {
    const result = await api.get<{ value?: { start: string; end: string } }>('system/setting/NotificationSendTime')
    notificationTime.value = result.value ?? { start: '00:00', end: '23:59' }
  } catch (error) {
    console.log(error)
  }
}

// 调用API保存通知发送时间设置
async function saveNotificationTime() {
  try {
    await api.post('system/setting/NotificationSendTime', notificationTime.value, { feedback: 'silent' })
    $toast.success(t('setting.notification.timeSaveSuccess'))
  } catch (error) {
    console.log(error)
    $toast.error(t('setting.notification.timeSaveFailed'))
  }
}

/**
 * 保存通知渠道实例的改动。
 *
 * `name` 是这条配置改动前的实例名，用于在库里定位那一行，与表单上的实例名不同即为改名。
 * 改名在服务端落定之后才发起缓存迁移：迁移按渠道名寻址，冲着一个还没落库的新名字迁只会
 * 白跑一趟。
 */
async function changNotificationSetting(notification: ServiceInstanceForm, name: string) {
  const previous = notifications.value.find(item => item.name === name)
  const nextName = notification.name ?? ''
  try {
    await changeNotificationConfig(notification, name)
    if (previous?.type === 'wechatclawbot' && previous.name !== nextName) {
      trackWechatClawBotRename(previous.name, nextName)
      await migrateWechatClawBotRenames()
    }
    $toast.success(t('serviceConfig.saveSuccess'))
  } catch (error) {
    console.log(error)
    $toast.error(t('serviceConfig.updateFailed'))
  }
}

// 加载消息类型开关
async function loadNotificationSwitchs() {
  try {
    const result = await api.get<{ value?: NotificationSwitchConf[] }>('system/setting/NotificationSwitchs')
    if (result.value && result.value.length > 0) {
      const savedSwitchs = result.value
      // 合并默认值中存在但后端数据中缺失的类型（如新增的类型）
      const defaults = notificationSwitchs.value
      for (const def of defaults) {
        if (!savedSwitchs.find(item => item.type === def.type)) {
          savedSwitchs.push(def)
        }
      }
      notificationSwitchs.value = savedSwitchs
    }
  } catch (error) {
    console.log(error)
  }
}

// 保存消息类型开关
async function saveNotificationSwitchs() {
  try {
    await api.post('system/setting/NotificationSwitchs', notificationSwitchs.value, { feedback: 'silent' })
    $toast.success(t('setting.notification.switchSaveSuccess'))
  } catch (error) {
    console.log(error)
    $toast.error(t('setting.notification.switchSaveFailed'))
  }
}

// 获取通知开关文本
function getNotificationSwitchText(type: string | undefined) {
  if (!type) return ''
  return notificationSwitchDict[type]
}

async function loadPageData() {
  await Promise.all([refreshNotifications(), loadNotificationSwitchs(), loadNotificationTime(), loadTemplateConfigs()])
}

// 加载数据
onMounted(() => {
  loadPageData()
})

useSilentSettingRefresh(loadPageData, {
  active: computed(() => props.active && !editorDialogOpen.value),
})
</script>

<template>
  <VRow>
    <VCol cols="12">
      <ServiceProviderIssues />
      <VCard>
        <VCardItem>
          <VCardTitle>{{ t('setting.notification.channels') }}</VCardTitle>
          <VCardSubtitle>{{ t('setting.notification.channelsDesc') }}</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <Draggable
            v-model="notifications"
            handle=".cursor-move"
            item-key="name"
            tag="div"
            :component-data="{ 'class': 'grid gap-3 grid-app-card' }"
          >
            <template #item="{ element }">
              <NotificationChannelCard
                :notification="element"
                :notifications="notifications"
                @change="changNotificationSetting"
                @close="removeNotification(element)"
              />
            </template>
          </Draggable>
        </VCardText>
        <VCardText>
          <div class="d-flex flex-wrap gap-4 mt-4">
            <VBtn color="success" variant="tonal">
              <VIcon icon="mdi-plus" />
              <VMenu :activator="'parent'" :close-on-content-click="true">
                <VList>
                  <VListItem
                    v-for="item in notificationTypeOptions"
                    :key="item.value"
                    @click="addNotification(item.value)"
                  >
                    <VListItemTitle>{{ item.title }}</VListItemTitle>
                  </VListItem>
                  <VListItem @click="addNotification('custom')">
                    <VListItemTitle>{{ t('setting.system.custom') }}</VListItemTitle>
                  </VListItem>
                </VList>
              </VMenu>
            </VBtn>
          </div>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>{{ t('setting.notification.templateConfigTitle') }}</VCardTitle>
          <VCardSubtitle>{{ t('setting.notification.templateConfigDesc') }}</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <div class="notification-template-grid">
            <button
              v-for="item in templateTypes"
              :key="item.type"
              type="button"
              class="notification-template-card app-card-shell app-card-colorful"
              :style="getTemplateAccentStyle(item)"
              @click="openEditor(item.type)"
            >
              <span class="template-card-icon">
                <VIcon :icon="item.icon" size="24" />
              </span>
              <span class="template-card-copy">
                <span class="template-card-title">{{ item.label }}</span>
                <span class="template-card-subtitle">Jinja2 JSON</span>
              </span>
              <VIcon class="template-card-arrow" icon="mdi-chevron-right" size="22" />
            </button>
          </div>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>{{ t('setting.notification.scope') }}</VCardTitle>
          <VCardSubtitle>{{ t('setting.notification.scopeDesc') }}</VCardSubtitle>
        </VCardItem>
        <VTable class="text-no-wrap">
          <thead>
            <tr>
              <th scope="col">{{ t('setting.notification.messageType') }}</th>
              <th scope="col">{{ t('setting.notification.scopeRange') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in notificationSwitchs" :key="index">
              <td>
                {{ getNotificationSwitchText(item.type) }}
              </td>
              <td>
                <VRadioGroup v-model="item.action" inline>
                  <VRadio value="user" :label="t('setting.notification.operationUserOnly')" />
                  <VRadio value="admin" :label="t('setting.notification.adminOnly')" />
                  <VRadio value="user,admin" :label="t('setting.notification.userAndAdmin')" />
                  <VRadio value="all" :label="t('setting.notification.allUsers')" />
                </VRadioGroup>
              </td>
            </tr>
          </tbody>
        </VTable>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn type="submit" @click="saveNotificationSwitchs" prepend-icon="mdi-content-save">
                {{ t('common.save') }}
              </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>{{ t('setting.notification.sendTime') }}</VCardTitle>
          <VCardSubtitle>{{ t('setting.notification.sendTimeDesc') }}</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <VRow>
            <VCol cols="6">
              <VTextField
                v-model="notificationTime.start"
                :label="t('setting.notification.startTime')"
                type="time"
                prepend-inner-icon="mdi-clock-start"
              />
            </VCol>
            <VCol cols="6">
              <VTextField
                v-model="notificationTime.end"
                :label="t('setting.notification.endTime')"
                type="time"
                prepend-inner-icon="mdi-clock-end"
              />
            </VCol>
          </VRow>
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn type="submit" @click="saveNotificationTime" prepend-icon="mdi-content-save">
                {{ t('common.save') }}
              </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
</template>
<style scoped>
/* 模板入口保持设置页的紧凑密度，卡片壳层复用全局 app-card-shell。 */
.notification-template-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
}

.notification-template-card {
  position: relative;
  display: flex;
  align-items: center;
  padding: 1rem;
  cursor: pointer;
  gap: 0.875rem;
  inline-size: 100%;
  min-block-size: 5.25rem;
  text-align: start;
}

.template-card-icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: rgba(var(--app-card-accent-rgb), 0.16);
  block-size: 2.75rem;
  color: rgb(var(--app-card-accent-rgb));
  inline-size: 2.75rem;
}

.template-card-copy {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-inline-size: 0;
}

.template-card-title {
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 0.98rem;
  font-weight: 600;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.template-card-subtitle {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
  line-height: 1.25;
  margin-block-start: 0.25rem;
}

.template-card-arrow {
  flex: 0 0 auto;
  color: rgba(var(--v-theme-on-surface), 0.42);
  transition:
    color 0.2s ease,
    transform 0.2s ease;
}

.notification-template-card:hover .template-card-arrow {
  color: rgb(var(--app-card-accent-rgb));
  transform: translateX(2px);
}

@media (width <= 600px) {
  .notification-template-grid {
    gap: 0.75rem;
  }

  .notification-template-card {
    padding: 0.875rem;
    min-block-size: 4.75rem;
  }
}
</style>
