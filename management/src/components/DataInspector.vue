<!-- 缓存查看组件；展示标准化数据、分页和分类，并在支持时维护单条隐藏覆盖。 -->
<script setup lang="ts">
import { ref, reactive, watch } from 'vue';
import type { Module, DataItem, Pagination } from '../types';
import { admin, request } from '../api';
import { useAction } from '../useAction';
import { statusLabel, time } from '../format';
const props = defineProps<{ module: Module; editable?: boolean }>();
const data = ref<DataItem | DataItem[] | null>(null), loaded = ref(false), category = ref('watched');
const pagination = reactive<Pagination>({ page: 1, limit: 20, total: 0 }), meta = ref<{ freshness: string; updatedAt: string | null }>();
const categories = { watched: '看过', watching: '在看', want: '想看', on_hold: '搁置', dropped: '抛弃' };
const { busy, error, message, run } = useAction();
async function load() {
  const params = new URLSearchParams({ page: String(pagination.page), limit: '20' });
  if (props.module.id === 'bangumi.collections') params.set('category', category.value);
  const result = await request<DataItem | DataItem[] | null>(`${admin}/modules/${encodeURIComponent(props.module.id)}/data?${params}`);
  data.value = result.data; Object.assign(pagination, result.pagination || { page: 1, limit: 20, total: 0 }); meta.value = result.meta; loaded.value = true;
}
async function toggle(item: DataItem) {
  await request(`${admin}/modules/${encodeURIComponent(props.module.id)}/items/${encodeURIComponent(item.itemId!)}/visibility`, 'PUT', { visible: item.itemVisible === false });
  await load();
}
watch(() => [props.module.id, props.module.visible], () => { loaded.value = false; pagination.page = 1; void run(load); }, { immediate: true });
</script>
<template>
  <section :aria-busy="busy"><h3>{{ module.name }} · 标准化数据</h3>
    <p v-if="error" role="alert" class="error">{{ error }}</p><p v-if="message" role="status" class="success">{{ message }}</p>
    <p v-if="meta">快照：{{ statusLabel(meta.freshness) }} · 最近成功 {{ time(meta.updatedAt) }}</p>
    <div class="toolbar"><label v-if="module.id === 'bangumi.collections'">收藏分类<select v-model="category" :disabled="busy" @change="pagination.page = 1; run(load)"><option v-for="(name, key) in categories" :key="key" :value="key">{{ name }}</option></select></label><button :disabled="busy" @click="run(load)">{{ busy ? '加载中…' : '重新加载数据' }}</button></div>
    <p v-if="!loaded">正在加载…</p>
    <template v-else-if="Array.isArray(data)">
      <p v-if="!data.length">当前分类或模块没有缓存条目。</p>
      <article v-for="(item, index) in data" :key="item.itemId || index" class="data-item"><div class="toolbar"><strong>{{ item.name || item.title || item.repo || item.fullName || item.month || `条目 ${index + 1}` }}</strong><template v-if="editable && module.items && item.itemId"><span>条目设置：{{ item.itemVisible === false ? '隐藏' : '继承模块' }}；当前{{ item.visible ? '公开' : '不公开' }}</span><button :disabled="busy" @click="run(() => toggle(item), '条目设置已保存')">{{ item.itemVisible === false ? '恢复条目' : '隐藏条目' }}</button></template></div><details><summary>查看完整数据</summary><pre>{{ JSON.stringify(item, null, 2) }}</pre></details></article>
      <div class="toolbar"><button :disabled="busy || pagination.page <= 1" @click="pagination.page--; run(load)">上一页</button><span>第 {{ pagination.page }} 页 · 共 {{ pagination.total }} 条</span><button :disabled="busy || pagination.page * pagination.limit >= pagination.total" @click="pagination.page++; run(load)">下一页</button></div>
    </template><pre v-else-if="data">{{ JSON.stringify(data, null, 2) }}</pre><p v-else>尚无成功快照，请检查来源配置并刷新。</p>
  </section>
</template>
