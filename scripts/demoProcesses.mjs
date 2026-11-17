import { spawnSync } from "node:child_process";
import path from "node:path";

export function waitForExit(child, timeout = 15000) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = (exited) => {
      clearTimeout(timer);
      child.off("exit", onExit);
      resolve(exited);
    };
    const onExit = () => done(true);
    const timer = setTimeout(() => done(false), timeout);
    child.once("exit", onExit);
  });
}

export async function stopAppTree(child) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const options = { encoding: "utf8", windowsHide: true, timeout: 10000 };
    let stopped = spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], options);
    if (stopped.status !== 0) {
      // PowerShell 7 can terminate descendants without taskkill's WMI login.
      stopped = spawnSync("pwsh.exe", ["-NoProfile", "-NonInteractive", "-Command",
        `$ErrorActionPreference='Stop'; [System.Diagnostics.Process]::GetProcessById(${child.pid}).Kill($true)`,
      ], options);
    }
    if (stopped.status !== 0 && !await waitForExit(child, 100)) {
      throw new Error(`Could not stop app tree ${child.pid}: ${stopped.stderr?.trim() || stopped.error?.message || "process termination failed"}`);
    }
  } else {
    try { process.kill(-child.pid, "SIGTERM"); }
    catch (error) { if (error.code !== "ESRCH") throw error; }
  }
  if (!await waitForExit(child)) throw new Error(`App process ${child.pid} did not stop.`);
}

export async function stopLocalDatabase(child, mysqlBin) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  const admin = path.join(mysqlBin, process.platform === "win32" ? "mysqladmin.exe" : "mysqladmin");
  // Only called for the database started by this launcher, never DATABASE_URL
  // or Docker. Let InnoDB flush and exit; do not force-kill a database process.
  spawnSync(admin, ["--host=127.0.0.1", "--port=3309", "--user=root", "shutdown"], {
    stdio: "ignore", windowsHide: true, timeout: 15000,
  });
  if (!await waitForExit(child)) {
    child.unref();
    throw new Error(`MariaDB is still running. Stop it with "${admin}" --host=127.0.0.1 --port=3309 --user=root shutdown.`);
  }
}
