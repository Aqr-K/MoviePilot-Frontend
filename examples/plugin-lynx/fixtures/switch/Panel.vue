<script setup>
import { ref } from 'vue'
const props = defineProps({ initialConfig: Object })
const emit = defineEmits(['save'])
const enabled = ref(props.initialConfig?.enabled ?? false)
</script>
<template>
  <v-card>
    <v-card-title>订阅提醒</v-card-title>
    <v-switch label="接收提醒" v-model="enabled" />
    <p v-if="enabled">已开启</p>
    <v-btn @click="emit('save', { ...initialConfig, enabled })">保存</v-btn>
  </v-card>
</template>
