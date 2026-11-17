import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { test } from "node:test";
import { stopAppTree } from "../demoProcesses.mjs";

const alive = (pid) => {
  try { process.kill(pid, 0); return true; }
  catch { return false; }
};

test("stopping an app also stops its worker processes", { timeout: 20000 }, async () => {
  const app = spawn(process.execPath, ["-e", `
    const { spawn } = require('node:child_process');
    const worker = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    process.send({ worker: worker.pid });
    setInterval(() => {}, 1000);
  `], { detached: process.platform !== "win32", windowsHide: true, stdio: ["ignore", "ignore", "inherit", "ipc"] });
  let worker;
  try {
    [{ worker }] = await once(app, "message");
    assert.ok(alive(worker));
    await stopAppTree(app);
    for (let retry = 0; retry < 20 && alive(worker); retry++) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(alive(app.pid), false);
    assert.equal(alive(worker), false);
  } finally {
    if (alive(app.pid)) process.kill(app.pid);
    if (worker && alive(worker)) process.kill(worker);
    if (app.connected) app.disconnect();
  }
});
