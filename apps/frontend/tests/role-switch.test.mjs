import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/app/(pages)/login/actions.tsx", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { switchRole } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

test("local and bypass sessions switch using only their cookie; SSO retains its token flow", async (t) => {
  const previous = process.env.NEXT_PUBLIC_BACKEND_API;
  process.env.NEXT_PUBLIC_BACKEND_API = "http://localhost:5001/api/";
  const calls = [];
  let response = Response.json({ status: true, data: { ActiveRole: "Lecturer", MicrosoftToken: "" } });
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, ...options });
    if (response instanceof Error) throw response;
    return response.clone();
  });
  try {
    for (const role of ["Lecturer", "Admin", "SCC", "HoP", "Student"]) {
      assert.equal((await switchRole("", role)).success, true);
      assert.equal(calls.at(-1).url, "http://localhost:5001/api/auth/login-local/role");
      assert.equal(calls.at(-1).method, "POST");
      assert.equal(calls.at(-1).credentials, "include");
      assert.deepEqual(JSON.parse(calls.at(-1).body), { role });
    }
    assert.equal((await switchRole("microsoft-session-token", "Lecturer")).success, true);
    assert.equal(calls.at(-1).url, "http://localhost:5001/api/auth/login");
    assert.equal(calls.at(-1).credentials, "include");
    assert.deepEqual(JSON.parse(calls.at(-1).body), { microsoft_token: "microsoft-session-token", role: "Lecturer" });

    for (const status of [401, 403, 500]) {
      response = Response.json({ status: false, errors: "Forbidden", data: null }, { status });
      assert.deepEqual(await switchRole("", "Admin"), { success: false, message: "Forbidden" });
    }
    // A success-shaped error response must not replace the current session.
    response = Response.json({ status: true, data: { ActiveRole: "Admin" } }, { status: 500 });
    assert.equal((await switchRole("", "Admin")).success, false);
    response = new Response("<html>Backend unavailable</html>", { status: 502 });
    assert.equal((await switchRole("", "Admin")).success, false);
    response = new TypeError("Failed to fetch");
    assert.equal((await switchRole("", "Admin")).success, false);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_BACKEND_API;
    else process.env.NEXT_PUBLIC_BACKEND_API = previous;
  }
});
