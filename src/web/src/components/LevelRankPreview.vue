<script setup>
import { computed } from 'vue';
const props = defineProps({ config: { type: Object, default: null } });
const accent = computed(() => /^#[\da-f]{6}$/i.test(props.config?.accentColor || '') ? props.config.accentColor : '#5865F2');
</script>

<template>
  <section class="preview-panel" aria-labelledby="level-preview-heading">
    <div class="preview-heading"><span class="material-symbols-outlined" aria-hidden="true">visibility</span><h2 id="level-preview-heading">Xem trước thẻ cấp độ</h2><span class="preview-label">MINH HỌA</span></div>
    <div class="rank-preview" :style="{ '--rank-accent': accent }">
      <svg class="rank-scenery" viewBox="0 0 400 300" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path fill="#183c30" d="M140 300V228h26v-28h28v-24h26v24h24v-48h28v-24h26v28h24v-48h28v-26h28v42h22v176Z" />
        <path fill="#244b39" d="M236 300v-80h22v-26h22v-38h18v-32h18v32h18v38h20v26h20v80ZM350 300V172h16v-24h16v24h18v128Z" />
        <path fill="#102b24" d="M264 300v-57h-25v-18h14v-20h15v-22h13v-20h14v20h13v22h15v20h14v18h-26v57Z" />
        <g fill="#a5c998" opacity=".45"><path d="M294 26h3v3h-3zM356 55h3v3h-3zM239 46h2v2h-2zM324 92h2v2h-2zM188 22h2v2h-2z" /></g>
        <g fill="#7ee7ca" opacity=".55"><path d="M365 87h3v4h4v3h-4v4h-3v-4h-4v-3h4ZM335 168h2v3h3v2h-3v3h-2v-3h-3v-2h3ZM287 67h2v2h2v2h-2v2h-2v-2h-2v-2h2Z" /></g>
      </svg>
      <div class="rank-brand"><span class="rank-brand-dot" aria-hidden="true"></span>IS7MC <span class="rank-brand-tag">LEVEL CHAT</span></div>
      <div class="rank-kicker">PLAYER STATS</div>
      <div class="rank-player">
        <div class="rank-avatar" aria-hidden="true"><span>N</span></div>
        <div class="rank-name"><small>THÀNH VIÊN MINH HỌA</small><strong>Người chơi</strong><span>Mỗi cuộc trò chuyện, thêm một bước tiến.</span></div>
        <div class="rank-level">
          <svg class="rank-diamond" viewBox="0 0 32 28" aria-hidden="true" focusable="false"><path fill="#0a5351" d="M8 0h16v4h4v4h4v8h-8v6h-4v6h-8v-6H8v-6H0V8h4V4h4Z" /><path fill="#24c4b8" d="M8 4h16v4h4v4h-4v4h-4v6h-8v-6H8v-4H4V8h4Z" /><path fill="#67ebd9" d="M8 4h12v4h4v4H12v4H8v-4H4V8h4Z" /><path fill="#b9fff0" d="M12 4h8v4h-8zM8 8h4v4H8z" /><path fill="#109698" d="M20 12h4v4h-4v6h-4V12Z" /><path fill="#effff5" d="M12 4h4v4h-4zM8 8h4v2H8z" /><path fill="#40dccb" d="M12 12h4v8h-4z" /><path fill="#087970" d="M16 22h4v2h-4zM24 8h4v4h-4z" /></svg>
          <small>LEVEL</small><strong>12</strong>
        </div>
      </div>
      <div class="rank-details">
        <div class="rank-stat"><span>Tổng tích lũy</span><strong>3.095 <small>XP</small></strong></div>
        <div class="rank-stat"><span>Còn để lên cấp</span><strong>155 <small>XP</small></strong></div>
        <svg class="rank-grass" viewBox="0 0 60 60" aria-hidden="true" focusable="false"><path fill="#584934" d="m4 18 26 13v27L4 45Z" /><path fill="#3b3529" d="m30 31 26-13v27L30 58Z" /><path fill="#709e48" d="M4 18 30 5l26 13-26 13Z" /><path fill="#91b75f" d="m15 13 15-8 11 6-15 8Z" /><path fill="#60823e" d="m4 18 26 13v9l-7-4v-5l-7-4v6l-6-3v-7l-6-3Zm26 13 26-13v8l-7 4v5l-7 4v-5l-6 3v6l-6 3Z" /><path fill="#867052" d="m9 36 7 4v6l-7-4Zm13 7 5 3v6l-5-3Z" /><path fill="#63543b" d="m35 46 7-4v6l-7 4Zm13-10 5-3v6l-5 3Z" /></svg>
      </div>
      <div class="rank-progress-title"><span>Tiến độ cấp 13</span><span>245 / 400 XP</span></div>
      <div class="rank-progress" aria-hidden="true"><span></span></div>
      <div class="rank-footer">Thẻ mẫu · không phải dữ liệu người chơi</div>
    </div>
    <p class="preview-note">Phác thảo màu và bố cục từ bản đang soạn. Ảnh Discord được tạo trên bot; số liệu ở đây chỉ minh họa.</p>
    <div v-if="config?.imageEnabled === false" class="preview-disabled"><span class="material-symbols-outlined" aria-hidden="true">image_not_supported</span>Ảnh đang tắt. Bot dùng embed văn bản.</div>
    <div class="preview-commands"><code>/level me</code><code>/rank</code><code>/leaderboard</code></div>
  </section>
</template>

<style scoped>
@font-face {
  font-family: 'Press Start 2P';
  src: url('/fonts/press-start-2p.ttf') format('truetype');
  font-style: normal;
  font-weight: 400;
  font-display: swap;
}
.preview-panel { min-width: 0; padding: 22px; border: 1px solid var(--v7-panel-border); border-radius: 20px; background: var(--v7-card); }
.preview-heading { display: flex; align-items: center; gap: 8px; margin-bottom: 18px; }.preview-heading > .material-symbols-outlined { color: var(--primary); font-size: 21px; }.preview-heading h2 { font-size: 14px; margin: 0; }.preview-label { margin-left: auto; padding: 4px 7px; border-radius: 6px; background: var(--surface-container-high); color: var(--on-surface-variant); font-size: 9px; font-weight: 800; letter-spacing: .07em; }
.rank-preview {
  --rank-text: #eef5e7;
  --rank-muted: #b7c9b5;
  position: relative;
  isolation: isolate;
  overflow: hidden;
  padding: 20px;
  border: 4px solid #091514;
  border-top-color: #526c5e;
  border-left-color: #526c5e;
  border-radius: 2px;
  background: repeating-conic-gradient(#ffffff03 0% 25%, transparent 0% 50%) 0 / 32px 32px, radial-gradient(ellipse at 88% 38%, #23726570, transparent 58%), radial-gradient(ellipse at 75% 100%, #375c3438, transparent 65%), linear-gradient(120deg, #0d191d, #102622 55%, #214031);
  color: var(--rank-text);
  box-shadow: 0 0 0 2px #070e10, inset 0 1px #a5c0a429, inset 0 -3px #050e0baa, inset 3px 0 color-mix(in srgb, var(--rank-accent), transparent 45%), 0 12px 24px #07141024;
}
.rank-preview::before { content: ''; position: absolute; inset: 5px; border: 1px solid #7baa8540; border-right-color: #05110e80; border-bottom-color: #05110e80; pointer-events: none; }
.rank-preview::after { content: ''; position: absolute; inset: 0; background: linear-gradient(#a8c9a7, #5e816b) left top / 10px 3px no-repeat, linear-gradient(#a8c9a7, #5e816b) left top / 3px 10px no-repeat, linear-gradient(#759780, #456752) right top / 10px 3px no-repeat, linear-gradient(#759780, #456752) right top / 3px 10px no-repeat, linear-gradient(#456752, #1e382c) left bottom / 10px 3px no-repeat, linear-gradient(#456752, #1e382c) left bottom / 3px 10px no-repeat, linear-gradient(#456752, #1e382c) right bottom / 10px 3px no-repeat, linear-gradient(#456752, #1e382c) right bottom / 3px 10px no-repeat; pointer-events: none; }
.rank-scenery { position: absolute; inset: 0; width: 100%; height: 100%; z-index: -1; pointer-events: none; }
.rank-brand { display: flex; align-items: center; gap: 6px; color: var(--rank-muted); font-size: 10px; font-weight: 700; letter-spacing: .06em; }
.rank-brand-dot { width: 6px; height: 6px; background: var(--rank-accent); }
.rank-brand-tag { margin-left: auto; font-size: 7px; }
.rank-brand-tag, .rank-kicker, .rank-level small, .rank-level strong, .rank-stat strong { font-family: 'Press Start 2P', monospace; font-weight: 400; }
.rank-kicker { margin: 22px 0 15px; color: #d4f78c; font-size: 12px; line-height: 1.6; text-shadow: 2px 2px #050d0b; }
.rank-player { display: flex; align-items: center; gap: 12px; }
.rank-avatar { flex: 0 0 58px; height: 58px; display: grid; place-items: center; border: 4px solid #152925; border-top-color: #a5b59a; border-left-color: #8b9b83; background: linear-gradient(135deg, #293e53 50%, #17332c 50%); box-shadow: inset 2px 2px #07171480, inset -1px -1px #75917b40, 0 0 0 1px #526b56, 0 0 0 3px #071210, 0 4px var(--rank-accent), 3px 7px 0 #050e0b70; }
.rank-avatar span { font-size: 30px; font-weight: 800; text-shadow: 2px 2px #071210; }
.rank-name { flex: 1; min-width: 0; }
.rank-name small { display: block; color: var(--rank-muted); font-size: 8px; line-height: 1.5; }
.rank-name strong { display: block; font-size: 21px; line-height: 1.35; margin: 4px 0; overflow-wrap: anywhere; text-shadow: 1px 2px #071210; }
.rank-name > span { display: block; color: var(--rank-muted); font-size: 10px; line-height: 1.5; }
.rank-level { position: relative; flex: 0 0 62px; display: grid; justify-items: center; gap: 8px; padding: 10px 4px; border: 1px solid #90ae6a; outline: 2px solid #0b1714; background: radial-gradient(ellipse at 50% 0, #184839, #0a1816 72%); box-shadow: inset 2px 2px #c9e3a328, inset -2px -2px #030d0bb3, 3px 4px 0 #07141070; }
.rank-level::after { content: ''; position: absolute; left: 6px; right: 6px; bottom: -6px; height: 3px; border-top: 1px solid #8da775; background: #324b35; box-shadow: 0 2px #071410; pointer-events: none; }
.rank-diamond { width: 25px; height: 22px; }
.rank-level small { font-size: 7px; color: #c7d9b5; }
.rank-level strong { font-size: 24px; line-height: 1.25; color: #d4f78c; text-shadow: 2px 2px #000; }
.rank-details { display: flex; align-items: center; gap: 8px; margin: 20px 0; }
.rank-stat { flex: 1; min-width: 0; padding: 9px; border: 1px solid #354d3d; border-top-color: #526a4e; background: linear-gradient(135deg, #16291ee8, #091715f5); box-shadow: inset 1px 1px #9bb8890d, inset -1px -1px #020c0966, 1px 2px #07130e80; }
.rank-stat > span { display: block; color: var(--rank-muted); font-size: 10px; line-height: 1.4; }
.rank-stat strong { display: block; margin-top: 7px; font-size: 10px; line-height: 1.5; color: #eef5e7; }
.rank-stat strong small { font-family: var(--font-body, sans-serif); font-size: 10px; }
.rank-grass { flex: 0 0 40px; width: 40px; height: 40px; }
.rank-progress-title { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 4px 12px; font-size: 11px; font-weight: 600; color: #c6dab7; font-variant-numeric: tabular-nums; }
.rank-progress { position: relative; height: 14px; margin-top: 8px; padding: 2px; border: 1px solid #697f52; background: #243424; box-shadow: inset 0 0 0 2px #080f0b, 1px 2px #050b08; }
.rank-progress::after { content: ''; position: absolute; inset: 2px; background: repeating-linear-gradient(90deg, transparent 0, transparent calc(5% - 2px), #101a0d calc(5% - 2px), #101a0d 5%); pointer-events: none; }
.rank-progress > span { display: block; height: 100%; width: 61.25%; background: linear-gradient(110deg, transparent 30%, #e5ffb33b 47%, transparent 64%), linear-gradient(#d9ff8f, #9ce454 35%, #4d9d31); box-shadow: inset 0 1px #efffcba6, inset 0 -1px #356522; }
.rank-footer { margin-top: 14px; font-size: 10px; line-height: 1.5; color: var(--rank-muted); }
.preview-note { color: var(--on-surface-variant); font-size: 12px; line-height: 1.65; margin: 16px 0; }.preview-disabled { display: flex; align-items: center; gap: 8px; color: var(--warning); font-size: 12px; margin: 14px 0; }.preview-disabled .material-symbols-outlined { font-size: 18px; }.preview-commands { display: flex; flex-wrap: wrap; gap: 7px; }.preview-commands code { padding: 5px 7px; border: 1px solid var(--outline-variant); border-radius: 7px; font-size: 10px; background: var(--surface-container); color: var(--on-surface-variant); }
@media(max-width: 520px) {
  .preview-panel { padding: 16px; }
  .preview-heading { flex-wrap: wrap; }
  .preview-label { font-size: 8px; }
  .rank-preview { padding: 16px 12px; }
  .rank-player { gap: 10px; }
  .rank-avatar { flex-basis: 44px; height: 44px; }
  .rank-avatar span { font-size: 25px; }
  .rank-name strong { font-size: 18px; }
  .rank-name > span { display: none; }
  .rank-level { flex-basis: 52px; }
  .rank-level strong { font-size: 21px; }
  .rank-grass { flex-basis: 30px; width: 30px; height: 30px; }
  .rank-stat { padding: 8px 6px; }
}
</style>
