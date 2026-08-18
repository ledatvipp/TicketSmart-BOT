<script setup>
defineProps({
  modelValue: { type: Boolean, default: false },
  label: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue']);
</script>

<template>
  <label class="switch" :class="{ disabled }">
    <input type="checkbox" :checked="modelValue" :disabled="disabled" @change="emit('update:modelValue', $event.target.checked)" />
    <span class="switch-track"></span>
    <span v-if="label || $slots.default" style="font-size: 13px;">
      <slot>{{ label }}</slot>
    </span>
  </label>
</template>
