import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const codexDir = path.join(projectRoot, ".codex");
const pidFile = path.join(codexDir, "local-server.pid");
const logFile = path.join(codexDir, "local-server.log");
const webQuestionBankFile = path.join(projectRoot, "data", "web-question-bank", "web-question-bank.json");
const action = process.argv[2] ?? "status";
const port = process.env.PORT ?? "3000";

fs.mkdirSync(codexDir, { recursive: true });

function readPid() {
  if (!fs.existsSync(pidFile)) {
    return null;
  }

  const value = fs.readFileSync(pidFile, "utf8").trim();
  return value ? Number.parseInt(value, 10) : null;
}

function isProcessAlive(pid) {
  if (!pid || Number.isNaN(pid)) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function removePidFile() {
  if (fs.existsSync(pidFile)) {
    fs.unlinkSync(pidFile);
  }
}

function findListeningPid() {
  try {
    const output = execFileSync("lsof", ["-tiTCP:" + port, "-sTCP:LISTEN"], {
      cwd: projectRoot,
      encoding: "utf8"
    }).trim();

    if (!output) {
      return null;
    }

    const pid = Number.parseInt(output.split("\n")[0], 10);
    return Number.isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

function getStatus() {
  const pid = readPid();
  const listeningPid = findListeningPid();

  if (pid && listeningPid === pid && isProcessAlive(pid)) {
    return { running: true, pid };
  }

  if (listeningPid) {
    fs.writeFileSync(pidFile, String(listeningPid));
    return { running: true, pid: listeningPid };
  }

  removePidFile();
  return { running: false, pid: null };
}

function printStatus() {
  const status = getStatus();
  if (!status.running) {
    console.log(`stopped\npidFile=${pidFile}\nlogFile=${logFile}\nurl=http://localhost:${port}`);
    return;
  }

  console.log(`running\npid=${status.pid}\npidFile=${pidFile}\nlogFile=${logFile}\nurl=http://localhost:${port}`);
}

function stopServer() {
  const status = getStatus();

  if (!status.running || !status.pid) {
    console.log("already-stopped");
    return;
  }

  try {
    process.kill(-status.pid, "SIGTERM");
  } catch {
    try {
      process.kill(status.pid, "SIGTERM");
    } catch {
      // If the process disappeared between checks, fall through and clean up.
    }
  }

  let waited = 0;
  while (waited < 5000 && isProcessAlive(status.pid)) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    waited += 100;
  }

  if (isProcessAlive(status.pid)) {
    try {
      process.kill(-status.pid, "SIGKILL");
    } catch {
      process.kill(status.pid, "SIGKILL");
    }
  }

  removePidFile();
  console.log("stopped");
}

function ensureBuildExists() {
  const buildManifest = path.join(projectRoot, ".next", "BUILD_ID");
  if (!fs.existsSync(buildManifest)) {
    throw new Error("missing-build");
  }
}

function readEnvironmentValue(name) {
  if (process.env[name]) return process.env[name];

  for (const fileName of [".env.local", ".env"]) {
    const filePath = path.join(projectRoot, fileName);
    if (!fs.existsSync(filePath)) continue;
    const line = fs.readFileSync(filePath, "utf8").split(/\r?\n/)
      .find((entry) => entry.startsWith(`${name}=`));
    if (line) return line.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, "");
  }

  return "";
}

function refreshWebQuestionBankIfNeeded() {
  const apiKey = readEnvironmentValue("TAVILY_API_KEY");
  if (!apiKey || apiKey === "your-tavily-api-key" || apiKey.startsWith("placeholder")) return false;

  const isStale = !fs.existsSync(webQuestionBankFile)
    || Date.now() - fs.statSync(webQuestionBankFile).mtimeMs > 24 * 60 * 60 * 1000;
  if (!isStale) return false;

  const child = spawn(process.execPath, [path.join(projectRoot, "scripts", "sync-web-question-bank.mjs")], {
    cwd: projectRoot,
    detached: true,
    stdio: "ignore",
    env: process.env
  });
  child.unref();
  return true;
}

function startServer() {
  const current = getStatus();

  if (current.running) {
    console.log(`already-running pid=${current.pid} url=http://localhost:${port}`);
    return;
  }

  ensureBuildExists();

  const stdout = fs.openSync(logFile, "a");
  const stderr = fs.openSync(logFile, "a");
  const child = spawn(
    process.execPath,
    [path.join(projectRoot, "scripts", "run-next.mjs"), "start", "--hostname", "0.0.0.0", "--port", port],
    {
      cwd: projectRoot,
      detached: true,
      stdio: ["ignore", stdout, stderr],
      env: {
        ...process.env,
        PORT: port
      }
    }
  );

  child.unref();

  // The launcher process may fork and exit quickly. Wait a moment for the port
  // to actually become available so `status` right after `start` is stable.
  let listeningPid = null;
  let waited = 0;
  while (waited < 10000) {
    listeningPid = findListeningPid();
    if (listeningPid) {
      break;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    waited += 100;
  }

  const pidToRecord = listeningPid ?? child.pid;
  fs.writeFileSync(pidFile, String(pidToRecord));
  const refreshScheduled = refreshWebQuestionBankIfNeeded();
  console.log(`started pid=${pidToRecord} url=http://localhost:${port}\nlogFile=${logFile}\nwebBankRefresh=${refreshScheduled ? "scheduled" : "not-needed"}`);
}

function restartServer() {
  stopServer();
  startServer();
}

if (action === "status") {
  printStatus();
} else if (action === "start") {
  startServer();
} else if (action === "stop") {
  stopServer();
} else if (action === "restart") {
  restartServer();
} else {
  console.error("Usage: node scripts/local-server.mjs <start|stop|restart|status>");
  process.exit(1);
}
