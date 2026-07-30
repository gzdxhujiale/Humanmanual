import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  define: {
    'process.env': {},
  },
  optimizeDeps: {
    include: ['@tiptap/extension-table'],
  },
  resolve: {
    dedupe: ['yjs', '@tiptap/pm', 'prosemirror-state', 'prosemirror-model', 'prosemirror-view'],
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "src") },
      { find: "@humanmanual/core", replacement: path.resolve(__dirname, "../../packages/core/src/index.ts") },
      // reactjs-tiptap-editor pulls in quill; stub it out since we never render Quill.
      { find: "quill", replacement: path.resolve(__dirname, "scripts/npm-stubs/quill/index.js") }
    ]
  },
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
