<script setup lang="ts">
import api from '@/api'
import { Subscribe, User } from '@/api/types'
import store from '@/store'
import avatar1 from '@images/avatars/avatar-1.png'
import { useToast } from 'vue-toast-notification'
import { useConfirm } from 'vuetify-use-dialog'
import { hasPermission } from '@/@core/utils/permission'
import UserAddEditDialog from '@/components/dialog/UserAddEditDialog.vue'

// 定义输入变量
const props = defineProps({
  user: {
    type: Object as PropType<User>,
    required: true,
  },
})

// 当前用户名称
const currentUser = store.state.auth.userName

// 定义触发的自定义事件
const emit = defineEmits(['remove', 'save'])

// 确认框
const createConfirm = useConfirm()

// 用户信息弹窗
const userEditDialog = ref(false)

// 提示框
const $toast = useToast()

// 用户电影订阅数量
const movieSubscriptions = ref(0)

// 用户电视剧订阅数量
const tvShowSubscriptions = ref(0)

// 按用户查询订阅数量
async function fetchSubscriptions() {
  try {
    const result: Subscribe[] = await api.get(`subscribe/user/${props.user.name}`)
    if (result) {
      movieSubscriptions.value = result.filter(item => item.type === '电影').length
      tvShowSubscriptions.value = result.filter(item => item.type === '电视剧').length
    }
  } catch (error) {
    console.log(error)
  }
}

// 删除用户
async function removeUser() {
  try {
    const isConfirmed = await createConfirm({
      title: '确认',
      content: `删除用户 ${props.user?.name} 的所有数据，是否确认？`,
    })
    if (!isConfirmed) return
    const result: { [key: string]: any } = await api.delete(`user/${props.user.name}`)
    if (result.success) {
      $toast.success('用户删除成功')
      emit('remove')
    } else {
      $toast.error('用户删除失败！')
    }
  } catch (error) {
    console.log(error)
  }
}

// 编辑用户
function editUser() {
  userEditDialog.value = true
}

// 计算是否有用户编辑权限
const canEditUser = computed(() => {
  if (store.state.auth.superUser) return true
  return hasPermission('admin') || hasPermission('usermanage')
})

// 计算是否有用户管理权限
const canManageUser = computed(() => {
  if (props.user.name == currentUser) return false
  return canEditUser
})

// 用户重新完成时
function onUserUpdate() {
  userEditDialog.value = false
  emit('save')
}

onMounted(() => {
  fetchSubscriptions()
})
</script>
<template>
  <VCard>
    <VCardText class="text-center pt-10 pb-3">
      <VAvatar variant="flat" size="100" rounded>
        <VImg :src="user.avatar || avatar1" alt="avatar" />
      </VAvatar>
      <h5 class="text-h5 mt-3">{{ user.name }}</h5>
      <VChip size="small" class="mt-3" :class="{ 'text-error': user.is_superuser }">
        {{ user.is_superuser ? '管理员' : '普通用户' }}
      </VChip>
    </VCardText>
    <VCardText class="flex flex-col justify-center gap-6 pb-5">
      <div class="d-flex align-center">
        <VAvatar size="40" color="primary" rounded variant="tonal" class="me-4">
          <VIcon size="24" icon="mdi-movie-open-outline"></VIcon>
        </VAvatar>
        <div class="max-w-100 w-100">
          <div class="text-h6 whitespace-no-wrap overflow-hidden overflow-ellipsis max-w-72">
            {{ movieSubscriptions }}
          </div>
          <div class="text-sm whitespace-no-wrap">电影订阅</div>
        </div>
      </div>
      <div class="d-flex align-center">
        <VAvatar size="40" color="primary" rounded variant="tonal" class="me-4">
          <VIcon size="24" icon="mdi-television"></VIcon>
        </VAvatar>
        <div class="max-w-100 w-100">
          <div class="text-h6 whitespace-no-wrap overflow-hidden overflow-ellipsis max-w-72">
            {{ tvShowSubscriptions }}
          </div>
          <div class="text-sm whitespace-no-wrap">电视剧订阅</div>
        </div>
      </div>
    </VCardText>
    <VCardText class="pb-6">
      <VDivider class="my-2">
        <span class="ms-2">详情信息</span>
      </VDivider>
      <VList lines="one">
        <VListItem>
          <VListItemTitle class="text-sm">
            <span class="font-weight-medium">邮箱：</span><span class="text-body-1"> {{ user.email }}</span>
          </VListItemTitle>
        </VListItem>
        <VListItem>
          <VListItemTitle class="text-sm">
            <span class="font-weight-medium">状态：</span
            ><span class="text-body-1">
              <VChip size="small" :class="{ 'text-success': user.is_active }" variant="tonal">
                {{ user.is_active ? '激活' : '已停用' }}
              </VChip>
            </span>
          </VListItemTitle>
        </VListItem>
        <VListItem>
          <VListItemTitle class="text-sm">
            <span class="font-weight-medium">双重认证：</span
            ><span class="text-body-1">
              <VChip size="small" :class="{ 'text-success': user.is_otp }" variant="tonal">
                {{ user.is_otp ? '已启用' : '未启用' }}
              </VChip>
            </span>
          </VListItemTitle>
        </VListItem>
      </VList>
    </VCardText>
    <VCardText class="flex flex-row justify-center">
      <VBtn v-if="canEditUser" color="primary" class="me-4" @click="editUser">编辑</VBtn>
      <VBtn v-if="canManageUser" color="error" variant="outlined" @click="removeUser"> 删除 </VBtn>
    </VCardText>
  </VCard>
  <!-- 用户编辑弹窗 -->
  <UserAddEditDialog
    v-if="userEditDialog"
    v-model="userEditDialog"
    :username="props.user?.name"
    oper="edit"
    @save="onUserUpdate"
    @close="userEditDialog = false"
  />
</template>
