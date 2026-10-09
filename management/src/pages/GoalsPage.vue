<!-- 学习目标维护页；提供新增、编辑、进度、归档、排序、可见性与确认删除，支持分页和筛选。 -->
<script setup lang="ts">
import { ref, reactive, onMounted, nextTick } from 'vue';
import { admin, request } from '../api';
import type { Goal, Pagination } from '../types';
import { useAction } from '../useAction';
const goals = ref<Goal[]>([]), status = ref(''), visible = ref(''), editing = ref<number | null>(null);
const pagination = reactive<Pagination>({ page: 1, limit: 20, total: 0 });
const confirming = ref<Goal | null>(null);
const labels: Record<string, string> = { planned: '计划中', active: '学习中', paused: '暂停', completed: '已完成' };
const empty = () => ({ title: '', description: '', progress: null as number | null, status: 'planned' as Goal['status'], visible: false, sortOrder: 0 });
const form = reactive(empty()), { busy, error, message, run } = useAction();
async function load() { const params = new URLSearchParams({ page: String(pagination.page), limit: '20' }); if (status.value) params.set('status', status.value); if (visible.value) params.set('visible', visible.value); const result = await request<Goal[]>(`${admin}/learning-goals?${params}`); goals.value = result.data; Object.assign(pagination, result.pagination); }
function reset() { editing.value = null; Object.assign(form, empty()); }
function edit(goal: Goal) { editing.value = goal.id; Object.assign(form, { title: goal.title, description: goal.description || '', progress: goal.progress, status: goal.status, visible: goal.visible, sortOrder: goal.sortOrder }); document.getElementById('goal-title')?.focus(); }
async function save() { const data = { ...form, description: form.description || null, progress: form.progress === null || String(form.progress) === '' ? null : Number(form.progress) }; await request(`${admin}/learning-goals${editing.value === null ? '' : `/${editing.value}`}`, editing.value === null ? 'POST' : 'PATCH', data); reset(); await load(); }
/** 使用页面内确认并移动焦点，避免浏览器原生弹窗阻断管理界面。 */
async function confirmRemoval(goal: Goal) { confirming.value = goal; await nextTick(); document.getElementById('confirm-delete-title')?.focus(); }
async function cancelRemoval() { const id = confirming.value?.id; confirming.value = null; await nextTick(); document.getElementById(`delete-goal-${id}`)?.focus(); }
async function remove(goal: Goal) { await run(async () => { await request(`${admin}/learning-goals/${goal.id}`, 'DELETE'); confirming.value = null; if (editing.value === goal.id) reset(); if (goals.value.length === 1 && pagination.page > 1) pagination.page--; await load(); }, '目标已删除'); }
function filter() { pagination.page = 1; void run(load); }
onMounted(() => run(load));
</script>
<template>
  <section :aria-busy="busy"><h2>学习目标</h2><p>新目标默认隐藏；已完成目标保留记录，公开端按已完成状态单独读取。</p>
    <p v-if="error" role="alert" class="error">{{ error }}</p><p v-if="message" role="status" class="success">{{ message }}</p>
    <div v-if="confirming" class="confirmation" role="alertdialog" aria-labelledby="confirm-delete-title" aria-describedby="confirm-delete-description"><h3 id="confirm-delete-title" tabindex="-1">确认删除目标</h3><p id="confirm-delete-description">永久删除“{{ confirming.title }}”？此操作无法撤销。</p><div class="toolbar"><button :disabled="busy" @click="cancelRemoval">取消删除</button><button class="danger" :disabled="busy" @click="remove(confirming)">{{ busy ? '删除中…' : '确认永久删除' }}</button></div></div>
    <form @submit.prevent="run(save, '学习目标已保存')"><fieldset :disabled="busy"><h3>{{ editing === null ? '新增目标' : '编辑目标' }}</h3>
      <label for="goal-title">标题<input id="goal-title" v-model="form.title" required maxlength="100"></label><label>说明<textarea v-model="form.description" maxlength="1000" rows="3"></textarea></label>
      <div class="grid"><label>进度（%，留空为未设置）<input v-model.number="form.progress" type="number" min="0" max="100" step="1"></label><label>状态<select v-model="form.status"><option v-for="(name, key) in labels" :key="key" :value="key">{{ name }}</option></select></label><label>顺序（小值在前）<input v-model.number="form.sortOrder" type="number" min="0" max="2147483647" step="1" required></label></div>
      <label class="check"><input v-model="form.visible" type="checkbox">允许公开这个目标</label><div class="toolbar"><button class="primary" type="submit">{{ busy ? '保存中…' : editing === null ? '新增目标' : '保存修改' }}</button><button v-if="editing !== null" type="button" @click="reset">取消编辑</button></div>
    </fieldset></form>
    <div class="toolbar filters"><label>状态筛选<select v-model="status" :disabled="busy" @change="filter"><option value="">全部状态</option><option v-for="(name, key) in labels" :key="key" :value="key">{{ name }}</option></select></label><label>可见性<select v-model="visible" :disabled="busy" @change="filter"><option value="">全部</option><option value="true">允许公开</option><option value="false">隐藏</option></select></label><button :disabled="busy" @click="run(load)">重新加载</button></div>
    <div class="table-wrap"><table><thead><tr><th>目标</th><th>进度</th><th>状态</th><th>顺序</th><th>可见性</th><th>操作</th></tr></thead><tbody><tr v-for="goal in goals" :key="goal.id"><td>{{ goal.title }}</td><td>{{ goal.progress === null ? '未设置' : `${goal.progress}%` }}</td><td>{{ labels[goal.status] }}</td><td>{{ goal.sortOrder }}</td><td>{{ goal.visible ? '允许公开' : '隐藏' }}</td><td class="toolbar"><button :disabled="busy" @click="edit(goal)">编辑</button><button :id="`delete-goal-${goal.id}`" class="danger" :disabled="busy" @click="confirmRemoval(goal)">删除</button></td></tr><tr v-if="!goals.length"><td colspan="6">{{ busy ? '正在加载…' : '没有符合条件的目标' }}</td></tr></tbody></table></div>
    <div class="toolbar"><button :disabled="busy || pagination.page <= 1" @click="pagination.page--; run(load)">上一页</button><span>第 {{ pagination.page }} 页 · 共 {{ pagination.total }} 条</span><button :disabled="busy || pagination.page * pagination.limit >= pagination.total" @click="pagination.page++; run(load)">下一页</button></div>
  </section>
</template>
