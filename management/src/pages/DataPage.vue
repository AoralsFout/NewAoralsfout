<!-- 数据和来源状态页；读取脱敏采集状态，手动刷新并浏览完整快照，不展示凭据明文。 -->
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { admin, request, HttpError } from '../api';
import type { Module, Source } from '../types';
import { useAction } from '../useAction';
import { time, statusLabel } from '../format';
import DataInspector from '../components/DataInspector.vue';
const modules = ref<Module[]>([]), sources = ref<Source[]>([]), selected = ref<Module | null>(null), refreshing = ref('');
const { busy, error, message, run } = useAction();
async function load() { const result = await Promise.all([request<Module[]>(`${admin}/modules`), request<Source[]>(`${admin}/sources`)]); modules.value = result[0].data.filter(m => m.source !== 'local'); sources.value = result[1].data; }
async function refresh(module: Module) {
  refreshing.value = module.id;
  try { await request(`${admin}/modules/${encodeURIComponent(module.id)}/refresh`, 'POST', {}); if (selected.value?.id === module.id) selected.value = null; }
  catch (e) { if (e instanceof HttpError && e.retryAfter) throw new Error(`${e.message}，约 ${e.retryAfter} 秒后可重试`); throw e; }
  finally { refreshing.value = ''; await load(); }
}
onMounted(() => run(load));
</script>
<template>
  <section :aria-busy="busy"><h2>数据与 API 状态</h2><p>状态表示最近一次采集结果。刷新可能等待一分钟；数据新鲜度与采集是否成功分别显示。</p>
    <p v-if="error" role="alert" class="error">{{ error }}</p><p v-if="message" role="status" class="success">{{ message }}</p><button :disabled="busy" @click="run(load)">{{ busy && !refreshing ? '加载中…' : '重新加载状态' }}</button>
    <div class="grid source-list"><article v-for="source in sources" :key="source.source"><h3>{{ source.source }}</h3><p>{{ source.kind === 'local' ? '本地服务' : '外部 API' }} · {{ statusLabel(source.state) }}</p><p>必要参数{{ source.configured ? '已配置' : '未全部配置' }}</p><small>最近成功 {{ time(source.lastSuccessAt) }}</small></article></div>
    <div class="table-wrap"><table><thead><tr><th>模块</th><th>采集 / 新鲜度</th><th>条目</th><th>时间与耗时</th><th>操作</th></tr></thead><tbody><tr v-for="module in modules" :key="module.id"><td>{{ module.name }}<small>{{ module.id }}</small></td><td>{{ module.configured ? statusLabel(module.lastResult) : '未配置' }} / {{ statusLabel(module.freshness) }}<small v-if="module.lastErrorMessage" class="error">{{ module.lastErrorMessage }}</small></td><td>{{ module.count }}</td><td><small>尝试 {{ time(module.lastAttemptAt) }}</small><small>成功 {{ time(module.lastSuccessAt) }}</small><small>最早重试 {{ time(module.nextAttemptAt) }}</small><small v-if="module.durationMs !== null">耗时 {{ module.durationMs }} ms</small></td><td><div class="toolbar"><button :disabled="busy || module.refreshing || !module.configured" @click="run(() => refresh(module), `${module.name} 刷新成功`)">{{ refreshing === module.id || module.refreshing ? '刷新中…' : '刷新' }}</button><button :disabled="busy" @click="selected = module">查看数据</button></div></td></tr><tr v-if="!modules.length"><td colspan="5">{{ busy ? '正在加载…' : '尚未加载模块，可重新加载状态' }}</td></tr></tbody></table></div>
  </section><DataInspector v-if="selected" :key="selected.id" :module="selected" />
</template>
