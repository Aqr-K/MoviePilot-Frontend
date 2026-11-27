<script setup>
import { ref } from 'vue'
const props = defineProps({ initialConfig: Object })
const emit = defineEmits(['save', 'switch'])
const count = ref(props.initialConfig?.count ?? 0)
</script>
<template>
  <v-card>
    <v-card-title>同步次数</v-card-title>
    <v-card-text>{{ count }}</v-card-text>
    <v-btn @click="count++">增加</v-btn>
    <v-btn @click="emit('save', { ...initialConfig, count })">保存</v-btn>
    <v-btn @click="emit('switch')">切换页面</v-btn>
  </v-card>
</template>
