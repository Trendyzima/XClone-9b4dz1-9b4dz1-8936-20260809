import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
  ],
  optimizeDeps: {
    exclude: [
      '@capacitor/core',
      '@capacitor/status-bar',
      '@capacitor/push-notifications',
      '@capacitor-community/admob',
      '@capgo/capacitor-updater',
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Stub all Capacitor packages on web builds so they don't break the bundle
      "@capacitor/core": path.resolve(__dirname, "./src/lib/capacitor-stub.ts"),
      "@capacitor/status-bar": path.resolve(__dirname, "./src/lib/capacitor-stub.ts"),
      "@capacitor/app": path.resolve(__dirname, "./src/lib/capacitor-stub.ts"),
      "@capacitor/device": path.resolve(__dirname, "./src/lib/capacitor-stub.ts"),
      "@capacitor/filesystem": path.resolve(__dirname, "./src/lib/capacitor-stub.ts"),
      "@capacitor/network": path.resolve(__dirname, "./src/lib/capacitor-stub.ts"),
      "@capacitor/push-notifications": path.resolve(__dirname, "./src/lib/capacitor-stub.ts"),
      "@capacitor/share": path.resolve(__dirname, "./src/lib/capacitor-stub.ts"),
      "@capacitor-community/admob": path.resolve(__dirname, "./src/lib/capacitor-stub.ts"),
      "@capacitor-community/firebase-analytics": path.resolve(__dirname, "./src/lib/capacitor-stub.ts"),
      "@capacitor-community/media": path.resolve(__dirname, "./src/lib/capacitor-stub.ts"),
      "@capgo/capacitor-updater": path.resolve(__dirname, "./src/lib/capacitor-stub.ts"),
      "@vercel/analytics/react": path.resolve(__dirname, "./src/lib/capacitor-stub.ts"),
    },
  },
});
