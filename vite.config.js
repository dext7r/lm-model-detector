import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  root: 'web',
  plugins: [vue(), tailwindcss()],
  build: {
    outDir: '../dist',
    // 沙箱环境禁止批量删除，改为固定文件名覆盖输出，避免累积
    emptyOutDir: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/app.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  server: {
    port: 5180,
    host: '127.0.0.1',
    proxy: {
      // 本地调试时把接口请求转发到 wrangler dev（npm run dev:api）
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true },
    },
  },
})
