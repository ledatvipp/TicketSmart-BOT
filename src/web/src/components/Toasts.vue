<script setup>
import { useToast } from '../stores/toast';
const toast = useToast();

const ICONS = { success: '✅', error: '⚠️', info: 'ℹ️' };
</script>

<template>
  <div class="toast-host">
    <TransitionGroup name="toast">
      <div v-for="t in toast.items" :key="t.id" :class="['toast', t.type]">
        <span style="margin-right: 8px;">{{ ICONS[t.type] || 'ℹ️' }}</span>
        {{ t.message }}
      </div>
    </TransitionGroup>
  </div>
</template>
