/** 管理操作反馈；导出禁止重复提交、成功提示与失效会话处理的组合函数。 */
import { ref } from 'vue';
import { HttpError } from './api';
import { useUserStore } from './stores/user';
export function useAction() {
  const busy = ref(false), error = ref(''), message = ref('');
  async function run(action: () => Promise<void>, success = '') {
    if (busy.value) return;
    busy.value = true; error.value = ''; message.value = '';
    try { await action(); message.value = success; }
    catch (e) {
      error.value = e instanceof Error ? e.message : '操作失败，请重试';
      if (e instanceof HttpError && e.status === 401) { useUserStore().user = null; useUserStore().error = '登录已失效，请重新登录'; }
      else if (e instanceof HttpError && e.status === 403) { await useUserStore().init(); }
    } finally { busy.value = false; }
  }
  return { busy, error, message, run };
}
