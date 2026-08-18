<script setup>
import { computed } from 'vue';
import { normalizeImageUrl } from '../utils/safeContent';

const props = defineProps({
  // Embed config
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  color: { type: String, default: '#5865F2' },
  footer: { type: String, default: '' },
  thumbnail: { type: String, default: '' },
  image: { type: String, default: '' },
  authorIcon: { type: String, default: '' },
  footerIcon: { type: String, default: '' },

  // Bot identity
  botName: { type: String, default: 'Ticket Bot' },
  botAvatar: { type: String, default: '' },

  // Fields: [{ name, value, inline }]
  fields: { type: Array, default: () => [] },

  // Optional content above embed
  content: { type: String, default: '' },

  // Components rendered below embed
  buttons: { type: Array, default: () => [] }, // [{ label, style: 'primary'|'success'|'danger' }]
  selectPlaceholder: { type: String, default: '' },
  selectOptions: { type: Array, default: () => [] }, // [{ label, emoji, description }]

  // Replacements
  vars: { type: Object, default: () => ({}) }, // { ticketNum, user, optionName }
});

function replace(str = '') {
  let out = str;
  for (const [k, v] of Object.entries(props.vars)) {
    out = out.replaceAll(`{${k}}`, v);
  }
  return out;
}

const titleHtml = computed(() => replace(props.title));
const descHtml = computed(() => replace(props.description));
const footerHtml = computed(() => replace(props.footer));
const botInitial = computed(() => (props.botName || 'B')[0].toUpperCase());
const embedBorderColor = computed(() => (!props.color || props.color === 'none') ? 'transparent' : props.color);
const safeBotAvatar = computed(() => normalizeImageUrl(props.botAvatar));
const safeThumbnail = computed(() => normalizeImageUrl(props.thumbnail));
const safeImage = computed(() => normalizeImageUrl(props.image));
const safeAuthorIcon = computed(() => normalizeImageUrl(props.authorIcon));
const safeFooterIcon = computed(() => normalizeImageUrl(props.footerIcon));

const now = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

function processedFields() {
  return props.fields.map((f) => ({
    name: replace(f.name),
    value: replace(f.value),
    inline: f.inline,
  }));
}
</script>

<template>
  <div class="discord-frame">
    <div class="discord-msg">
      <img v-if="safeBotAvatar" :src="safeBotAvatar" class="discord-avatar" alt="" />
      <div v-else class="discord-avatar">{{ botInitial }}</div>

      <div style="flex: 1; min-width: 0;">
        <div class="discord-author">
          <span class="discord-name">{{ botName }}</span>
          <span class="discord-bot-tag">BOT</span>
          <span class="discord-time">{{ now }}</span>
        </div>

        <div v-if="content" style="margin-bottom: 4px; white-space: pre-wrap;">{{ replace(content) }}</div>

        <div class="discord-embed" :style="{ borderLeftColor: embedBorderColor }">
          <div v-if="safeAuthorIcon" class="discord-embed-author">
            <img :src="safeAuthorIcon" class="discord-embed-author-icon" alt="" />
            <span class="discord-embed-author-name">{{ titleHtml || 'Thông báo' }}</span>
          </div>
          <div v-else-if="titleHtml" class="discord-embed-title">{{ titleHtml }}</div>

          <img v-if="safeThumbnail" :src="safeThumbnail" class="discord-embed-thumb" alt="" />

          <div v-if="descHtml" class="discord-embed-desc">{{ descHtml }}</div>

          <div v-if="processedFields().length" class="discord-embed-fields">
            <div
              v-for="(f, i) in processedFields()" :key="i"
              :class="['discord-embed-field', f.inline ? 'inline' : 'block']"
            >
              <div class="discord-embed-field-name">{{ f.name }}</div>
              <div class="discord-embed-field-value">{{ f.value }}</div>
            </div>
          </div>

          <img v-if="safeImage" :src="safeImage" class="discord-embed-img" alt="" />

          <div v-if="footerHtml" class="discord-embed-footer">
            <img v-if="safeFooterIcon" :src="safeFooterIcon" class="discord-embed-footer-icon" alt="" />
            <span>{{ footerHtml }}</span>
          </div>
        </div>

        <!-- Select menu -->
        <div v-if="selectPlaceholder" class="discord-select" style="margin-top: 8px;">
          <span style="color: #80848e; flex: 1;">{{ selectPlaceholder }}</span>
          <span style="color: #80848e;">▾</span>
        </div>

        <!-- Buttons -->
        <div v-if="buttons.length" class="discord-buttons">
          <button
            v-for="(b, i) in buttons" :key="i"
            :class="['discord-btn', b.style || 'primary']"
            type="button"
            disabled
          >{{ b.label }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.discord-embed-author {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.discord-embed-author-icon {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
}
.discord-embed-author-name {
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
}
.discord-embed-footer {
  display: flex;
  align-items: center;
  gap: 8px;
}
.discord-embed-footer-icon {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  object-fit: cover;
}
</style>
