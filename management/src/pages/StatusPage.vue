<!-- 当前状态维护页；读取、完整保存描述、接单状态、有效期与单条可见性。 -->
<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue';
import { admin, request } from '../api';
import type { PersonalStatus } from '../types';
import { useAction } from '../useAction';
const form = reactive<PersonalStatus>({ text: '', availability: 'unknown', visible: false, expiresAt: null });
const expiry = ref(''), updatedAt = ref(''), loaded = ref(false);
const { busy, error, message, run } = useAction();
/** datetime-local 输入用浏览器本地时间展示，保存时明确转换为 UTC。 */
function localDate(iso: string) { const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
async function load() { const { data } = await request<PersonalStatus | null>(`${admin}/personal-status`); if (data) { Object.assign(form, { text: data.text, availability: data.availability, visible: data.visible, expiresAt: data.expiresAt }); expiry.value = data.expiresAt ? localDate(data.expiresAt) : ''; updatedAt.value = data.updatedAt || ''; } loaded.value = true; }
async function save() { const { data } = await request<PersonalStatus>(`${admin}/personal-status`, 'PUT', { text: form.text, availability: form.availability, visible: form.visible, expiresAt: expiry.value ? new Date(expiry.value).toISOString() : null }); updatedAt.value = data.updatedAt || ''; }
onMounted(() => run(load));
</script>
<template>
  <section :aria-busy="busy"><h2>当前状态</h2><p>这里控制内容可见性；公开展示还需在“展示设置”中开启当前状态模块。</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p><p v-if="message" class="success" role="status">{{ message }}</p>
    <form v-if="loaded" @submit.prevent="run(save, '当前状态已保存')"><fieldset :disabled="busy">
      <label>当前描述<textarea v-model="form.text" maxlength="500" rows="5"></textarea></label><small>{{ form.text.length }}/500，留空可清除描述</small>
      <label>接单状态<select v-model="form.availability"><option value="unknown">未设置</option><option value="open">可接单</option><option value="limited">需先沟通</option><option value="closed">暂不接单</option></select></label>
      <label>有效期（本地时间，留空表示持续有效）<input v-model="expiry" type="datetime-local"></label>
      <p v-if="expiry && Date.parse(expiry) <= Date.now()" class="error">已过期。重新保存前请更新有效期或清空。</p>
      <label class="check"><input v-model="form.visible" type="checkbox">允许公开这条状态</label>
      <div class="toolbar"><button class="primary" type="submit">{{ busy ? '保存中…' : '保存状态' }}</button><button type="button" @click="run(load)">重新加载</button></div>
      <small v-if="updatedAt">上次保存：{{ new Date(updatedAt).toLocaleString() }}</small>
    </fieldset></form><button v-else :disabled="busy" @click="run(load)">{{ busy ? '加载中…' : '重试加载' }}</button>
  </section>
</template>
