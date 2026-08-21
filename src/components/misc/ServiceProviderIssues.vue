<script lang="ts" setup>
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { fetchAbsentServiceProviders } from '@/api/serviceConfig'
import type { ServiceConfigProviderIssue } from '@/api/types'

/**
 * 「提供方已消失」提示。
 *
 * 配置好好地列在设置页上、服务实例却不存在，是最难自查的一种状况。后端只给稳定的成因
 * 代码，措辞在此处按当前语言渲染——同一句话在两端各存一份，改一处就漂移。
 */

const { t } = useI18n()

const issues = ref<ServiceConfigProviderIssue[]>([])

/** 把成因代码渲染成带处置动作的文案，未知代码退回通用说法而不是显示代码本身。 */
function reasonText(issue: ServiceConfigProviderIssue) {
  const params = { extension: issue.extension_id, type: issue.type }
  switch (issue.reason) {
    case 'not_installed':
      return t('serviceConfig.reasonNotInstalled', params)
    case 'disabled':
      return t('serviceConfig.reasonDisabled', params)
    case 'start_failed':
      return t('serviceConfig.reasonStartFailed', params)
    default:
      return t('serviceConfig.reasonUnknown', params)
  }
}

/** 查询提供方已消失的服务实例配置。 */
async function loadIssues() {
  try {
    issues.value = await fetchAbsentServiceProviders()
  } catch (error) {
    console.log(error)
    issues.value = []
  }
}

defineExpose({ loadIssues })

onMounted(loadIssues)
</script>

<template>
  <VAlert v-if="issues.length" type="warning" variant="tonal" class="mb-4" icon="mdi-puzzle-remove-outline">
    <VAlertTitle class="mb-2">{{ t('serviceConfig.providerIssueTitle') }}</VAlertTitle>
    <div class="text-sm mb-2">{{ t('serviceConfig.providerIssueDesc') }}</div>
    <ul class="ps-4">
      <li v-for="issue in issues" :key="`${issue.capability}-${issue.type}-${issue.name}`" class="text-sm">
        <span class="font-weight-medium">{{ issue.name }}</span>
        <span class="text-medium-emphasis"> — {{ reasonText(issue) }}</span>
      </li>
    </ul>
  </VAlert>
</template>
