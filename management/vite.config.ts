/** 管理页面构建配置；导出 Vite 配置并将 /api 同源代理到独立后端。 */
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  plugins: [vue()],
  server: { port: 5174, strictPort: true, proxy: { '/api': { target: 'http://localhost:3002', changeOrigin: false, timeout: 130000, proxyTimeout: 130000 } } },
});
