<script lang="ts" setup>
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from 'vue-toastification'
import type { AuthProviderConf } from '@/api/types'
import AuthProviderCard from '@/components/cards/AuthProviderCard.vue'
import ServiceProviderIssues from '@/components/misc/ServiceProviderIssues.vue'
import { useServiceConfigs } from '@/composables/useServiceConfigs'
import { useSilentSettingRefresh } from '@/composables/useSilentSettingRefresh'
import { findAuthIdentityConflicts, resolveAuthIdentity } from '@/utils/authIdentity'

/**
 * 登录入口设置。
 *
 * 登录入口是服务实例族的一员，与下载器、媒体服务器、消息渠道、存储共用同一张配置表与同一组
 * 端点，因此这里走的是需要管理员的 `/service/configs/auth`。登录页那条 `/auth/providers`
 * 是无鉴权的、交出的是不带 config 的入口描述，两者不是同一件事，图省事复用会把配置里的
 * token 与 client_secret 摊给未登录的访客。
 *
 * 本族没有默认调用目标，故页面上不出现「设为默认」——用户在登录页点的永远是具体某个按钮，
 * 「调用未指定实例」这回事在这里无从解释，后端对该族的置位请求一律以 400 退回。
 *
 * 本族也没有内建类型：登录入口全部由插件声明，类型目录为空是全新安装的常态而不是故障，
 * 因此空目录给的是「去装一个插件」的引导，而不是一个空白页或一句读取失败。
 */

const { t } = useI18n()
const $toast = useToast()

const props = defineProps({
  active: {
    type: Boolean,
    default: true,
  },
})

const {
  configs,
  infos,
  types: providerTypes,
  canAddInstance,
  maskedFieldsOf,
  load: loadProviders,
  addConfig: addProviderConfig,
  changeConfig: changeProviderConfig,
  removeConfig: removeProviderConfig,
} = useServiceConfigs<AuthProviderConf>('auth')

// 被多条配置同时认领的身份标识，冲突的几条一律不产出登录入口
const identityConflicts = computed(() => findAuthIdentityConflicts(configs.value))

// 冲突涉及的入口名称，按标识分组说明是哪几条在抢
const conflictGroups = computed(() =>
  [...identityConflicts.value].map(identity => ({
    identity,
    names: configs.value.filter(item => resolveAuthIdentity(item) === identity).map(item => item.name),
  })),
)

/**
 * 可新增配置的登录入口类型。
 *
 * 全部来自服务实例登记表：本族没有内建类型，宿主自己一个入口也提供不了。能不能再加一份由
 * canAddInstance 按 multi_instance 判定——媒体服务器单点登录每台一份，第三方站点单点登录
 * 通常只有一份，两者的差别只有声明方自己知道。
 */
const providerTypeOptions = computed(() =>
  providerTypes.value.filter(item => canAddInstance(item.type)).map(item => ({ title: item.name, value: item.type })),
)

/** 判断该条配置的类型当前是否已登记，未登记时它产不出登录入口。 */
function isTypeAvailable(provider: AuthProviderConf) {
  const info = infos.value.find(item => item.type === provider.type && item.name === provider.name)
  return info?.type_available ?? true
}

/** 判断该条配置的身份标识是否正被同族另一条配置抢占。 */
function isConflicted(provider: AuthProviderConf) {
  return identityConflicts.value.has(resolveAuthIdentity(provider))
}

// 读取登录入口配置，失败时保留上一轮内容而不是清空
async function refreshProviders() {
  try {
    await loadProviders()
  } catch (error) {
    console.log(error)
    $toast.error(t('serviceConfig.loadFailed'))
  }
}

/** 为新入口取一个同族内不重名的名称，它同时是登录页上那个按钮的文案。 */
function nextProviderName(base: string) {
  if (!configs.value.some(item => item.name === base)) return base
  let index = 2
  while (configs.value.some(item => item.name === `${base}${index}`)) index += 1
  return `${base}${index}`
}

// 新增一个登录入口，新增时一律停用：凭据还没填，先摆上登录页只会让用户点进一个死胡同
async function addProvider(serviceType: string, typeName: string) {
  try {
    await addProviderConfig({
      type: serviceType,
      name: nextProviderName(typeName || serviceType),
      enabled: false,
      config: {},
    })
    $toast.success(t('serviceConfig.saveSuccess'))
  } catch (error) {
    console.log(error)
    $toast.error(t('serviceConfig.createFailed'))
  }
}

// 移除一个登录入口，同族其余配置不受影响
async function removeProvider(provider: AuthProviderConf) {
  try {
    await removeProviderConfig(provider)
  } catch (error) {
    console.log(error)
    $toast.error(t('serviceConfig.deleteFailed'))
  }
}

/**
 * 保存一个登录入口的改动。
 *
 * `originalName` 是改动前的实例名，用于在库里定位那一行，与表单上的实例名不同即为改名。
 * 凭据字段回传掩码即表示未改动，服务端从库里取回原值。
 */
async function changeProvider(provider: AuthProviderConf, originalName: string) {
  try {
    await changeProviderConfig(provider, originalName)
    $toast.success(t('serviceConfig.saveSuccess'))
  } catch (error) {
    console.log(error)
    $toast.error(t('serviceConfig.updateFailed'))
  }
}

onMounted(refreshProviders)

useSilentSettingRefresh(refreshProviders, { active: computed(() => props.active) })
</script>

<template>
  <VRow>
    <VCol cols="12">
      <ServiceProviderIssues />
      <VAlert v-if="conflictGroups.length" type="error" variant="tonal" class="mb-4" icon="mdi-account-alert-outline">
        <VAlertTitle class="mb-2">{{ t('auth.identityConflictTitle') }}</VAlertTitle>
        <div class="text-sm mb-2">{{ t('auth.identityConflictDesc') }}</div>
        <ul class="ps-4">
          <li v-for="group in conflictGroups" :key="group.identity" class="text-sm">
            <span class="font-weight-medium">{{ group.identity }}</span>
            <span class="text-medium-emphasis"> — {{ group.names.join('、') }}</span>
          </li>
        </ul>
      </VAlert>
      <VCard>
        <VCardItem>
          <VCardTitle>{{ t('auth.entries') }}</VCardTitle>
          <VCardSubtitle>{{ t('auth.entriesDesc') }}</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <VAlert v-if="!providerTypes.length" type="info" variant="tonal" icon="mdi-puzzle-plus-outline" class="mb-4">
            <VAlertTitle class="mb-2">{{ t('auth.noTypesTitle') }}</VAlertTitle>
            <div class="text-sm">{{ t('auth.noTypesDesc') }}</div>
          </VAlert>
          <div v-if="configs.length" class="grid gap-3 grid-app-card">
            <AuthProviderCard
              v-for="provider in configs"
              :key="`${provider.type}-${provider.name}`"
              :provider="provider"
              :providers="configs"
              :masked-fields="maskedFieldsOf(provider.type, provider.name)"
              :conflicted="isConflicted(provider)"
              :type-available="isTypeAvailable(provider)"
              @change="changeProvider"
              @close="removeProvider(provider)"
            />
          </div>
          <div v-else-if="providerTypes.length" class="text-medium-emphasis text-body-2">
            {{ t('auth.noEntries') }}
          </div>
        </VCardText>
        <VCardText v-if="providerTypeOptions.length">
          <div class="d-flex flex-wrap gap-4 mt-4">
            <VBtn color="success" variant="tonal">
              <VIcon icon="mdi-plus" />
              <VMenu :activator="'parent'" :close-on-content-click="true">
                <VList>
                  <VListItem
                    v-for="item in providerTypeOptions"
                    :key="item.value"
                    @click="addProvider(item.value, item.title)"
                  >
                    <VListItemTitle>{{ item.title }}</VListItemTitle>
                  </VListItem>
                </VList>
              </VMenu>
            </VBtn>
          </div>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
</template>
