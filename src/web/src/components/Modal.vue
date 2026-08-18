<script setup>
import { watch, onUnmounted } from 'vue';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' },
  size: { type: String, default: 'md' }, // md | lg | xl
  closeOnBackdrop: { type: Boolean, default: true },
});
const emit = defineEmits(['update:modelValue', 'close']);

function close() {
  emit('update:modelValue', false);
  emit('close');
}

function onBackdrop(e) {
  if (props.closeOnBackdrop && e.target.classList.contains('modal-backdrop')) close();
}

function onKeydown(e) {
  if (e.key === 'Escape') close();
}

watch(() => props.modelValue, (open) => {
  if (open) {
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeydown);
  } else {
    document.body.style.overflow = '';
    window.removeEventListener('keydown', onKeydown);
  }
});

onUnmounted(() => {
  document.body.style.overflow = '';
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="modelValue" class="modal-backdrop" @click="onBackdrop">
        <div :class="['modal-panel', 'size-' + size]" role="dialog">
          <div v-if="title || $slots.title || $slots.actions !== undefined || true" class="modal-header">
            <h2 class="modal-title">
              <slot name="title">{{ title }}</slot>
            </h2>
            <button class="modal-close" @click="close" aria-label="Close">
              <span class="material-symbols-outlined symbol-md">close</span>
            </button>
          </div>
          <div class="modal-body"><slot /></div>
          <div v-if="$slots.actions" class="modal-actions">
            <slot name="actions" :close="close" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
