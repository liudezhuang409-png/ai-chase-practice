import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const mode = process.argv[2] ?? "dev";
const extraArgs = process.argv.slice(3);

const allowedModes = new Set(["dev", "build", "start"]);

if (!allowedModes.has(mode)) {
  console.error(`Unsupported mode: ${mode}`);
  console.error("Usage: node scripts/run-next.mjs <dev|build|start>");
  process.exit(1);
}

const prepareScript = path.join(projectRoot, "scripts", "prepare-next-runtime.mjs");
const nextBin = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: "inherit",
      env: process.env
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      // When `run-next.mjs start` is used as a detached launcher (see
      // `scripts/local-server.mjs`), it can be terminated by SIGTERM as part of a
      // normal shutdown flow. Avoid logging a noisy stack trace in that case.
      if (code == null && (signal === "SIGTERM" || signal === "SIGINT")) {
        resolve();
        return;
      }

      const suffix = code == null ? `signal ${signal ?? "unknown"}` : `code ${code}`;
      reject(new Error(`${command} ${args.join(" ")} exited with ${suffix}`));
    });
  });
}

await run(process.execPath, [prepareScript]);
await run(process.execPath, [nextBin, mode, ...extraArgs]);
