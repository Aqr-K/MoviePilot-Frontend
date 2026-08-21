<script lang="ts" setup>
import { manageStorage } from '@/api/manage'
import { updateServiceConfig } from '@/api/serviceConfig'
import type { StorageConf } from '@/api/types'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

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
    default: 'smb',
  },
  // 所属存储实例的整条配置，交出类型与实例名供配置保存指到具体那一行
  storageConf: {
    type: Object as PropType<StorageConf>,
    default: undefined,
  },
})

// 定义事件
const emit = defineEmits(['done', 'close'])

// 完成
async function handleDone() {
  await saveSmbConfig()
  emit('done')
}

// 重置配置
async function handleReset() {
  try {
    await manageStorage(props.storage, 'reset_config')
    // 重置成功
    handleDone()
  } catch (e) {
    console.error(e)
  }
}

// 保存 SMB 设置
async function saveSmbConfig() {
  try {
    const instance = props.storageConf
    if (instance?.type && instance?.name) {
      // 走实例配置端点：凭据掩码原样回传即表示该项未改动，服务端从库里取回原值；
      // 按令牌整份替换的旧路径不还原掩码，只改一个地址就会把掩码本身写成新密码
      await updateServiceConfig('storage', instance.type, instance.name, { ...instance, config: props.conf })
    } else {
      await manageStorage(props.storage, 'save_config', { conf: props.conf })
    }
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
          <VIcon icon="mdi-folder-network-outline" class="me-2" />
        </template>
        <VCardTitle>
          {{ t('dialog.smbConfig.title') }}
        </VCardTitle>
      </VCardItem>
      <VDivider />
      <VCardText>
        <VRow>
          <VCol cols="12" md="6">
            <VTextField
              v-model="props.conf.host"
              :hint="t('dialog.smbConfig.hostHint')"
              :label="t('dialog.smbConfig.host')"
              persistent-hint
              prepend-inner-icon="mdi-server"
              placeholder="192.168.1.100"
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="props.conf.share"
              :hint="t('dialog.smbConfig.shareHint')"
              :label="t('dialog.smbConfig.share')"
              persistent-hint
              prepend-inner-icon="mdi-folder-network"
              placeholder="shared_folder"
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="props.conf.username"
              :hint="t('dialog.smbConfig.usernameHint')"
              :label="t('dialog.smbConfig.username')"
              persistent-hint
              prepend-inner-icon="mdi-account"
              placeholder="your_username"
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              type="password"
              v-model="props.conf.password"
              :hint="t('dialog.smbConfig.passwordHint')"
              :label="t('dialog.smbConfig.password')"
              persistent-hint
              prepend-inner-icon="mdi-lock"
              placeholder="your_password"
            />
          </VCol>
          <VCol cols="12" md="6">
            <VTextField
              v-model="props.conf.domain"
              :hint="t('dialog.smbConfig.domainHint')"
              :label="t('dialog.smbConfig.domain')"
              persistent-hint
              prepend-inner-icon="mdi-domain"
              placeholder="WORKGROUP"
            />
          </VCol>
        </VRow>
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <VBtn color="error" variant="tonal" @click="handleReset" prepend-icon="mdi-restore">
          {{ t('dialog.smbConfig.reset') }}
        </VBtn>
        <VSpacer />
        <VBtn color="primary" variant="flat" @click="handleDone" prepend-icon="mdi-check" class="px-5">
          {{ t('dialog.smbConfig.complete') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
