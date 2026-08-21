<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'
import type { StorageConf } from '@/api/types'
import { isStorageInstanceName, joinStorageToken } from '@/utils/storageToken'

/**
 * 存储实例的外壳设置。
 *
 * 「承接不带实例名的路径」与「默认存储」刻意做成两个开关：前者回答存量路径 `u115:/media`
 * 没写实例名时落到该类型的哪一份，每个存储类型恰好一份；后者回答调用完全没指定存储时用
 * 哪一份，整族至多一份。两者互不蕴含，合并成一个开关就会把其中一件事做错。
 */

const display = useDisplay()
const { t } = useI18n()

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: true,
  },
  storage: {
    type: Object as PropType<StorageConf>,
    required: true,
  },
})

const emit = defineEmits(['update:modelValue', 'close', 'done'])

// 实例名
const instanceName = ref(props.storage.name ?? '')

// 是否承接本存储类型的裸令牌
const bareTokenTarget = ref(!!props.storage.bare_token_target)

// 是否为本族的默认调用目标
const isDefaultTarget = ref(!!props.storage.default)

const instanceDialog = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

// 实例名的写法与后端一致：非空、不含空白与 : / \ @
const nameRules = [(value: string) => isStorageInstanceName(value) || t('storage.instanceNameInvalid')]

// 当前设置拼出来的存储令牌，让用户看得见路径里将要写什么
const tokenPreview = computed(() =>
  bareTokenTarget.value ? props.storage.type : joinStorageToken(props.storage.type, instanceName.value),
)

const canSave = computed(() => isStorageInstanceName(instanceName.value))

/** 交出改动后的实例外壳，默认调用目标由调用方另走专用端点。 */
function handleDone() {
  if (!canSave.value) return
  instanceDialog.value = false
  emit('done', {
    ...props.storage,
    name: instanceName.value,
    bare_token_target: bareTokenTarget.value,
    default: isDefaultTarget.value,
  })
}
</script>

<template>
  <VDialog
    v-if="instanceDialog"
    v-model="instanceDialog"
    scrollable
    max-width="32rem"
    :fullscreen="!display.mdAndUp.value"
  >
    <VCard>
      <VCardItem>
        <template #prepend>
          <VIcon icon="mdi-database-cog" />
        </template>
        <VCardTitle>{{ t('storage.instanceName') }}</VCardTitle>
        <VCardSubtitle>{{ tokenPreview }}</VCardSubtitle>
        <VDialogCloseBtn v-model="instanceDialog" />
      </VCardItem>
      <VDivider />
      <VCardText>
        <VRow>
          <VCol cols="12">
            <VTextField
              v-model="instanceName"
              :label="t('storage.instanceName')"
              :hint="t('storage.instanceNameHint')"
              :rules="nameRules"
              persistent-hint
              prepend-inner-icon="mdi-label"
            />
          </VCol>
          <VCol cols="12">
            <VSwitch
              v-model="bareTokenTarget"
              :label="t('storage.bareTokenTarget')"
              :hint="t('storage.bareTokenTargetHint')"
              color="primary"
              persistent-hint
              inset
            />
          </VCol>
          <VCol cols="12">
            <VSwitch
              v-model="isDefaultTarget"
              :label="t('serviceConfig.defaultTarget')"
              :hint="t('serviceConfig.defaultTargetHint')"
              color="primary"
              persistent-hint
              inset
            />
          </VCol>
        </VRow>
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <VSpacer />
        <VBtn
          color="primary"
          variant="flat"
          :disabled="!canSave"
          @click="handleDone"
          prepend-icon="mdi-content-save"
          class="px-5"
        >
          {{ t('common.save') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
