import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/http.ts"],
  format: ["esm"],
  target: "node22",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  dts: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
