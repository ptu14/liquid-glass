import { defineConfig } from "tsup";

export default defineConfig([
  // React adapter + core
  {
    entry: ["src/index.ts"],
    format: ["cjs", "esm"],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    external: ["react", "react-dom", "html2canvas"],
  },
  // Angular adapter
  {
    entry: { angular: "src/angular/index.ts" },
    format: ["esm"],
    dts: true,
    splitting: false,
    sourcemap: true,
    external: [
      "@angular/core",
      "@angular/common",
      "@zumer/snapdom",
    ],
  },
]);
