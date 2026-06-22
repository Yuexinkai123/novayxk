import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import packageJson from "./package.json";

export default defineConfig({
  base: "./",
  define: {
    __NOVAYXK_APP_VERSION__: JSON.stringify(packageJson.version),
  },
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
