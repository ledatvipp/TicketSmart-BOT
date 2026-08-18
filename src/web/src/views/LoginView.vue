<script setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ConfigAPI } from '../api/endpoints';
import { useAuth } from '../stores/auth';

const loginUrl = ref('');
const error = ref('');
const localLoginEnabled = ref(false);
const username = ref('');
const password = ref('');
const submitting = ref(false);
const route = useRoute();
const router = useRouter();
const auth = useAuth();

function redirectAfterLogin() {
  const redirect = String(route.query.redirect || '');
  return redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/dashboard';
}

async function submitLocalLogin() {
  error.value = '';
  submitting.value = true;
  try {
    await auth.loginWithPassword(username.value, password.value);
    password.value = '';
    await router.replace(redirectAfterLogin());
  } catch (err) {
    error.value = err.response?.data?.message || 'Đăng nhập không thành công. Vui lòng thử lại.';
  } finally {
    submitting.value = false;
  }
}

onMounted(async () => {
  try {
    const data = await ConfigAPI.publicConfig();
    loginUrl.value = data.loginUrl;
    localLoginEnabled.value = data.localLoginEnabled === true;
  } catch {
    error.value = 'Không kết nối được Backend API. Hãy kiểm tra tiến trình API và cấu hình mạng.';
  }
});
</script>

<template>
  <main class="login-v7">
    <section class="login-v7-showcase">
      <div class="login-v7-brand"><span>IS</span><div><strong>IS7MC Control</strong><small>Support Intelligence Platform</small></div></div>
      <div class="showcase-copy">
        <span class="showcase-kicker"><i></i> MULTI-CLUSTER OPERATIONS</span>
        <h1>Một trung tâm.<br><em>Toàn bộ hỗ trợ.</em></h1>
        <p>Điều hành ticket, Smart AI và bảy cụm máy chủ trong một dashboard sạch, realtime và an toàn.</p>
      </div>
      <div class="showcase-nodes">
        <span>🌿 SMP</span><span>🏕️ Survival</span><span>☁️ Skyblock</span><span>📦 BoxPvP</span><span>🪷 Tu Tiên</span><span>⚔️ FFA</span><span>🧊 ChunkySMP</span>
      </div>
      <footer>IS7MC Network • Secure staff access</footer>
    </section>

    <section class="login-v7-form-side">
      <div class="login-v7-card">
        <div class="login-card-icon"><span class="material-symbols-outlined">shield_lock</span></div>
        <span class="login-eyebrow">STAFF PORTAL</span>
        <h2>Chào mừng trở lại</h2>
        <p>Đăng nhập bằng Discord hoặc tài khoản nội bộ đã được cấp quyền để truy cập trung tâm vận hành.</p>

        <form v-if="localLoginEnabled" class="local-login-form" @submit.prevent="submitLocalLogin">
          <label>
            <span>Tên đăng nhập</span>
            <input v-model="username" autocomplete="username" maxlength="50" required placeholder="Nhập tên đăng nhập" />
          </label>
          <label>
            <span>Mật khẩu</span>
            <input v-model="password" type="password" autocomplete="current-password" maxlength="256" required placeholder="Nhập mật khẩu" />
          </label>
          <button class="local-login-button" type="submit" :disabled="submitting">
            <span class="material-symbols-outlined">login</span>
            {{ submitting ? 'Đang đăng nhập...' : 'Đăng nhập tài khoản nội bộ' }}
          </button>
        </form>

        <div v-if="localLoginEnabled && loginUrl" class="login-divider"><span>hoặc</span></div>

        <a v-if="loginUrl" :href="loginUrl" class="discord-login-button">
          <svg width="19" height="19" viewBox="0 0 71 55" fill="currentColor"><path d="M60.1 4.9A58.5 58.5 0 0045.7.4a.2.2 0 00-.2.1l-2 4.4a54 54 0 00-16.3 0L25.2.5a.2.2 0 00-.2-.1 58.4 58.4 0 00-14.4 4.5.2.2 0 00-.1.1A60 60 0 00.1 45.5a.2.2 0 00.1.2 58.8 58.8 0 0017.7 9 .2.2 0 00.2-.1 42 42 0 003.6-5.9.2.2 0 00-.1-.3 38.7 38.7 0 01-5.6-2.6.2.2 0 010-.3l1.1-.9a.2.2 0 01.2 0 41.9 41.9 0 0036.4 0 .2.2 0 01.2 0l1.1.9a.2.2 0 010 .3 36.3 36.3 0 01-5.6 2.6.2.2 0 00-.1.3 47.1 47.1 0 003.6 5.9.2.2 0 00.2.1 58.6 58.6 0 0017.7-9 .2.2 0 00.1-.2c1.4-15.1-2.4-28.3-10.1-40.6a.2.2 0 00-.1-.1zM23.7 37.3c-3.5 0-6.4-3.2-6.4-7.1 0-4 2.8-7.1 6.4-7.1 3.6 0 6.5 3.2 6.4 7.1 0 4-2.8 7.1-6.4 7.1zm23.6 0c-3.5 0-6.4-3.2-6.4-7.1 0-4 2.8-7.1 6.4-7.1 3.6 0 6.5 3.2 6.4 7.1 0 4-2.8 7.1-6.4 7.1z"/></svg>
          Tiếp tục với Discord
          <span class="material-symbols-outlined">arrow_forward</span>
        </a>
        <div v-else-if="!error" class="login-loading"><i></i><span>Đang kết nối hệ thống đăng nhập...</span></div>
        <div v-if="error" class="login-error"><span class="material-symbols-outlined">error</span>{{ error }}</div>

        <div class="login-trust"><span class="material-symbols-outlined">verified_user</span><div><strong>Đăng nhập bảo mật</strong><small>Dashboard không lưu mật khẩu Discord của bạn.</small></div></div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.login-v7 { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1.08fr) minmax(440px, .92fr); background: #0c0d18; color: #fff; }
.login-v7-showcase { position: relative; min-height: 100vh; display: flex; flex-direction: column; overflow: hidden; padding: 34px 42px; background: radial-gradient(circle at 75% 20%, rgba(108,99,255,.38), transparent 28%), radial-gradient(circle at 15% 85%, rgba(39,197,245,.14), transparent 30%), linear-gradient(145deg, #111222, #1d1b3f 62%, #25205b); }
.login-v7-showcase::before { content: ''; position: absolute; width: 430px; height: 430px; right: -130px; top: 12%; border: 1px solid rgba(255,255,255,.08); border-radius: 50%; box-shadow: 0 0 0 75px rgba(255,255,255,.025), 0 0 0 150px rgba(255,255,255,.015); }
.login-v7-brand { position: relative; z-index: 1; display: flex; align-items: center; gap: 11px; }
.login-v7-brand > span { width: 42px; height: 42px; display: grid; place-items: center; border-radius: 13px; background: linear-gradient(135deg, #7d74ff, #4353cc); box-shadow: 0 12px 28px rgba(108,99,255,.32); font-size: 13px; font-weight: 850; }
.login-v7-brand strong, .login-v7-brand small { display: block; }.login-v7-brand strong { font-size: 13px; }.login-v7-brand small { margin-top: 2px; color: rgba(255,255,255,.47); font-size: 9px; }
.showcase-copy { position: relative; z-index: 1; max-width: 780px; margin: auto 0; }
.showcase-kicker { display: inline-flex; align-items: center; gap: 8px; color: rgba(255,255,255,.55); font-size: 9px; font-weight: 800; letter-spacing: .14em; }.showcase-kicker i { width: 7px; height: 7px; border-radius: 50%; background: #65f5bd; box-shadow: 0 0 12px #65f5bd; }
.showcase-copy h1 { margin: 15px 0 14px; font-size: clamp(48px, 6vw, 82px); line-height: .96; letter-spacing: -.06em; }.showcase-copy h1 em { color: #aaa5ff; font-style: normal; }.showcase-copy p { max-width: 620px; margin: 0; color: rgba(255,255,255,.58); font-size: 14px; line-height: 1.7; }
.showcase-nodes { position: relative; z-index: 1; display: flex; flex-wrap: wrap; gap: 7px; }.showcase-nodes span { padding: 7px 10px; border: 1px solid rgba(255,255,255,.11); border-radius: 999px; background: rgba(255,255,255,.055); color: rgba(255,255,255,.68); font-size: 8px; }
.login-v7-showcase footer { position: relative; z-index: 1; margin-top: 20px; color: rgba(255,255,255,.3); font-size: 8px; }
.login-v7-form-side { display: grid; place-items: center; padding: 40px; background: var(--surface); color: var(--on-surface); }
.login-v7-card { width: min(100%, 420px); }
.login-card-icon { width: 48px; height: 48px; display: grid; place-items: center; margin-bottom: 22px; border-radius: 15px; background: color-mix(in srgb, var(--v7-purple), transparent 84%); color: var(--v7-purple-2); }.login-card-icon .material-symbols-outlined { font-size: 23px; }
.login-eyebrow { color: var(--v7-purple-2); font-size: 8px; font-weight: 850; letter-spacing: .14em; }.login-v7-card h2 { margin: 8px 0 9px; font-size: 34px; letter-spacing: -.045em; }.login-v7-card > p { margin: 0 0 26px; color: var(--on-surface-variant); font-size: 11px; line-height: 1.65; }
.discord-login-button { height: 48px; display: grid; grid-template-columns: 21px minmax(0,1fr) 18px; align-items: center; gap: 10px; padding: 0 15px; border-radius: 13px; background: linear-gradient(135deg, #5865f2, #6c63ff); box-shadow: 0 14px 32px rgba(88,101,242,.24); color: #fff; font-size: 11px; font-weight: 750; transition: all 170ms ease; }.discord-login-button:hover { transform: translateY(-2px); box-shadow: 0 18px 38px rgba(88,101,242,.35); }.discord-login-button > .material-symbols-outlined { font-size: 17px; }
.local-login-form { display: grid; gap: 12px; }.local-login-form label { display: grid; gap: 6px; color: var(--on-surface-variant); font-size: 9px; font-weight: 750; }.local-login-form input { width: 100%; box-sizing: border-box; height: 43px; padding: 0 12px; border: 1px solid var(--outline-variant); border-radius: 11px; outline: none; background: var(--surface-container); color: var(--on-surface); font: inherit; font-size: 11px; }.local-login-form input:focus { border-color: var(--v7-purple); box-shadow: 0 0 0 3px color-mix(in srgb, var(--v7-purple), transparent 83%); }.local-login-button { height: 46px; display: flex; align-items: center; justify-content: center; gap: 8px; border: 0; border-radius: 12px; background: var(--v7-purple); color: #fff; font-size: 10px; font-weight: 800; cursor: pointer; }.local-login-button:disabled { cursor: wait; opacity: .7; }.local-login-button .material-symbols-outlined { font-size: 17px; }.login-divider { position: relative; height: 24px; display: grid; place-items: center; color: var(--on-surface-variant); font-size: 9px; }.login-divider::before { content: ''; position: absolute; inset: 50% 0 auto; border-top: 1px solid var(--outline-variant); }.login-divider span { position: relative; z-index: 1; padding: 0 9px; background: var(--surface); }
.login-loading { height: 48px; display: flex; align-items: center; gap: 10px; padding: 0 14px; border-radius: 13px; background: var(--surface-container); color: var(--on-surface-variant); font-size: 9px; }.login-loading i { width: 15px; height: 15px; border: 2px solid var(--outline-variant); border-top-color: var(--v7-purple); border-radius: 50%; animation: spin .8s linear infinite; }@keyframes spin { to { transform: rotate(360deg); } }
.login-error { display: flex; align-items: flex-start; gap: 8px; padding: 11px 12px; border: 1px solid color-mix(in srgb, var(--error), transparent 68%); border-radius: 12px; background: color-mix(in srgb, var(--error), transparent 91%); color: var(--error); font-size: 9px; line-height: 1.5; }.login-error .material-symbols-outlined { font-size: 17px; }
.login-trust { display: grid; grid-template-columns: 29px minmax(0,1fr); gap: 9px; align-items: center; margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--outline-variant); }.login-trust > .material-symbols-outlined { color: var(--v7-green); font-size: 22px; }.login-trust strong, .login-trust small { display: block; }.login-trust strong { font-size: 9px; }.login-trust small { margin-top: 2px; color: var(--on-surface-variant); font-size: 8px; }
@media (max-width: 900px) { .login-v7 { grid-template-columns: 1fr; }.login-v7-showcase { min-height: 44vh; padding: 25px; }.showcase-copy { margin: 70px 0 50px; }.showcase-copy h1 { font-size: 52px; }.login-v7-form-side { padding: 48px 25px; } }
@media (max-width: 520px) { .login-v7-showcase { display: none; }.login-v7 { background: var(--surface); }.login-v7-form-side { min-height: 100vh; padding: 28px 20px; }.login-v7-card h2 { font-size: 31px; } }
</style>
