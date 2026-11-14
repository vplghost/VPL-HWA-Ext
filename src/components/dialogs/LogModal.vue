<script setup lang="ts">
import ModalDialog from '@/src/components/common/ModalDialog.vue';
import LogTab from '@/src/components/tabs/LogTab.vue';
defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void }>();
</script>

<template>
  <ModalDialog :model-value="modelValue" title="API Log" icon="📋" max-width="max-w-6xl" @update:model-value="emit('update:modelValue', $event)">
    <LogTab />
  </ModalDialog>
</template>
