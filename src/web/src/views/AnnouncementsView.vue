<script setup>
import { ref, onMounted } from 'vue';
import { ConfigAPI } from '../api/endpoints';
import { useToast } from '../stores/toast';
import StButton from '../components/StButton.vue';
import DiscordEmbedPreview from '../components/DiscordEmbedPreview.vue';
import ImageGalleryModal from '../components/ImageGalleryModal.vue';
import { getGeneratedBannerDataUrl, hasGeneratedBanner as checkGeneratedBanner } from '../utils/generatedBannerCache';
import { isSupportedImageFile, normalizeImageUrl } from '../utils/safeContent';

const toast = useToast();
const sending = ref(false);
const safeImage = (value) => normalizeImageUrl(value);

const hasGeneratedBanner = ref(false);
const isDraggingImage = ref(false);
const isDraggingThumbnail = ref(false);
const isDraggingAuthorIcon = ref(false);
const isDraggingFooterIcon = ref(false);
const isDraggingTitle = ref(false);
const isDraggingDesc = ref(false);
const isDraggingFooter = ref(false);

const showGallery = ref(false);
const galleryTargetKey = ref('');

function openGalleryFor(key) {
  galleryTargetKey.value = key;
  showGallery.value = true;
}

function handleGallerySelect(url) {
  if (galleryTargetKey.value === 'image') {
    form.value.image = url;
    form.value.imageFile = ''; // Clear file if using gallery URL
    toast.success('Đã áp dụng ảnh lớn từ thư viện!');
  } else if (galleryTargetKey.value === 'thumbnail') {
    form.value.thumbnail = url;
    form.value.thumbnailFile = ''; // Clear file if using gallery URL
    toast.success('Đã áp dụng ảnh thu nhỏ từ thư viện!');
  }
}

const fileInputImageRef = ref(null);
const fileInputThumbnailRef = ref(null);
const fileInputAuthorIconRef = ref(null);
const fileInputFooterIconRef = ref(null);

const form = ref({
  channelId: '',
  mode: 'container',
  title: '',
  description: '',
  footer: '',
  image: '',
  imageFile: '',
  thumbnail: '',
  thumbnailFile: '',
  authorIcon: '',
  authorIconFile: '',
  footerIcon: '',
  footerIconFile: '',
  color: 'none',
});

function setNoColor() {
  form.value.color = 'none';
}

onMounted(async () => {
  hasGeneratedBanner.value = await checkGeneratedBanner();
});

async function useGeneratedBanner() {
  const data = await getGeneratedBannerDataUrl();
  if (data) {
    form.value.imageFile = data;
    form.value.image = ''; // Clear URL if using file
    toast.success('Đã áp dụng ảnh vừa tạo!');
  } else {
    toast.error('Không tìm thấy ảnh vừa tạo');
  }
}

function handleFileSelect(e, key) {
  const file = e.target.files?.[0];
  if (file) {
    processFile(file, key);
  }
}

function processFile(file, key) {
  if (!file) return;
  if (!isSupportedImageFile(file)) {
    toast.error('Chỉ hỗ trợ PNG, JPEG, GIF hoặc WebP tối đa 5 MB');
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    form.value[key] = e.target.result;
    if (key === 'imageFile') form.value.image = '';
    else if (key === 'thumbnailFile') form.value.thumbnail = '';
    else if (key === 'authorIconFile') form.value.authorIcon = '';
    else if (key === 'footerIconFile') form.value.footerIcon = '';
    toast.success('Đã tải ảnh lên!');
  };
  reader.readAsDataURL(file);
}

function removeFile(key) {
  form.value[key] = '';
  if (key === 'imageFile' && fileInputImageRef.value) {
    fileInputImageRef.value.value = '';
  } else if (key === 'thumbnailFile' && fileInputThumbnailRef.value) {
    fileInputThumbnailRef.value.value = '';
  } else if (key === 'authorIconFile' && fileInputAuthorIconRef.value) {
    fileInputAuthorIconRef.value.value = '';
  } else if (key === 'footerIconFile' && fileInputFooterIconRef.value) {
    fileInputFooterIconRef.value.value = '';
  }
}

async function send() {
  if (sending.value) return;
  if (!form.value.channelId.trim()) return toast.error('Nhập Channel ID');
  if (!form.value.title.trim() && !form.value.description.trim()) return toast.error('Nhập nội dung thông báo');

  sending.value = true;
  try {
    const res = await ConfigAPI.sendAnnouncement({ ...form.value });
    toast.success(`Đã gửi thông báo (${res.messageId})`);
  } catch (e) {
    toast.error(e.response?.data?.message || 'Lỗi gửi thông báo');
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <div class="page-header announce-header">
    <div>
      <p class="eyebrow">Discord publisher</p>
      <h1 class="page-title">Thông báo</h1>
      <p class="page-sub">Gửi embed hoặc container vào channel Discord để thông báo update, sự kiện, bảo trì.</p>
    </div>
    <StButton variant="primary" :disabled="sending" @click="send">
      <span class="material-symbols-outlined symbol-sm">send</span>
      {{ sending ? 'Đang gửi...' : 'Gửi thông báo' }}
    </StButton>
  </div>

  <div class="announce-grid">
    <section class="card announce-editor">
      <div class="form-row">
        <label>Channel ID</label>
        <input v-model="form.channelId" placeholder="Channel nhận thông báo" />
      </div>

      <div class="form-row">
        <label>Kiểu message</label>
        <div class="mode-picker">
          <button :class="{ active: form.mode === 'container' }" @click="form.mode = 'container'">
            <strong>Container</strong>
            <span>Không có thanh xám nếu không chọn màu</span>
          </button>
          <button :class="{ active: form.mode === 'embed' }" @click="form.mode = 'embed'">
            <strong>Embed</strong>
            <span>Embed Discord cổ điển</span>
          </button>
        </div>
      </div>

      <div class="grid-2">
        <div 
          class="form-row drag-drop-textarea" 
          :class="{ 'drag-over': isDraggingTitle }"
          @dragover.prevent="isDraggingTitle = true"
          @dragleave.prevent="isDraggingTitle = false"
          @drop.prevent="isDraggingTitle = false; processFile($event.dataTransfer?.files?.[0], 'authorIconFile')"
        >
          <label>Title</label>
          <textarea v-model="form.title" placeholder="Update mới"></textarea>
        </div>
        <div class="form-row">
          <label>Color</label>
          <div class="color-control">
            <input v-if="form.color !== 'none'" v-model="form.color" type="color" />
            <span v-else class="no-color-preview">Container không màu</span>
            <button type="button" @click="setNoColor">Không màu</button>
            <button v-if="form.color === 'none'" type="button" @click="form.color = '#5865F2'">Dùng màu</button>
          </div>
        </div>
      </div>

      <div 
        class="form-row drag-drop-textarea" 
        :class="{ 'drag-over': isDraggingDesc }"
        @dragover.prevent="isDraggingDesc = true"
        @dragleave.prevent="isDraggingDesc = false"
        @drop.prevent="isDraggingDesc = false; processFile($event.dataTransfer?.files?.[0], 'imageFile')"
      >
        <label>Nội dung</label>
        <textarea v-model="form.description" placeholder="Viết nội dung thông báo..." style="min-height: 180px;"></textarea>
      </div>

      <div class="grid-2">
        <!-- Thumbnail (góc phải) -->
        <div class="form-row">
          <label>Thumbnail (góc phải)</label>
          <div 
            class="upload-dropzone" 
            :class="{ active: isDraggingThumbnail, 'has-file': form.thumbnailFile }"
            @dragover.prevent="isDraggingThumbnail = true"
            @dragleave.prevent="isDraggingThumbnail = false"
            @drop.prevent="isDraggingThumbnail = false; processFile($event.dataTransfer?.files?.[0], 'thumbnailFile')"
            @click="fileInputThumbnailRef.click()"
          >
            <input 
              type="file" 
              ref="fileInputThumbnailRef" 
              style="display: none;" 
              accept="image/*" 
              @change="handleFileSelect($event, 'thumbnailFile')"
            />
            
            <div v-if="form.thumbnailFile" class="uploaded-preview-container" @click.stop>
              <img :src="safeImage(form.thumbnailFile)" class="uploaded-thumb" />
              <div class="uploaded-actions">
                <span class="file-info-text">Ảnh đã chọn (Local)</span>
                <button type="button" class="btn-remove-file" @click="removeFile('thumbnailFile')">
                  <span class="material-symbols-outlined symbol-sm">delete</span> Gỡ bỏ
                </button>
              </div>
            </div>
            
            <div v-else class="dropzone-prompt">
              <span class="material-symbols-outlined upload-icon">cloud_upload</span>
              <p class="prompt-text">Kéo thả ảnh hoặc click để chọn</p>
            </div>
          </div>
          <div class="image-alternatives">
            <input 
              v-if="!form.thumbnailFile" 
              v-model="form.thumbnail" 
              placeholder="Hoặc dán URL: https://..." 
              class="url-input"
            />
            <div class="flex gap-2" style="margin-top: 4px; width: 100%;">
              <button 
                type="button" 
                class="btn-use-generated" 
                style="background: var(--surface-container-high);"
                @click="openGalleryFor('thumbnail')"
              >
                <span class="material-symbols-outlined symbol-sm">collections</span>
                Chọn từ thư viện
              </button>
            </div>
          </div>
        </div>

        <!-- Image (lớn ở dưới / banner) -->
        <div class="form-row">
          <label>Hình ảnh (URL hoặc Tải lên)</label>
          <div 
            class="upload-dropzone" 
            :class="{ active: isDraggingImage, 'has-file': form.imageFile }"
            @dragover.prevent="isDraggingImage = true"
            @dragleave.prevent="isDraggingImage = false"
            @drop.prevent="isDraggingImage = false; processFile($event.dataTransfer?.files?.[0], 'imageFile')"
            @click="fileInputImageRef.click()"
          >
            <input 
              type="file" 
              ref="fileInputImageRef" 
              style="display: none;" 
              accept="image/*" 
              @change="handleFileSelect($event, 'imageFile')"
            />
            
            <div v-if="form.imageFile" class="uploaded-preview-container" @click.stop>
              <img :src="safeImage(form.imageFile)" class="uploaded-thumb" />
              <div class="uploaded-actions">
                <span class="file-info-text">Ảnh đã chọn (Local)</span>
                <button type="button" class="btn-remove-file" @click="removeFile('imageFile')">
                  <span class="material-symbols-outlined symbol-sm">delete</span> Gỡ bỏ
                </button>
              </div>
            </div>
            
            <div v-else class="dropzone-prompt">
              <span class="material-symbols-outlined upload-icon">cloud_upload</span>
              <p class="prompt-text">Kéo thả ảnh hoặc click để chọn</p>
            </div>
          </div>
          
          <div class="image-alternatives">
            <input 
              v-if="!form.imageFile" 
              v-model="form.image" 
              placeholder="Hoặc dán URL: https://..." 
              class="url-input"
            />
            <div class="flex gap-2" style="margin-top: 4px; width: 100%;">
              <button 
                v-if="hasGeneratedBanner" 
                type="button" 
                class="btn-use-generated" 
                @click="useGeneratedBanner"
              >
                <span class="material-symbols-outlined symbol-sm">auto_awesome</span>
                Ảnh vừa tạo
              </button>
              <button 
                type="button" 
                class="btn-use-generated" 
                style="background: var(--surface-container-high);"
                @click="openGalleryFor('image')"
              >
                <span class="material-symbols-outlined symbol-sm">collections</span>
                Chọn từ thư viện
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="grid-2" style="margin-top: 16px;">
        <!-- Author Icon -->
        <div class="form-row">
          <label>Ảnh ở Title / Author (Tròn nhỏ)</label>
          <div 
            class="upload-dropzone" 
            :class="{ active: isDraggingAuthorIcon, 'has-file': form.authorIconFile }"
            @dragover.prevent="isDraggingAuthorIcon = true"
            @dragleave.prevent="isDraggingAuthorIcon = false"
            @drop.prevent="isDraggingAuthorIcon = false; processFile($event.dataTransfer?.files?.[0], 'authorIconFile')"
            @click="fileInputAuthorIconRef.click()"
          >
            <input 
              type="file" 
              ref="fileInputAuthorIconRef" 
              style="display: none;" 
              accept="image/*" 
              @change="handleFileSelect($event, 'authorIconFile')"
            />
            
            <div v-if="form.authorIconFile" class="uploaded-preview-container" @click.stop>
              <img :src="safeImage(form.authorIconFile)" class="uploaded-thumb" style="border-radius: 50%; width: 50px; height: 50px; object-fit: cover;" />
              <div class="uploaded-actions">
                <span class="file-info-text">Ảnh đã chọn (Local)</span>
                <button type="button" class="btn-remove-file" @click="removeFile('authorIconFile')">
                  <span class="material-symbols-outlined symbol-sm">delete</span> Gỡ bỏ
                </button>
              </div>
            </div>
            
            <div v-else class="dropzone-prompt">
              <span class="material-symbols-outlined upload-icon">cloud_upload</span>
              <p class="prompt-text">Kéo thả ảnh hoặc click để chọn</p>
            </div>
          </div>
          <div class="image-alternatives">
            <input 
              v-if="!form.authorIconFile" 
              v-model="form.authorIcon" 
              placeholder="Hoặc dán URL: https://..." 
              class="url-input"
            />
          </div>
        </div>

        <!-- Footer Icon -->
        <div class="form-row">
          <label>Ảnh ở Footer (Tròn nhỏ)</label>
          <div 
            class="upload-dropzone" 
            :class="{ active: isDraggingFooterIcon, 'has-file': form.footerIconFile }"
            @dragover.prevent="isDraggingFooterIcon = true"
            @dragleave.prevent="isDraggingFooterIcon = false"
            @drop.prevent="isDraggingFooterIcon = false; processFile($event.dataTransfer?.files?.[0], 'footerIconFile')"
            @click="fileInputFooterIconRef.click()"
          >
            <input 
              type="file" 
              ref="fileInputFooterIconRef" 
              style="display: none;" 
              accept="image/*" 
              @change="handleFileSelect($event, 'footerIconFile')"
            />
            
            <div v-if="form.footerIconFile" class="uploaded-preview-container" @click.stop>
              <img :src="safeImage(form.footerIconFile)" class="uploaded-thumb" style="border-radius: 50%; width: 50px; height: 50px; object-fit: cover;" />
              <div class="uploaded-actions">
                <span class="file-info-text">Ảnh đã chọn (Local)</span>
                <button type="button" class="btn-remove-file" @click="removeFile('footerIconFile')">
                  <span class="material-symbols-outlined symbol-sm">delete</span> Gỡ bỏ
                </button>
              </div>
            </div>
            
            <div v-else class="dropzone-prompt">
              <span class="material-symbols-outlined upload-icon">cloud_upload</span>
              <p class="prompt-text">Kéo thả ảnh hoặc click để chọn</p>
            </div>
          </div>
          <div class="image-alternatives">
            <input 
              v-if="!form.footerIconFile" 
              v-model="form.footerIcon" 
              placeholder="Hoặc dán URL: https://..." 
              class="url-input"
            />
          </div>
        </div>
      </div>

      <div 
        class="form-row drag-drop-textarea" 
        :class="{ 'drag-over': isDraggingFooter }"
        @dragover.prevent="isDraggingFooter = true"
        @dragleave.prevent="isDraggingFooter = false"
        @drop.prevent="isDraggingFooter = false; processFile($event.dataTransfer?.files?.[0], 'footerIconFile')"
      >
        <label>Footer</label>
        <textarea v-model="form.footer" placeholder="Tên server hoặc ghi chú"></textarea>
      </div>
    </section>

    <aside class="card card-glass announce-preview">
      <div class="preview-head">
        <h3>Preview</h3>
        <span class="badge badge-brand">{{ form.mode }}</span>
      </div>

      <div v-if="form.mode === 'container'" class="container-preview" :class="{ colored: form.color !== 'none' }" :style="{ borderLeftColor: form.color !== 'none' ? form.color : 'transparent' }">
        <img v-if="safeImage(form.authorIconFile || form.authorIcon)" :src="safeImage(form.authorIconFile || form.authorIcon)" alt="" style="margin-bottom: 8px; border-radius: 4px; max-height: 80px; object-fit: contain;" />
        <img v-if="safeImage(form.imageFile || form.image)" :src="safeImage(form.imageFile || form.image)" alt="" />
        <div v-if="form.imageFile || form.image" class="container-divider"></div>
        
        <!-- Section layout with thumbnail accessory if thumbnail exists -->
        <div v-if="form.thumbnailFile || form.thumbnail" class="container-section-preview">
          <div class="text-content">
            <h2 v-if="form.title">{{ form.title }}</h2>
            <p v-if="form.description">{{ form.description }}</p>
          </div>
          <img :src="safeImage(form.thumbnailFile || form.thumbnail)" class="container-thumbnail-preview" />
        </div>
        
        <template v-else>
          <h2 v-if="form.title">{{ form.title }}</h2>
          <p v-if="form.description">{{ form.description }}</p>
        </template>
        
        <img v-if="safeImage(form.footerIconFile || form.footerIcon)" :src="safeImage(form.footerIconFile || form.footerIcon)" alt="" style="margin-top: 8px; border-radius: 4px; max-height: 60px; object-fit: contain;" />
        <div v-if="form.footer" class="container-divider"></div>
        <small v-if="form.footer">{{ form.footer }}</small>
      </div>

      <DiscordEmbedPreview
        v-else
        :title="form.title"
        :description="form.description"
        :color="form.color"
        :footer="form.footer"
        :image="form.imageFile || form.image"
        :thumbnail="form.thumbnailFile || form.thumbnail"
        :author-icon="form.authorIconFile || form.authorIcon"
        :footer-icon="form.footerIconFile || form.footerIcon"
      />
    </aside>
    <ImageGalleryModal v-model="showGallery" @select="handleGallerySelect" />
  </div>
</template>

<style scoped>
.announce-header {
  padding: 26px;
  border: 1px solid var(--outline-variant);
  border-radius: 18px;
  background: var(--surface-container-low);
}

.eyebrow {
  margin: 0 0 8px;
  color: var(--primary);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.announce-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 520px;
  gap: 22px;
  align-items: start;
}

.mode-picker {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.mode-picker button {
  display: grid;
  gap: 4px;
  padding: 14px;
  border: 1px solid var(--outline-variant);
  border-radius: 12px;
  background: var(--surface-container);
  color: var(--on-surface);
  text-align: left;
}

.mode-picker button.active {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary), transparent 88%);
  box-shadow: 0 0 0 3px var(--brand-glow);
}

.mode-picker span {
  color: var(--on-surface-variant);
  font-size: 12px;
}

.color-control {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.color-control input[type="color"] {
  width: 48px;
  height: 38px;
  padding: 4px;
}

.color-control button {
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--outline-variant);
  border-radius: 999px;
  background: var(--surface-container-low);
  color: var(--on-surface);
}

.no-color-preview {
  height: 36px;
  display: inline-flex;
  align-items: center;
  padding: 0 12px;
  border: 1px dashed var(--outline);
  border-radius: 999px;
  color: var(--on-surface-variant);
  font-size: 12px;
}

.announce-preview {
  position: sticky;
  top: 82px;
}

.preview-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}

.preview-head h3 {
  margin: 0;
}



.upload-dropzone {
  border: 2px dashed var(--outline-variant);
  border-radius: 12px;
  padding: 16px;
  text-align: center;
  background: var(--surface-container-low);
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100px;
}

.upload-dropzone:hover, .upload-dropzone.active {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary), transparent 95%);
}

.dropzone-prompt {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.upload-icon {
  font-size: 28px;
  color: var(--on-surface-variant);
  margin-bottom: 2px;
}

.prompt-text {
  font-size: 12px;
  font-weight: 500;
  margin: 0;
  color: var(--on-surface);
}

.uploaded-preview-container {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
}

.uploaded-thumb {
  width: 100px;
  height: 50px;
  object-fit: contain;
  border-radius: 6px;
  background: #020617;
  border: 1px solid var(--outline-variant);
}

.uploaded-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  flex-grow: 1;
}

.file-info-text {
  font-size: 12px;
  font-weight: 600;
  color: var(--on-surface);
}

.btn-remove-file {
  display: flex;
  align-items: center;
  gap: 4px;
  background: color-mix(in srgb, var(--error), transparent 90%);
  color: var(--error);
  border: 1px solid color-mix(in srgb, var(--error), transparent 75%);
  border-radius: 6px;
  padding: 2px 8px;
  font-size: 11px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.15s ease;
}

.btn-remove-file:hover {
  background: var(--error);
  color: #fff;
}

.image-alternatives {
  display: flex;
  gap: 10px;
  margin-top: 10px;
  align-items: center;
  width: 100%;
}

.url-input {
  flex-grow: 1;
}

.btn-use-generated {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 38px;
  padding: 0 14px;
  background: var(--surface-container-high);
  color: var(--on-surface);
  border: 1px solid var(--outline-variant);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.btn-use-generated:hover {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}

.btn-use-generated span {
  font-size: 16px;
}

.container-section-preview {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.container-section-preview .text-content {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 10px;
}

.container-thumbnail-preview {
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: 6px;
  flex-shrink: 0;
}

.drag-drop-textarea {
  position: relative;
  transition: all 0.2s ease;
  border: 1px solid transparent;
  border-radius: 8px;
}
.drag-drop-textarea.drag-over {
  background: color-mix(in srgb, var(--primary), transparent 95%);
  border-color: var(--primary) !important;
}

@media (max-width: 1100px) {
  .announce-grid {
    grid-template-columns: 1fr;
  }

  .announce-preview {
    position: static;
  }
}

@media (max-width: 640px) {
  .mode-picker,
  .grid-2 {
    grid-template-columns: 1fr;
  }
}
</style>
