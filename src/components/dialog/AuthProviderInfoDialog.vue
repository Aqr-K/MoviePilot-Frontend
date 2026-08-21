<script setup lang="ts">
import { computed, onBeforeMount, ref, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'
import { fetchServiceConfigForm } from '@/api/serviceConfig'
import type { AuthProviderConf, RenderProps } from '@/api/types'
import FormRender from '@/components/render/FormRender.vue'
import { findAuthIdentityConflicts, resolveAuthIdentity } from '@/utils/authIdentity'

/**
 * 单个登录入口的配置弹窗。
 *
 * 本族没有「设为默认」这一项：族级默认回答的是「调用没指定用哪个」，而登录时用户点的是
 * 具体某个按钮，不存在未指定这回事，后端对该族的置位请求一律以 400 退回。
 *
 * 身份绑定标识收在折叠面板里：它是绑定唯一键的一半，绝大多数用户从不需要碰它，摆在正面
 * 只会让人以为必填。填过或正在冲突时自动展开——冲突时入口会从登录页上消失，而原因就藏在
 * 这一项里，收着等于让用户对着一份看起来正常的配置排查。
 */

const display = useDisplay()
const { t } = useI18n()

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: true,
  },
  // 单个登录入口
  provider: {
    type: Object as PropType<AuthProviderConf>,
    required: true,
  },
  // 该族的全部登录入口，用于判定身份标识冲突与实例名重名
  providers: {
    type: Array as PropType<AuthProviderConf[]>,
    required: true,
  },
  // 该条配置被掩码的字段路径，非空时提示凭据留着不动即保留原值
  maskedFields: {
    type: Array as PropType<string[]>,
    default: () => [],
  },
})

const emit = defineEmits(['update:modelValue', 'close', 'change'])

// 改动前的实例名，用于在库里定位那一行；表单上的实例名与它不同即为改名
const originalName = props.provider.name ?? ''

const instanceName = ref(originalName)
const enabled = ref(!!props.provider.enabled)
// 身份绑定标识留空即表示按「类型@实例名」派生，故空串与未填是同一件事
const identityProvider = ref(props.provider.identity_provider ?? '')

// 类型专属配置，FormRender 直接改写本对象
const configModel = ref<Record<string, unknown>>({ ...(props.provider.config ?? {}) })
// 类型随声明登记的界面布局，未登记专属界面时为空
const formItems = ref<RenderProps[]>([])
const formLoaded = ref(false)

const providerDialog = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

// 当前设置最终生效的身份标识，让用户看得见将写进绑定表的那个取值
const effectiveIdentity = computed(() =>
  resolveAuthIdentity({
    type: props.provider.type,
    name: instanceName.value,
    identity_provider: identityProvider.value,
  }),
)

// 该标识是否已被同族另一条配置认领，冲突时两条都不产出登录入口
const identityConflict = computed(() => {
  const others = props.providers.filter(item => item.name !== originalName || item.type !== props.provider.type)
  return findAuthIdentityConflicts([
    ...others,
    { type: props.provider.type, name: instanceName.value, identity_provider: identityProvider.value },
  ]).has(effectiveIdentity.value)
})

// 填过或正在冲突时默认展开专家面板，其余情况收起
const advancedPanel = ref<number[]>(identityProvider.value ? [0] : [])

// 实例名即登录页上那个按钮的名称，空名字产不出可点的入口
const nameRules = [(value: string) => !!value?.trim() || t('auth.instanceNameRequired')]

const canSave = computed(() => !!instanceName.value.trim())

/**
 * 读取该类型随声明登记的配置界面。
 *
 * 登录入口类型全部由插件提供，宿主没有一份内建界面可退回；取不到界面时列表留空，由模板
 * 给出说明，而不是把弹窗停在加载态上。
 */
async function loadConfigForm() {
  try {
    const form = await fetchServiceConfigForm('auth', props.provider.type)
    formItems.value = form.available ? (form.conf ?? []) : []
    // 声明方给的初始模型只补已有配置没写到的键，不覆盖用户已填的取值
    if (form.model) configModel.value = { ...form.model, ...configModel.value }
  } catch (error) {
    console.log(error)
    formItems.value = []
  } finally {
    formLoaded.value = true
  }
}

/**
 * 交出改动后的配置。
 *
 * 身份绑定标识是宿主消费的实例级字段，平铺在表单顶层而不是塞进 config——塞进去会被声明了
 * 契约的类型判为违约、整条配置连带被拒收。留空时不带这一项，让宿主照旧派生。
 */
function handleDone() {
  if (!canSave.value) return
  const identity = identityProvider.value.trim()
  providerDialog.value = false
  emit(
    'change',
    {
      type: props.provider.type,
      name: instanceName.value.trim(),
      enabled: enabled.value,
      config: { ...configModel.value },
      ...(identity ? { identity_provider: identity } : {}),
    },
    originalName,
  )
}

onBeforeMount(loadConfigForm)
</script>

<template>
  <VDialog v-model="providerDialog" scrollable max-width="40rem" :fullscreen="!display.mdAndUp.value">
    <VCard>
      <VCardItem>
        <template #prepend>
          <VIcon icon="mdi-login-variant" />
        </template>
        <VCardTitle>{{ props.provider.name || t('auth.entry') }}</VCardTitle>
        <VCardSubtitle>{{ props.provider.type }}</VCardSubtitle>
        <VDialogCloseBtn v-model="providerDialog" />
      </VCardItem>
      <VDivider />
      <VCardText>
        <VAlert v-if="identityConflict" type="error" variant="tonal" class="mb-4" icon="mdi-account-alert-outline">
          {{ t('auth.identityConflict', { identity: effectiveIdentity }) }}
        </VAlert>
        <VAlert v-if="props.maskedFields.length" type="info" variant="tonal" class="mb-4" icon="mdi-key-outline">
          {{ t('serviceConfig.maskedSecretHint') }}
        </VAlert>
        <VRow>
          <VCol cols="12" md="8">
            <VTextField
              v-model="instanceName"
              :label="t('auth.instanceName')"
              :hint="t('auth.instanceNameHint')"
              :rules="nameRules"
              persistent-hint
              prepend-inner-icon="mdi-label"
            />
          </VCol>
          <VCol cols="12" md="4">
            <VSwitch v-model="enabled" :label="t('auth.enabled')" color="primary" inset />
          </VCol>
        </VRow>
        <div class="mt-4">
          <LoadingBanner v-if="!formLoaded" />
          <template v-else-if="formItems.length">
            <FormRender v-for="(item, index) in formItems" :key="index" :config="item" :model="configModel" />
          </template>
          <div v-else class="text-medium-emphasis text-body-2">{{ t('auth.noConfigForm') }}</div>
        </div>
        <VExpansionPanels v-model="advancedPanel" multiple variant="accordion" class="mt-4">
          <VExpansionPanel>
            <VExpansionPanelTitle>{{ t('auth.identityProvider') }}</VExpansionPanelTitle>
            <VExpansionPanelText>
              <VTextField
                v-model="identityProvider"
                :label="t('auth.identityProvider')"
                :placeholder="effectiveIdentity"
                :hint="t('auth.identityProviderHint')"
                :error="identityConflict"
                persistent-hint
                persistent-placeholder
                prepend-inner-icon="mdi-account-key-outline"
              />
              <div class="text-medium-emphasis text-caption mt-3">
                {{ t('auth.identityProviderEffective', { identity: effectiveIdentity }) }}
              </div>
            </VExpansionPanelText>
          </VExpansionPanel>
        </VExpansionPanels>
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <VSpacer />
        <VBtn
          color="primary"
          variant="flat"
          :disabled="!canSave"
          prepend-icon="mdi-content-save"
          class="px-5"
          @click="handleDone"
        >
          {{ t('common.save') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
