<script lang="ts" setup>
import { manageStorage } from '@/api/manage'
import { updateServiceConfig } from '@/api/serviceConfig'
import type { StorageConf } from '@/api/types'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'
import { configureAceEditorPadding } from '@/utils/aceEditor'

// 显示器宽度
const display = useDisplay()

// 多语言支持
const { t } = useI18n()

// 定义输入
const props = defineProps({
  conf: {
    type: Object as PropType<{ [key: string]: any }>,
    required: true,
  },
  // 存储令牌，同一类型配了多份实例时用它指到具体那一份
  storage: {
    type: String,
    default: 'rclone',
  },
  // 所属存储实例的整条配置，交出类型与实例名供配置保存指到具体那一行
  storageConf: {
    type: Object as PropType<StorageConf>,
    default: undefined,
  },
})

if (!props.conf.filepath) {
  props.conf.filepath = '/moviepilot/.config/rclone/rclone.conf'
}

if (!props.conf.content) {
  props.conf.content = t('dialog.rcloneConfig.defaultContent')
}

// 定义事件
const emit = defineEmits(['done', 'close'])

// 完成
async function handleDone() {
  await savaRcloneConfig()
  emit('done')
}

// 保存rclone设置
async function savaRcloneConfig() {
  try {
    const instance = props.storageConf
    if (instance?.type && instance?.name) {
      // 走实例配置端点：凭据掩码原样回传即表示该项未改动，服务端从库里取回原值；
      // 按令牌整份替换的旧路径不还原掩码，只改一个地址就会把掩码本身写成新凭据
      await updateServiceConfig('storage', instance.type, instance.name, { ...instance, config: props.conf })
    } else {
      await manageStorage(props.storage, 'save_config', { conf: props.conf })
    }
  } catch (e) {
    console.error(e)
  }
}

// 重置配置
async function handleReset() {
  try {
    await manageStorage(props.storage, 'reset_config')
    handleDone()
  } catch (e) {
    console.error(e)
  }
}
</script>

<template>
  <VDialog width="50rem" scrollable :fullscreen="!display.mdAndUp.value">
    <VCard>
      <VDialogCloseBtn @click="emit('close')" />
      <VCardItem>
        <template #prepend>
          <VIcon icon="mdi-cog-outline" class="me-2" />
        </template>
        <VCardTitle>
          {{ t('dialog.rcloneConfig.title') }}
        </VCardTitle>
      </VCardItem>
      <VDivider />
      <VCardText>
        <VRow>
          <VCol cols="12">
            <VTextField
              v-model="props.conf.filepath"
              :label="t('dialog.rcloneConfig.filePath')"
              prepend-inner-icon="mdi-file-document"
            />
          </VCol>
          <VCol cols="12">
            <VAceEditor
              v-model:value="props.conf.content"
              lang="ini"
              theme="monokai"
              class="rounded h-full min-h-[30rem]"
              @init="configureAceEditorPadding"
            >
            </VAceEditor>
          </VCol>
        </VRow>
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <VBtn color="error" variant="tonal" @click="handleReset" prepend-icon="mdi-restore">
          {{ t('dialog.rcloneConfig.reset') }}
        </VBtn>
        <VSpacer />
        <VBtn color="primary" variant="flat" @click="handleDone" prepend-icon="mdi-check" class="px-5">
          {{ t('dialog.rcloneConfig.complete') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
