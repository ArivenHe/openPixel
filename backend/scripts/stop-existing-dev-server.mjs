import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, "..");
const envPath = path.join(backendDir, ".env");
const defaultPort = 3000;

const execFileText = (command, args) =>
  new Promise((resolve, reject) => {
    execFile(command, args, { encoding: "utf8" }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });

const readEnvPort = async () => {
  if (process.env.PORT) {
    return process.env.PORT;
  }

  try {
    const raw = await fs.readFile(envPath, "utf8");
    const line = raw
      .split(/\r?\n/)
      .map((item) => item.trim())
      .find((item) => item.startsWith("PORT="));
    return line?.slice("PORT=".length).replace(/^["']|["']$/g, "");
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`[dev] failed to read .env: ${error.message}`);
    }
    return undefined;
  }
};

const getListeningPids = async (port) => {
  try {
    const output = await execFileText("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fp"]);
    return [
      ...new Set(
        output
          .split(/\r?\n/)
          .filter((line) => line.startsWith("p"))
          .map((line) => Number.parseInt(line.slice(1), 10))
          .filter(Number.isFinite)
      )
    ];
  } catch (error) {
    if (error.code === 1) {
      return [];
    }
    console.warn(`[dev] unable to inspect port ${port}: ${error.message}`);
    return [];
  }
};

const getProcessCwd = async (pid) => {
  try {
    const output = await execFileText("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"]);
    return output
      .split(/\r?\n/)
      .find((line) => line.startsWith("n"))
      ?.slice(1);
  } catch {
    return "";
  }
};

const getProcessCommand = async (pid) => {
  try {
    return (await execFileText("ps", ["-p", String(pid), "-o", "command="])).trim();
  } catch {
    return "";
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForPortToClose = async (port, pid) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const pids = await getListeningPids(port);
    if (!pids.includes(pid)) {
      return true;
    }
    await sleep(100);
  }
  return false;
};

if (process.env.OPENPIXEL_SKIP_AUTO_STOP === "1") {
  process.exit(0);
}

const port = Number.parseInt((await readEnvPort()) ?? String(defaultPort), 10);
if (!Number.isFinite(port) || port <= 0) {
  console.warn(`[dev] invalid PORT value; skip auto stop`);
  process.exit(0);
}

const pids = await getListeningPids(port);
if (pids.length === 0) {
  process.exit(0);
}

for (const pid of pids) {
  if (pid === process.pid || pid === process.ppid) {
    continue;
  }

  const cwd = await getProcessCwd(pid);
  const command = await getProcessCommand(pid);
  const isSameBackend = path.resolve(cwd || "/") === backendDir;

  if (!isSameBackend) {
    console.warn(`[dev] port ${port} is used by another process; not killing it automatically.`);
    console.warn(`[dev] pid ${pid}: ${command || "unknown command"}`);
    console.warn(`[dev] cwd ${cwd || "unknown cwd"}`);
    continue;
  }

  console.log(`[dev] stopping previous OpenPixel backend on port ${port} (pid ${pid})`);
  process.kill(pid, "SIGTERM");

  const closed = await waitForPortToClose(port, pid);
  if (!closed) {
    console.warn(`[dev] previous backend did not stop after SIGTERM; force killing pid ${pid}`);
    process.kill(pid, "SIGKILL");
    await waitForPortToClose(port, pid);
  }
}
