<script setup lang="ts">
import { StorageConf } from '@/api/types'
import { formatBytes } from '@core/utils/formatters'
import storage_png from '@images/misc/storage.png'
import alipan_png from '@images/misc/alipan.webp'
import u115_png from '@images/misc/u115.png'
import rclone_png from '@images/misc/rclone.png'
import alist_png from '@images/misc/openlist.svg'
import custom_png from '@images/misc/database.png'
import smb_png from '@images/misc/smb.png'
import api from '@/api'
import AliyunAuthDialog from '../dialog/AliyunAuthDialog.vue'
import U115AuthDialog from '../dialog/U115AuthDialog.vue'
import RcloneConfigDialog from '../dialog/RcloneConfigDialog.vue'
import AlistConfigDialog from '../dialog/AlistConfigDialog.vue'
import SmbConfigDialog from '../dialog/SmbConfigDialog.vue'
import { useToast } from 'vue-toastification'
import { isNullOrEmptyObject } from '@/@core/utils'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

// 显示器宽度
const display = useDisplay()

// 国际化
const { t } = useI18n()

// 定义输入
const props = defineProps({
  storage: {
    type: Object as PropType<StorageConf>,
    required: true,
  },
})

// 定义事件
const emit = defineEmits(['done', 'close'])

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

// 存储
const storage_ref = ref(props.storage)

// 自定义存储名称
const customName = ref(props.storage.name)

// 自定义存储类型
const storageType = ref(props.storage.type)

// 阿里云盘认证对话框
const aliyunAuthDialog = ref(false)
// 115网盘认证对话框
const u115AuthDialog = ref(false)
// Rclone配置对话框
const rcloneConfigDialog = ref(false)
// AList配置对话框
const aListConfigDialog = ref(false)
// SMB配置对话框
const smbConfigDialog = ref(false)
// 自定义存储配置对话框
const customConfigDialog = ref(false)

// 打开存储对话框
function openStorageDialog() {
  switch (props.storage.type) {
    case 'alipan':
      aliyunAuthDialog.value = true
      break
    case 'u115':
      u115AuthDialog.value = true
      break
    case 'rclone':
      rcloneConfigDialog.value = true
      break
    case 'alist':
      aListConfigDialog.value = true
      break
    case 'smb':
      smbConfigDialog.value = true
      break
    case 'local':
      $toast.info(t('storage.noConfigNeeded'))
      break
    default:
      customConfigDialog.value = true
      break
  }
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

// 查询存储信息
async function queryStorage() {
  try {
    const data: { total: number; available: number } = await api.get(`storage/usage/${props.storage.type}`)
    total.value = data.total
    available.value = data.available
  } catch (error) {
    console.error(error)
  }
}

// 完成配置后的处理
function handleDone() {
  aliyunAuthDialog.value = false
  u115AuthDialog.value = false
  rcloneConfigDialog.value = false
  aListConfigDialog.value = false
  smbConfigDialog.value = false
  customConfigDialog.value = false
  // 更新存储
  storage_ref.value.name = customName.value
  storage_ref.value.type = storageType.value
  emit('done', storage_ref.value)
}

onMounted(() => {
  queryStorage()
})

// 关闭
function onClose() {
  emit('close')
}
</script>
<template>
  <div>
    <VCard variant="tonal" @click="openStorageDialog">
      <VDialogCloseBtn @click="onClose" class="absolute top-1 right-1" />
      <VCardText class="flex justify-space-between align-center gap-3">
        <div class="align-self-start flex-1">
          <h5 class="text-h6 mb-1">{{ storage.name }}</h5>
          <div class="mb-3 text-sm" v-if="total">{{ formatBytes(used, 1) }} / {{ formatBytes(total, 1) }}</div>
          <div v-else-if="isNullOrEmptyObject(storage.config)">{{ t('storage.notConfigured') }}</div>
        </div>
        <VImg :src="getIcon" cover class="mt-8" max-width="3rem" min-width="3rem" />
      </VCardText>
      <div class="w-full absolute bottom-0">
        <VProgressLinear v-if="usage > 0" :model-value="usage" :bg-color="progressColor" :color="progressColor" />
      </div>
    </VCard>
    <AliyunAuthDialog
      v-if="aliyunAuthDialog"
      v-model="aliyunAuthDialog"
      :conf="props.storage.config || {}"
      @close="aliyunAuthDialog = false"
      @done="handleDone"
    />
    <U115AuthDialog
      v-if="u115AuthDialog"
      v-model="u115AuthDialog"
      :conf="props.storage.config || {}"
      @close="u115AuthDialog = false"
      @done="handleDone"
    />
    <RcloneConfigDialog
      v-if="rcloneConfigDialog"
      v-model="rcloneConfigDialog"
      :conf="props.storage.config || {}"
      @close="rcloneConfigDialog = false"
      @done="handleDone"
    />
    <AlistConfigDialog
      v-if="aListConfigDialog"
      v-model="aListConfigDialog"
      :conf="props.storage.config || {}"
      @close="aListConfigDialog = false"
      @done="handleDone"
    />
    <SmbConfigDialog
      v-if="smbConfigDialog"
      v-model="smbConfigDialog"
      :conf="props.storage.config || {}"
      @close="smbConfigDialog = false"
      @done="handleDone"
    />
    <VDialog
      v-if="customConfigDialog"
      v-model="customConfigDialog"
      scrollable
      max-width="30rem"
      :fullscreen="!display.smAndUp.value"
    >
      <VCard>
        <VCardItem>
          <template #prepend>
            <VIcon icon="mdi-cog" />
          </template>
          <VCardTitle>{{ t('storage.custom') }}</VCardTitle>
          <VDialogCloseBtn v-model="customConfigDialog" />
        </VCardItem>
        <VDivider />
        <VCardText>
          <VRow>
            <VCol cols="12" md="6">
              <VTextField
                v-model="storageType"
                :label="t('storage.type')"
                :hint="t('storage.customTypeHint')"
                persistent-hint
                prepend-inner-icon="mdi-database"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model="customName"
                :label="t('storage.name')"
                persistent-hint
                prepend-inner-icon="mdi-label"
              />
            </VCol>
          </VRow>
        </VCardText>
        <VCardActions class="pt-3">
          <VBtn @click="handleDone" prepend-icon="mdi-content-save" class="px-5">
            {{ t('common.save') }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
</template>
