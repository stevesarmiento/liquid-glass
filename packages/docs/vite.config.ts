import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

const designSystemEntry = fileURLToPath(new URL("../design-system/src/index.ts", import.meta.url));
const liquidGlassEntry = fileURLToPath(new URL("../liquid-glass/src/index.ts", import.meta.url));
const liquidGlassReactEntry = fileURLToPath(new URL("../liquid-glass/src/react/index.ts", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@liquid-glass/design-system": designSystemEntry,
      "liquid-glass/react": liquidGlassReactEntry,
      "liquid-glass": liquidGlassEntry,
    },
  },
});
