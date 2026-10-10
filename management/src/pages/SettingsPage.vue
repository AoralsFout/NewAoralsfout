<!-- 展示设置页；维护固定模块开关和条目隐藏覆盖，解释父模块依赖与本地内容可见性。 -->
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { admin, request } from '../api';
import type { Module } from '../types';
import { useAction } from '../useAction';
import DataInspector from '../components/DataInspector.vue';
const modules = ref<Module[]>([]), selected = ref<Module | null>(null);
const { busy, error, message, run } = useAction();
async function load() { modules.value = (await request<Module[]>(`${admin}/modules`)).data; }
async function toggle(module: Module) { await request(`${admin}/modules/${encodeURIComponent(module.id)}`, 'PATCH', { visible: !module.visible }); await load(); if (selected.value?.id === module.id) selected.value = modules.value.find(m => m.id === module.id) || null; }
onMounted(() => run(load));
/** 本地联系方式通过专用管理页维护，不使用外部快照的条目隐藏接口。 */
const contactModuleId = 'contacts';
</script>
<template>
  <section :aria-busy="busy"><h2>展示设置</h2><p>开启模块后，只会公开有效且未被隐藏的数据。关闭模块保留内容和同步任务。</p>
    <p v-if="error" role="alert" class="error">{{ error }}</p><p v-if="message" role="status" class="success">{{ message }}</p><button :disabled="busy" @click="run(load)">{{ busy ? '处理中…' : '重新加载设置' }}</button>
    <div class="table-wrap"><table><thead><tr><th>模块</th><th>公开开关</th><th>条目与关联</th></tr></thead><tbody><tr v-for="module in modules" :key="module.id"><td>{{ module.name }}<small>{{ module.id }}</small></td><td><button :aria-label="`${module.name}公开开关`" :aria-pressed="module.visible" :disabled="busy" @click="run(() => toggle(module), `${module.name} 设置已保存`)">{{ module.visible ? '已开启 · 点击关闭' : '已关闭 · 点击开启' }}</button></td><td><p v-if="module.parent">依赖 {{ module.parent }} 的开关和可见条目。</p><RouterLink v-if="module.id === 'L07'" to="/status">维护状态内容与有效期</RouterLink><RouterLink v-else-if="module.id === 'L08'" to="/goals">维护目标和单条可见性</RouterLink><RouterLink v-else-if="module.id === contactModuleId" to="/contacts">维护联系方式、排序和单条可见性</RouterLink><button v-else-if="module.items" :disabled="busy" @click="selected = module">管理条目可见性</button><span v-else-if="!module.parent">仅支持整个模块开关</span></td></tr><tr v-if="!modules.length"><td colspan="3">{{ busy ? '正在加载…' : '尚未加载设置，可重新加载' }}</td></tr></tbody></table></div>
  </section><DataInspector v-if="selected" :key="selected.id" :module="selected" editable />
</template>
