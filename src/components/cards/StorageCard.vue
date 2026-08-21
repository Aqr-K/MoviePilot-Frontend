<script setup lang="ts">
import type { StorageConf } from '@/api/types'
import { formatBytes } from '@core/utils/formatters'
import storage_png from '@images/misc/storage.png'
import alipan_png from '@images/misc/alipan.webp'
import u115_png from '@images/misc/u115.png'
import rclone_png from '@images/misc/rclone.png'
import alist_png from '@images/misc/openlist.svg'
import alistgo_png from '@images/misc/alist.svg'
import custom_png from '@images/misc/database.png'
import smb_png from '@images/misc/smb.png'
import { manageStorage } from '@/api/manage'
import { useToast } from 'vue-toastification'
import { isNullOrEmptyObject } from '@/@core/utils'
import { useI18n } from 'vue-i18n'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useCardAccentColor } from '@/composables/useCardAccentColor'
import { storageTokenOfConf } from '@/utils/storageToken'

const AliyunAuthDialog = defineAsyncComponent(() => import('../dialog/AliyunAuthDialog.vue'))
const U115AuthDialog = defineAsyncComponent(() => import('../dialog/U115AuthDialog.vue'))
const RcloneConfigDialog = defineAsyncComponent(() => import('../dialog/RcloneConfigDialog.vue'))
const AlistConfigDialog = defineAsyncComponent(() => import('../dialog/AlistConfigDialog.vue'))
const SmbConfigDialog = defineAsyncComponent(() => import('../dialog/SmbConfigDialog.vue'))
const StorageCustomConfigDialog = defineAsyncComponent(() => import('../dialog/StorageCustomConfigDialog.vue'))

// 配置保存走实例配置端点的弹窗，它们要按实例身份写回，而不是按令牌整份替换
const CONFIG_DIALOGS: Component[] = [RcloneConfigDialog, AlistConfigDialog, SmbConfigDialog]

// 国际化
const { t } = useI18n()
const { accentRgb, imageRef, updateAccentColor } = useCardAccentColor('#FFB400')

// 定义输入
const props = defineProps({
  storage: {
    type: Object as PropType<StorageConf>,
    required: true,
  },
})

// 定义事件
const emit = defineEmits(['done', 'close', 'edit'])

// 本实例的存储令牌，管理动作按令牌指到具体实例而不是整个存储类型
const storageToken = computed(() => storageTokenOfConf(props.storage))

// 提示信息
const $toast = useToast()

// 存储总空间
const total = ref(0)

// 存储可用空间
const available = ref(0)

// 储存已用空间
const used = computed(() => {
  return total.value - available.value
})

/** 打开指定类型的共享存储配置弹窗。 */
function openStorageDialog() {
  const dialogMap: Record<string, Component> = {
    alipan: AliyunAuthDialog,
    u115: U115AuthDialog,
    rclone: RcloneConfigDialog,
    alist: AlistConfigDialog,
    alistgo: AlistConfigDialog,
    smb: SmbConfigDialog,
  }

  if (props.storage.type === 'local') {
    $toast.info(t('storage.noConfigNeeded'))
    return
  }

  const dialog = dialogMap[props.storage.type] || StorageCustomConfigDialog
  // 配置类弹窗把配置写回实例配置端点，故另外交出整条实例配置；授权类弹窗不需要
  const instanceProps = CONFIG_DIALOGS.includes(dialog) ? { storageConf: props.storage } : {}
  // 凭据配置按令牌指到具体实例：同一类型配了两份时，令牌是唯一能区分它们的东西
  const dialogProps =
    dialog === StorageCustomConfigDialog
      ? { storage: props.storage }
      : dialog === AlistConfigDialog
        ? { conf: props.storage.config || {}, type: props.storage.type, storage: storageToken.value, ...instanceProps }
        : { conf: props.storage.config || {}, storage: storageToken.value, ...instanceProps }

  openSharedDialog(
    dialog,
    dialogProps,
    {
      done: handleDone,
    },
    { closeOn: ['close', 'done', 'update:modelValue'] },
  )
}

// 根据存储类型选择图标
const getIcon = computed(() => {
  switch (props.storage.type) {
    case 'local':
      return storage_png
    case 'alipan':
      return alipan_png
    case 'u115':
      return u115_png
    case 'rclone':
      return rclone_png
    case 'alist':
      return alist_png
    case 'alistgo':
      return alistgo_png
    case 'smb':
      return smb_png
    default:
      return custom_png
  }
})

// 计算进度条颜色
const progressColor = computed(() => {
  if (usage.value > 90) {
    return 'error'
  } else if (usage.value > 70) {
    return 'warning'
  } else {
    return 'success'
  }
})

// 计算存储使用率
const usage = computed(() => {
  return Math.round((used.value / (total.value || 1)) * 1000) / 10
})

/** 查询存储空间使用信息。 */
async function queryStorage() {
  try {
    const data = await manageStorage<{ total: number; available: number }>(storageToken.value, 'usage')
    total.value = data.total
    available.value = data.available
  } catch (error) {
    console.error(error)
  }
}

/** 完成配置后的处理并通知父级刷新。 */
function handleDone(storage?: StorageConf) {
  emit('done', storage || props.storage)
}

onMounted(() => {
  queryStorage()
})

/** 关闭存储卡片。 */
function onClose() {
  emit('close')
}

/** 打开实例外壳设置（实例名、裸令牌承接、默认存储）。 */
function onEdit() {
  emit('edit', props.storage)
}
</script>

<template>
  <VCard
    variant="tonal"
    class="app-card-shell app-card-colorful"
    :style="{ '--app-card-accent-rgb': accentRgb }"
    @click="openStorageDialog"
  >
    <VDialogCloseBtn @click="onClose" />
    <span class="app-card-top-action absolute top-3 right-12">
      <IconBtn :aria-label="`edit-${storage.name}`" @click.stop="onEdit">
        <VIcon icon="mdi-database-cog" />
      </IconBtn>
    </span>
    <VCardText class="flex justify-space-between align-center gap-3">
      <div class="align-self-start flex-1">
        <h5 class="text-h6 mb-1">
          <VBadge v-if="storage.default" dot inline color="success" class="me-1" />
          {{ storage.name }}
        </h5>
        <div class="mb-1 text-xs text-medium-emphasis">{{ storageToken }}</div>
        <div class="mb-3 text-sm" v-if="total">{{ formatBytes(used, 1) }} / {{ formatBytes(total, 1) }}</div>
        <div v-else-if="isNullOrEmptyObject(storage.config)">{{ t('storage.notConfigured') }}</div>
      </div>
      <VImg
        ref="imageRef"
        :src="getIcon"
        cover
        class="mt-8"
        max-width="3rem"
        min-width="3rem"
        @load="updateAccentColor"
      />
    </VCardText>
    <div class="w-full absolute bottom-0">
      <VProgressLinear v-if="usage > 0" :model-value="usage" :bg-color="progressColor" :color="progressColor" />
    </div>
  </VCard>
</template>
