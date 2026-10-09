/** 管理应用入口；注册 Pinia 与四个维护页面路由并挂载应用。 */
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import StatusPage from './pages/StatusPage.vue';
import GoalsPage from './pages/GoalsPage.vue';
import DataPage from './pages/DataPage.vue';
import SettingsPage from './pages/SettingsPage.vue';
import './style.css';
const router = createRouter({ history: createWebHistory(), routes: [
  { path: '/', redirect: '/status' }, { path: '/auth/callback', redirect: '/status' },
  { path: '/status', component: StatusPage }, { path: '/goals', component: GoalsPage },
  { path: '/data', component: DataPage }, { path: '/settings', component: SettingsPage },
  { path: '/:pathMatch(.*)*', redirect: '/status' },
] });
createApp(App).use(createPinia()).use(router).mount('#app');
