<script setup>
import { ref, watch } from 'vue';
import Modal from './Modal.vue';
import StButton from './StButton.vue';

import { BannersAPI } from '../api/endpoints';
import { normalizeImageUrl } from '../utils/safeContent';

const props = defineProps({
  modelValue: { type: Boolean, default: false }
});

const emit = defineEmits(['update:modelValue', 'select']);

const loading = ref(false);
const banners = ref([]);

async function loadBanners() {
  loading.value = true;
  try {
    const data = await BannersAPI.list();
    banners.value = data.map((banner) => ({ ...banner, safeImageUrl: normalizeImageUrl(banner.imageUrl, { allowData: false, allowBlob: false }) })).filter((banner) => banner.safeImageUrl);
  } catch (err) {
    console.error('Failed to fetch banners:', err);
  } finally {
    loading.value = false;
  }
}

watch(() => props.modelValue, (isOpen) => {
  if (isOpen) {
    loadBanners();
  }
});

function selectBanner(url) {
  emit('select', url);
  emit('update:modelValue', false);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}
</script>

<template>
  <Modal 
    :modelValue="modelValue" 
    @update:modelValue="emit('update:modelValue', $event)" 
    title="Thư viện ảnh đã tạo"
    size="lg"
  >
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>Đang tải danh sách ảnh từ máy chủ...</p>
    </div>

    <div v-else-if="banners.length === 0" class="empty-state">
      <span class="material-symbols-outlined empty-icon">broken_image</span>
      <h3>Chưa có ảnh nào được lưu</h3>
      <p class="muted">Hãy tạo ảnh và lưu lại trong trang "Tạo ảnh thông báo" để có thể tái sử dụng tại đây.</p>
      <router-link to="/banner-generator" class="btn-go-create" @click="emit('update:modelValue', false)">
        Đi tới trang tạo ảnh
      </router-link>
    </div>

    <div v-else class="gallery-grid">
      <div 
        v-for="b in banners" 
        :key="b.id" 
        class="gallery-card"
        @click="selectBanner(b.safeImageUrl)"
      >
        <div class="image-wrapper">
          <img :src="b.safeImageUrl" alt="" loading="lazy" />
          <div class="hover-overlay">
            <span class="material-symbols-outlined select-icon">check_circle</span>
            <span class="select-text">Chọn ảnh này</span>
          </div>
        </div>
        <div class="card-details">
          <div class="card-name">{{ b.name }}</div>
          <div class="card-date">{{ formatDate(b.createdAt) }}</div>
        </div>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.loading-state, .empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
}

.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty-icon {
  font-size: 48px;
  color: var(--on-surface-variant);
  margin-bottom: 12px;
  opacity: 0.5;
}

.empty-state h3 {
  margin: 0 0 8px 0;
  font-size: 16px;
}

.empty-state p {
  font-size: 13px;
  max-width: 320px;
  margin: 0 0 20px 0;
}

.btn-go-create {
  display: inline-block;
  padding: 8px 16px;
  background: var(--primary);
  color: white;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
  transition: background var(--t-fast);
}
.btn-go-create:hover {
  background: var(--primary-hover);
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
  max-height: 480px;
  overflow-y: auto;
  padding: 4px;
}

.gallery-card {
  background: var(--surface-container-low);
  border: 1px solid var(--outline-variant);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: all var(--t-fast) var(--ease-out);
}

.gallery-card:hover {
  transform: translateY(-2px);
  border-color: var(--primary);
  box-shadow: var(--shadow-md);
  background: var(--surface-container-high);
}

.image-wrapper {
  position: relative;
  aspect-ratio: 1024 / 341;
  background: #000;
  overflow: hidden;
  border-bottom: 1px solid var(--outline-variant);
}

.image-wrapper img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform var(--t-fast) var(--ease-out);
}

.gallery-card:hover .image-wrapper img {
  transform: scale(1.03);
}

.hover-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  opacity: 0;
  transition: opacity var(--t-fast);
}

.gallery-card:hover .hover-overlay {
  opacity: 1;
}

.select-icon {
  font-size: 28px;
  color: var(--primary);
}

.select-text {
  font-size: 12px;
  font-weight: 600;
  color: white;
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
}

.card-details {
  padding: 10px 12px;
}

.card-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--on-surface);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-date {
  font-size: 11px;
  color: var(--on-surface-variant);
  margin-top: 2px;
  opacity: 0.8;
}
</style>
