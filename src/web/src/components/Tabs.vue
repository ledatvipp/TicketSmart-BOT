<script setup>
import { ref, nextTick, watch, onMounted } from 'vue';

const props = defineProps({
  modelValue: { type: [String, Number], default: null },
  tabs: { type: Array, required: true }, // [{ value, label, icon? }]
});
const emit = defineEmits(['update:modelValue']);

const wrapEl = ref(null);
const indicator = ref({ left: 0, width: 0, visible: false });

function move(value) {
  if (!wrapEl.value) return;
  const btn = wrapEl.value.querySelector(`[data-tab="${value}"]`);
  if (!btn) return;
  const wrapRect = wrapEl.value.getBoundingClientRect();
  const btnRect  = btn.getBoundingClientRect();
  indicator.value = {
    left: btnRect.left - wrapRect.left,
    width: btnRect.width,
    visible: true,
  };
}

function select(value) {
  emit('update:modelValue', value);
}

watch(() => props.modelValue, async (v) => { await nextTick(); move(v); });
onMounted(async () => { await nextTick(); move(props.modelValue); });
</script>

<template>
  <div ref="wrapEl" class="tabs">
    <div
      class="tab-indicator"
      :style="{
        left: indicator.left + 'px',
        width: indicator.width + 'px',
        opacity: indicator.visible ? 1 : 0,
      }"
    />
    <button
      v-for="t in tabs"
      :key="t.value"
      :data-tab="t.value"
      :class="['tab', { active: modelValue === t.value }]"
      @click="select(t.value)"
    >
      <span
        v-if="t.icon"
        :class="{ 'material-symbols-outlined': /^[a-z0-9_]+$/i.test(t.icon) }"
        style="margin-right: 6px; font-size: 18px; vertical-align: middle; display: inline-flex; align-items: center;"
      >
        {{ t.icon }}
      </span>
      {{ t.label }}
    </button>
  </div>
</template>
