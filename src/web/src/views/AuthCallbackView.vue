<script setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../stores/auth';

const auth = useAuth();
const route = useRoute();
const router = useRouter();
const error = ref('');

onMounted(async () => {
  const code = route.query.code;
  const state = route.query.state;
  if (!code || !state) {
    error.value = 'Thiếu code/state OAuth';
    return;
  }
  try {
    await auth.loginWithCode(String(code), String(state));
    router.replace('/dashboard');
  } catch (e) {
    error.value = e.response?.data?.message || 'Đăng nhập thất bại';
    setTimeout(() => router.replace('/login'), 3000);
  }
});
</script>

<template>
  <div class="login-shell">
    <div class="login-card">
      <h1>{{ error ? '❌ Lỗi' : '⏳ Đang đăng nhập...' }}</h1>
      <p v-if="error" style="color: var(--red);">{{ error }}</p>
      <p v-else>Vui lòng chờ một chút.</p>
    </div>
  </div>
</template>
