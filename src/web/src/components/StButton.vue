<script setup>
import { ref } from 'vue';

defineProps({
  variant: { type: String, default: 'default' }, // default | primary | danger | ghost
  size: { type: String, default: 'md' },         // sm | md | lg
  icon: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
});

const btnEl = ref(null);

function onClick(e) {
  if (!btnEl.value) return;
  const rect = btnEl.value.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  ripple.style.width = ripple.style.height = size + 'px';
  ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
  ripple.style.top  = (e.clientY - rect.top  - size / 2) + 'px';
  btnEl.value.appendChild(ripple);
  setTimeout(() => ripple.remove(), 650);
}
</script>

<template>
  <button
    ref="btnEl"
    :class="[
      'btn',
      variant === 'primary' && 'btn-primary',
      variant === 'danger'  && 'btn-danger',
      variant === 'ghost'   && 'btn-ghost',
      size === 'sm' && 'btn-sm',
      size === 'lg' && 'btn-lg',
      icon && 'btn-icon',
    ]"
    :disabled="disabled"
    @click="onClick"
  >
    <slot />
  </button>
</template>
