<script setup>
import { reactive, watch } from 'vue';
import StButton from './StButton.vue';
import { parseDiscordIds } from '../utils/level-dashboard.js';

const props = defineProps({ config: { type: Object, required: true }, disabled: Boolean });
const idText = reactive({});
const idFields = [
  { key: 'allowedChannelIds', label: 'Kênh được cộng EXP', help: 'Mỗi dòng một channel ID, hoặc phân cách bằng dấu phẩy. Discord → Developer Mode → Copy Channel ID.', rows: 3 },
  { key: 'requiredVerifiedRoleIds', label: 'Role xác minh', help: 'Chỉ cần có một trong các role này. Để trống nếu không yêu cầu role xác minh.', rows: 2 },
  { key: 'adminRoleIds', label: 'Role quản trị Level Chat', help: 'Được dùng lệnh quản trị Level Chat. Quyền Discord Administrator luôn được phép, kể cả khi danh sách trống.', rows: 2 },
];
watch(() => props.config, (value) => {
  for (const field of idFields) idText[field.key] = Array.isArray(value[field.key]) ? value[field.key].join('\n') : '';
}, { immediate: true });
function updateIds(key, text) { idText[key] = text; props.config[key] = parseDiscordIds(text); }
const xpFields = [
  { key: 'xpPerMessage', label: 'EXP mỗi tin hợp lệ', min: 1, max: 100, help: 'Từ 1–100 EXP. Chỉ tin vượt qua bộ lọc mới được tính.' },
  { key: 'cooldownSeconds', label: 'Thời gian chờ (giây)', min: 0, max: 3600, help: 'Khoảng cách giữa hai lần nhận EXP của một người.' },
  { key: 'minContentLength', label: 'Số ký tự hữu ích tối thiểu', min: 1, max: 1000, help: 'Không tính dấu cách và nội dung URL.' },
  { key: 'similarityWindow', label: 'Số tin gần nhất để so sánh', min: 1, max: 100, help: 'So sánh với các tin đã nhận EXP trước đó.' },
];
</script>

<template>
  <fieldset class="level-controls" :disabled="disabled">
    <legend class="level-sr-only">Cấu hình Level Chat</legend>
    <div class="level-toggle-row"><div><label for="level-enabled">Bật Level Chat</label><p>Thành viên nhận EXP từ các tin nhắn hợp lệ.</p></div><input id="level-enabled" v-model="config.enabled" type="checkbox" role="switch" /></div>

    <section class="level-form-section" aria-labelledby="level-eligibility-title">
      <div class="level-section-title"><span>01</span><div><h3 id="level-eligibility-title">Ai được nhận EXP?</h3><p>Giới hạn kênh và xác minh thành viên.</p></div></div>
      <div v-for="field in idFields" :key="field.key" class="level-field">
        <label :for="'level-' + field.key">{{ field.label }}</label>
        <textarea :id="'level-' + field.key" :value="idText[field.key]" :rows="field.rows" inputmode="numeric" placeholder="Mỗi dòng một Discord ID" :aria-describedby="'level-' + field.key + '-help'" @input="updateIds(field.key, $event.target.value)"></textarea>
        <small :id="'level-' + field.key + '-help'">{{ field.help }}</small>
        <p v-if="field.key === 'allowedChannelIds' && !config.allowedChannelIds.length" class="level-field-warning"><span class="material-symbols-outlined" aria-hidden="true">info</span>Danh sách trống: không cộng EXP ở bất kỳ kênh nào.</p>
      </div>
    </section>

    <section class="level-form-section" aria-labelledby="level-xp-title">
      <div class="level-section-title"><span>02</span><div><h3 id="level-xp-title">Nhịp độ & chống spam</h3><p>Thưởng cho cuộc trò chuyện, không thưởng cho lặp tin.</p></div></div>
      <div class="level-field-grid"><div v-for="field in xpFields" :key="field.key" class="level-field"><label :for="'level-' + field.key">{{ field.label }}</label><input :id="'level-' + field.key" v-model.number="config[field.key]" type="number" step="1" :min="field.min" :max="field.max" :aria-describedby="'level-' + field.key + '-help'" /><small :id="'level-' + field.key + '-help'">{{ field.help }}</small></div></div>
      <div class="level-field"><label for="level-similarityThreshold">Ngưỡng tương đồng <span>· 0.9 tương đương 90%</span></label><input id="level-similarityThreshold" v-model.number="config.similarityThreshold" type="number" min="0.5" max="1" step="0.01" /><small>Tin đạt hoặc vượt ngưỡng này so với tin cũ không nhận EXP. Lệnh bắt đầu bằng ! cũng không nhận EXP.</small></div>
    </section>

    <section class="level-form-section" aria-labelledby="level-roles-title">
      <div class="level-section-title"><span>03</span><div><h3 id="level-roles-title">Role theo cấp</h3><p>Bot giữ role cao nhất mà thành viên đạt được.</p></div></div>
      <p v-if="!config.levelRoles.length" class="level-inline-empty">Chưa có mốc role. Thêm khi bạn muốn đánh dấu thành viên tích cực.</p>
      <div v-for="(row, index) in config.levelRoles" :key="index" class="level-milestone-row"><div class="level-field"><label :for="'level-role-min-' + index">Từ level</label><input :id="'level-role-min-' + index" v-model.number="row.minLevel" type="number" min="1" max="100000" step="1" /></div><div class="level-field"><label :for="'level-role-id-' + index">Discord role ID</label><input :id="'level-role-id-' + index" v-model.trim="row.roleId" inputmode="numeric" /></div><button type="button" class="level-remove" :aria-label="'Xóa mốc role ' + (index + 1)" @click="config.levelRoles.splice(index, 1)"><span class="material-symbols-outlined" aria-hidden="true">delete</span></button></div>
      <StButton type="button" variant="ghost" :disabled="config.levelRoles.length >= 100" @click="config.levelRoles.push({ minLevel: 10, roleId: '' })"><span class="material-symbols-outlined" aria-hidden="true">add</span>Thêm mốc role</StButton>
    </section>

    <section class="level-form-section" aria-labelledby="level-rewards-title">
      <div class="level-section-title"><span>04</span><div><h3 id="level-rewards-title">Phần thưởng Minecraft</h3><p>Mỗi lần vượt cấp tạo một phần thưởng bền vững.</p></div></div>
      <div class="level-field-grid"><div class="level-field"><label for="level-rewardSpins">Lượt quay mặc định mỗi cấp</label><input id="level-rewardSpins" v-model.number="config.rewardSpins" type="number" min="0" max="100000" step="1" /><small>0 = không cấp lượt quay mặc định.</small></div><div class="level-field"><label for="level-minecraftServiceId">Minecraft service ID</label><input id="level-minecraftServiceId" v-model.trim="config.minecraftServiceId" maxlength="64" autocomplete="off" /><small>Khớp service-id của worker LobbySign. Không nhập secret vào đây.</small></div></div>
      <div v-for="(row, index) in config.rewardMilestones" :key="index" class="level-milestone-row"><div class="level-field"><label :for="'level-reward-min-' + index">Từ level</label><input :id="'level-reward-min-' + index" v-model.number="row.minLevel" type="number" min="1" max="100000" step="1" /></div><div class="level-field"><label :for="'level-reward-spins-' + index">Lượt quay mỗi cấp</label><input :id="'level-reward-spins-' + index" v-model.number="row.spins" type="number" min="0" max="100000" step="1" /></div><button type="button" class="level-remove" :aria-label="'Xóa mốc thưởng ' + (index + 1)" @click="config.rewardMilestones.splice(index, 1)"><span class="material-symbols-outlined" aria-hidden="true">delete</span></button></div>
      <StButton type="button" variant="ghost" :disabled="config.rewardMilestones.length >= 100" @click="config.rewardMilestones.push({ minLevel: 10, spins: 2 })"><span class="material-symbols-outlined" aria-hidden="true">add</span>Thêm mốc thưởng</StButton>
      <p class="level-help">Mốc cao nhất không vượt level thay thế lượt quay mặc định; không cộng dồn các mốc.</p>
      <div class="level-field-grid"><div class="level-field"><label for="level-maxRewardAttempts">Số lần thử thưởng tối đa</label><input id="level-maxRewardAttempts" v-model.number="config.maxRewardAttempts" type="number" min="1" max="100" step="1" /></div><div class="level-field"><label for="level-rewardRetryBaseSeconds">Chờ thử lại ban đầu (giây)</label><input id="level-rewardRetryBaseSeconds" v-model.number="config.rewardRetryBaseSeconds" type="number" min="1" max="3600" step="1" /></div></div>
      <small class="level-help">Thời gian chờ tăng dần, tối đa 24 giờ. Phần thưởng đã tạo giữ nguyên service ID và chính sách retry cũ.</small>
    </section>

    <section class="level-form-section" aria-labelledby="level-visual-title">
      <div class="level-section-title"><span>05</span><div><h3 id="level-visual-title">Thông báo & thẻ cấp độ</h3><p>Một dấu mốc đáng nhớ ngay trong Discord.</p></div></div>
      <div class="level-toggle-row"><div><label for="level-announcementEnabled">Thông báo khi lên cấp</label><p>Gửi vào kênh bên dưới hoặc kênh trò chuyện hiện tại.</p></div><input id="level-announcementEnabled" v-model="config.announcementEnabled" type="checkbox" role="switch" /></div>
      <div class="level-field"><label for="level-announcementChannelId">Kênh thông báo <span>· tùy chọn</span></label><input id="level-announcementChannelId" :value="config.announcementChannelId || ''" inputmode="numeric" @input="config.announcementChannelId = $event.target.value.trim() || null" /><small>Để trống: thông báo tại kênh nơi thành viên lên cấp.</small></div>
      <div class="level-toggle-row"><div><label for="level-imageEnabled">Dùng ảnh thẻ cấp độ</label><p>Tắt để dùng embed. Khi tạo ảnh lỗi, bot vẫn dùng embed dự phòng.</p></div><input id="level-imageEnabled" v-model="config.imageEnabled" type="checkbox" role="switch" /></div>
      <div class="level-field"><label for="level-accentColor">Màu nhấn thẻ</label><div class="level-color-field"><span :style="{ backgroundColor: /^#[\da-f]{6}$/i.test(config.accentColor) ? config.accentColor : '#5865F2' }" aria-hidden="true"></span><input id="level-accentColor" v-model.trim="config.accentColor" maxlength="7" spellcheck="false" placeholder="#5865F2" /></div><small>Mã hex 6 chữ số. Xem trước màu thẻ ở bên cạnh.</small></div>
    </section>
  </fieldset>
</template>
