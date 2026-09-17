import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Relative base so the built app can be served from any sub-path of the suite.
export default defineConfig({
  base: "./",
  resolve: { tsconfigPaths: true },
  plugins: [tailwindcss(), viteReact()],
});
