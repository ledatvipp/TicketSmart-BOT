<script setup>
import { ref, onMounted, computed } from 'vue';
import { ConfigAPI, OptionsAPI, ClustersAPI } from '../api/endpoints';
import { useToast } from '../stores/toast';
import StButton from '../components/StButton.vue';
import Tabs from '../components/Tabs.vue';
import Switch from '../components/Switch.vue';
import DiscordEmbedPreview from '../components/DiscordEmbedPreview.vue';
import ImageGalleryModal from '../components/ImageGalleryModal.vue';
import { getGeneratedBannerDataUrl, hasGeneratedBanner as checkGeneratedBanner } from '../utils/generatedBannerCache';
import { isSupportedImageFile, normalizeImageUrl } from '../utils/safeContent';

const cfg = ref(null);
const options = ref([]);
const clusters = ref([]);
const tab = ref('setup');
const toast = useToast();
const saving = ref(false);
const publishingSetup = ref(false);
const openRouterKeyInput = ref('');
const testingOpenRouter = ref(false);
const deletingOpenRouterKey = ref(false);
const playgroundPrompt = ref('Hãy trả lời ngắn gọn: server Minecraft của tôi có hệ thống ticket hỗ trợ người chơi, bạn có thể giúp những gì?');
const playgroundResult = ref(null);
const runningPlayground = ref(false);
const aiRuntime = ref([]);
const safeImage = (value) => normalizeImageUrl(value);

const TABS = [
  { value: 'setup',  label: 'Setup Embed',  icon: 'settings' },
  { value: 'ticket', label: 'Ticket Embed', icon: 'confirmation_number' },
  { value: 'dm',     label: 'DM & Behavior', icon: 'mail' },
  { value: 'smart',  label: 'Smart AI',     icon: 'smart_toy' },
  { value: 'ids',    label: 'Discord IDs',  icon: 'fingerprint' },
];

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
  if (galleryTargetKey.value) {
    cfg.value[galleryTargetKey.value] = url;
    toast.success('Đã áp dụng ảnh từ thư viện!');
  }
}

const fileInputImageRef = ref(null);
const fileInputThumbnailRef = ref(null);
const fileInputAuthorIconRef = ref(null);
const fileInputFooterIconRef = ref(null);

onMounted(async () => {
  const [c, o, clusterRows, provider] = await Promise.all([
    ConfigAPI.get(),
    OptionsAPI.list(),
    ClustersAPI.list({ active: true }),
    ConfigAPI.aiProvider().catch(() => null),
  ]);
  cfg.value = provider ? { ...c, ...provider } : c;
  aiRuntime.value = Array.isArray(provider?.runtime) ? provider.runtime : [];
  options.value = o;
  clusters.value = clusterRows;
  hasGeneratedBanner.value = await checkGeneratedBanner();
});

async function useGeneratedBannerFor(key) {
  const data = await getGeneratedBannerDataUrl();
  if (data) {
    cfg.value[key] = data;
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
    cfg.value[key] = e.target.result;
    toast.success('Đã tải ảnh lên!');
  };
  reader.readAsDataURL(file);
}

function removeFile(key) {
  cfg.value[key] = '';
  if (key === 'embedImage' && fileInputImageRef.value) {
    fileInputImageRef.value.value = '';
  } else if (key === 'embedThumbnail' && fileInputThumbnailRef.value) {
    fileInputThumbnailRef.value.value = '';
  } else if (key === 'embedAuthorIcon' && fileInputAuthorIconRef.value) {
    fileInputAuthorIconRef.value.value = '';
  } else if (key === 'embedFooterIcon' && fileInputFooterIconRef.value) {
    fileInputFooterIconRef.value.value = '';
  }
}

async function save() {
  if (saving.value) return;
  saving.value = true;
  try {
    cfg.value = await ConfigAPI.update(cfg.value);
    const pendingKey = openRouterKeyInput.value.trim();
    if (pendingKey) {
      const status = await ConfigAPI.setOpenRouterKey(pendingKey);
      cfg.value = { ...cfg.value, ...status };
      openRouterKeyInput.value = '';
      toast.success('Đã lưu cấu hình và OpenRouter API key');
    } else {
      toast.success('Đã lưu cấu hình');
    }
  } catch (e) {
    toast.error(e.response?.data?.message || 'Lỗi lưu');
  } finally {
    saving.value = false;
  }
}

async function testOpenRouter() {
  if (testingOpenRouter.value) return;
  testingOpenRouter.value = true;
  try {
    const data = await ConfigAPI.testOpenRouter({
      model: cfg.value.openRouterModel,
      ...(openRouterKeyInput.value.trim() ? { apiKey: openRouterKeyInput.value.trim() } : {}),
    });
    toast.success(`OpenRouter OK${data.fallbackUsed ? ' (fallback)' : ''} · ${data.modelUsed || data.model} · ${data.latencyMs} ms · ${data.usage?.totalTokens || 0} tokens`);
    await refreshAiProviderRuntime();
  } catch (e) {
    toast.error(e.response?.data?.message || 'Không kết nối được OpenRouter');
  } finally {
    testingOpenRouter.value = false;
  }
}


async function refreshAiProviderRuntime() {
  try {
    const provider = await ConfigAPI.aiProvider();
    cfg.value = { ...cfg.value, ...provider };
    aiRuntime.value = Array.isArray(provider?.runtime) ? provider.runtime : [];
  } catch { /* runtime metrics are diagnostic only */ }
}

async function runOpenRouterPlayground() {
  if (runningPlayground.value) return;
  const prompt = playgroundPrompt.value.trim();
  if (!prompt) {
    toast.error('Hãy nhập câu hỏi để thử AI');
    return;
  }
  runningPlayground.value = true;
  playgroundResult.value = null;
  try {
    const data = await ConfigAPI.playgroundOpenRouter({
      prompt,
      model: cfg.value.openRouterModel,
      ...(openRouterKeyInput.value.trim() ? { apiKey: openRouterKeyInput.value.trim() } : {}),
    });
    playgroundResult.value = data;
    toast.success(`AI trả lời xong${data.fallbackUsed ? ' · fallback' : ''} · ${data.latencyMs} ms · ${data.usage?.totalTokens || 0} tokens`);
    await refreshAiProviderRuntime();
  } catch (e) {
    toast.error(e.response?.data?.message || 'AI Playground không nhận được phản hồi');
  } finally {
    runningPlayground.value = false;
  }
}

async function deleteOpenRouterKey() {
  if (deletingOpenRouterKey.value) return;
  if (!window.confirm('Xóa OpenRouter API key đã lưu trong Dashboard? Nếu server có OPENROUTER_API_KEY trong .env thì hệ thống sẽ tự dùng key đó.')) return;
  deletingOpenRouterKey.value = true;
  try {
    const status = await ConfigAPI.deleteOpenRouterKey();
    cfg.value = { ...cfg.value, ...status };
    openRouterKeyInput.value = '';
    toast.success(status.openRouterApiKeySource === 'env' ? 'Đã xóa key Dashboard; đang dùng key từ .env' : 'Đã xóa OpenRouter API key');
  } catch (e) {
    toast.error(e.response?.data?.message || 'Không xóa được OpenRouter API key');
  } finally {
    deletingOpenRouterKey.value = false;
  }
}

async function publishSetup() {
  if (publishingSetup.value) return;
  publishingSetup.value = true;
  try {
    const res = await ConfigAPI.publishSetup(cfg.value);
    toast.success(`Đã cập nhật setup embed (${res.deleted || 0} bản cũ đã xóa)`);
  } catch (e) {
    toast.error(e.response?.data?.message || 'Lỗi cập nhật setup embed');
  } finally {
    publishingSetup.value = false;
  }
}

function setNoColor(key) {
  cfg.value[key] = 'none';
}

function setupMode() {
  return cfg.value.embedColor === 'none' ? 'container' : 'embed';
}

function setSetupMode(mode) {
  if (mode === 'container') cfg.value.embedColor = 'none';
  else if (cfg.value.embedColor === 'none') cfg.value.embedColor = '#5865F2';
}

// Preview vars
const nowTime = computed(() => new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }));

const previewVars = computed(() => ({
  ticketNum: '0042',
  user: '@Bạn',
  optionName: options.value[0]?.name || 'Hỗ trợ chung',
  channel: '#ticket-0042',
}));

// Setup embed fields cho preview (giả lập)
const setupFields = computed(() => {
  if (!cfg.value || !options.value.length) return [];
  return [];  // setup embed không có fields
});

// Setup embed select options
const setupSelectOptions = computed(() =>
  options.value.filter((o) => o.isActive).map((o) => ({
    label: `${o.emoji || '🗺️'} ${o.name}`,
    description: o.description || '',
  }))
);

// Ticket embed fields cho preview
const ticketFields = computed(() => {
  if (!cfg.value) return [];
  const f = [];
  if (cfg.value.ticketShowType)    f.push({ name: '📋 Loại Ticket', value: '🐛 Bug & Fix', inline: true });
  if (cfg.value.ticketShowCreator) f.push({ name: '👤 Người Tạo',   value: '@Bạn (you)',    inline: true });
  if (cfg.value.ticketShowTime)    f.push({ name: '📅 Thời Gian',    value: new Date().toLocaleString('vi-VN'), inline: true });
  if (cfg.value.ticketShowGuide)   f.push({ name: '📌 Hướng Dẫn',    value: cfg.value.ticketGuidance || '', inline: false });
  return f;
});
</script>

<template>
  <div v-if="!cfg" class="empty">Đang tải cấu hình...</div>

  <template v-else>
    <div class="page-header">
      <div>
        <h1 class="page-title">Cấu hình</h1>
        <p class="page-sub">Mọi thứ bạn cấu hình sẽ hiện lên Discord live ở cột phải</p>
      </div>
      <div class="flex gap-2">
        <StButton variant="ghost" @click="$router.go(-1)"> Quay lại</StButton>
        <StButton variant="primary" :disabled="saving" @click="save">
          <span class="material-symbols-outlined symbol-sm" style="vertical-align: middle; margin-right: 4px;">{{ saving ? 'progress_activity' : 'save' }}</span>
          {{ saving ? 'Đang lưu...' : 'Lưu cấu hình' }}
        </StButton>
      </div>
    </div>

    <Tabs v-model="tab" :tabs="TABS" />

    <div style="display: grid; grid-template-columns: 1fr 560px; gap: 24px; align-items: start;">
      <!-- ─── EDITOR ─── -->
      <div class="card">
        <!-- TAB: Setup -->
        <template v-if="tab === 'setup'">
          <div class="config-section-head">
            <div>
              <h3>Embed setup</h3>
              <p>Message public để user chọn loại hỗ trợ và tạo ticket.</p>
            </div>
            <StButton variant="primary" :disabled="publishingSetup || !cfg.embedChannelId" @click="publishSetup">
              <span class="material-symbols-outlined symbol-sm">cloud_upload</span>
              {{ publishingSetup ? 'Đang cập nhật...' : 'Cập nhật lên Discord' }}
            </StButton>
          </div>

          <div 
            class="form-row drag-drop-textarea" 
            :class="{ 'drag-over': isDraggingTitle }"
            @dragover.prevent="isDraggingTitle = true"
            @dragleave.prevent="isDraggingTitle = false"
            @drop.prevent="isDraggingTitle = false; processFile($event.dataTransfer?.files?.[0], 'embedAuthorIcon')"
          >
            <label>Title</label>
            <textarea v-model="cfg.embedTitle" placeholder="Tiêu đề embed..."></textarea>
          </div>
          <div 
            class="form-row drag-drop-textarea" 
            :class="{ 'drag-over': isDraggingDesc }"
            @dragover.prevent="isDraggingDesc = true"
            @dragleave.prevent="isDraggingDesc = false"
            @drop.prevent="isDraggingDesc = false; processFile($event.dataTransfer?.files?.[0], 'embedImage')"
          >
            <label>Description</label>
            <textarea v-model="cfg.embedDesc" style="min-height: 140px;" placeholder="Mô tả chi tiết..."></textarea>
          </div>
          <div class="grid-2">
            <div 
              class="form-row drag-drop-textarea" 
              :class="{ 'drag-over': isDraggingFooter }"
              @dragover.prevent="isDraggingFooter = true"
              @dragleave.prevent="isDraggingFooter = false"
              @drop.prevent="isDraggingFooter = false; processFile($event.dataTransfer?.files?.[0], 'embedFooterIcon')"
            >
              <label>Footer</label>
              <textarea v-model="cfg.embedFooter" placeholder="Chân trang embed..."></textarea>
            </div>
            <div class="form-row">
              <label>Color</label>
              <div class="color-control">
                <input v-if="cfg.embedColor !== 'none'" v-model="cfg.embedColor" type="color" />
                <span v-else class="no-color-preview">Container không màu</span>
                <button type="button" @click="setNoColor('embedColor')">Không màu</button>
                <button v-if="cfg.embedColor === 'none'" type="button" @click="cfg.embedColor = '#5865F2'">Dùng màu</button>
              </div>
            </div>
          </div>
          <div class="grid-2">
            <!-- Thumbnail (góc phải) -->
            <div class="form-row">
              <label>Thumbnail (góc phải)</label>
              <div 
                class="upload-dropzone" 
                :class="{ active: isDraggingThumbnail, 'has-file': cfg.embedThumbnail && cfg.embedThumbnail.startsWith('data:') }"
                @dragover.prevent="isDraggingThumbnail = true"
                @dragleave.prevent="isDraggingThumbnail = false"
                @drop.prevent="isDraggingThumbnail = false; processFile($event.dataTransfer?.files?.[0], 'embedThumbnail')"
                @click="fileInputThumbnailRef.click()"
              >
                <input 
                  type="file" 
                  ref="fileInputThumbnailRef" 
                  style="display: none;" 
                  accept="image/*" 
                  @change="handleFileSelect($event, 'embedThumbnail')"
                />
                
                <div v-if="cfg.embedThumbnail && cfg.embedThumbnail.startsWith('data:')" class="uploaded-preview-container" @click.stop>
                  <img :src="safeImage(cfg.embedThumbnail)" class="uploaded-thumb" />
                  <div class="uploaded-actions">
                    <span class="file-info-text">Ảnh đã chọn (Local)</span>
                    <button type="button" class="btn-remove-file" @click="removeFile('embedThumbnail')">
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
                  v-if="!cfg.embedThumbnail || !cfg.embedThumbnail.startsWith('data:')" 
                  v-model="cfg.embedThumbnail" 
                  placeholder="Hoặc dán URL: https://..." 
                  class="url-input"
                />
                <div class="flex gap-2" style="margin-top: 4px; width: 100%;">
                  <button 
                    v-if="hasGeneratedBanner" 
                    type="button" 
                    class="btn-use-generated" 
                    @click="useGeneratedBannerFor('embedThumbnail')"
                  >
                    <span class="material-symbols-outlined symbol-sm">auto_awesome</span>
                    Ảnh vừa tạo
                  </button>
                  <button 
                    type="button" 
                    class="btn-use-generated" 
                    style="background: var(--surface-container-high);"
                    @click="openGalleryFor('embedThumbnail')"
                  >
                    <span class="material-symbols-outlined symbol-sm">collections</span>
                    Chọn từ thư viện
                  </button>
                </div>
              </div>
            </div>

            <!-- Image (lớn ở dưới) -->
            <div class="form-row">
              <label>Hình ảnh (lớn ở dưới)</label>
              <div 
                class="upload-dropzone" 
                :class="{ active: isDraggingImage, 'has-file': cfg.embedImage && cfg.embedImage.startsWith('data:') }"
                @dragover.prevent="isDraggingImage = true"
                @dragleave.prevent="isDraggingImage = false"
                @drop.prevent="isDraggingImage = false; processFile($event.dataTransfer?.files?.[0], 'embedImage')"
                @click="fileInputImageRef.click()"
              >
                <input 
                  type="file" 
                  ref="fileInputImageRef" 
                  style="display: none;" 
                  accept="image/*" 
                  @change="handleFileSelect($event, 'embedImage')"
                />
                
                <div v-if="cfg.embedImage && cfg.embedImage.startsWith('data:')" class="uploaded-preview-container" @click.stop>
                  <img :src="safeImage(cfg.embedImage)" class="uploaded-thumb" />
                  <div class="uploaded-actions">
                    <span class="file-info-text">Ảnh đã chọn (Local)</span>
                    <button type="button" class="btn-remove-file" @click="removeFile('embedImage')">
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
                  v-if="!cfg.embedImage || !cfg.embedImage.startsWith('data:')" 
                  v-model="cfg.embedImage" 
                  placeholder="Hoặc dán URL: https://..." 
                  class="url-input"
                />
                <div class="flex gap-2" style="margin-top: 4px; width: 100%;">
                  <button 
                    v-if="hasGeneratedBanner" 
                    type="button" 
                    class="btn-use-generated" 
                    @click="useGeneratedBannerFor('embedImage')"
                  >
                    <span class="material-symbols-outlined symbol-sm">auto_awesome</span>
                    Ảnh vừa tạo
                  </button>
                  <button 
                    type="button" 
                    class="btn-use-generated" 
                    style="background: var(--surface-container-high);"
                    @click="openGalleryFor('embedImage')"
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
                :class="{ active: isDraggingAuthorIcon, 'has-file': cfg.embedAuthorIcon && cfg.embedAuthorIcon.startsWith('data:') }"
                @dragover.prevent="isDraggingAuthorIcon = true"
                @dragleave.prevent="isDraggingAuthorIcon = false"
                @drop.prevent="isDraggingAuthorIcon = false; processFile($event.dataTransfer?.files?.[0], 'embedAuthorIcon')"
                @click="fileInputAuthorIconRef.click()"
              >
                <input 
                  type="file" 
                  ref="fileInputAuthorIconRef" 
                  style="display: none;" 
                  accept="image/*" 
                  @change="handleFileSelect($event, 'embedAuthorIcon')"
                />
                
                <div v-if="cfg.embedAuthorIcon && cfg.embedAuthorIcon.startsWith('data:')" class="uploaded-preview-container" @click.stop>
                  <img :src="safeImage(cfg.embedAuthorIcon)" class="uploaded-thumb" style="border-radius: 50%; width: 50px; height: 50px; object-fit: cover;" />
                  <div class="uploaded-actions">
                    <span class="file-info-text">Ảnh đã chọn (Local)</span>
                    <button type="button" class="btn-remove-file" @click="removeFile('embedAuthorIcon')">
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
                  v-if="!cfg.embedAuthorIcon || !cfg.embedAuthorIcon.startsWith('data:')" 
                  v-model="cfg.embedAuthorIcon" 
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
                :class="{ active: isDraggingFooterIcon, 'has-file': cfg.embedFooterIcon && cfg.embedFooterIcon.startsWith('data:') }"
                @dragover.prevent="isDraggingFooterIcon = true"
                @dragleave.prevent="isDraggingFooterIcon = false"
                @drop.prevent="isDraggingFooterIcon = false; processFile($event.dataTransfer?.files?.[0], 'embedFooterIcon')"
                @click="fileInputFooterIconRef.click()"
              >
                <input 
                  type="file" 
                  ref="fileInputFooterIconRef" 
                  style="display: none;" 
                  accept="image/*" 
                  @change="handleFileSelect($event, 'embedFooterIcon')"
                />
                
                <div v-if="cfg.embedFooterIcon && cfg.embedFooterIcon.startsWith('data:')" class="uploaded-preview-container" @click.stop>
                  <img :src="safeImage(cfg.embedFooterIcon)" class="uploaded-thumb" style="border-radius: 50%; width: 50px; height: 50px; object-fit: cover;" />
                  <div class="uploaded-actions">
                    <span class="file-info-text">Ảnh đã chọn (Local)</span>
                    <button type="button" class="btn-remove-file" @click="removeFile('embedFooterIcon')">
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
                  v-if="!cfg.embedFooterIcon || !cfg.embedFooterIcon.startsWith('data:')" 
                  v-model="cfg.embedFooterIcon" 
                  placeholder="Hoặc dán URL: https://..." 
                  class="url-input"
                />
              </div>
            </div>
          </div>
          <div class="form-row"><label>Select placeholder</label><input v-model="cfg.selectPlaceholder" /></div>
        </template>

        <!-- TAB: Ticket -->
        <template v-if="tab === 'ticket'">
          <h3 style="margin: 0 0 16px;">Embed ticket — hiện khi user tạo ticket mới</h3>
          <p class="muted text-sm" style="margin: -8px 0 16px;">
            Biến: <code style="background: var(--bg-2); padding: 2px 6px; border-radius: 4px;">{ticketNum}</code>
            <code style="background: var(--bg-2); padding: 2px 6px; border-radius: 4px; margin: 0 4px;">{user}</code>
            <code style="background: var(--bg-2); padding: 2px 6px; border-radius: 4px;">{optionName}</code>
          </p>

          <div class="grid-2">
            <div class="form-row"><label>Title</label><input v-model="cfg.ticketTitle" /></div>
            <div class="form-row">
              <label>Color</label>
              <div class="color-control">
                <input v-if="cfg.ticketColor !== 'none'" v-model="cfg.ticketColor" type="color" />
                <span v-else class="no-color-preview">Không màu</span>
                <button type="button" @click="setNoColor('ticketColor')">Không màu</button>
                <button v-if="cfg.ticketColor === 'none'" type="button" @click="cfg.ticketColor = '#5865F2'">Dùng màu</button>
              </div>
            </div>
          </div>
          <div class="form-row"><label>Description</label><textarea v-model="cfg.ticketDesc"></textarea></div>
          <div class="form-row"><label>Guidance (hiển thị trong field "Hướng Dẫn")</label><textarea v-model="cfg.ticketGuidance"></textarea></div>
          <div class="form-row"><label>Footer</label><input v-model="cfg.ticketFooter" /></div>

          <div style="margin-top: 16px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
            <Switch v-model="cfg.ticketShowType">Hiện field "Loại Ticket"</Switch>
            <Switch v-model="cfg.ticketShowCreator">Hiện field "Người Tạo"</Switch>
            <Switch v-model="cfg.ticketShowTime">Hiện field "Thời Gian"</Switch>
            <Switch v-model="cfg.ticketShowGuide">Hiện field "Hướng Dẫn"</Switch>
          </div>
        </template>

        <!-- TAB: DM & Behavior -->
        <template v-if="tab === 'dm'">
          <h3 style="margin: 0 0 16px;">DM & hành vi bot</h3>

          <div style="display: grid; gap: 14px;">
            <Switch v-model="cfg.dmOnTicketCreate">
              <div>
                <div style="font-weight: 600;">Gửi DM cho user khi tạo ticket</div>
                <div class="muted text-xs">User sẽ nhận tin nhắn riêng có link đến channel ticket</div>
              </div>
            </Switch>

            <Switch v-model="cfg.deleteSetupMessages">
              <div>
                <div style="font-weight: 600;">Auto-xóa tin nhắn trong setup channel</div>
                <div class="muted text-xs">Channel có embed setup sẽ chỉ giữ tin của bot</div>
              </div>
            </Switch>
          </div>

          <div class="form-row" style="margin-top: 24px;">
            <label>Nội dung DM</label>
            <textarea v-model="cfg.dmMessage" style="min-height: 100px;"></textarea>
            <div class="muted text-xs">Biến: {ticketNum}, {channel}</div>
          </div>
        </template>

        <!-- TAB: Smart Assistant -->
        <template v-if="tab === 'smart'">
          <h3 style="margin: 0 0 8px;">Smart Assistant</h3>
          <p class="muted text-sm" style="margin: 0 0 20px;">
            Rule Engine, AI Router, hội thoại nhiều lượt và Knowledge Base phối hợp với nhau. Mọi action vẫn bị giới hạn bởi Action Engine an toàn.
          </p>

          <div class="ai-provider-card">
            <div class="ai-provider-head">
              <div>
                <div class="ai-provider-title">🧠 OpenRouter AI Provider</div>
                <div class="muted text-xs">AI thật cho Intent Router, Grounded Answer, Ticket Triage và embeddings. API key được mã hóa ở backend và không bao giờ được đọc ngược về Dashboard.</div>
              </div>
              <span class="badge" :class="cfg.aiProviderReady ? 'badge-green' : 'badge-gray'">
                {{ cfg.aiProviderReady ? `Đã kết nối · ${cfg.openRouterApiKeySource === 'dashboard' ? 'Dashboard' : '.env'}` : 'Chưa có API key' }}
              </span>
            </div>

            <div class="form-row">
              <label>OpenRouter API Key</label>
              <input
                v-model="openRouterKeyInput"
                type="password"
                autocomplete="new-password"
                spellcheck="false"
                placeholder="sk-or-v1-... (để trống để giữ key hiện tại)"
              />
              <div class="muted text-xs">
                <template v-if="cfg.openRouterApiKeyConfigured">Key hiện tại: <strong>{{ cfg.openRouterKeyHint || 'đã cấu hình' }}</strong>. Nhập key mới rồi bấm “Lưu cấu hình” để thay thế.</template>
                <template v-else>Có thể lưu ở Dashboard hoặc dùng biến môi trường <code>OPENROUTER_API_KEY</code>.</template>
              </div>
            </div>

            <div class="grid-2">
              <div class="form-row">
                <label>Model chính / Intent Router</label>
                <input v-model="cfg.openRouterModel" placeholder="google/gemma-4-26b-a4b-it:free" />
              </div>
              <div class="form-row">
                <label>Embedding model</label>
                <input v-model="cfg.openRouterEmbeddingModel" placeholder="openai/text-embedding-3-small" />
              </div>
            </div>
            <div class="grid-2">
              <div class="form-row">
                <label>Answer model (tuỳ chọn)</label>
                <input v-model="cfg.openRouterAnswerModel" placeholder="Để trống = model chính" />
              </div>
              <div class="form-row">
                <label>Triage model (tuỳ chọn)</label>
                <input v-model="cfg.openRouterTriageModel" placeholder="Để trống = model chính" />
              </div>
            </div>

            <div class="grid-2 provider-controls">
              <Switch v-model="cfg.openRouterReasoningEnabled">
                <div>
                  <div style="font-weight: 600;">Bật reasoning</div>
                  <div class="muted text-xs">Dùng reasoning nội bộ cho model hỗ trợ; bot chỉ dùng final answer, không đưa reasoning ra Discord.</div>
                </div>
              </Switch>
              <div class="form-row" style="margin: 0;">
                <label>Reasoning effort</label>
                <select v-model="cfg.openRouterReasoningEffort" :disabled="!cfg.openRouterReasoningEnabled">
                  <option value="minimal">Minimal</option>
                  <option value="low">Low — khuyên dùng</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>

            <div class="ai-provider-actions">
              <StButton variant="ghost" :disabled="testingOpenRouter || (!cfg.openRouterApiKeyConfigured && !openRouterKeyInput.trim())" @click="testOpenRouter">
                <span class="material-symbols-outlined symbol-sm">network_check</span>
                {{ testingOpenRouter ? 'Đang test...' : 'Test OpenRouter' }}
              </StButton>
              <StButton v-if="cfg.openRouterApiKeySource === 'dashboard'" variant="ghost" :disabled="deletingOpenRouterKey" @click="deleteOpenRouterKey">
                <span class="material-symbols-outlined symbol-sm">key_off</span>
                {{ deletingOpenRouterKey ? 'Đang xóa...' : 'Xóa key Dashboard' }}
              </StButton>
            </div>
            <div class="muted text-xs">Mặc định dùng <code>google/gemma-4-26b-a4b-it:free</code>. Nếu model <code>:free</code> bị timeout/rate-limit/5xx, bản trial tự thử <code>{{ cfg.freeFallbackModel || 'openrouter/free' }}</code>; đặt <code>OPENROUTER_FALLBACK_MODEL=off</code> để tắt.</div>

            <div class="ai-playground">
              <div class="ai-playground-head">
                <div>
                  <strong>🧪 AI Playground</strong>
                  <div class="muted text-xs">Thử model thật trước khi bật AI cho người chơi. Prompt thử không được lưu vào database hay audit log.</div>
                </div>
                <span class="muted text-xs">{{ playgroundPrompt.length }}/2000</span>
              </div>
              <textarea
                v-model="playgroundPrompt"
                maxlength="2000"
                rows="4"
                placeholder="Nhập một câu hỏi thử..."
              ></textarea>
              <div class="ai-provider-actions">
                <StButton
                  variant="ghost"
                  :disabled="runningPlayground || !playgroundPrompt.trim() || (!cfg.openRouterApiKeyConfigured && !openRouterKeyInput.trim())"
                  @click="runOpenRouterPlayground"
                >
                  <span class="material-symbols-outlined symbol-sm">science</span>
                  {{ runningPlayground ? 'AI đang trả lời...' : 'Chạy thử AI' }}
                </StButton>
              </div>

              <div v-if="playgroundResult" class="ai-playground-result">
                <div class="ai-playground-metrics">
                  <span>{{ playgroundResult.modelUsed || playgroundResult.requestedModel }}</span>
                  <span v-if="playgroundResult.fallbackUsed">fallback</span>
                  <span>{{ playgroundResult.latencyMs }} ms</span>
                  <span>{{ playgroundResult.usage?.inputTokens || 0 }} in</span>
                  <span>{{ playgroundResult.usage?.outputTokens || 0 }} out</span>
                  <span v-if="playgroundResult.usage?.reasoningTokens">{{ playgroundResult.usage.reasoningTokens }} reasoning</span>
                </div>
                <div class="ai-playground-answer">{{ playgroundResult.response }}</div>
              </div>

              <div v-if="aiRuntime.length" class="ai-runtime-grid">
                <div v-for="row in aiRuntime" :key="row.service" class="ai-runtime-row">
                  <div>
                    <strong>{{ row.service.replace('openrouter-', '') }}</strong>
                    <div class="muted text-xs">{{ row.requests }} requests · {{ row.retries }} retries · avg {{ row.averageLatencyMs }} ms</div>
                  </div>
                  <span class="badge" :class="row.circuitOpen ? 'badge-red' : row.failures ? 'badge-yellow' : 'badge-green'">
                    {{ row.circuitOpen ? 'Circuit open' : `${row.successes} OK / ${row.failures} lỗi` }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div class="smart-security-note" style="margin-bottom: 18px; border-color: rgba(26,188,156,.45);">
            <strong>🗺️ Multi‑Cluster Router</strong>
            <span>SMP, Survival, Skyblock, BoxPvP, Tu Tiên, FFA và ChunkySMP có ngữ cảnh, Knowledge Base và ticket scope riêng. Bot sẽ hỏi bằng button khi chưa biết cụm.</span>
          </div>

          <div style="display: grid; gap: 14px; margin-bottom: 20px;">
            <Switch v-model="cfg.smartRequireCluster">
              <div>
                <div style="font-weight: 600;">Bắt buộc xác định cụm trước khi AI trả lời</div>
                <div class="muted text-xs">Chặn AI lấy nhầm cơ chế giữa Survival, Skyblock, BoxPvP hoặc ChunkySMP.</div>
              </div>
            </Switch>
            <Switch v-model="cfg.ticketRequireCluster">
              <div>
                <div style="font-weight: 600;">Ticket phải có cụm máy chủ</div>
                <div class="muted text-xs">Ticket chưa có cụm sẽ hiện select và tạm khóa nút hỏi AI.</div>
              </div>
            </Switch>
            <Switch v-model="cfg.ticketClusterSelectEnabled">
              <div>
                <div style="font-weight: 600;">Cho phép chọn cụm ngay trên ticket panel</div>
                <div class="muted text-xs">Member chọn bằng select; ticket có thể tự chuyển sang category Discord của cụm.</div>
              </div>
            </Switch>
          </div>

          <div class="grid-2" style="margin-bottom: 20px;">
            <div class="form-row">
              <label>Cụm mặc định</label>
              <select v-model="cfg.smartDefaultClusterKey">
                <option :value="null">Không mặc định — hỏi member</option>
                <option v-for="cluster in clusters" :key="cluster.key" :value="cluster.key">{{ cluster.emoji }} {{ cluster.name }}</option>
              </select>
            </div>
            <div class="form-row">
              <label>Quản lý cụm</label>
              <RouterLink to="/clusters" class="btn btn-ghost" style="justify-content: center;">🛠️ Mở trang Cụm máy chủ</RouterLink>
            </div>
          </div>
          <div class="form-row" style="margin-bottom: 22px;">
            <label>Channel → Cluster map (JSON nâng cao)</label>
            <textarea v-model="cfg.smartClusterChannelMap" placeholder='{"123456789012345678":"survival","skyblock":["987654321098765432"]}'></textarea>
            <div class="muted text-xs">Dùng khi một channel support chỉ dành riêng cho một cụm; lúc đó bot không cần hỏi lại.</div>
          </div>

          <div style="display: grid; gap: 14px;">
            <Switch v-model="cfg.smartSupportEnabled">
              <div>
                <div style="font-weight: 600;">Bật Smart Assistant</div>
                <div class="muted text-xs">Bot đọc câu hỏi tại các channel được cấu hình hoặc khi bị mention.</div>
              </div>
            </Switch>

            <Switch v-model="cfg.smartMentionOnly">
              <div>
                <div style="font-weight: 600;">Chỉ phản hồi khi mention bot</div>
                <div class="muted text-xs">Bật để bot không tự chen vào hội thoại thông thường.</div>
              </div>
            </Switch>

            <Switch v-model="cfg.smartAiEnabled">
              <div>
                <div style="font-weight: 600;">Bật AI Intent Router</div>
                <div class="muted text-xs">Dùng OpenRouter đã cấu hình bên trên. Khi OpenRouter lỗi, bot tự fallback về rule/Knowledge thay vì trả lời bừa.</div>
              </div>
            </Switch>

            <Switch v-model="cfg.smartKnowledgeEnabled">
              <div>
                <div style="font-weight: 600;">Bật Knowledge Base</div>
                <div class="muted text-xs">Tìm tài liệu bằng keyword; tự dùng embedding khi đã cấu hình model embedding.</div>
              </div>
            </Switch>

            <Switch v-model="cfg.smartKnowledgeAiEnabled">
              <div>
                <div style="font-weight: 600;">AI viết câu trả lời có nguồn</div>
                <div class="muted text-xs">AI chỉ được tổng hợp từ các bài Knowledge đã truy xuất. Nếu lỗi sẽ trả nguyên nội dung bài phù hợp nhất.</div>
              </div>
            </Switch>

            <Switch v-model="cfg.smartConversationEnabled">
              <div>
                <div style="font-weight: 600;">Nhớ ngữ cảnh hội thoại</div>
                <div class="muted text-xs">Hiểu các câu nối tiếp như “còn cái đó thì sao?” và cho phép trả lời bước xác nhận mà không cần mention lại.</div>
              </div>
            </Switch>

            <Switch v-model="cfg.smartClarificationEnabled">
              <div>
                <div style="font-weight: 600;">Tự hỏi lại khi chưa chắc</div>
                <div class="muted text-xs">Bot hiển thị các lựa chọn gần nhất thay vì đoán sai và mở nhầm ticket.</div>
              </div>
            </Switch>

            <Switch v-model="cfg.smartMultiIntentEnabled">
              <div>
                <div style="font-weight: 600;">Hiểu nhiều yêu cầu trong một tin nhắn</div>
                <div class="muted text-xs">Ví dụ: vừa mất đồ, vừa gặp lỗi nạp tiền — bot tách và xử lý từng ý.</div>
              </div>
            </Switch>

            <Switch v-model="cfg.smartFuzzyMatchingEnabled">
              <div>
                <div style="font-weight: 600;">Sửa typo và tiếng lóng</div>
                <div class="muted text-xs">Hiểu câu không dấu, viết tắt và lỗi gõ phổ biến của người chơi Việt Nam.</div>
              </div>
            </Switch>
          </div>

          <div class="smart-security-note" style="margin-top: 22px; border-color: rgba(88,101,242,.45);">
            <strong>🎫 AI bên trong Ticket</strong>
            <span>Ưu tiên panel, button, select và modal. AI chỉ phản hồi khi có câu hỏi rõ ràng, tự nhường staff và không tự quyết định giao dịch, hoàn đồ, kháng án hoặc bảo mật.</span>
          </div>

          <div style="display: grid; gap: 14px; margin-top: 16px;">
            <Switch v-model="cfg.ticketCompactMode">
              <div>
                <div style="font-weight: 600;">Ticket compact</div>
                <div class="muted text-xs">Gộp hướng dẫn vào một panel, hạn chế welcome và auto-message rời rạc.</div>
              </div>
            </Switch>
            <Switch v-model="cfg.ticketAiEnabled">
              <div>
                <div style="font-weight: 600;">Bật AI trong ticket</div>
                <div class="muted text-xs">Tự hỗ trợ câu hỏi đơn giản ngay trong ticket bằng một AI panel được cập nhật.</div>
              </div>
            </Switch>
            <Switch v-model="cfg.ticketAiOnlyCreator">
              <div>
                <div style="font-weight: 600;">Chỉ trả lời người tạo ticket</div>
                <div class="muted text-xs">Tránh AI chen vào trao đổi giữa staff hoặc người được thêm vào ticket.</div>
              </div>
            </Switch>
            <Switch v-model="cfg.ticketAiRequireQuestion">
              <div>
                <div style="font-weight: 600;">Chỉ phản hồi câu hỏi rõ ràng</div>
                <div class="muted text-xs">Không phản hồi mọi tin nhắn; mention bot hoặc dùng modal vẫn luôn được ưu tiên.</div>
              </div>
            </Switch>
            <Switch v-model="cfg.ticketAiPauseWhenClaimed">
              <div>
                <div style="font-weight: 600;">Tự nhường khi staff nhận ticket</div>
                <div class="muted text-xs">AI tạm dừng sau khi claim, trừ khi người chơi chủ động gọi AI.</div>
              </div>
            </Switch>
            <Switch v-model="cfg.ticketAiSensitiveEscalation">
              <div>
                <div style="font-weight: 600;">Bắt buộc staff với vấn đề nhạy cảm</div>
                <div class="muted text-xs">Tiền, hoàn đồ, report, kháng án và tài khoản chỉ được AI thu thập checklist.</div>
              </div>
            </Switch>
            <Switch v-model="cfg.ticketAiPanelMode">
              <div>
                <div style="font-weight: 600;">Dùng một AI panel duy nhất</div>
                <div class="muted text-xs">Câu trả lời mới sẽ sửa panel cũ thay vì gửi thêm tin nhắn.</div>
              </div>
            </Switch>
            <Switch v-model="cfg.ticketAiAutoSummary">
              <div>
                <div style="font-weight: 600;">Tóm tắt vấn đề trên ticket panel</div>
                <div class="muted text-xs">Giúp staff đọc nhanh nội dung chính mà không phải xem toàn bộ hội thoại.</div>
              </div>
            </Switch>
            <Switch v-model="cfg.ticketAiTriageEnabled">
              <div>
                <div style="font-weight: 600;">Structured AI triage</div>
                <div class="muted text-xs">Tự tóm tắt, phát hiện thông tin thiếu, gợi ý priority/tag và đánh dấu ticket cần người thật.</div>
              </div>
            </Switch>
            <Switch v-model="cfg.ticketAiAutoPriority">
              <div>
                <div style="font-weight: 600;">AI tự nâng priority</div>
                <div class="muted text-xs">Chỉ nâng, không hạ priority và chỉ áp dụng khi triage đạt confidence tối thiểu.</div>
              </div>
            </Switch>
            <Switch v-model="cfg.ticketAiAutoTags">
              <div>
                <div style="font-weight: 600;">AI tự gắn tags</div>
                <div class="muted text-xs">Thêm tag ngắn theo intent/cụm/rủi ro để staff lọc ticket nhanh hơn.</div>
              </div>
            </Switch>
            <Switch v-model="cfg.ticketAiAutoEscalateSensitive">
              <div>
                <div style="font-weight: 600;">Tự ping staff khi triage cần người thật</div>
                <div class="muted text-xs">Có chống spam 30 phút; mặc định tắt để tránh mention ngoài ý muốn.</div>
              </div>
            </Switch>
          </div>

          <div class="grid-2" style="margin-top: 18px;">
            <div class="form-row">
              <label>Chế độ AI trong ticket</label>
              <select v-model="cfg.ticketAiMode">
                <option value="off">Tắt</option>
                <option value="passive">Thụ động — chỉ khi gọi AI</option>
                <option value="balanced">Cân bằng — khuyên dùng</option>
                <option value="active">Chủ động có kiểm soát</option>
              </select>
            </div>
            <div class="form-row">
              <label>Confidence tối thiểu</label>
              <input v-model.number="cfg.ticketAiMinConfidence" type="number" min="0.5" max="0.98" step="0.01" />
            </div>
          </div>
          <div class="grid-2">
            <div class="form-row">
              <label>Cooldown trả lời (giây)</label>
              <input v-model.number="cfg.ticketAiReplyCooldownSeconds" type="number" min="5" max="900" />
            </div>
            <div class="form-row">
              <label>Số phản hồi tự động tối đa/ticket</label>
              <input v-model.number="cfg.ticketAiMaxReplies" type="number" min="0" max="20" />
            </div>
          </div>
          <div class="form-row">
            <label>Độ dài câu trả lời trong ticket</label>
            <input v-model.number="cfg.ticketAiMaxAnswerChars" type="number" min="240" max="1200" step="50" />
            <div class="muted text-xs">Khuyến nghị 450–700 ký tự vì member ít đọc chữ dài.</div>
          </div>
          <div class="grid-2">
            <div class="form-row">
              <label>Ngữ cảnh ticket (tin nhắn)</label>
              <input v-model.number="cfg.ticketAiContextMessages" type="number" min="2" max="20" />
              <div class="muted text-xs">AI đọc các tin gần nhất để hiểu câu nối tiếp.</div>
            </div>
            <div class="form-row">
              <label>Triage confidence tối thiểu</label>
              <input v-model.number="cfg.ticketAiTriageMinConfidence" type="number" min="0.5" max="0.98" step="0.01" />
            </div>
          </div>

          <div class="form-row" style="margin-top: 22px;">
            <label>Smart support channel IDs</label>
            <textarea v-model="cfg.smartSupportChannelIds" placeholder="123456789012345678,987654321098765432"></textarea>
            <div class="muted text-xs">Phân cách bằng dấu phẩy. Để trống thì bot chỉ phản hồi khi được mention.</div>
          </div>

          <div class="grid-2">
            <div class="form-row">
              <label>Cooldown mỗi người (giây)</label>
              <input v-model.number="cfg.smartCooldownSeconds" type="number" min="3" max="300" />
            </div>
            <div class="form-row">
              <label>Rule confidence</label>
              <input v-model.number="cfg.smartRuleThreshold" type="number" min="0.5" max="1" step="0.01" />
            </div>
          </div>
          <div class="form-row">
            <label>AI confidence tối thiểu</label>
            <input v-model.number="cfg.smartAiThreshold" type="number" min="0.5" max="1" step="0.01" />
          </div>


          <div class="grid-2">
            <div class="form-row">
              <label>Ngưỡng hỏi lại</label>
              <input v-model.number="cfg.smartClarificationThreshold" type="number" min="0.3" max="0.95" step="0.01" />
              <div class="muted text-xs">Dưới mức này bot sẽ ưu tiên xác nhận intent.</div>
            </div>
            <div class="form-row">
              <label>Số intent tối đa</label>
              <input v-model.number="cfg.smartMaxIntents" type="number" min="1" max="3" />
            </div>
          </div>

          <div class="grid-2">
            <div class="form-row">
              <label>Thời gian nhớ hội thoại (phút)</label>
              <input v-model.number="cfg.smartConversationTtlMinutes" type="number" min="2" max="1440" />
            </div>
            <div class="form-row">
              <label>Số tin nhắn ngữ cảnh</label>
              <input v-model.number="cfg.smartMaxContextMessages" type="number" min="2" max="12" />
            </div>
          </div>

          <div class="grid-2">
            <div class="form-row">
              <label>Knowledge score tối thiểu</label>
              <input v-model.number="cfg.smartKnowledgeThreshold" type="number" min="0.05" max="1" step="0.01" />
            </div>
            <div class="form-row">
              <label>Số bài truy xuất</label>
              <input v-model.number="cfg.smartKnowledgeMaxResults" type="number" min="1" max="5" />
            </div>
          </div>
          <div class="form-row">
            <label>Độ dài câu trả lời tối đa</label>
            <input v-model.number="cfg.smartAnswerMaxChars" type="number" min="300" max="3500" step="100" />
          </div>
          <div class="grid-3">
            <div class="form-row">
              <label>Evidence tối thiểu</label>
              <input v-model.number="cfg.smartEvidenceMinScore" type="number" min="0.2" max="0.95" step="0.01" />
            </div>
            <div class="form-row">
              <label>Top-gap tối thiểu</label>
              <input v-model.number="cfg.smartEvidenceMinTopGap" type="number" min="0" max="0.25" step="0.01" />
            </div>
            <div class="form-row">
              <label>Knowledge freshness (ngày)</label>
              <input v-model.number="cfg.smartKnowledgeFreshnessDays" type="number" min="7" max="1460" />
            </div>
          </div>
          <div class="muted text-xs" style="margin-top:-8px;margin-bottom:14px;">Evidence gate kết hợp retrieval score, feedback quality và độ mới của bài; nguồn yếu sẽ không được AI biến thành câu trả lời có vẻ chắc chắn.</div>


          <div class="grid-2">
            <div class="form-row">
              <label>Cache phản hồi AI (giây)</label>
              <input v-model.number="cfg.smartResponseCacheSeconds" type="number" min="30" max="3600" />
            </div>
            <div class="form-row">
              <label>Số lần retry AI</label>
              <input v-model.number="cfg.smartAiRetryCount" type="number" min="0" max="4" />
            </div>
          </div>
          <div class="form-row">
            <label>Giới hạn câu hỏi mỗi phút/người</label>
            <input v-model.number="cfg.smartBurstLimitPerMinute" type="number" min="2" max="60" />
          </div>

          <div class="grid-2">
            <div class="form-row">
              <label>Role ID nhận escalation</label>
              <input v-model="cfg.smartEscalationRoleId" placeholder="Role staff được ping" />
            </div>
            <div class="form-row">
              <label>Channel ID nhận escalation</label>
              <input v-model="cfg.smartEscalationChannelId" placeholder="Để trống: gửi tại channel hiện tại" />
            </div>
          </div>

          <div class="smart-security-note">
            <strong>🔒 Giới hạn an toàn</strong>
            <span>AI chỉ phân loại/tổng hợp từ nguồn đã duyệt. Retry, cache, circuit breaker và fallback giữ bot hoạt động khi dịch vụ AI gặp lỗi; mọi thao tác thật vẫn do Action Engine kiểm soát.</span>
          </div>
        </template>

        <!-- TAB: IDs -->
        <template v-if="tab === 'ids'">
          <h3 style="margin: 0 0 16px;">Discord IDs</h3>
          <p class="muted text-sm" style="margin: -8px 0 20px;">
            Bật Developer Mode trong Discord → click chuột phải vào channel/role → Copy ID
          </p>

          <div class="form-row">
            <label>Embed channel ID</label>
            <input v-model="cfg.embedChannelId" placeholder="Channel có embed setup ticket" />
            <div class="muted text-xs">Sau khi đổi channel hoặc chỉnh setup embed, bấm “Cập nhật lên Discord” ở tab Setup Embed để xóa bản cũ và gửi bản mới.</div>
          </div>
          <div class="form-row">
            <label>Log channel ID</label>
            <input v-model="cfg.logChannelId" placeholder="Channel nhận log khi ticket đóng" />
          </div>
          <div class="form-row">
            <label>Staff/Admin role ID</label>
            <input v-model="cfg.staffRoleId" placeholder="Role có quyền claim/close ticket" />
            <div class="muted text-xs">Role này cũng sẽ được bot ping khi có ticket mới được tạo.</div>
          </div>
        </template>
      </div>

      <!-- ─── LIVE PREVIEW ─── -->
      <div style="position: sticky; top: 24px;">
        <div class="card card-glass">
          <div class="flex" style="align-items: center; justify-content: space-between; margin-bottom: 14px;">
            <h3 style="margin: 0; font-size: 14px; display: inline-flex; align-items: center; gap: 6px; color: var(--on-surface-variant);">
              <span class="material-symbols-outlined symbol-sm">visibility</span>
              Live Preview
            </h3>
            <span class="badge badge-brand">{{ TABS.find(t => t.value === tab)?.label }}</span>
          </div>
          <!-- Setup embed preview -->
          <div v-if="tab === 'setup' && cfg.embedColor === 'none'" class="discord-frame">
            <div class="discord-msg">
              <div class="discord-avatar">B</div>
              <div style="flex: 1; min-width: 0;">
                <div class="discord-author">
                  <span class="discord-name">Ticket Bot</span>
                  <span class="discord-bot-tag">BOT</span>
                  <span class="discord-time">{{ nowTime }}</span>
                </div>
                <div class="container-preview" style="border-left-color: transparent;">
                  <img v-if="safeImage(cfg.embedAuthorIcon)" :src="safeImage(cfg.embedAuthorIcon)" alt="" style="margin-bottom: 8px; border-radius: 4px; max-height: 80px; object-fit: contain;" />
                  <img v-if="safeImage(cfg.embedImage)" :src="safeImage(cfg.embedImage)" alt="" />
                  <div v-if="safeImage(cfg.embedImage)" class="container-divider"></div>
                  
                  <div v-if="safeImage(cfg.embedThumbnail)" class="container-section-preview">
                    <div class="text-content">
                      <h2 v-if="cfg.embedTitle">{{ cfg.embedTitle }}</h2>
                      <p v-if="cfg.embedDesc">{{ cfg.embedDesc }}</p>
                    </div>
                    <img :src="safeImage(cfg.embedThumbnail)" class="container-thumbnail-preview" />
                  </div>
                  <template v-else>
                    <h2 v-if="cfg.embedTitle">{{ cfg.embedTitle }}</h2>
                    <p v-if="cfg.embedDesc">{{ cfg.embedDesc }}</p>
                  </template>

                  <img v-if="safeImage(cfg.embedFooterIcon)" :src="safeImage(cfg.embedFooterIcon)" alt="" style="margin-top: 8px; border-radius: 4px; max-height: 60px; object-fit: contain;" />
                  <div v-if="cfg.embedFooter" class="container-divider"></div>
                  <small v-if="cfg.embedFooter">{{ cfg.embedFooter }}</small>
                </div>
                <div v-if="cfg.selectPlaceholder" class="discord-select" style="margin-top: 8px;">
                  <span style="color: #80848e; flex: 1;">{{ cfg.selectPlaceholder }}</span>
                  <span style="color: #80848e;">▾</span>
                </div>
              </div>
            </div>
          </div>

          <DiscordEmbedPreview
            v-if="tab === 'setup' && cfg.embedColor !== 'none'"
            :title="cfg.embedTitle"
            :description="cfg.embedDesc"
            :color="cfg.embedColor"
            :footer="cfg.embedFooter"
            :thumbnail="cfg.embedThumbnail"
            :image="cfg.embedImage"
            :author-icon="cfg.embedAuthorIcon"
            :footer-icon="cfg.embedFooterIcon"
            :select-placeholder="cfg.selectPlaceholder"
            :select-options="setupSelectOptions"
          />
          <!-- Ticket embed preview -->
          <DiscordEmbedPreview
            v-if="tab === 'ticket'"
            :title="cfg.ticketTitle"
            :description="cfg.ticketDesc"
            :color="cfg.ticketColor"
            :footer="cfg.ticketFooter"
            :fields="ticketFields"
            :vars="previewVars"
            content="@Bạn"
            :buttons="[
              { label: 'Claim', style: 'success' },
              { label: 'Đóng', style: 'danger' },
            ]"
          />

          <!-- DM preview -->
          <div v-if="tab === 'dm'" class="discord-frame">
            <div class="discord-msg">
              <div class="discord-avatar">B</div>
              <div style="flex: 1;">
                <div class="discord-author">
                  <span class="discord-name">Ticket Bot</span>
                  <span class="discord-bot-tag">BOT</span>
                </div>
                <div v-if="cfg.dmOnTicketCreate" style="white-space: pre-wrap; color: #dbdee1;">
                  {{ (cfg.dmMessage || '').replace('{ticketNum}', '0042').replace('{channel}', '#ticket-0042') }}
                </div>
                <div v-else class="muted text-xs">DM đang tắt</div>
              </div>
            </div>
          </div>

          <div v-if="tab === 'smart'" class="discord-frame">
            <div class="discord-msg">
              <div class="discord-avatar">B</div>
              <div style="flex: 1;">
                <div class="discord-author">
                  <span class="discord-name">Smart Assistant</span>
                  <span class="discord-bot-tag">BOT</span>
                </div>
                <div style="color: #dbdee1; line-height: 1.5;">
                  🤖 <strong>Gợi ý nhanh trong ticket</strong><br />
                  AI trả lời ngắn, cập nhật một panel và nhường staff với vấn đề nhạy cảm.
                </div>
                <div class="discord-select" style="margin-top: 10px;">⚡ Hỏi AI • Bổ sung thông tin • Gọi Staff</div>
              </div>
            </div>
          </div>

          <!-- IDs tab — không preview, chỉ chú thích -->
          <div v-if="tab === 'ids'" class="empty">
            ID không có preview — lưu xong test trên Discord
          </div>
        </div>
      </div>
    </div>
    <ImageGalleryModal v-model="showGallery" @select="handleGallerySelect" />
  </template>
</template>

<style scoped>
.config-section-head {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 16px;
  margin-bottom: 16px;
}

.config-section-head h3 {
  margin: 0;
}

.config-section-head p {
  margin: 4px 0 0;
  color: var(--on-surface-variant);
  font-size: 13px;
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


.ai-provider-card {
  display: grid;
  gap: 14px;
  padding: 16px;
  margin-bottom: 18px;
  border: 1px solid color-mix(in srgb, var(--primary), transparent 55%);
  border-radius: 12px;
  background: color-mix(in srgb, var(--primary), transparent 96%);
}

.ai-provider-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.ai-provider-title {
  font-weight: 700;
  margin-bottom: 4px;
}

.ai-provider-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.provider-controls {
  align-items: center;
}

.ai-playground {
  display: grid;
  gap: 10px;
  margin-top: 4px;
  padding-top: 14px;
  border-top: 1px solid var(--outline-variant);
}

.ai-playground-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.ai-playground textarea {
  min-height: 92px;
  resize: vertical;
}

.ai-playground-result {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--outline-variant);
  border-radius: 10px;
  background: var(--surface-container-low);
}

.ai-playground-metrics {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.ai-playground-metrics span {
  padding: 3px 7px;
  border-radius: 999px;
  background: var(--surface-container-high);
  color: var(--on-surface-variant);
  font-size: 11px;
}

.ai-playground-answer {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.55;
}

.ai-runtime-grid {
  display: grid;
  gap: 7px;
}

.ai-runtime-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 10px;
  border: 1px solid var(--outline-variant);
  border-radius: 9px;
}

.smart-security-note {
  margin-top: 18px;
  padding: 14px;
  border: 1px solid var(--outline-variant);
  border-radius: 10px;
  background: var(--surface-container-low);
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: var(--on-surface-variant);
}

.smart-security-note strong { color: var(--on-surface); }

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

@media (max-width: 760px) {
  .config-section-head {
    display: grid;
  }
}
</style>
