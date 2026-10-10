<!-- 管理应用布局；负责会话检查、权限提示、五页导航和退出登录。 -->
<script setup lang="ts">
import { onMounted } from 'vue';
import { useUserStore } from './stores/user';
import { useAction } from './useAction';
const user = useUserStore();
const { busy, error, run } = useAction();
onMounted(() => user.init());
</script>
<template>
  <a class="skip" href="#content">跳到主要内容</a>
  <header><div><h1>AoralsFout · 展示管理</h1><p>维护内容、查看来源、控制公开范围</p></div><div v-if="user.user" class="toolbar"><span>{{ user.user.username }}</span><button :disabled="busy" @click="run(user.logout)">{{ busy ? '退出中…' : '退出登录' }}</button></div></header>
  <main id="content">
    <p v-if="user.loading" role="status">正在检查登录状态…</p>
    <section v-else-if="!user.user"><h2>管理员登录</h2><p>使用 NeoBlog 现有的 Natayark 账号登录。</p><p v-if="user.error" class="error" role="alert">{{ user.error }}</p><div class="toolbar"><button class="primary" @click="user.login">登录</button><button @click="user.init">重新检查</button></div></section>
    <section v-else-if="!user.isAdmin"><h2>无法进入管理页面</h2><p>当前账号没有管理员权限，请使用 NeoBlog 管理员账号登录。</p></section>
    <template v-else>
      <nav aria-label="管理页面"><RouterLink to="/status">当前状态</RouterLink><RouterLink to="/goals">学习目标</RouterLink><RouterLink to="/contacts">联系方式</RouterLink><RouterLink to="/data">数据与 API 状态</RouterLink><RouterLink to="/settings">展示设置</RouterLink></nav>
      <p v-if="error" role="alert" class="error">{{ error }}</p>
      <RouterView />
    </template>
  </main>
</template>
