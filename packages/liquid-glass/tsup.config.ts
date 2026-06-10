import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      "react/index": "src/react/index.ts",
      // Standalone entry so scripts/build-css.mjs can import the stylesheet
      // string without pulling in React, to emit dist/react/index.css.
      "react/inject-styles": "src/react/inject-styles.ts",
    },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    injectStyle: false,
    // "#wasm" is a package.json subpath import that must survive bundling so
    // consumers' bundlers resolve the wasm-pack glue (and its wasm asset).
    external: ["react", "react-dom", "#wasm"],
  },
]);
