<!-- 联系方式管理页：提供自定义类型、展示文本与链接的增删改、排序、单条可见性和分页筛选；删除前确认并管理焦点。 -->
<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { admin, request } from '../api';
import type { ContactMethod, Pagination } from '../types';
import { useAction } from '../useAction';

const contacts = ref<ContactMethod[]>([]), editing = ref<number | null>(null), confirming = ref<ContactMethod | null>(null);
const visible = ref(''), typeFilter = ref(''), loaded = ref(false);
const pagination = reactive<Pagination>({ page: 1, limit: 20, total: 0 });
const empty = () => ({ type: 'email', label: '', value: '', url: '', visible: false, sortOrder: 0 });
const form = reactive(empty()), { busy, error, message, run } = useAction();
const fieldNames = ['type', 'label', 'value', 'url', 'sortOrder'] as const;
/** 服务端字段错误保留在输入旁；摘要提供可聚焦的字段链接，不清除用户已填内容。 */
const fieldErrors = computed(() => Object.fromEntries(fieldNames.map(field => [field, error.value.split('；').filter(item => item.startsWith(`${field}:`)).map(item => item.slice(field.length + 1).trim()).join('；')])));
watch(error, async value => { if (value) { await nextTick(); document.getElementById('contact-error')?.focus(); } });
/** 列表使用专用管理接口，保留隐藏记录；筛选和排序均由服务端执行。 */
async function load() {
  const params = new URLSearchParams({ page: String(pagination.page), limit: '20' });
  if (visible.value) params.set('visible', visible.value);
  if (typeFilter.value.trim()) params.set('type', typeFilter.value.trim());
  const result = await request<ContactMethod[]>(`${admin}/contacts?${params}`);
  contacts.value = result.data; Object.assign(pagination, result.pagination); loaded.value = true;
}
function reset() { editing.value = null; Object.assign(form, empty()); }
function edit(contact: ContactMethod) {
  editing.value = contact.id; Object.assign(form, { type: contact.type, label: contact.label, value: contact.value, url: contact.url || '', visible: contact.visible, sortOrder: contact.sortOrder });
  document.getElementById('contact-label')?.focus();
}
/** 空链接转换为 null；写入成功后刷新首页，失败时由统一操作状态保留表单。 */
async function save() {
  await request(`${admin}/contacts${editing.value === null ? '' : `/${editing.value}`}`, editing.value === null ? 'POST' : 'PATCH', { ...form, url: form.url.trim() || null });
  reset(); pagination.page = 1; await load(); document.getElementById('contact-label')?.focus();
}
async function toggle(contact: ContactMethod) {
  await request(`${admin}/contacts/${contact.id}`, 'PATCH', { visible: !contact.visible });
  if (editing.value === contact.id) form.visible = !contact.visible;
  await load();
}
/** 永久删除必须先展示确认区域；取消恢复按钮焦点，删除末页唯一条目时退回上一页。 */
async function confirmRemoval(contact: ContactMethod) { confirming.value = contact; await nextTick(); document.getElementById('contact-delete-title')?.focus(); }
async function cancelRemoval() { const id = confirming.value?.id; confirming.value = null; await nextTick(); document.getElementById(`delete-contact-${id}`)?.focus(); }
async function remove(contact: ContactMethod) {
  await request(`${admin}/contacts/${contact.id}`, 'DELETE'); confirming.value = null;
  if (editing.value === contact.id) reset();
  if (contacts.value.length === 1 && pagination.page > 1) pagination.page--;
  await load(); document.getElementById('contact-label')?.focus();
}
function filter() { pagination.page = 1; void run(load); }
onMounted(() => run(load));
</script>

<template>
  <section :aria-busy="busy">
    <h2>联系方式</h2>
    <p>类型可以自定义，例如 email、phone、github、wechat、qq。新条目默认隐藏；对外展示还需在“展示设置”开启联系方式模块。</p>
    <div v-if="error" id="contact-error" role="alert" tabindex="-1" class="error">
      <p>{{ error }}</p>
      <ul v-if="fieldNames.some(field => fieldErrors[field])"><template v-for="field in fieldNames" :key="field"><li v-if="fieldErrors[field]"><a :href="`#contact-${field}`">{{ fieldErrors[field] }}</a></li></template></ul>
    </div>
    <p v-if="message" role="status" class="success">{{ message }}</p>
    <div v-if="confirming" class="confirmation" role="alert" aria-labelledby="contact-delete-title">
      <h3 id="contact-delete-title" tabindex="-1">确认删除联系方式</h3>
      <p>永久删除“{{ confirming.label }}”？此操作无法撤销。</p>
      <div class="toolbar"><button :disabled="busy" @click="cancelRemoval">取消删除</button><button class="danger" :disabled="busy" @click="run(() => remove(confirming!), '联系方式已删除')">确认永久删除</button></div>
    </div>
    <form @submit.prevent="run(save, '联系方式已保存')">
      <fieldset :disabled="busy || !!confirming">
        <h3>{{ editing === null ? '新增联系方式' : '编辑联系方式' }}</h3>
        <div class="grid">
          <label for="contact-label">展示名称<input id="contact-label" v-model="form.label" required maxlength="100" :aria-invalid="!!fieldErrors.label" aria-describedby="contact-label-error"><small v-if="fieldErrors.label" id="contact-label-error" class="error">{{ fieldErrors.label }}</small></label>
          <label for="contact-type">类型<input id="contact-type" v-model="form.type" list="contact-types" required maxlength="32" :aria-invalid="!!fieldErrors.type" aria-describedby="contact-type-help contact-type-error"><small id="contact-type-help">可选建议或填写其他类型。email、phone 用于生成邮件或拨号入口。</small><small v-if="fieldErrors.type" id="contact-type-error" class="error">{{ fieldErrors.type }}</small></label>
        </div>
        <datalist id="contact-types"><option v-for="type in ['email', 'phone', 'github', 'wechat', 'qq', 'website']" :key="type" :value="type" /></datalist>
        <label for="contact-value">展示文本或账号<input id="contact-value" v-model="form.value" required maxlength="500" :aria-invalid="!!fieldErrors.value" aria-describedby="contact-value-error"><small v-if="fieldErrors.value" id="contact-value-error" class="error">{{ fieldErrors.value }}</small></label>
        <label for="contact-url">跳转链接（选填）<input id="contact-url" v-model="form.url" type="url" maxlength="2000" :aria-invalid="!!fieldErrors.url" aria-describedby="contact-url-help contact-url-error"><small id="contact-url-help">填写 HTTP(S) 链接；留空时账号仍可展示和复制。</small><small v-if="fieldErrors.url" id="contact-url-error" class="error">{{ fieldErrors.url }}</small></label>
        <label for="contact-sortOrder">顺序（小值在前）<input id="contact-sortOrder" v-model.number="form.sortOrder" type="number" min="0" max="2147483647" step="1" required :aria-invalid="!!fieldErrors.sortOrder" aria-describedby="contact-sortOrder-error"><small v-if="fieldErrors.sortOrder" id="contact-sortOrder-error" class="error">{{ fieldErrors.sortOrder }}</small></label>
        <label class="check"><input v-model="form.visible" type="checkbox">允许公开这条联系方式</label>
        <div class="toolbar"><button class="primary" type="submit">{{ busy ? '保存中…' : editing === null ? '新增联系方式' : '保存修改' }}</button><button v-if="editing !== null" type="button" @click="reset">取消编辑</button></div>
      </fieldset>
    </form>
    <form class="toolbar filters" @submit.prevent="filter"><label>类型筛选<input v-model="typeFilter" :disabled="busy" maxlength="32" list="contact-types"></label><label>可见性<select v-model="visible" :disabled="busy" @change="filter"><option value="">全部</option><option value="true">允许公开</option><option value="false">隐藏</option></select></label><button :disabled="busy" type="submit">查询</button><button :disabled="busy" type="button" @click="run(load)">重新加载</button></form>
    <div class="table-wrap"><table><thead><tr><th>联系方式</th><th>类型</th><th>顺序</th><th>可见性</th><th>操作</th></tr></thead><tbody>
      <tr v-for="contact in contacts" :key="contact.id"><td class="contact-cell">{{ contact.label }}<small>{{ contact.value }}</small><small v-if="contact.url">{{ contact.url }}</small></td><td>{{ contact.type }}</td><td>{{ contact.sortOrder }}</td><td>{{ contact.visible ? '允许公开' : '隐藏' }}</td><td><div class="toolbar"><button :disabled="busy || !!confirming" @click="edit(contact)">编辑</button><button :disabled="busy || !!confirming" :aria-label="`${contact.label}公开开关`" :aria-pressed="contact.visible" @click="run(() => toggle(contact), '可见性已保存')">{{ contact.visible ? '隐藏' : '公开' }}</button><button :id="`delete-contact-${contact.id}`" class="danger" :disabled="busy || !!confirming" @click="confirmRemoval(contact)">删除</button></div></td></tr>
      <tr v-if="!contacts.length"><td colspan="5">{{ busy ? '正在加载…' : !loaded ? '尚未读取联系方式，请重新加载。' : '暂无符合条件的联系方式，可以在上方新增。' }}</td></tr>
    </tbody></table></div>
    <div class="toolbar"><button :disabled="busy || pagination.page <= 1" @click="pagination.page--; run(load)">上一页</button><span>第 {{ pagination.page }} 页 · 共 {{ pagination.total }} 条</span><button :disabled="busy || pagination.page * pagination.limit >= pagination.total" @click="pagination.page++; run(load)">下一页</button></div>
  </section>
</template>

<style scoped>
.contact-cell { overflow-wrap: anywhere; max-width: 380px; }
</style>
