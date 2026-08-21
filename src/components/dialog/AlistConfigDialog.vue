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
  type: {
    type: String,
    default: 'alist',
  },
  // 存储令牌，同一类型配了多份实例时用它指到具体那一份；留空时退回按类型指向
  storage: {
    type: String,
    default: '',
  },
  // 所属存储实例的整条配置，交出类型与实例名供配置保存指到具体那一行
  storageConf: {
    type: Object as PropType<StorageConf>,
    default: undefined,
  },
})

// 管理动作的目标：有令牌用令牌，没有则按类型指向该类型承接裸令牌的那一份
const manageTargetToken = computed(() => props.storage || props.type)

// 定义事件
const emit = defineEmits(['done', 'close'])

// 完成
async function handleDone() {
  await savaAlistConfig()
  emit('done')
}

// 重置配置
async function handleReset() {
  try {
    await manageStorage(manageTargetToken.value, 'reset_config')
    // 重置成功
    handleDone()
  } catch (e) {
    console.error(e)
  }
}

// 登录类型
let loginType = ref('username')
if (props.conf.token) {
  loginType = ref('token')
} else if (props.conf.username) {
  loginType = ref('username')
} else {
  loginType = ref('guest')
}

// 数据源
const sourceItems = [
  {
    'title': t('dialog.alistConfig.loginTypeOptions.username'),
    'value': 'username',
  },
  { 'title': t('dialog.alistConfig.loginTypeOptions.token'), 'value': 'token' },
  { 'title': t('dialog.alistConfig.loginTypeOptions.guest'), 'value': 'guest' },
]

// 保存alist设置
async function savaAlistConfig() {
  try {
    const instance = props.storageConf
    if (instance?.type && instance?.name) {
      // 走实例配置端点：凭据掩码原样回传即表示该项未改动，服务端从库里取回原值；
      // 按令牌整份替换的旧路径不还原掩码，只改一个地址就会把掩码本身写成新凭据
      await updateServiceConfig('storage', instance.type, instance.name, { ...instance, config: props.conf })
    } else {
      await manageStorage(manageTargetToken.value, 'save_config', { conf: props.conf })
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
          <VIcon icon="mdi-cog-outline" class="me-2" />
        </template>
        <VCardTitle>
          {{ t(`dialog.${props.type}Config.title`) }}
        </VCardTitle>
      </VCardItem>
      <VDivider />
      <VCardText>
        <VRow>
          <VCol cols="12">
            <VTextField
              v-model="props.conf.url"
              :hint="t(`dialog.${props.type}Config.serverUrl`)"
              :label="t(`dialog.${props.type}Config.serverUrl`)"
              persistent-hint
              prepend-inner-icon="mdi-server"
            />
          </VCol>
          <VCol cols="12" md="4">
            <VSelect
              v-model="loginType"
              :items="sourceItems"
              :label="t('dialog.alistConfig.loginType')"
              :hint="t('dialog.alistConfig.loginType')"
              persistent-hint
              prepend-inner-icon="mdi-login"
            />
          </VCol>
          <VCol cols="12" md="4" v-if="loginType == 'username'">
            <VTextField
              v-model="props.conf.username"
              :hint="t('dialog.alistConfig.username')"
              :label="t('dialog.alistConfig.username')"
              persistent-hint
              prepend-inner-icon="mdi-account"
            />
          </VCol>
          <VCol cols="12" md="4" v-if="loginType == 'username'">
            <VTextField
              type="password"
              v-model="props.conf.password"
              :hint="t('dialog.alistConfig.password')"
              :label="t('dialog.alistConfig.password')"
              persistent-hint
              prepend-inner-icon="mdi-lock"
            />
          </VCol>
          <VCol cols="12" md="8" v-if="loginType == 'token'">
            <VTextField
              v-model="props.conf.token"
              :hint="t('dialog.alistConfig.loginTypeOptions.token')"
              :label="t('dialog.alistConfig.loginTypeOptions.token')"
              persistent-hint
              prepend-inner-icon="mdi-key"
            />
          </VCol>
        </VRow>
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <VBtn color="error" variant="tonal" @click="handleReset" prepend-icon="mdi-restore">
          {{ t('dialog.alistConfig.reset') }}
        </VBtn>
        <VSpacer />
        <VBtn color="primary" variant="flat" @click="handleDone" prepend-icon="mdi-check" class="px-5">
          {{ t('dialog.alistConfig.complete') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
