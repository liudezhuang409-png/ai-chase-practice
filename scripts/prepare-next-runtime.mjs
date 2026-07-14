import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const sourceDir = path.join(cwd, "node_modules", "@next", "swc-wasm-nodejs");
const targetDir = path.join(cwd, "node_modules", "next", "wasm", "@next", "swc-wasm-nodejs");

function copyDir(source, target) {
  fs.mkdirSync(target, { recursive: true });

  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      copyDir(sourcePath, targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

if (!fs.existsSync(sourceDir)) {
  console.warn(
    "[prepare-next-runtime] Missing @next/swc-wasm-nodejs. Run `npm install` before starting the app."
  );
  process.exit(0);
}

fs.rmSync(targetDir, { recursive: true, force: true });
copyDir(sourceDir, targetDir);

console.log("[prepare-next-runtime] Synced @next/swc-wasm-nodejs into next/wasm fallback path.");
