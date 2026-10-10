/** 展示页面构建配置：导出 Vue 的 Vite 配置，固定开发端口并将公开 /api 请求同源代理到独立后端。 */
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:3002",
        changeOrigin: false,
        timeout: 130000,
        proxyTimeout: 130000,
      },
    },
  },
});
