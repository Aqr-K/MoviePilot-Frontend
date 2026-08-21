<script setup lang="ts">
import { computed, defineAsyncComponent, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AuthProviderConf } from '@/api/types'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { resolveAuthIdentity } from '@/utils/authIdentity'

/**
 * 登录页上一个入口按钮对应的配置卡片。
 *
 * 卡片上刻意把身份标识摆出来：它决定第三方身份绑定落在哪个命名空间，改实例名就会连带改掉
 * 派生取值，而后果——已绑定的用户查不到自己的绑定——在配置界面上原本完全看不出来。
 */

const AuthProviderInfoDialog = defineAsyncComponent(() => import('@/components/dialog/AuthProviderInfoDialog.vue'))

const { t } = useI18n()

const props = defineProps({
  // 单个登录入口
  provider: {
    type: Object as PropType<AuthProviderConf>,
    required: true,
  },
  // 该族的全部登录入口
  providers: {
    type: Array as PropType<AuthProviderConf[]>,
    required: true,
  },
  // 该条配置被掩码的字段路径
  maskedFields: {
    type: Array as PropType<string[]>,
    default: () => [],
  },
  // 该条配置的身份标识是否被同族另一条配置同时认领
  conflicted: {
    type: Boolean,
    default: false,
  },
  // 提供该类型的插件当前是否在场，不在场时这条配置产不出入口
  typeAvailable: {
    type: Boolean,
    default: true,
  },
})

const emit = defineEmits(['close', 'change'])

// 该条配置最终生效的身份标识
const identity = computed(() => resolveAuthIdentity(props.provider))

/** 打开登录入口配置弹窗。 */
function openProviderDialog() {
  openSharedDialog(
    AuthProviderInfoDialog,
    {
      provider: props.provider,
      providers: props.providers,
      maskedFields: props.maskedFields,
    },
    {
      change: (...args: unknown[]) => emit('change', ...args),
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
}
</script>

<template>
  <VCard variant="tonal" class="app-card-shell" @click="openProviderDialog">
    <VDialogCloseBtn @click.stop="emit('close')" />
    <VCardText class="app-card-summary app-card-summary--title-subtitle">
      <div class="app-card-summary__content">
        <div class="app-card-summary__title-row">
          <VBadge v-if="props.provider.enabled" dot inline color="success" class="me-1" />
          <span class="app-card-summary__title text-h6">{{ props.provider.name }}</span>
        </div>
        <div class="app-card-summary__subtitle text-body-1">{{ props.provider.type }}</div>
        <div class="text-medium-emphasis text-caption mt-1">{{ t('auth.identityProvider') }}: {{ identity }}</div>
        <VChip v-if="props.conflicted" color="error" size="small" variant="tonal" class="mt-2">
          {{ t('auth.identityConflictBadge') }}
        </VChip>
        <VChip v-else-if="!props.typeAvailable" color="warning" size="small" variant="tonal" class="mt-2">
          {{ t('serviceConfig.typeUnavailable') }}
        </VChip>
      </div>
    </VCardText>
  </VCard>
</template>
