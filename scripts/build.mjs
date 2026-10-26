import { build } from "vite";
import tailwind from "@tailwindcss/vite";
import { mkdir, copyFile } from "node:fs/promises";
await build({
  plugins: [tailwind()],
  build: {
    rollupOptions: { input: { popup: "popup.html", options: "options.html" } },
    emptyOutDir: true,
  },
});
await build({
  publicDir: false,
  build: {
    emptyOutDir: false,
    lib: {
      entry: "src/background/index.ts",
      formats: ["es"],
      fileName: () => "background.js",
    },
  },
});
await build({
  publicDir: false,
  build: {
    emptyOutDir: false,
    lib: {
      entry: "src/content/index.ts",
      formats: ["iife"],
      name: "AutoFullscreen",
      fileName: () => "content.js",
    },
  },
});
await mkdir("dist/fonts", { recursive: true });
await copyFile(
  "node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2",
  "dist/fonts/inter.woff2",
);
await mkdir("dist/licenses", { recursive: true });
for (const [pkg, name] of [
  ["@fontsource/inter", "Inter-OFL"],
  ["lucide-react", "Lucide-ISC"],
  ["react", "React-MIT"],
  ["react-dom", "ReactDOM-MIT"],
])
  await copyFile(`node_modules/${pkg}/LICENSE`, `dist/licenses/${name}.txt`);
