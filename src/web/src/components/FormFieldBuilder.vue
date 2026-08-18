<script setup>
import { computed } from 'vue';
import StButton from './StButton.vue';
import Switch from './Switch.vue';

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue']);

const fields = computed({
  get: () => props.modelValue || [],
  set: (v) => emit('update:modelValue', v),
});

function add() {
  if (props.disabled) return;
  fields.value = [...fields.value, {
    id: 'field_' + Date.now(),
    label: 'New field',
    type: 'text',
    required: false,
    placeholder: '',
  }];
}

function remove(idx) {
  if (props.disabled) return;
  const arr = [...fields.value];
  arr.splice(idx, 1);
  fields.value = arr;
}

function move(idx, dir) {
  if (props.disabled) return;
  const arr = [...fields.value];
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= arr.length) return;
  [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
  fields.value = arr;
}

function update(idx, key, val) {
  if (props.disabled) return;
  const arr = [...fields.value];
  // If changing type to select, initialize options if they don't exist
  if (key === 'type' && val === 'select' && !arr[idx].options) {
    arr[idx] = { ...arr[idx], [key]: val, options: [] };
  } else {
    arr[idx] = { ...arr[idx], [key]: val };
  }
  fields.value = arr;
}

function addSelectOption(fieldIdx) {
  if (props.disabled) return;
  const arr = [...fields.value];
  const field = arr[fieldIdx];
  const opts = [...(field.options || [])];
  opts.push({
    label: 'Lựa chọn mới',
    value: 'option_' + Date.now(),
    fields: [],
    showFields: true
  });
  arr[fieldIdx] = { ...field, options: opts };
  fields.value = arr;
}

function removeSelectOption(fieldIdx, optIdx) {
  if (props.disabled) return;
  const arr = [...fields.value];
  const field = arr[fieldIdx];
  const opts = [...(field.options || [])];
  opts.splice(optIdx, 1);
  arr[fieldIdx] = { ...field, options: opts };
  fields.value = arr;
}

function updateSelectOption(fieldIdx, optIdx, key, val) {
  if (props.disabled) return;
  const arr = [...fields.value];
  const field = arr[fieldIdx];
  const opts = [...(field.options || [])];
  opts[optIdx] = { ...opts[optIdx], [key]: val };
  
  if (key === 'label' && (!opts[optIdx].value || opts[optIdx].value.startsWith('option_'))) {
    opts[optIdx].value = val.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
  }
  
  arr[fieldIdx] = { ...field, options: opts };
  fields.value = arr;
}

function toggleSelectOptionFields(fieldIdx, optIdx) {
  const arr = [...fields.value];
  const field = arr[fieldIdx];
  const opts = [...(field.options || [])];
  opts[optIdx] = { ...opts[optIdx], showFields: !opts[optIdx].showFields };
  arr[fieldIdx] = { ...field, options: opts };
  fields.value = arr;
}
</script>

<template>
  <div>
    <div v-if="!fields.length" class="empty">Chưa có field nào. Bấm <strong>+ Thêm field</strong> để bắt đầu.</div>

    <div v-for="(f, i) in fields" :key="f.id" class="card" style="margin-bottom: 14px; padding: 14px; background: rgba(255, 255, 255, 0.015); border: 1px solid var(--outline-variant);">
      <div class="flex" style="align-items: center; gap: 10px; margin-bottom: 12px;">
        <strong style="font-size: 12px; color: var(--brand-2);">#{{ i + 1 }}</strong>
        <input
          :value="f.label"
          :disabled="disabled"
          @input="update(i, 'label', $event.target.value)"
          placeholder="Tên trường (Label)"
          style="flex: 1; font-size: 13px;"
        />
        <select
          :value="f.type"
          :disabled="disabled"
          @change="update(i, 'type', $event.target.value)"
          style="width: 130px;"
        >
          <option value="text">📝 Text</option>
          <option value="textarea">📄 Textarea</option>
          <option value="number">🔢 Number</option>
          <option value="url">🔗 URL</option>
          <option value="select">🔽 Dropdown</option>
        </select>
        <StButton v-if="!disabled" variant="ghost" size="sm" icon @click="move(i, -1)" :disabled="i === 0">↑</StButton>
        <StButton v-if="!disabled" variant="ghost" size="sm" icon @click="move(i, 1)" :disabled="i === fields.length - 1">↓</StButton>
        <StButton v-if="!disabled" variant="danger" size="sm" icon @click="remove(i)">✕</StButton>
      </div>

      <input
        v-if="f.type !== 'select'"
        :value="f.placeholder"
        :disabled="disabled"
        @input="update(i, 'placeholder', $event.target.value)"
        placeholder="Placeholder (gợi ý hiện trong input)"
        style="width: 100%; font-size: 12px; margin-bottom: 8px;"
      />

      <!-- Options editor if type is select -->
      <div v-if="f.type === 'select'" style="margin-left: 20px; border-left: 2px dashed var(--outline); padding-left: 14px; margin-top: 10px; margin-bottom: 10px;">
        <div style="font-weight: 600; font-size: 12px; margin-bottom: 8px; color: var(--brand-2);">
          Danh sách lựa chọn (Dropdown Options)
        </div>
        <div v-for="(opt, oIdx) in f.options || []" :key="oIdx" class="flex flex-col" style="gap: 8px; background: rgba(255,255,255,0.02); padding: 10px; border-radius: 6px; margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.05);">
          <div class="flex" style="align-items: center; gap: 8px;">
            <input
              :value="opt.label"
              :disabled="disabled"
              @input="updateSelectOption(i, oIdx, 'label', $event.target.value)"
              placeholder="Tên lựa chọn (VD: Tố Cáo)"
              style="flex: 1; font-size: 12px;"
            />
            <input
              :value="opt.value"
              :disabled="disabled"
              @input="updateSelectOption(i, oIdx, 'value', $event.target.value)"
              placeholder="Mã (VD: report)"
              style="width: 120px; font-size: 12px;"
            />
            <StButton v-if="!disabled" variant="danger" size="sm" icon @click="removeSelectOption(i, oIdx)">✕</StButton>
          </div>
          
          <!-- Nested sub-fields -->
          <div style="margin-top: 4px;">
            <div class="flex" style="align-items: center; justify-content: space-between; margin-bottom: 4px;">
              <span class="muted text-xs">Trường thông tin con khi chọn "{{ opt.label || 'này' }}"</span>
              <StButton variant="ghost" size="sm" @click="toggleSelectOptionFields(i, oIdx)">
                {{ opt.showFields ? 'Ẩn trường con' : 'Cấu hình trường con (' + (opt.fields?.length || 0) + ')' }}
              </StButton>
            </div>
            
            <div v-if="opt.showFields" style="margin-left: 10px; border-left: 1px solid var(--outline-variant); padding-left: 10px; margin-top: 6px;">
              <FormFieldBuilder
                :model-value="opt.fields || []"
                :disabled="disabled"
                @update:model-value="(val) => updateSelectOption(i, oIdx, 'fields', val)"
              />
            </div>
          </div>
        </div>
        <StButton v-if="!disabled" variant="ghost" size="sm" @click="addSelectOption(i)">+ Thêm lựa chọn</StButton>
      </div>

      <Switch
        :model-value="!!f.required"
        :disabled="disabled"
        @update:model-value="(v) => update(i, 'required', v)"
      >Required (bắt buộc)</Switch>
    </div>

    <StButton v-if="!disabled" variant="primary" size="sm" @click="add">+ Thêm field</StButton>
    <p class="muted text-xs mt-3">
      <strong>Mẹo:</strong> Nếu biểu mẫu chỉ có tối đa 5 trường văn bản, bot sẽ hiển thị dạng Modal trực tiếp. 
      Nếu chứa Dropdown hoặc nhiều hơn 5 trường, bot sẽ tự động chuyển sang giao diện Wizard từng bước qua tin nhắn ẩn (ephemeral).
    </p>
  </div>
</template>
