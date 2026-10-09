/** NeoBlog 用户状态的精简复用；导出去重初始化、Cookie 登录跳转和服务端退出行为。 */
import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import { request, HttpError } from '../api';
import type { User } from '../types';
export const useUserStore = defineStore('user', () => {
  const user = ref<User | null>(null), loading = ref(true), error = ref('');
  const isAdmin = computed(() => user.value?.role === 'admin');
  let pending: Promise<void> | null = null;
  const init = () => {
    if (pending) return pending;
    loading.value = true; error.value = '';
    pending = (async () => {
      try { user.value = (await request<User>('/api/auth/me')).data; }
      catch (e) { user.value = null; if (!(e instanceof HttpError && e.status === 401)) error.value = e instanceof Error ? e.message : '登录检查失败'; }
      finally { loading.value = false; pending = null; }
    })(); return pending;
  };
  const login = () => { window.location.href = '/api/auth/natayark'; };
  const logout = async () => { await request('/api/auth/logout', 'POST', {}); user.value = null; };
  return { user, loading, error, isAdmin, init, login, logout };
});
